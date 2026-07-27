import { create } from 'zustand';
import {startOmenland } from "@/components/data/omenlandInit";
import { OmenlandInitPayload, OPFSFile, AvailableIndex, TerrainYearStep } from '@/components/data/dataTypes';
import { saveProject, loadProject, getSavedProjects } from '@/components/data/diskOPFS';

// 1. Defined structure for Active View Items
export interface ActiveDataViewIndex {
  fileName: string;
  category: string;
}

export interface DATAStore {
  // 1. Infrastructure States (Disk/Memory Cache)
  availableIndexes: AvailableIndex[]; 
  downloadedIndexes: string[];     // Files currently stored in OPFS
  loadedIndexes: string[];         // Files currently mounted in DuckDB VFS
  loadingKeys: string[];           // Keys actively downloading/mounting right now

  // 2. Application Workspace State (The Current Chart)
  activeDataViewIndexes: ActiveDataViewIndex[]; // Array of { fileName, category }
  activeProjectName: string | null;            // null represents the Unsaved Scratchpad ('session.json')
  localProjects: OPFSFile[];                  // User's saved workspace JSON metadata files

  // 3. Terrain Matrix Data State
  terrainData: TerrainYearStep[] | null;
 
  // Core Engine Initialization Locks
  isInitialized: boolean;
  isInitializing: boolean;
  isTerrainReady: boolean;

  // Global Time & Display Config
  windowStartYear: number | null;
  fullYearRange: [number, number] | null;
  isGeologicalTime: boolean;

  // --- STATE SETTERS ---
  setIsGeologicalTime: (val: boolean, accountId?: string) => void;
  setWindowStartYear: (year: number | null, accountId?: string) => void;
  setFullYearRange: (range: [number, number] | null, accountId?: string) => void;
  setActiveProjectName: (name: string | null, accountId?: string) => void;

  // OPFS Disk Actions
  setDownloadedIndexes: (keys: string[]) => void;
  addDownloadedIndex: (key: string) => void;

  // DuckDB VFS / Active Context Actions
  setLoadedIndexes: (keys: string[]) => void;
  addLoadedIndex: (key: string) => void;
  removeLoadedIndex: (key: string) => void;

  // Loading / Lock Controller Actions
  setKeyLoading: (key: string, isLoading: boolean) => void;

  // Workspace Selection Actions
  addToDataView: (item: ActiveDataViewIndex | AvailableIndex | string, accountId: string) => Promise<void>;
  removeFromDataView: (fileName: string, accountId: string) => Promise<void>;
  clearDataView: (accountId: string) => Promise<void>;
  setDataView: (items: (ActiveDataViewIndex | string)[], accountId: string) => Promise<void>;

  // Terrain Matrix Actions
  setTerrainData: (data: TerrainYearStep[] | null) => void;

  // Project Document Lifecycle Management Actions
  createNewProject: (accountId: string) => Promise<void>;
  saveCurrentProjectAs: (projectName: string, accountId: string) => Promise<void>;
  loadNamedProject: (projectName: string, accountId: string) => Promise<void>;
  loadSessionContext: (accountId: string) => Promise<void>;
  refreshLocalProjects: (accountId: string) => Promise<void>;

  // The Bootloader
  initializeOmenland: (accountId: string) => Promise<void>;
  setTerrainReady: (val: boolean) => void;
}

/**
 * Helper to ensure items are consistently formatted as { fileName, category },
 * even when receiving raw string fileNames or legacy OPFS loads.
 */
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
    category: input.category || availableIndexes.find((a) => a.fileName === input.fileName)?.category || input.fileName,
  };
};

/**
 * DEBOUNCED AUTO-SAVE
 * Safely batches rapid state changes (like timeline sliding) into a single OPFS disk write.
 */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
function triggerAutoSave(accountId: string, getStore: () => DATAStore) {
  if (!accountId) return;

  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  autoSaveTimer = setTimeout(async () => {
    const state = getStore();

    // Saves directly to activeProjectName.json OR session.json if null
    await saveProject(accountId, state.activeProjectName, {
      activeProjectName: state.activeProjectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
      fullYearRange: state.fullYearRange,
    });

    console.log(`💾 Auto-saved working state to OPFS [${state.activeProjectName || 'session'}]`);
  }, 400); // 400ms debounce
}

export const useDATAStore = create<DATAStore>((set, get) => ({
  // --- INITIAL STATES --- //
  availableIndexes: [], 
  downloadedIndexes: [],
  loadedIndexes: [],
  loadingKeys: [],
  activeDataViewIndexes: [], 
  activeProjectName: null, 
  localProjects: [],

  // Terrain Data State
  terrainData: null,

  isInitialized: false,
  isInitializing: false,
  isTerrainReady: false,

  windowStartYear: null,
  isGeologicalTime: false,
  fullYearRange: null,

  // --- CONFIG SETTERS W/ AUTO-SAVE TRIGGERS ---
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

  // --- DUCKDB / DATAVIEW ACTIVE CONTEXT ACTIONS ---
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

  // --- LOADING / LOCK CONTROLLER ---
  setKeyLoading: (key, isLoading) =>
    set((state) => ({
      loadingKeys: isLoading
        ? state.loadingKeys.includes(key)
          ? state.loadingKeys
          : [...state.loadingKeys, key]
        : state.loadingKeys.filter((k) => k !== key),
    })),

  // --- WORKSPACE SELECTION ACTIONS ---
  setDataView: async (items, accountId) => {
    const available = get().availableIndexes;
    const normalized = items.map((item) => normalizeActiveIndex(item, available));
    
    set({ activeDataViewIndexes: normalized });
    if (accountId) triggerAutoSave(accountId, get);
  },

  addToDataView: async (targetItem, accountId) => {
    
    const currentActive = get().activeDataViewIndexes;
    const available = get().availableIndexes;
    const normalizedItem = normalizeActiveIndex(targetItem, available);

    if (currentActive.some((item) => item.fileName === normalizedItem.fileName)) return;

    set({ activeDataViewIndexes: [...currentActive, normalizedItem] });
        console.log("NOW WE HAVE THESE INDEXES IN THE DATA VIEW:", get().activeDataViewIndexes);

    if (accountId) triggerAutoSave(accountId, get);
  },

  removeFromDataView: async (fileName, accountId) => {
    const nextActive = get().activeDataViewIndexes.filter((item) => item.fileName !== fileName);
    console.log("NOW WE HAVE THESE INDEXES IN THE DATA VIEW:", nextActive);
    set({ activeDataViewIndexes: nextActive });
    console.log("NOW WE HAVE THESE INDEXES IN THE DATA VIEW:", get().activeDataViewIndexes);
    if (accountId) triggerAutoSave(accountId, get);
  },

  clearDataView: async (accountId) => {
    set({ activeDataViewIndexes: [] });
    if (accountId) triggerAutoSave(accountId, get);
  },

  // --- TERRAIN MATRIX ACTIONS ---
  setTerrainData: (data) => set({ terrainData: data }),
  
  // --- PROJECT DOCUMENT LIFECYCLE MANAGEMENT ACTIONS --- //
  createNewProject: async (accountId: string) => {
    set({ 
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

    // 1. Save explicitly to new project name
    await saveProject(accountId, projectName, { 
      activeProjectName: projectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
      fullYearRange: state.fullYearRange,
    });

    set({ activeProjectName: projectName });

    // 2. Also register it as the active session
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

      set({ 
        activeDataViewIndexes: normalizedActive,
        activeProjectName: projectName,
        ...(targetConfig.windowStartYear !== undefined && { windowStartYear: targetConfig.windowStartYear }),
        ...(targetConfig.isGeologicalTime !== undefined && { isGeologicalTime: targetConfig.isGeologicalTime }),
        ...(targetConfig.fullYearRange !== undefined && { fullYearRange: targetConfig.fullYearRange }),
      });
      
      // Mirror load selection back to session default
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

    set({
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
      
      const updatedProjects: OPFSFile[] = entries.map(entry => ({
        name: entry.name,
        handle: entry.handle
      }));

      set({ localProjects: updatedProjects });
    } catch (error) {
      console.error(`Failed to refresh local projects for account ${accountId}:`, error);
    }
  },

  // --- THE BOOTLOADER ---
  initializeOmenland: async (accountId: string) => {
    if (get().isInitializing || get().isInitialized) return;
    
    set({ isInitializing: true });

    try {
      const setUpData: OmenlandInitPayload = await startOmenland(accountId);
      const available = setUpData.availableIndexes || [];
      const rawActive = setUpData.activeDataViewIndexes || [];
      const normalizedActive = rawActive.map((item: any) => normalizeActiveIndex(item, available));

      set({ 
        availableIndexes: available,
        downloadedIndexes: setUpData.downloadedIndexes,
        loadedIndexes: setUpData.loadedIndexes,
        localProjects: setUpData.localProjects,
        
        // Hydrate configuration defaults (could come from session.json inside OmenlandInitPayload)
        activeDataViewIndexes: normalizedActive,
        activeProjectName: setUpData.activeProjectName ?? null,
        windowStartYear: setUpData.windowStartYear ?? null,
        isGeologicalTime: setUpData.isGeologicalTime ?? false,
        fullYearRange: setUpData.fullYearRange ?? null,

        isInitialized: true,
        isInitializing: false
      });
      
    } catch (error) {
      console.error("Critical failure during Omenland initialization:", error);
      set({ isInitializing: false });
    }
  },

  setTerrainReady: (val) => set({ isTerrainReady: val }),
}));