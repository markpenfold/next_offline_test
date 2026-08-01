import { create } from 'zustand';
import { startOmenland } from '@/components/data/omenlandInit';
import { hydrateSingleSlot, sliceWindow, deriveTotalYearSpan } from '@/components/data/dataHelpers';
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

import { checkWebGPUSupport, WebGPUStatus } from '@/lib/utils/general';
import { showWebGPUToast } from '@/lib/utils/webgpuToast';

import {
  loadGpuSettingsFromOPFS,
  saveGpuSettingsToOPFS,
  OPFSGpuSettings,
} from '@/components/data/diskOPFS';


// ============================================================================
// 1. HARDWARE SLOT DEFINITION
// ============================================================================
export type ChangedSlotEvent = {
  // number    -> single slot update (e.g. toggle slot 3)
  // number[]  -> multi-slot update (e.g. re-order slots [1, 2, 3])
  // 'ALL'     -> project load, reset, or bulk import
  indices: number | number[] | 'ALL';
  nonce: number;
};


export interface Slot {
  id: number; // 0 to 11 (Maps 1:1 to GPU attribute slots)
  fileName: string | null;
  category: string | null;
  isActive: boolean;
  color: string;
  terrainIndexData: Map<number, { count: number; uuids: string[] }> | null;
  buffer: Float32Array; // 1024-element float array sent to GPU attribute
  uuidMap: Map<number, string[]>;
  minYear?: number;  
  maxYear?: number; 
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
  lastChangedSlot: ChangedSlotEvent | null;
  accountId:string | null;
 

  // Global Time & Display Config
  totalYearSpan: [number, number];
  windowStartYear: number | null;
  isGeologicalTime: boolean;
  stepsize:number;

  // Project Session
  activeProjectName: string | null;
  localProjects: OPFSFile[];
  finderIsOpen: boolean;

  // Locks
  isInitialized: boolean;
  isInitializing: boolean;

  // 🚀 WebGPU / WebGL State
  gpuPreference: 'unset' | 'webgpu' | 'webgl';
  gpuStatus: WebGPUStatus | null;
  useWebGL: boolean;
  

  // Actions
  initWebGPUSupport: (accountId?: string | null) => Promise<void>;
  setGpuPreference: (pref: 'webgpu' | 'webgl' | 'unset') => void;
  resetGpuPreference: () => void;

 

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
  setFinderOpen: (openORclosed:boolean) => void;

  // Bootloader
  initializeOmenland: (accountId: string) => Promise<void>;
}

// ============================================================================
// 3. INTERNAL HELPERS
// ============================================================================

export interface PopulateSlotsOptions {
  items: ActiveDataViewIndex[];
  currentSlots: Slot[];
  windowStartYear: number | null;
  mode: 'replace' | 'append';
}

export interface PopulateSlotsResult {
  slots: Slot[];
  verifiedActiveIndexes: ActiveDataViewIndex[];
  resolvedWindowStartYear: number | null;
  totalYearSpan: [number, number];
  lastChangedSlot: ChangedSlotEvent;
}

export async function populateSlots({
  items,
  currentSlots,
  windowStartYear,
  mode,
}: PopulateSlotsOptions): Promise<PopulateSlotsResult> {
  const updatedSlots = mode === 'replace' ? createInitialSlots() : [...currentSlots];
  let activeWindowYear = windowStartYear;
  const verifiedActiveIndexes: ActiveDataViewIndex[] = [];

  for (const item of items) {
    // 1. Skip if appending an already active index
    if (mode === 'append' && updatedSlots.some((s) => s.isActive && s.fileName === item.fileName)) {
      continue;
    }

    // 2. Find next free slot
    const targetSlotIndex = updatedSlots.findIndex((s) => !s.isActive);
    if (targetSlotIndex === -1) {
      console.warn('[populateSlots] All 12 terrain slots are full!');
      break;
    }

    // 3. Hydrate slot cleanly using guaranteed metadata
    try {
      const { slot, resolvedWindowStartYear } = await hydrateSingleSlot(
        item.fileName,
        targetSlotIndex,
        activeWindowYear,
        item.category
      );

      updatedSlots[targetSlotIndex] = slot;
      verifiedActiveIndexes.push(item);

      // Bootstrap start year if window was null (e.g. first boot)
      if (activeWindowYear === null) {
        activeWindowYear = resolvedWindowStartYear;
      }
    } catch (slotError) {
      console.error(
        `[populateSlots] Parquet read failed for '${item.fileName}':`,
        slotError
      );
    }
  }

  return {
    slots: updatedSlots,
    verifiedActiveIndexes,
    resolvedWindowStartYear: activeWindowYear,
    totalYearSpan: deriveTotalYearSpan(updatedSlots),
    lastChangedSlot: { indices: 'ALL', nonce: Date.now() },
  };
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function triggerAutoSave(getStore: () => DATAStore) {
  const state = getStore();

  const accountId = state.accountId;

  // Prevent auto-saving while store is uninitialized or booting
  if (!accountId || !state.isInitialized || state.isInitializing) return;

  console.log("AUTO SAVING: ")
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

    console.log(`💾 Auto-saved state to OPFS [${state.activeDataViewIndexes }]`);
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
  lastChangedSlot: null,
  accountId:null,

  totalYearSpan: [0,0],
  windowStartYear: null,
  isGeologicalTime: false,
  stepsize: 1,

  activeProjectName: null,
  localProjects: [],
  finderIsOpen: false,

  isInitialized: false,
  isInitializing: false,

  // Initial WebGPU state
  gpuPreference: 'unset',
  gpuStatus: null,
  useWebGL: false,

  setGpuPreference: async (pref) => {
    const { accountId, gpuStatus } = get();
    
    // Safeguard: Force WebGL if hardware lacks support
    const shouldFallback = pref === 'webgl' || !gpuStatus?.supported;

    set({
      gpuPreference: pref,
      useWebGL: shouldFallback,
    });

    if (accountId) {
      await saveGpuSettingsToOPFS(accountId, {
        gpuPreference: pref,
        updatedAt: new Date().toISOString(),
      });
    }
  },

  resetGpuPreference: async () => {
    const { accountId } = get();
    set({ gpuPreference: 'unset', useWebGL: false });

    if (accountId) {
      await saveGpuSettingsToOPFS(accountId, {
        gpuPreference: 'unset',
        updatedAt: new Date().toISOString(),
      });
    }

    // Re-run detection flow
    await get().initWebGPUSupport(accountId);
  },

  initWebGPUSupport: async (accountId?: string | null) => {
    // Resolve provided accountId or fallback to current store state
    const targetAccountId = accountId ?? get().accountId ?? null;
    
    set({ accountId: targetAccountId });

    // 1. Check hardware support
    const status = await checkWebGPUSupport();
    set({ gpuStatus: status });

    // 2. Try loading existing OPFS settings for this account
    let opfsSettings: OPFSGpuSettings | null = null;
    if (targetAccountId) {
      opfsSettings = await loadGpuSettingsFromOPFS(targetAccountId);
    }

    // 3. Evaluate Preference logic
    if (opfsSettings && opfsSettings.gpuPreference !== 'unset') {
      const pref = opfsSettings.gpuPreference;
      set({
        gpuPreference: pref,
        useWebGL: pref === 'webgl' || !status.supported,
      });
    } else {
      // Unset: First initialization for this account
      if (!status.supported) {
        set({ gpuPreference: 'webgl', useWebGL: true });

        if (targetAccountId) {
          await saveGpuSettingsToOPFS(targetAccountId, {
            gpuPreference: 'webgl',
            updatedAt: new Date().toISOString(),
          });
        }

        showWebGPUToast(status);
      } else {
        set({ gpuPreference: 'webgpu', useWebGL: false });

        if (targetAccountId) {
          await saveGpuSettingsToOPFS(targetAccountId, {
            gpuPreference: 'webgpu',
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  },

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
    triggerAutoSave(get);
  },

  setWindowStartYear: function (year, accountId) {
    const currentSlots = get().slots;
    const reSlicedSlots = [...currentSlots];

    for (let i = 0; i < reSlicedSlots.length; i = i + 1) {
      const slot = reSlicedSlots[i];
      if (slot.isActive && slot.terrainIndexData) {
        const slice = sliceWindow(slot.terrainIndexData, year, get().stepsize, slot.minYear, slot.maxYear);
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

    triggerAutoSave(get);
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

    const alreadyExists = currentSlots.some((s) => s.isActive && s.fileName === item.fileName);
    if (alreadyExists) return;

    const freeSlotIndex = currentSlots.findIndex((s) => !s.isActive);
    console.log("adding to this sloooooooooooooooooooooooooooooooOt:", freeSlotIndex);
    if (freeSlotIndex === -1) {
      console.warn('All 12 terrain slots are full!');
      return;
    }

    // Hydrate slot
    const { slot: hydratedSlot, resolvedWindowStartYear } = await hydrateSingleSlot(
      item.fileName,
      freeSlotIndex,
      currentYear, // Might be null on first load
      item.category
    );

    const updatedSlots = [...currentSlots];
    updatedSlots[freeSlotIndex] = hydratedSlot;

    // If windowStartYear was null, commit the resolved year to global store
    const nextWindowYear = currentYear ?? resolvedWindowStartYear;

    set({
      slots: updatedSlots,
      windowStartYear: nextWindowYear,
      totalYearSpan: deriveTotalYearSpan(updatedSlots),
      lastChangedSlot: { indices: freeSlotIndex, nonce: Date.now() },
      
    });

    get().addActiveDataViewIndex({
      fileName: item.fileName,
      category: item.category,
      tier: item.tier,
    });

  triggerAutoSave(get);
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
      totalYearSpan: deriveTotalYearSpan(updatedSlots),
      lastChangedSlot: { indices: slotIndex, nonce: Date.now() },
    });

    triggerAutoSave(get);
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
      lastChangedSlot: { indices: 'ALL', nonce: Date.now() },
    });

    triggerAutoSave(get);
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

  loadNamedProject: async function (projectName: string, accountId?: string) {
    if (!accountId) return;

    const targetConfig = await loadProject(accountId, projectName);
    if (!targetConfig) return;

    const result = await populateSlots({
      items: targetConfig.activeDataViewIndexes || [],
      currentSlots: createInitialSlots(),
      windowStartYear: targetConfig.windowStartYear ?? null,
      mode: 'replace',
    });

    set({
      slots: result.slots,
      activeDataViewIndexes: result.verifiedActiveIndexes,
      activeProjectName: projectName,
      windowStartYear: result.resolvedWindowStartYear,
      isGeologicalTime: targetConfig.isGeologicalTime || false,
      totalYearSpan: result.totalYearSpan,
      lastChangedSlot: result.lastChangedSlot,
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

  setFinderOpen: function(openORclosed){
    set({finderIsOpen: openORclosed});
  },

  // --- BOOTLOADER --- //////////
  initializeOmenland: async function (accountId?: string) {
    if (get().isInitializing || !accountId || get().isInitialized) return;

    set({ isInitializing: true });

    try {
      const setUpData: OmenlandInitPayload = await startOmenland(accountId);
      const result = await populateSlots({
        items: setUpData.activeDataViewIndexes || [],
        currentSlots: createInitialSlots(),
        windowStartYear: setUpData.windowStartYear ?? null,
        mode: 'replace',
      });

      set({
        availableIndexes: setUpData.availableIndexes || [],
        downloadedIndexes: setUpData.downloadedIndexes || [],
        localProjects: setUpData.localProjects || [],
        slots: result.slots,
        activeDataViewIndexes: result.verifiedActiveIndexes,
        activeProjectName: setUpData.activeProjectName || null,
        windowStartYear: result.resolvedWindowStartYear,
        isGeologicalTime: setUpData.isGeologicalTime || false,
        totalYearSpan: result.totalYearSpan,
        isInitialized: true,
        isInitializing: false,
      });

      console.log("ERE BE DEM SLOTS YOU ASKED FOR MASSA:", get().slots)
    } catch (error) {
      console.error('Critical failure during initialization:', error);
      set({ isInitializing: false });
    }
  },
}));