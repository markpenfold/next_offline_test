import { create } from 'zustand';
import { runOmenlandInit } from "@/components/data/omenlandInit";
import { OmenlandInitPayload, OPFSFile, AvailableIndex } from '@/components/data/dataTypes';
import { TerrainYearStep } from "@/components/data/dataTypes";
import { saveProject, loadProject, getSavedProjects, saveSession } from '@/components/data/diskOPFS';

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
  activeProjectName: string | null;            // null represents the Unsaved Scratchpad ('autosave')
  localProjects: OPFSFile[];                  // User's saved workspace JSON metadata files

  // 3. Terrain Matrix Data State
  terrainData: TerrainYearStep[] | null;
  terrainDataViewWindow: TerrainYearStep[] | null;

  // Core Engine Initialization Locks
  isInitialized: boolean;
  isInitializing: boolean;
  isTerrainReady: boolean;

  windowStartYear: number | null;
  isGeologicalTime: boolean;


  setIsGeologicalTime: (val: boolean) => void;
  setWindowStartYear: (year: number | null) => void;

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
  setTerrainDataViewWindow: (data: TerrainYearStep[] | null) => void;

  // Project Document Lifecycle Management Actions
  createNewProject: (accountId: string) => Promise<void>;
  saveCurrentProjectAs: (projectName: string, accountId: string) => Promise<void>;
  loadNamedProject: (projectName: string, accountId: string) => Promise<void>;
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
  terrainDataViewWindow: null,

  isInitialized: false,
  isInitializing: false,
  isTerrainReady: false,

  windowStartYear: null,
  isGeologicalTime: false, // Defaulting to "human" time (50k years)





  setIsGeologicalTime: (val) => set({ isGeologicalTime: val }),
  setWindowStartYear: (year) => set({ windowStartYear: year }),

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
    
    if (accountId) {
      const target = get().activeProjectName || 'autosave';
      await saveProject(accountId, target, { activeDataViewIndexes: normalized });
    }
  },

  addToDataView: async (targetItem, accountId) => {
    const currentActive = get().activeDataViewIndexes;
    const available = get().availableIndexes;

    const normalizedItem = normalizeActiveIndex(targetItem, available);

    // Prevent duplicates by checking fileName
    if (currentActive.some((item) => item.fileName === normalizedItem.fileName)) return;

    const nextActive = [...currentActive, normalizedItem];
    set({ activeDataViewIndexes: nextActive });

    if (accountId) {
      const target = get().activeProjectName || 'autosave';
      await saveProject(accountId, target, { activeDataViewIndexes: nextActive });
    }
  },

  removeFromDataView: async (fileName, accountId) => {
    const nextActive = get().activeDataViewIndexes.filter((item) => item.fileName !== fileName);
    set({ activeDataViewIndexes: nextActive });

    if (accountId) {
      const target = get().activeProjectName || 'autosave';
      await saveProject(accountId, target, { activeDataViewIndexes: nextActive });
    }
  },

  clearDataView: async (accountId) => {
    set({ activeDataViewIndexes: [] });

    if (accountId) {
      const target = get().activeProjectName || 'autosave';
      await saveProject(accountId, target, { activeDataViewIndexes: [] });
    }
  },

  // --- TERRAIN MATRIX ACTIONS ---
  setTerrainData: (data) => set({ terrainData: data }),
  setTerrainDataViewWindow: (data) => set({ terrainDataViewWindow: data }),

  // --- PROJECT DOCUMENT LIFECYCLE MANAGEMENT ACTIONS ---  //
  
  /** Wipes current canvas context and defaults back to fresh autosave track **/
  createNewProject: async (accountId) => {
    set({ 
      activeDataViewIndexes: [],
      activeProjectName: null,
      terrainData: null,
    });

    if (accountId) {
      await saveSession(accountId, null);
      await saveProject(accountId, 'autosave', { activeDataViewIndexes: [] });
    }
  },

  /** Snapshots current index selections out to a named file and registers session layout */
  saveCurrentProjectAs: async (projectName, accountId) => {
    if (!accountId || !projectName.trim()) return;

    const currentLayout = get().activeDataViewIndexes;
    
    await saveProject(accountId, projectName, { activeDataViewIndexes: currentLayout });
    set({ activeProjectName: projectName });
    await saveSession(accountId, projectName);
    
    await get().refreshLocalProjects(accountId);
  },

  /** Reads structural configuration out of a dedicated project document track */
  loadNamedProject: async (projectName, accountId) => {
    if (!accountId) return;
    
    const targetConfig = await loadProject(accountId, projectName);
    
    if (targetConfig) {
      const available = get().availableIndexes;
      const rawActive = targetConfig.activeDataViewIndexes || [];
      const normalizedActive = rawActive.map((item: any) => normalizeActiveIndex(item, available));

      set({ 
        activeDataViewIndexes: normalizedActive,
        activeProjectName: projectName
      });
      
      await saveSession(accountId, projectName);
    }
  },

  /** Scans the account-specific OPFS directory layout to pull up-to-date document descriptors */
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
      const setUpData: OmenlandInitPayload = await runOmenlandInit(accountId);
      const available = setUpData.availableIndexes || [];
      const rawActive = setUpData.activeDataViewIndexes || [];
      const normalizedActive = rawActive.map((item: any) => normalizeActiveIndex(item, available));

      set({ 
        availableIndexes: available,
        downloadedIndexes: setUpData.downloadedIndexes,
        loadedIndexes: setUpData.loadedIndexes,
        localProjects: setUpData.localProjects,
        activeDataViewIndexes: normalizedActive,
        activeProjectName: setUpData.activeProjectName,
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