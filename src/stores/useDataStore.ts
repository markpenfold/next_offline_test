import { create } from 'zustand';
import { startOmenland } from '@/components/data/omenlandInit';
import { hydrateSingleSlot, sliceWindow, deriveTotalYearSpan } from '@/components/data/dataHelpers';
import {
  OmenlandInitPayload,
  OPFSFile,
  AvailableIndex,
  ActiveDataViewIndex,
  AvailableDataShard,
} from '@/components/data/dataTypes';
import {
  saveProject,
  loadProject,
  getSavedProjects,
  getLocalOPFSDataShards,
} from '@/components/data/diskOPFS';
import { COLLECTION_COLORS_T6_GREYSCALE, COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';
import { getShardsFromIndex } from '@/components/data/cloudR2';
import {
  checkFileExists, 
  saveToOPFSFolder,
} from '@/components/data/diskOPFS';
import { useUIStore } from '@/stores/useUIStore';


// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export type DownloadStatus = "idle" | "downloading" | "ready" | "error";

export interface ChangedSlotEvent {
  indices: number | number[] | string;
  nonce: number;
}

export interface ActiveSlotMeta {
  id: number;
  fileName: string;
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
  //eventData: string[]; 
}

// ============================================================================
// 2. STORE INTERFACE
// ============================================================================

export interface DATAStore {
  availableIndexes: any[];
  downloadedIndexes: any[];
  dataShards: AvailableDataShard[];

  activeDataViewIndexes: ActiveDataViewIndex[];
  slots: Slot[];
  lastChangedSlot: ChangedSlotEvent | null;
  accountId: string | null;

  masterBuffer: any;
  activeSlotsMetadata: any[];

  totalYearSpan: [number, number];
  windowStartYear: number | null;
  isGeologicalTime: boolean;
  stepsize: number;

  activeProjectName: string | null;
  localProjects: { name: string; handle: any }[];

  isInitialized: boolean;
  isInitializing: boolean;

  // Actions
  addActiveDataViewIndex: (item: ActiveDataViewIndex) => void;
  removeActiveDataViewIndex: (fileName: string) => void;
  setDataShards: (shards: AvailableDataShard[]) => void;
  refreshDataShards: () => Promise<AvailableDataShard[]>;

  // Slots
  setIsGeologicalTime: (val: boolean) => void;
  setWindowStartYear: (year: number) => void;
  setMasterBufferData: (buffer: any, metadata: any[]) => void;
  addToSlot: (item: AvailableIndex) => Promise<void>;
  clearSlot: (slotIndex: number) => void;
  clearFileFromSlots: (target: string | AvailableIndex) => void;
  clearAllSlots: () => void;
  setSlotColor: (slotIndex: number, newColor: string) => void;
  getSlotColor: (fileName: string) => string | undefined;
  getUUIDsForEvent: (slotIndex: number, year: number) => string[];
  reorderSlots: (fromIndex: number, toIndex: number) => void;

  // Projects
  createNewProject: (accountId: string | null) => Promise<void>;
  saveCurrentProjectAs: (projectName: string, accountId: string | null) => Promise<void>;
  loadNamedProject: (projectName: string, accountId?: string) => Promise<void>;
  refreshLocalProjects: (accountId: string | null) => Promise<void>;

  // Bootloader
  initializeOmenland: (accountId?: string) => Promise<void>;

  // Data Download Sync
  downloadStatuses: Record<string, 'idle' | 'downloading' | 'ready' | 'error'>;
  inFlightDownloads: Map<string, Promise<boolean>>;
  getDownloadStatus: (fileName: string) => string;
  getFullDataShards: (item: any, accountId: string) => Promise<boolean>;
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

// used to reload from session/project
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



function toIndexFileName(fileName: string): string {
  if (fileName.startsWith('index__')) return fileName;

  // Pattern: {tier}_{category}_{partition?}_{version}.parquet
  // - tier: letters/numbers before first '_'
  // - version: 'v' + numbers before extension
  // - partition: optional '_pre_1900' or '_post_1900'
  const regex = /^([a-zA-Z0-9]+)_(.+?)(?:_(?:pre|post)_\d+)?_(v\d+)\.parquet$/;
  const match = fileName.match(regex);

  if (!match) {
    return fileName; // Return unchanged if non-standard
  }

  const [, tier, category, version] = match;

  // Rebuild as index__tier__category__version.parquet
  return `index__${tier}__${category}__${version}.parquet`;
}
// ============================================================================
// 4. ZUSTAND STORE
// ============================================================================

export const useDATAStore = create<DATAStore>((set, get) => ({
  // Initial State
  availableIndexes: [],
  downloadedIndexes: [],
  dataShards: [],

  activeDataViewIndexes: [],
  slots: [],
  lastChangedSlot: null,
  accountId: null,

  masterBuffer: null,
  activeSlotsMetadata: [],

  totalYearSpan: [0, 0],
  windowStartYear: null,
  isGeologicalTime: false,
  stepsize: 1,

  activeProjectName: null,
  localProjects: [],

  isInitialized: false,
  isInitializing: false,

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

  setDataShards: (shards) => set({ dataShards: shards }),

  refreshDataShards: async () => {
    try {
      const shards = await getLocalOPFSDataShards();
      console.log("refreshDataShards GETTING SHARDS from OPFS: ", shards)
      set({ dataShards: shards });
      return shards;
    } catch (err) {
      console.error("🚨 [DATAStore] Failed to refresh local OPFS data shards:", err);
      return get().dataShards;
    }
  },

  setIsGeologicalTime: function (val) {
    set({ isGeologicalTime: val });
    //triggerAutoSave(get);
  },

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
   // triggerAutoSave(get);
  },

  setMasterBufferData: (buffer, metadata) =>
    set({ masterBuffer: buffer, activeSlotsMetadata: metadata }),

  addToSlot: async function (item: AvailableIndex) {
    const currentSlots = get().slots;
    const currentYear = get().windowStartYear;

    if (currentSlots.length >= 12) {
      console.warn('All 12 terrain slots are full!');
      return;
    }

    if (currentSlots.some((s) => s.fileName === item.fileName)) return;

    const newStackIndex = currentSlots.length;

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

    const updatedSlots = [...currentSlots, newSlot];
    // this needs to only update if was previously null
    const nextWindowYear = currentYear ?? resolvedWindowStartYear;

    set({
      slots: updatedSlots,
      windowStartYear: nextWindowYear,
      totalYearSpan: deriveTotalYearSpan(updatedSlots),
      lastChangedSlot: { indices: newStackIndex, nonce: Date.now() },
    });

    get().addActiveDataViewIndex({
      fileName: item.fileName,
      category: item.category,
      tier: item.tier,
    });

   // triggerAutoSave(get);
  },

  clearSlot: function (slotIndex) {
    const currentSlots = get().slots;

    if (slotIndex < 0 || slotIndex >= currentSlots.length) return;

    const targetSlot = currentSlots[slotIndex];
    if (targetSlot?.fileName) {
      get().removeActiveDataViewIndex(targetSlot.fileName);
    }

    const updatedSlots = currentSlots
      .filter((_, idx) => idx !== slotIndex)
      .map((slot, newIdx) => ({ ...slot, id: newIdx }));

    set({
      slots: updatedSlots,
      totalYearSpan: deriveTotalYearSpan(updatedSlots),
      lastChangedSlot: { indices: slotIndex, nonce: Date.now() },
    });

   // triggerAutoSave(get);
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

   // triggerAutoSave(get);
  },

  setSlotColor: (slotIndex: number, newColor: string) => {
    const slots = [...get().slots];
    if (slots[slotIndex]) {
      slots[slotIndex] = { ...slots[slotIndex], color: newColor };
      set({ slots });
     // triggerAutoSave(get);
    }
  },

  getSlotColor: (fileName: string) => {
    let fN = toIndexFileName(fileName);
    //console.log("FNFNFNFNFNFNFNFNFNFNFNFNFNFNFN: ", fN)
    let col = get().slots.find((slot) => slot.fileName === fN)?.color;
    //console.log("COLOR IS...............", col)
    return col;
  },

  getUUIDsForEvent: function (slotIndex, year) {
    const slot = get().slots[slotIndex];
    if (!slot) return [];
    return slot.uuidMap.get(year) || [];
  },

  createNewProject: async function (accountId) {
    set({
      slots: [],
      activeDataViewIndexes: [],
      activeProjectName: null,
      windowStartYear: null,
    });

    if (accountId) {
      await saveProject(accountId, null, {
        activeProjectName: null,
        activeDataViewIndexes: [],
        windowStartYear: null,
        builderEvents: [],
      });
    }
  },

  reorderSlots: (fromIndex: number, toIndex: number) => {
    const currentSlots = [...get().slots];
    const currentActive = [...get().activeDataViewIndexes];

    if (
      fromIndex < 0 ||
      fromIndex >= currentSlots.length ||
      toIndex < 0 ||
      toIndex >= currentSlots.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const [movedSlot] = currentSlots.splice(fromIndex, 1);
    currentSlots.splice(toIndex, 0, movedSlot);

    const reindexedSlots = currentSlots.map((slot, idx) => ({
      ...slot,
      id: idx,
    }));

    if (currentActive[fromIndex]) {
      const [movedActive] = currentActive.splice(fromIndex, 1);
      currentActive.splice(toIndex, 0, movedActive);
    }

    set({
      slots: reindexedSlots,
      activeDataViewIndexes: currentActive,
      lastChangedSlot: { indices: 'ALL', nonce: Date.now() },
    });

   // triggerAutoSave(get);
  },

  saveCurrentProjectAs: async function (projectName, accountId) {
    if (!accountId || !projectName.trim()) return;

    const state = get();
    const projectPayload = {
      activeProjectName: projectName,
      activeDataViewIndexes: state.activeDataViewIndexes,
      windowStartYear: state.windowStartYear,
      isGeologicalTime: state.isGeologicalTime,
      tlBuilderEvents: useUIStore.getState().timelineBuilderEvents,
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

    console.log("LOADING THIS CONFIG::::>", targetConfig);
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
    useUIStore.getState().setTimelineBuilderEvents(targetConfig.builderEvents  || []);
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

  initializeOmenland: async function (accountId?: string) {
    if (get().isInitializing || !accountId || get().isInitialized) return;

    set({ isInitializing: true, accountId });

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

      useUIStore.getState().setTimelineBuilderEvents(setUpData.builderEvents || []);
      } catch (error) {
        console.error('Critical failure during initialization:', error);
        set({ isInitializing: false });
      }
    },

  downloadStatuses: {},

  inFlightDownloads: new Map(),

  getDownloadStatus: (fileName) => {
    return get().downloadStatuses[fileName] || 'idle';
  },

  getFullDataShards: async (item, accountId) => {
    const fileName = item.fileName;

    console.log("CUNTING CUTTUFKCL getFullDataShards fileName:", fileName);


    const { inFlightDownloads, downloadStatuses } = get();

    if (inFlightDownloads.has(fileName)) {
      return inFlightDownloads.get(fileName)!;
    }

    if (downloadStatuses[fileName] === 'ready') {
      return true;
    }

    const downloadTask = (async (): Promise<boolean> => {
      set((state) => ({
        downloadStatuses: { ...state.downloadStatuses, [fileName]: 'downloading' },
      }));

      try {
        // Delegate fetching, S3 key generation, and OPFS saving to getShardsFromIndex
        const result = await getShardsFromIndex({
          fileName,
          accountId,
        });

        console.log("FUCKING CUNT BUCKET:", result);

        if (!result.success) {
          throw new Error(`Failed to retrieve shards for index: ${fileName}`);
        }

        // 🟢 Refresh store dataShards state after saving Parquet files to disk
        await get().refreshDataShards();

        set((state) => ({
          downloadStatuses: { ...state.downloadStatuses, [fileName]: 'ready' },
        }));

        return true;
      } catch (err) {
        console.error(`❌ Background download failed for ${fileName}:`, err);

        set((state) => ({
          downloadStatuses: { ...state.downloadStatuses, [fileName]: 'error' },
        }));

        return false;
      } finally {
        const currentInFlight = get().inFlightDownloads;
        currentInFlight.delete(fileName);
      }
    })();

    inFlightDownloads.set(fileName, downloadTask);

    return downloadTask;
  },

}));