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
import { COLLECTION_COLORS_T6_GREYSCALE, COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';
import { checkWebGPUSupport, WebGPUStatus } from '@/lib/utils/general';
import { showWebGPUToast } from '@/lib/utils/webgpuToast';
import { Vector3 } from 'three';
import {
  loadGpuSettingsFromOPFS,
  saveGpuSettingsToOPFS,
  OPFSGpuSettings,
} from '@/components/data/diskOPFS';

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export type ChangedSlotEvent = {
  indices: number | number[] | 'ALL';
  nonce: number;
};

export interface ActiveSlotMeta {
  id: number;
  name: string;
  color: string;
}

export interface HoverCoord {
  x: number;
  y: number;
  z: number;
}

export interface Slot {
  id: number; // Array stack position (0 to 11)
  fileName: string;
  category: string | null;
  color: string;
  terrainIndexData: Map<number, { count: number; uuids: string[] }> | null;
  buffer: Float32Array; // 1024-element float array sent to GPU attribute
  uuidMap: Map<number, string[]>;
  minYear?: number;  
  maxYear?: number;
  totalEvents: number; 
}

// ============================================================================
// 2. STORE INTERFACE
// ============================================================================

export interface DATAStore {
  // Infrastructure Registries
  availableIndexes: AvailableIndex[];
  downloadedIndexes: string[];
  loadingKeys: string[];

  // Active Session State (Active Stack)
  activeDataViewIndexes: ActiveDataViewIndex[];
  slots: Slot[]; // Dynamic Active Stack: Length 0 to 12
  lastChangedSlot: ChangedSlotEvent | null;
  accountId: string | null;
  hoverCoord: HoverCoord | null;

  // Global Time & Display Config
  totalYearSpan: [number, number];
  windowStartYear: number | null;
  isGeologicalTime: boolean;
  stepsize: number;
  masterBuffer: Float32Array | null;
  activeSlotsMetadata: ActiveSlotMeta[];

  // Project Session
  activeProjectName: string | null;
  localProjects: OPFSFile[];
  finderIsOpen: boolean;

  // Locks
  isInitialized: boolean;
  isInitializing: boolean;

  // WebGPU / WebGL State
  gpuPreference: 'unset' | 'webgpu' | 'webgl';
  gpuStatus: WebGPUStatus | null;
  useWebGL: boolean;

  // WebGPU Actions
  initWebGPUSupport: (accountId?: string | null) => Promise<void>;
  setGpuPreference: (pref: 'webgpu' | 'webgl' | 'unset') => void;
  resetGpuPreference: () => void;

  // State / Config Setters
  addActiveDataViewIndex: (item: ActiveDataViewIndex) => void;
  removeActiveDataViewIndex: (fileName: string) => void;
  setWindowStartYear: (year: number, accountId?: string) => void;
  setIsGeologicalTime: (val: boolean, accountId?: string) => void;
  setKeyLoading: (key: string, isLoading: boolean) => void;

  // Slot Actions (Stack Logic)
  addToSlot: (item: AvailableIndex, accountId?: string) => Promise<void>;
  clearSlot: (slotIndex: number, accountId?: string) => void;
  clearAllSlots: (accountId?: string) => void;
  clearFileFromSlots: (target: string | AvailableIndex, accountId?: string) => void;
  getUUIDsForEvent: (slotIndex: number, year: number) => string[];
  setSlotColor: (slotIndex: number, newColor: string) => void;

  // UI / GPU Sync
  setHoverCoord: (coord: Vector3 | HoverCoord | null) => void;
  setMasterBufferData: (buffer: Float32Array, metadata: ActiveSlotMeta[]) => void;

  // Project Lifecycle
  createNewProject: (accountId: string) => Promise<void>;
  saveCurrentProjectAs: (projectName: string, accountId: string) => Promise<void>;
  loadNamedProject: (projectName: string, accountId: string) => Promise<void>;
  refreshLocalProjects: (accountId: string) => Promise<void>;
  setFinderOpen: (openORclosed: boolean) => void;

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
  console.log("Populate those slots, boys")
  const updatedSlots: Slot[] = mode === 'replace' ? [] : [...currentSlots];
  let activeWindowYear = windowStartYear;
  const verifiedActiveIndexes: ActiveDataViewIndex[] = [];

  for (const item of items) {
    if (updatedSlots.length >= 12) {
      console.warn('[populateSlots] Max 12 terrain slots reached!');
      break;
    }

    // Skip duplicates
    if (updatedSlots.some((s) => s.fileName === item.fileName)) {
      continue;
    }

    const nextStackIndex = updatedSlots.length;

    try {
      const { slot, resolvedWindowStartYear } = await hydrateSingleSlot(
        item.fileName,
        nextStackIndex,
        activeWindowYear,
        item.category
      );

      const color = COLLECTION_COLORS_T6[nextStackIndex % 12];

      updatedSlots.push({
        id: nextStackIndex,
        fileName: item.fileName,
        category: item.category || null,
        color: slot.color || color,
        terrainIndexData: slot.terrainIndexData,
        buffer: slot.buffer,
        uuidMap: slot.uuidMap,
        minYear: slot.minYear,
        maxYear: slot.maxYear,
        totalEvents: slot.totalEvents, 
      });

      verifiedActiveIndexes.push(item);

      if (activeWindowYear === null) {
        activeWindowYear = resolvedWindowStartYear;
      }
    } catch (slotError) {
      console.error(`[populateSlots] Parquet read failed for '${item.fileName}':`, slotError);
    }
  }

  // Re-index slots so IDs strictly equal 0..N-1
  const reindexed = updatedSlots.map((s, idx) => ({ ...s, id: idx }));

  return {
    slots: reindexed,
    verifiedActiveIndexes,
    resolvedWindowStartYear: activeWindowYear,
    totalYearSpan: deriveTotalYearSpan(reindexed),
    lastChangedSlot: { indices: 'ALL', nonce: Date.now() },
  };
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function triggerAutoSave(getStore: () => DATAStore) {
  const state = getStore();
  const accountId = state.accountId;

  if (!accountId || !state.isInitialized || state.isInitializing) return;

  if (autoSaveTimer) clearTimeout(autoSaveTimer);

  autoSaveTimer = setTimeout(async function () {
    const state = getStore();

    await saveProject(accountId, state.activeProjectName, {
      activeProjectName: state.activeProjectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
    });

    console.log(`💾 Auto-saved state to OPFS [${state.activeDataViewIndexes.length} active slots]`);
  }, 400);
}

// ============================================================================
// 4. ZUSTAND STORE
// ============================================================================

export const useDATAStore = create<DATAStore>((set, get) => ({
  // Initial State
  availableIndexes: [],
  downloadedIndexes: [],
  loadingKeys: [],

  activeDataViewIndexes: [],
  slots: [], // Empty stack by default
  lastChangedSlot: null,
  accountId: null,

  hoverCoord: null,
  masterBuffer: null,
  activeSlotsMetadata: [],

  totalYearSpan: [0, 0],
  windowStartYear: null,
  isGeologicalTime: false,
  stepsize: 1,

  activeProjectName: null,
  localProjects: [],
  finderIsOpen: false,

  isInitialized: false,
  isInitializing: false,

  gpuPreference: 'unset',
  gpuStatus: null,
  useWebGL: false,

  setGpuPreference: async (pref) => {
    const { accountId, gpuStatus } = get();
    const shouldFallback = pref === 'webgl' || !gpuStatus?.supported;

    set({ gpuPreference: pref, useWebGL: shouldFallback });

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

    await get().initWebGPUSupport(accountId);
  },

  initWebGPUSupport: async (accountId?: string | null) => {
    const targetAccountId = accountId ?? get().accountId ?? null;
    set({ accountId: targetAccountId });

    const status = await checkWebGPUSupport();
    set({ gpuStatus: status });

    let opfsSettings: OPFSGpuSettings | null = null;
    if (targetAccountId) {
      opfsSettings = await loadGpuSettingsFromOPFS(targetAccountId);
    }

    if (opfsSettings && opfsSettings.gpuPreference !== 'unset') {
      const pref = opfsSettings.gpuPreference;
      set({ gpuPreference: pref, useWebGL: pref === 'webgl' || !status.supported });
    } else {
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

  addActiveDataViewIndex: (item: ActiveDataViewIndex) => {
    const current = get().activeDataViewIndexes;
    if (current.some((x) => x.fileName === item.fileName)) return;
    set({ activeDataViewIndexes: [...current, item] });
  },

  removeActiveDataViewIndex: (fileName: string) => {
    set({
      activeDataViewIndexes: get().activeDataViewIndexes.filter((item) => item.fileName !== fileName),
    });
  },

  setIsGeologicalTime: function (val) {
    set({ isGeologicalTime: val });
    triggerAutoSave(get);
  },

  // 💡 RESLICE WINDOW: Simple map over active slots array
  setWindowStartYear: function (year) {
    const currentSlots = get().slots;

    const reSlicedSlots = currentSlots.map((slot) => {
      if (!slot.terrainIndexData) return slot;
      const slice = sliceWindow(slot.terrainIndexData, year, get().stepsize, slot.minYear, slot.maxYear);
      return {
        ...slot,
        buffer: slice.buffer,
        uuidMap: slice.uuidMap,
      };
    });

    set({ windowStartYear: year, slots: reSlicedSlots });
    triggerAutoSave(get);
  },

  setHoverCoord: (coord) =>
    set({
      hoverCoord: coord ? { x: coord.x, y: coord.y, z: coord.z } : null,
    }),

  setMasterBufferData: (buffer, metadata) =>
    set({ masterBuffer: buffer, activeSlotsMetadata: metadata }),

  setKeyLoading: function (key, isLoading) {
    const currentKeys = get().loadingKeys;
    const nextKeys = isLoading
      ? currentKeys.includes(key) ? currentKeys : [...currentKeys, key]
      : currentKeys.filter((k) => k !== key);

    set({ loadingKeys: nextKeys });
  },

  // 💡 ADD TO SLOT: Pushes to TOP of stack
  addToSlot: async function (item: AvailableIndex) {
    const currentSlots = get().slots;
   
    
    const currentYear = get().windowStartYear;

    if (currentSlots.length >= 12) {
      console.warn('All 12 terrain slots are full!');
      return;
    }

    if (currentSlots.some((s) => s.fileName === item.fileName)) return;

    const newStackIndex = currentSlots.length;

    // Hydrate slot data
    const { slot: hydratedSlot, resolvedWindowStartYear } = await hydrateSingleSlot(
      item.fileName,
      newStackIndex,
      currentYear,
      item.category
    );

    const defaultColor = COLLECTION_COLORS_T6[newStackIndex % 12];

    const newSlot: Slot = {
      id: newStackIndex,
      fileName: item.fileName,
      category: item.category || null,
      color: hydratedSlot.color || defaultColor,
      terrainIndexData: hydratedSlot.terrainIndexData,
      buffer: hydratedSlot.buffer,
      uuidMap: hydratedSlot.uuidMap,
      minYear: hydratedSlot.minYear,
      maxYear: hydratedSlot.maxYear,
      totalEvents: hydratedSlot.totalEvents,
    };

   

    // PUSH TO TOP OF STACK
    const updatedSlots = [...currentSlots, newSlot];
    const nextWindowYear = currentYear ?? resolvedWindowStartYear;

    set({
      slots: updatedSlots,
      windowStartYear: nextWindowYear,
      totalYearSpan: deriveTotalYearSpan(updatedSlots),
      lastChangedSlot: { indices: newStackIndex, nonce: Date.now() },
    });
     console.log("====================we have ADD slots===================\n ", updatedSlots)
    

    get().addActiveDataViewIndex({
      fileName: item.fileName,
      category: item.category,
      tier: item.tier,
    });

    triggerAutoSave(get);
  },

  // 💡 CLEAR SLOT: Splices out item and collapses higher layers down cleanly
  clearSlot: function (slotIndex) {
    const currentSlots = get().slots;
    
    if (slotIndex < 0 || slotIndex >= currentSlots.length) return;

    const targetSlot = currentSlots[slotIndex];
    if (targetSlot?.fileName) {
      get().removeActiveDataViewIndex(targetSlot.fileName);
    }

    // Filter out target index & re-index IDs to maintain contiguous 0..N-1 array
    const updatedSlots = currentSlots
      .filter((_, idx) => idx !== slotIndex)
      .map((slot, newIdx) => ({ ...slot, id: newIdx }));

    set({
      slots: updatedSlots,
      totalYearSpan: deriveTotalYearSpan(updatedSlots),
      lastChangedSlot: { indices: slotIndex, nonce: Date.now() },
    });
    console.log("====================we have CLEAR slots===================\n ", updatedSlots)
    triggerAutoSave(get);
  },

  clearFileFromSlots: function (target: string | AvailableIndex) {
    const fileName = typeof target === 'string' ? target : target.fileName;
    const slotIndex = get().slots.findIndex((slot) => slot.fileName === fileName);
    if (slotIndex !== -1) {
      get().clearSlot(slotIndex);
    }
  },

  clearAllSlots: function () {
    set({
      slots: [],
      activeDataViewIndexes: [],
      lastChangedSlot: { indices: 'ALL', nonce: Date.now() },
    });

    triggerAutoSave(get);
  },

  setSlotColor: (slotIndex: number, newColor: string) => {
    const slots = [...get().slots];
    if (slots[slotIndex]) {
      slots[slotIndex] = { ...slots[slotIndex], color: newColor };
      set({ slots });
      triggerAutoSave(get);
    }
  },

  getUUIDsForEvent: function (slotIndex, year) {
    const slot = get().slots[slotIndex];
    if (!slot) return [];
    return slot.uuidMap.get(year) || [];
  },

  // Project Lifecycle
  createNewProject: async function (accountId) {
    set({
      slots: [],
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
      currentSlots: [],
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
      set({ localProjects: entries.map((entry) => ({ name: entry.name, handle: entry.handle })) });
    } catch (error) {
      console.error(`Failed to refresh local projects:`, error);
    }
  },

  setFinderOpen: function (openORclosed) {
    set({ finderIsOpen: openORclosed });
  },

  // Bootloader
  initializeOmenland: async function (accountId?: string) {
    if (get().isInitializing || !accountId || get().isInitialized) return;

    set({ isInitializing: true });

    try {
      const setUpData: OmenlandInitPayload = await startOmenland(accountId);
      const result = await populateSlots({
        items: setUpData.activeDataViewIndexes || [],
        currentSlots: [],
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
    } catch (error) {
      console.error('Critical failure during initialization:', error);
      set({ isInitializing: false });
    }
  },
}));