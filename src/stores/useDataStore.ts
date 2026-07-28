import { create } from 'zustand';
import { startOmenland } from '@/components/data/omenlandInit';
import {
  OmenlandInitPayload,
  OPFSFile,
  AvailableIndex,
  TerrainYearStep,
} from '@/components/data/dataTypes';
import {
  saveProject,
  loadProject,
  getSavedProjects,
} from '@/components/data/diskOPFS';

import {COLLECTION_COLORS_T6} from '@/lib/utils/col_constants'


/* THIS IS THE PRIMARY RESOURCE /////////////////////////////////////////////////
export interface AvailableIndex {
  key:string;
  fileName: string;
  category:string;
  tier: "free" | "pro"; 
  cube: string;         
  s3Key?: string;        
  sizeBytes?: number;   
  handle?: FileSystemFileHandle; 
  version:string;
}/////////////////////////////////////////////////////////////////////////////////
 */


// ============================================================================
// 1. 12-SLOT ARCHITECTURE DEFINITIONS
// ============================================================================

export interface Slot {
  id: number; // 0 to 11 (Maps 1:1 to GPU attribute slots)
  fileName: string | null; // e.g., "war_events.parquet"
  category: string | null; // Display category name (e.g., "War")
  isActive: boolean; // Is this slot currently in use?
  color: string; // Permanent hex color anchored to this slot index
  buffer: Float32Array; // 1024-element float array sent to GPU attribute
  uuidMap: Map<number, string[]>; // Year -> array of UUIDs for click/hover lookups
}



// create 12 empty slots.
export const createInitialSlots = (): Slot[] =>
  Array.from({ length: 12 }, (_, i) => ({
    id: i,
    fileName: null,
    category: null,
    isActive: false,
    color: COLLECTION_COLORS_T6[i],
    buffer: new Float32Array(1024).fill(0),
    uuidMap: new Map(),
  }));

export interface ActiveDataViewIndex {
  fileName: string;
  category: string;
}

// ============================================================================
// 2. STORE INTERFACE
// ============================================================================

export interface DATAStore {
  // Infrastructure States (Disk/Memory Cache)
  availableIndexes: AvailableIndex[];
  downloadedIndexes: string[]; // Files currently stored in OPFS
  loadedIndexes: string[]; // Files currently mounted in DuckDB VFS
  loadingKeys: string[]; // Keys actively downloading/mounting right now


  // Active State (The Current Chart)
  activeDataViewIndexes: ActiveDataViewIndex[];
  terrainData: TerrainYearStep[] | null;
  // 12-Slot Hardware Render Registry (GPU Bridge)
  slots: Slot[];
  // Global Time & Display Config
  windowStartYear: number | null;
  fullYearRange: [number, number] | null;
  isGeologicalTime: boolean;


  // Project stuff 
  activeProjectName: string | null;
  localProjects: OPFSFile[];

  // Core Engine Locks
  isInitialized: boolean;
  isInitializing: boolean;
  isTerrainReady: boolean;



  // --- STATE SETTERS ---
  setIsGeologicalTime: (val: boolean, accountId?: string) => void;
  setWindowStartYear: (year: number | null, accountId?: string) => void;
  setFullYearRange: (range: [number, number] | null, accountId?: string) => void;
  setActiveProjectName: (name: string | null, accountId?: string) => void;

  // OPFS Disk Actions
  setDownloadedIndexes: (keys: string[]) => void;
  addDownloadedIndex: (key: string) => void;

  // DuckDB VFS Actions
  setLoadedIndexes: (keys: string[]) => void;
  addLoadedIndex: (key: string) => void;
  removeLoadedIndex: (key: string) => void;

  // Loading Controller Actions
  setKeyLoading: (key: string, isLoading: boolean) => void;

  // Analysis & Slot Actions
  addToDataView: (item: ActiveDataViewIndex | AvailableIndex | string, accountId: string) => Promise<void>;
  removeFromDataView: (fileName: string, accountId: string) => Promise<void>;
  clearDataView: (accountId: string) => Promise<void>;
  setDataView: (items: (ActiveDataViewIndex | string)[], accountId: string) => Promise<void>;

  // Shader & Slot Helpers
  updateSlotBuffer: (slotIndex: number, buffer: Float32Array, uuidMap?: Map<number, string[]>) => void;
  swapSlots: (fromIndex: number, toIndex: number, accountId?: string) => void;
  getSlotByFileName: (fileName: string) => Slot | undefined;
  getSlotByCategory: (category: string) => Slot | undefined;
  getUUIDsForEvent: (slotIndex: number, year: number) => string[];

  // Terrain Matrix Actions
  setTerrainData: (data: TerrainYearStep[] | null) => void;

  // Project Document Lifecycle Management
  createNewProject: (accountId: string) => Promise<void>;
  saveCurrentProjectAs: (projectName: string, accountId: string) => Promise<void>;
  loadNamedProject: (projectName: string, accountId: string) => Promise<void>;
  loadSessionContext: (accountId: string) => Promise<void>;
  refreshLocalProjects: (accountId: string) => Promise<void>;

  // Bootloader
  initializeOmenland: (accountId: string) => Promise<void>;
  setTerrainReady: (val: boolean) => void;
}

// ============================================================================
// 3. HELPERS
// ============================================================================

// guarantee a consistent, fully-populated { fileName, category } object (ActiveDataViewIndex)
const normalizeActiveIndex = (
  input: ActiveDataViewIndex | AvailableIndex | string,
  availableIndexes: AvailableIndex[]
): ActiveDataViewIndex => {
  if (typeof input === 'string') {
    const found = availableIndexes.find((a) => a.fileName === input || a.key === input);
    return {
      fileName: input,
      category: found ? found.category : input,
    };
  }

  return {
    fileName: input.fileName,
    category:
      input.category ||
      availableIndexes.find((a) => a.fileName === input.fileName)?.category ||
      input.fileName,
  };
};


// Syncs the 12-Slot registry into `activeDataViewIndexes` format for disk persistence.
const deriveActiveIndexesFromSlots = (slots: Slot[]): ActiveDataViewIndex[] => {
  return slots
    .filter((s) => s.isActive && s.fileName)
    .map((s) => ({ fileName: s.fileName!, category: s.category || s.fileName! }));
};


// Cues up the 12-Slots from active indexes.
// These are then ready to have their buffers set
const hydrateSlotsFromActiveIndexes = (
  items: ActiveDataViewIndex[],
  availableIndexes: AvailableIndex[]
): Slot[] => {
  const newSlots = createInitialSlots();
  const normalized = items.map((item) => normalizeActiveIndex(item, availableIndexes));

  normalized.slice(0, 12).forEach((item, index) => {
    newSlots[index] = {
      ...newSlots[index],
      fileName: item.fileName,
      category: item.category,
      isActive: true,
    };
  });

  return newSlots;
};

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
function triggerAutoSave(accountId: string, getStore: () => DATAStore) {
  if (!accountId) return;

  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  autoSaveTimer = setTimeout(async () => {
    const state = getStore();

    await saveProject(accountId, state.activeProjectName, {
      activeProjectName: state.activeProjectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
      fullYearRange: state.fullYearRange,
    });

    console.log(`💾 Auto-saved working state to OPFS [${state.activeProjectName || 'session'}]`);
  }, 400);
}

// ============================================================================
// 4. ZUSTAND STORE IMPLEMENTATION
// ============================================================================

export const useDATAStore = create<DATAStore>((set, get) => ({
  // --- INITIAL STATES ---
  availableIndexes: [],
  downloadedIndexes: [],
  loadedIndexes: [],
  loadingKeys: [],
  activeDataViewIndexes: [],
  activeProjectName: null,
  localProjects: [],

  // 12-Slot Registry Initialization
  slots: createInitialSlots(),
  // Terrain Data State
  terrainData: null,
  windowStartYear: null,
  isGeologicalTime: false,
  fullYearRange: null,


  isInitialized: false,
  isInitializing: false,
  isTerrainReady: false,


  // --- CONFIG SETTERS W/ AUTO-SAVE ---
  setIsGeologicalTime: (val, accountId) => {
    set({ isGeologicalTime: val });
    if (accountId) triggerAutoSave(accountId, get);
  },

  setWindowStartYear: (year, accountId) => {
    set({ windowStartYear: year });
    if (accountId) triggerAutoSave(accountId, get);
  },

  setFullYearRange: (range, accountId) => {
    set({ fullYearRange: range });
    if (accountId) triggerAutoSave(accountId, get);
  },

  setActiveProjectName: (name, accountId) => {
    set({ activeProjectName: name });
    if (accountId) triggerAutoSave(accountId, get);
  },




  // --- OPFS DISK ACTIONS ---
  setDownloadedIndexes: (indexes) => set({ downloadedIndexes: indexes }),

  addDownloadedIndex: (newIndex) =>
    set((state) => {
      if (state.downloadedIndexes.includes(newIndex)) return state;
      return { downloadedIndexes: [...state.downloadedIndexes, newIndex] };
    }),

  // --- DUCKDB / VFS ACTIONS ---
  setLoadedIndexes: (indexes) => set({ loadedIndexes: indexes }),

  addLoadedIndex: (newIndex) =>
    set((state) => {
      if (state.loadedIndexes.includes(newIndex)) return state;
      return { loadedIndexes: [...state.loadedIndexes, newIndex] };
    }),

  removeLoadedIndex: (deleteIndex) =>
    set((state) => ({
      loadedIndexes: state.loadedIndexes.filter((idx) => idx !== deleteIndex),
    })),

  // --- LOADING CONTROLLER ---
  setKeyLoading: (key, isLoading) =>
    set((state) => ({
      loadingKeys: isLoading
        ? state.loadingKeys.includes(key)
          ? state.loadingKeys
          : [...state.loadingKeys, key]
        : state.loadingKeys.filter((k) => k !== key),
    })),





  // --- WORKSPACE & SLOT SELECTION ACTIONS --- //
  setDataView: async (items, accountId) => {
    // so available holds all the data on all the indexes
    const available = get().availableIndexes;
    // normalized is an ActiveDataViewIndex { fileName, category }
    const normalized = items.map((item) => normalizeActiveIndex(item, available));
    // prepare for buffer injection
    const newSlots = hydrateSlotsFromActiveIndexes(normalized, available);

    set({
      slots: newSlots,
      activeDataViewIndexes: deriveActiveIndexesFromSlots(newSlots),
    });

    if (accountId) triggerAutoSave(accountId, get);
  },

  addToDataView: async (targetItem, accountId) => {
    const currentSlots = get().slots;
    const available = get().availableIndexes;
    const normalizedItem = normalizeActiveIndex(targetItem, available);

    // 1. Check if item is already active in any slot
    if (currentSlots.some((s) => s.isActive && s.fileName === normalizedItem.fileName)) {
      return;
    }

    // 2. Find the first empty slot (0 to 11)
    const freeSlotIndex = currentSlots.findIndex((s) => !s.isActive);
    if (freeSlotIndex === -1) {
      console.warn('All 12 terrain slots are full! Remove a timeline to add another.');
      return;
    }

    // 3. Occupy the free slot without shifting existing ones
    const updatedSlots = [...currentSlots];
    updatedSlots[freeSlotIndex] = {
      ...updatedSlots[freeSlotIndex],
      fileName: normalizedItem.fileName,
      category: normalizedItem.category,
      isActive: true,
      buffer: new Float32Array(1024).fill(0),
      uuidMap: new Map(),
    };

    set({
      slots: updatedSlots,
      activeDataViewIndexes: deriveActiveIndexesFromSlots(updatedSlots),
    });

    if (accountId) triggerAutoSave(accountId, get);
  },

  removeFromDataView: async (fileName, accountId) => {
    const currentSlots = get().slots;
    const slotIndex = currentSlots.findIndex((s) => s.isActive && s.fileName === fileName);

    if (slotIndex === -1) return;

    // Clear the specific slot. DO NOT SHIFT array elements so GPU indices remain anchored!
    const updatedSlots = [...currentSlots];
    updatedSlots[slotIndex] = {
      ...updatedSlots[slotIndex],
      fileName: null,
      category: null,
      isActive: false,
      buffer: new Float32Array(1024).fill(0),
      uuidMap: new Map(),
    };

    set({
      slots: updatedSlots,
      activeDataViewIndexes: deriveActiveIndexesFromSlots(updatedSlots),
    });

    if (accountId) triggerAutoSave(accountId, get);
  },

  clearDataView: async (accountId) => {
    set({
      slots: createInitialSlots(),
      activeDataViewIndexes: [],
      terrainData: null,
    });

    if (accountId) triggerAutoSave(accountId, get);
  },

  // --- SHADER <--> SLOT HELPERS --- //
  updateSlotBuffer: (slotIndex, buffer, uuidMap) => {
    const slots = get().slots;
    if (slotIndex < 0 || slotIndex >= 12) return;

    const updatedSlots = [...slots];
    updatedSlots[slotIndex] = {
      ...updatedSlots[slotIndex],
      buffer,
      ...(uuidMap && { uuidMap }),
    };

    set({ slots: updatedSlots });
  },

  swapSlots: (fromIndex, toIndex, accountId) => {
    const slots = get().slots;
    if (fromIndex < 0 || fromIndex >= 12 || toIndex < 0 || toIndex >= 12) return;

    const updatedSlots = [...slots];
    // Swap payloads while preserving slot.id (0..11) and slot.color alignment
    const slotA = updatedSlots[fromIndex];
    const slotB = updatedSlots[toIndex];

    updatedSlots[fromIndex] = { ...slotB, id: fromIndex, color: COLLECTION_COLORS_T6[fromIndex] };
    updatedSlots[toIndex] = { ...slotA, id: toIndex, color: COLLECTION_COLORS_T6[toIndex] };

    set({
      slots: updatedSlots,
      activeDataViewIndexes: deriveActiveIndexesFromSlots(updatedSlots),
    });

    if (accountId) triggerAutoSave(accountId, get);
  },

  getSlotByFileName: (fileName) => {
    return get().slots.find((s) => s.fileName === fileName);
  },

  getSlotByCategory: (category) => {
    return get().slots.find((s) => s.category === category);
  },

  getUUIDsForEvent: (slotIndex, year) => {
    const slot = get().slots[slotIndex];
    if (!slot || !slot.isActive) return [];
    return slot.uuidMap.get(year) || [];
  },

  // --- TERRAIN MATRIX ACTIONS ---
  setTerrainData: (data) => set({ terrainData: data }),

  // --- PROJECT DOCUMENT LIFECYCLE MANAGEMENT ---
  createNewProject: async (accountId: string) => {
    set({
      slots: createInitialSlots(),
      activeDataViewIndexes: [],
      activeProjectName: null,
      terrainData: null,
      windowStartYear: null,
    });

    if (accountId) {
      await saveProject(accountId, null, {
        activeProjectName: null,
        activeDataViewIndexes: [],
        windowStartYear: null,
      });
    }
  },

  saveCurrentProjectAs: async (projectName: string, accountId: string) => {
    if (!accountId || !projectName.trim()) return;

    const state = get();

    await saveProject(accountId, projectName, {
      activeProjectName: projectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
      fullYearRange: state.fullYearRange,
    });

    set({ activeProjectName: projectName });

    await saveProject(accountId, null, {
      activeProjectName: projectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
      fullYearRange: state.fullYearRange,
    });

    await get().refreshLocalProjects(accountId);
  },

  loadNamedProject: async (projectName: string, accountId: string) => {
    if (!accountId) return;

    const targetConfig = await loadProject(accountId, projectName);

    if (targetConfig) {
      const available = get().availableIndexes;
      const rawActive = targetConfig.activeDataViewIndexes || [];
      const normalizedActive = rawActive.map((item: any) => normalizeActiveIndex(item, available));
      const newSlots = hydrateSlotsFromActiveIndexes(normalizedActive, available);

      set({
        slots: newSlots,
        activeDataViewIndexes: normalizedActive,
        activeProjectName: projectName,
        ...(targetConfig.windowStartYear !== undefined && { windowStartYear: targetConfig.windowStartYear }),
        ...(targetConfig.isGeologicalTime !== undefined && { isGeologicalTime: targetConfig.isGeologicalTime }),
        ...(targetConfig.fullYearRange !== undefined && { fullYearRange: targetConfig.fullYearRange }),
      });

      await saveProject(accountId, null, {
        activeProjectName: projectName,
        activeDataViewIndexes: normalizedActive,
        windowStartYear: targetConfig.windowStartYear ?? null,
        isGeologicalTime: targetConfig.isGeologicalTime ?? false,
        fullYearRange: targetConfig.fullYearRange ?? null,
      });
    }
  },

  loadSessionContext: async (accountId: string) => {
    if (!accountId) return;

    const session = await loadProject(accountId, null);
    if (!session) return;

    const available = get().availableIndexes;
    const rawActive = session.activeDataViewIndexes || [];
    const normalizedActive = rawActive.map((item: any) => normalizeActiveIndex(item, available));
    const newSlots = hydrateSlotsFromActiveIndexes(normalizedActive, available);

    set({
      slots: newSlots,
      activeProjectName: session.activeProjectName || null,
      activeDataViewIndexes: normalizedActive,
      ...(session.windowStartYear !== undefined && { windowStartYear: session.windowStartYear }),
      ...(session.isGeologicalTime !== undefined && { isGeologicalTime: session.isGeologicalTime }),
      ...(session.fullYearRange !== undefined && { fullYearRange: session.fullYearRange }),
    });
  },

  refreshLocalProjects: async (accountId: string) => {
    if (!accountId) return;
    try {
      const entries = await getSavedProjects(accountId);

      const updatedProjects: OPFSFile[] = entries.map((entry) => ({
        name: entry.name,
        handle: entry.handle,
      }));

      set({ localProjects: updatedProjects });
    } catch (error) {
      console.error(`Failed to refresh local projects for account ${accountId}:`, error);
    }
  },

  // --- BOOTLOADER ---
  initializeOmenland: async (accountId: string) => {
    if (get().isInitializing || get().isInitialized) return;

    set({ isInitializing: true });

    try {
      const setUpData: OmenlandInitPayload = await startOmenland(accountId);
      const available = setUpData.availableIndexes || [];
      const rawActive = setUpData.activeDataViewIndexes || [];
      const normalizedActive = rawActive.map((item: any) => normalizeActiveIndex(item, available));
      const initialSlots = hydrateSlotsFromActiveIndexes(normalizedActive, available);

      set({
        availableIndexes: available,
        downloadedIndexes: setUpData.downloadedIndexes,
        loadedIndexes: setUpData.loadedIndexes,
        localProjects: setUpData.localProjects,

        slots: initialSlots,
        activeDataViewIndexes: normalizedActive,
        activeProjectName: setUpData.activeProjectName ?? null,
        windowStartYear: setUpData.windowStartYear ?? null,
        isGeologicalTime: setUpData.isGeologicalTime ?? false,
        fullYearRange: setUpData.fullYearRange ?? null,

        isInitialized: true,
        isInitializing: false,
      });
    } catch (error) {
      console.error('Critical failure during Omenland initialization:', error);
      set({ isInitializing: false });
    }
  },

  setTerrainReady: (val) => set({ isTerrainReady: val }),
}));