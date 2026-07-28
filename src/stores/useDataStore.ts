import { create } from 'zustand';
import { startOmenland } from '@/components/data/omenlandInit';
import { hydrateSingleSlot, sliceWindow } from '@/components/data/dataHelpers';
import {
  OmenlandInitPayload,
  OPFSFile,
  AvailableIndex,
  ActiveDataViewIndex,
} from '@/components/data/dataTypes';
import {
  saveProject,
  loadProject,
  getSavedProjects,
} from '@/components/data/diskOPFS';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';

// ============================================================================
// 1. HARDWARE SLOT DEFINITION
// ============================================================================

export interface Slot {
  id: number; // 0 to 11 (Maps 1:1 to GPU attribute slots)
  fileName: string | null;
  category: string | null;
  isActive: boolean;
  color: string;
  terrainIndexData: Map<number, { count: number; uuids: string[] }> | null;
  buffer: Float32Array; // 1024-element float array sent to GPU attribute
  uuidMap: Map<number, string[]>;
}

export const createInitialSlots = (): Slot[] => {
  return Array.from({ length: 12 }, function (_, i) {
    return {
      id: i,
      fileName: null,
      category: null,
      isActive: false,
      color: COLLECTION_COLORS_T6[i],
      terrainIndexData: null,
      buffer: new Float32Array(1024).fill(0),
      uuidMap: new Map(),
    };
  });
};


// ============================================================================
// 2. STORE INTERFACE
// ============================================================================

export interface DATAStore {
  // Infrastructure Registries
  availableIndexes: AvailableIndex[];
  downloadedIndexes: string[];
  loadingKeys: string[];

  // Active Session State
  activeDataViewIndexes: ActiveDataViewIndex[];
  slots: Slot[];

  // Global Time & Display Config
  windowStartYear: number;
  isGeologicalTime: boolean;

  // Project Session
  activeProjectName: string | null;
  localProjects: OPFSFile[];

  // Locks
  isInitialized: boolean;
  isInitializing: boolean;

  // --- ACTIONS ---

  /** Atomic action to push a new ActiveDataViewIndex object into session state */
  addActiveDataViewIndex: (item: ActiveDataViewIndex) => void;

  /** Atomic action to filter out an ActiveDataViewIndex object by fileName */
  removeActiveDataViewIndex: (fileName: string) => void;
  setWindowStartYear: (year: number, accountId?: string) => void;
  setIsGeologicalTime: (val: boolean, accountId?: string) => void;
  setKeyLoading: (key: string, isLoading: boolean) => void;

  // Slot Actions
addToSlot: (item: AvailableIndex, accountId?: string) => Promise<void>;
clearSlot: (slotIndex: number, accountId?: string) => void;  clearAllSlots: (accountId?: string) => void;
clearFileFromSlots: (target: string | AvailableIndex, accountId?: string) => void;
  getUUIDsForEvent: (slotIndex: number, year: number) => string[];

  // Project Lifecycle
  createNewProject: (accountId: string) => Promise<void>;
  saveCurrentProjectAs: (projectName: string, accountId: string) => Promise<void>;
  loadNamedProject: (projectName: string, accountId: string) => Promise<void>;
  refreshLocalProjects: (accountId: string) => Promise<void>;

  // Bootloader
  initializeOmenland: (accountId: string) => Promise<void>;
}

// ============================================================================
// 3. INTERNAL HELPERS
// ============================================================================



let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
function triggerAutoSave(accountId: string | undefined, getStore: () => DATAStore) {
  if (!accountId) return;

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(async function () {
    const state = getStore();

    await saveProject(accountId, state.activeProjectName, {
      activeProjectName: state.activeProjectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
    });

    console.log(`💾 Auto-saved state to OPFS [${state.activeProjectName || 'session'}]`);
  }, 400);
}

// ============================================================================
// 4. ZUSTAND STORE
// ============================================================================

export const useDATAStore = create<DATAStore>((set, get) => ({
  // --- INITIAL STATES ---
  availableIndexes: [],
  downloadedIndexes: [],
  loadingKeys: [],

  activeDataViewIndexes: [],
  slots: createInitialSlots(),

  windowStartYear: 1000,
  isGeologicalTime: false,

  activeProjectName: null,
  localProjects: [],

  isInitialized: false,
  isInitializing: false,

  // update active view indexes
  addActiveDataViewIndex: (item: ActiveDataViewIndex) => {
  const current = get().activeDataViewIndexes;
  // Prevent duplicates
  if (current.some((x) => x.fileName === item.fileName)) return;

  set({
    activeDataViewIndexes: [...current, item],
  });
},

removeActiveDataViewIndex: (fileName: string) => {
  set({
    activeDataViewIndexes: get().activeDataViewIndexes.filter(
      (item) => item.fileName !== fileName
    ),
  });
},

  // --- CONFIG SETTERS ---
  setIsGeologicalTime: function (val, accountId) {
    set({ isGeologicalTime: val });
    triggerAutoSave(accountId, get);
  },

  setWindowStartYear: function (year, accountId) {
    const currentSlots = get().slots;
    const reSlicedSlots = [...currentSlots];

    for (let i = 0; i < reSlicedSlots.length; i = i + 1) {
      const slot = reSlicedSlots[i];
      if (slot.isActive && slot.terrainIndexData) {
        const slice = sliceWindow(slot.terrainIndexData, year);
        reSlicedSlots[i] = {
          ...slot,
          buffer: slice.buffer,
          uuidMap: slice.uuidMap,
        };
      }
    }

    set({
      windowStartYear: year,
      slots: reSlicedSlots,
    });

    triggerAutoSave(accountId, get);
  },

  setKeyLoading: function (key, isLoading) {
    const currentKeys = get().loadingKeys;
    let nextKeys: string[] = [];

    if (isLoading) {
      if (currentKeys.includes(key)) {
        nextKeys = currentKeys;
      } else {
        nextKeys = [...currentKeys, key];
      }
    } else {
      nextKeys = currentKeys.filter(function (k) {
        return k !== key;
      });
    }

    set({ loadingKeys: nextKeys });
  },

  // --- SLOT ACTIONS ---
  addToSlot: async function (item: AvailableIndex, accountId?: string) {
  const currentSlots = get().slots;
  const currentYear = get().windowStartYear;

  // 1. Check if already mounted
  const alreadyExists = currentSlots.some((slot) => slot.isActive && slot.fileName === item.fileName);
  if (alreadyExists) return;

  // 2. Find open hardware slot
  const freeSlotIndex = currentSlots.findIndex((slot) => !slot.isActive);
  if (freeSlotIndex === -1) {
    console.warn('All 12 terrain slots are full!');
    return;
  }

  // 3. Hydrate slot—passes item.category directly
  const hydratedSlot = await hydrateSingleSlot(
    item.fileName,
    freeSlotIndex,
    currentYear,
    item.category
  );

  const updatedSlots = [...currentSlots];
  updatedSlots[freeSlotIndex] = hydratedSlot;

  set({ slots: updatedSlots });

  // 4. Update activeDataViewIndexes directly with zero array searches
  get().addActiveDataViewIndex({
    fileName: item.fileName,
    category: item.category,
    tier: item.tier,
  });

  triggerAutoSave(accountId, get);
},

  clearSlot: function (slotIndex, accountId) {
    if (slotIndex < 0 || slotIndex >= 12) return;

    const currentSlots = get().slots;
    let slotty = currentSlots[slotIndex];
    const indexKiller = slotty?.fileName;

    // Only remove from active indexes if a file was actually loaded
    if (indexKiller) {
      get().removeActiveDataViewIndex(indexKiller);
    }
    const updatedSlots = [...currentSlots];

    updatedSlots[slotIndex] = {
      id: slotIndex,
      fileName: null,
      category: null,
      isActive: false,
      color: COLLECTION_COLORS_T6[slotIndex],
      terrainIndexData: null,
      buffer: new Float32Array(1024).fill(0),
      uuidMap: new Map(),
    };
    

    set({
      slots: updatedSlots,
      
    });

    triggerAutoSave(accountId, get);
  },

 clearFileFromSlots: function (target: string | AvailableIndex, accountId?: string) {
  const fileName = typeof target === 'string' ? target : target.fileName;
  const slots = get().slots;

  const slotIndex = slots.findIndex((slot) => slot.fileName === fileName);
  if (slotIndex !== -1) {
    get().clearSlot(slotIndex, accountId);
  }
},

  clearAllSlots: function (accountId) {
    set({
      slots: createInitialSlots(),
      activeDataViewIndexes: [],
    });

    triggerAutoSave(accountId, get);
  },

  

  getUUIDsForEvent: function (slotIndex, year) {
    const slot = get().slots[slotIndex];
    if (!slot || !slot.isActive) return [];
    return slot.uuidMap.get(year) || [];
  },

  // --- PROJECT LIFECYCLE ---

  createNewProject: async function (accountId) {
    set({
      slots: createInitialSlots(),
      activeDataViewIndexes: [],
      activeProjectName: null,
      windowStartYear: 1000,
    });

    if (accountId) {
      await saveProject(accountId, null, {
        activeProjectName: null,
        activeDataViewIndexes: [],
        windowStartYear: 1000,
      });
    }
  },

  saveCurrentProjectAs: async function (projectName, accountId) {
    if (!accountId || !projectName.trim()) return;

    const state = get();

    const projectPayload = {
      activeProjectName: projectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
    };

    await saveProject(accountId, projectName, projectPayload);
    await saveProject(accountId, null, projectPayload);

    set({ activeProjectName: projectName });
    await get().refreshLocalProjects(accountId);
  },

  
  
  loadNamedProject: async function (projectName, accountId) {
  if (!accountId) return;

  const targetConfig = await loadProject(accountId, projectName);
  if (!targetConfig) return;

  const available = get().availableIndexes;
  const rawActive = targetConfig.activeDataViewIndexes || [];
  const targetYear = targetConfig.windowStartYear || 1000;

  // 1. Normalize rawActive to clean ActiveDataViewIndex[] objects
  const activeObjects: ActiveDataViewIndex[] = rawActive.map((item: any) => {
    if (typeof item === 'object' && item !== null && 'fileName' in item) {
      return item;
    }
    // Legacy string fallback (e.g. older session JSONs on disk)
    const match = available.find((a) => a.fileName === item);
    return {
      fileName: item,
      category: match?.category || match?.cube || 'unknown',
      tier: match?.tier || 'free',
    };
  });

  // 2. Hydrate slots cleanly—pass activeObj.category as parameter 4
  const newSlots = createInitialSlots();
  for (let i = 0; i < Math.min(activeObjects.length, 12); i++) {
    const activeObj = activeObjects[i];

      newSlots[i] = await hydrateSingleSlot(
      activeObj.fileName, // 1. string
      i,                  // 2. slot index
      targetYear,         // 3. window start year
      activeObj.category, // 4. category display name (bypasses lookup inside hydrateSingleSlot!)
      available           // 5. fallback catalog
    );
  }

  // 3. Commit clean object array to store
  set({
    slots: newSlots,
    activeDataViewIndexes: activeObjects,
    activeProjectName: projectName,
    windowStartYear: targetYear,
    isGeologicalTime: targetConfig.isGeologicalTime || false,
  });
},

  refreshLocalProjects: async function (accountId) {
    if (!accountId) return;
    try {
      const entries = await getSavedProjects(accountId);
      const updatedProjects: OPFSFile[] = entries.map(function (entry) {
        return { name: entry.name, handle: entry.handle };
      });
      set({ localProjects: updatedProjects });
    } catch (error) {
      console.error(`Failed to refresh local projects:`, error);
    }
  },

  // --- BOOTLOADER ---

  initializeOmenland: async function (accountId) {
  if (get().isInitializing || get().isInitialized) return;

  set({ isInitializing: true });

  try {
    const setUpData: OmenlandInitPayload = await startOmenland(accountId);
    const available = setUpData.availableIndexes || [];
    const rawActive = setUpData.activeDataViewIndexes || [];
    const targetYear = setUpData.windowStartYear || 1000;

    // 1. Normalize rawActive into clean ActiveDataViewIndex[] objects upfront
    const activeObjects: ActiveDataViewIndex[] = rawActive.map((item: any) => {
      if (typeof item === 'object' && item !== null && 'fileName' in item) {
        return item;
      }
      // Legacy string fallback for older session configs
      const match = available.find((a) => a.fileName === item);
      return {
        fileName: item,
        category: match?.category || match?.cube || 'unknown',
        tier: match?.tier || 'free',
      };
    });

    // 2. Hydrate slots cleanly—pass activeObj.category directly as parameter 4
    const initialSlots = createInitialSlots();
    for (let i = 0; i < Math.min(activeObjects.length, 12); i++) {
      const activeObj = activeObjects[i];

      initialSlots[i] = await hydrateSingleSlot(
        activeObj.fileName, // 1. fileName (string)
        i,                  // 2. slot index
        targetYear,         // 3. window start year
        activeObj.category, // 4. category (bypasses search in hydrateSingleSlot)
        available           // 5. fallback catalog
      );
    }

    // 3. Commit state with clean normalized activeDataViewIndexes
    set({
      availableIndexes: available,
      downloadedIndexes: setUpData.downloadedIndexes,
      localProjects: setUpData.localProjects,
      slots: initialSlots,
      activeDataViewIndexes: activeObjects,
      activeProjectName: setUpData.activeProjectName || null,
      windowStartYear: targetYear,
      isGeologicalTime: setUpData.isGeologicalTime || false,
      isInitialized: true,
      isInitializing: false,
    });
  } catch (error) {
    console.error('Critical failure during initialization:', error);
    set({ isInitializing: false });
  }
},
}));