// @/components/data/omenladnInit.ts

import { getExpectedDataShardNames } from "@/components/data/dataHelpers"; // or buildLocalDataShardFileName
import { fetchAvailableIndexes, getMasterIndex } from "@/components/data/cloudR2";
import { 
  getOPFSEntries, 
  getLocalOPFSIndexes,
  getSavedProjects, 
  loadProject,
  saveProject 
} from '@/components/data/diskOPFS';
import { 
  AvailableIndex, 
  OmenlandInitPayload, 
  ProjectConfig, 
  ActiveDataViewIndex 
} from "@/components/data/dataTypes";
import { isReallyOnline, isSUPAyOnline } from '@/lib/utils/checkOnline';

import { useDATAStore } from "@/stores/useDataStore";

// 🟢 Import DuckDB helpers to mount files into DuckDB VFS and build currentDataView at boot
import { loadShardIntoEngine, rebuildDataView } from "@/components/data/duckDATA";

// HELPER: Offline-First Parallel Discovery (Cloud + Disk)
async function getAllIndexes(accountId: string) {
  const online = typeof window !== "undefined" ? await isReallyOnline() : true;

  // 1. Always scan local OPFS files first (instant local access)
  const [localCacheIndexFiles, opfsIndexes] = await Promise.all([
    getOPFSEntries('indexes').catch((err) => {
      console.error("💾 OPFS index scan failed:", err);
      return [] as Array<{ name: string; handle: FileSystemFileHandle }>;
    }),
    getLocalOPFSIndexes().catch((err) => {
      console.error("💾 OPFS local index metadata parse failed:", err);
      return [] as AvailableIndex[];
    })
  ]);

  let availableIndexes: AvailableIndex[] = [];

  // 2. If online, attempt to fetch remote Cloud R2 catalog
  if (online) {
    try {
      availableIndexes = await fetchAvailableIndexes(accountId);
      console.log(`☁️ Discovered ${availableIndexes.length} remote indexes from Cloud R2.`);
    } catch (err) {
      console.warn("☁️ Cloud fetch failed despite being online. Falling back to local OPFS:", err);
      availableIndexes = opfsIndexes;
    }
  } else {
    // 3. Known Offline: Catalog is strictly what exists in OPFS
    console.log("⚡ Offline mode active: Populating index catalog exclusively from OPFS.");
    availableIndexes = opfsIndexes;
  }

  return { 
    availableIndexes, 
    localCacheIndexFiles,
    isOnline: online && availableIndexes !== opfsIndexes 
  };
}

// Self-Healing Layer: Verifies active data layers, auto-downloads missing cloud indexes
export async function loadMissingIndexes(
  projectConfig: ProjectConfig,
  localCacheIndexFiles: Array<{ name: string; handle: FileSystemFileHandle }>,
  availableCloudIndexes: AvailableIndex[],
  accountId: string,
  isOnline: boolean
): Promise<ActiveDataViewIndex[]> {
  if (!projectConfig?.activeDataViewIndexes || !accountId) {
    return [];
  }

  const activeIndexes: ActiveDataViewIndex[] = [];
  const localFileNames = localCacheIndexFiles.map((f) => f.name);

  for (const item of projectConfig.activeDataViewIndexes) {
    const fileName = typeof item === "string" ? item : item.fileName;

    // Case A: File is already cached on disk (OPFS)
    if (localFileNames.includes(fileName)) {
      activeIndexes.push(item);
      continue;
    }

    // Case B: File is missing locally and we are offline -> Skip cloud download
    if (!isOnline) {
      console.warn(`⚡ Offline: ${fileName} is missing locally and cannot be downloaded. Dropping from view.`);
      continue;
    }

    // Case C: File is missing locally and online -> Attempt cloud auto-recovery download
    console.log(`☁️ Missing active file: ${fileName}. Attempting auto-recovery download...`);
    const cloudItemMeta = availableCloudIndexes.find((idx) => idx.fileName === fileName);

    if (!cloudItemMeta) {
      console.warn(`❌ ${fileName} not found in cloud registry. Dropping from active view.`);
      continue;
    }

    try {
      const { success } = await getMasterIndex({ item: cloudItemMeta, accountId });
      if (success) {
        console.log(`✅ Recovered missing index to OPFS: ${fileName}`);
        activeIndexes.push(item);
      } else {
        throw new Error("Cloud download returned failure status");
      }
    } catch (error: any) {
      console.error(
        `🚨 Failed to recover ${fileName}: ${error?.message ?? error}. Dropping from view.`
      );
    }
  }

  return activeIndexes;
}

// Loads active workspace session from session.json or sets up a blank scratchpad.
async function loadFromSession(
  accountId: string,
  localCacheIndexFiles: Array<{ name: string; handle: FileSystemFileHandle }>,
  availableIndexes: AvailableIndex[],
  isOnline: boolean
): Promise<{
  activeIndexes: ActiveDataViewIndex[];
  savedProjectsList: Array<{ name: string; handle: FileSystemFileHandle }>;
  resolvedProjectName: null;
  windowStart:number | null;
}> {
  const savedProjectsList = await getSavedProjects(accountId).catch(() => []);
  const sessionConfig = await loadProject(accountId, null).catch(() => null);
  const isBlankSession = !sessionConfig || !sessionConfig.activeDataViewIndexes?.length;

  if (isBlankSession) {
    console.log(`📝 Session missing or blank. Initializing clean scratchpad session...`);
    const blankSession: ProjectConfig = {
      activeProjectName: null,
      activeDataViewIndexes: [],
    };

    await saveProject(accountId, null, blankSession).catch((err) =>
      console.warn("⚠️ Failed to initialize session.json scratchpad:", err)
    );

    return {
      activeIndexes: [],
      savedProjectsList,
      resolvedProjectName: null,
      windowStart: null,
    };
  }

  // Scratchpad session exists: recover or verify active indexes
  const activeIndexes = await loadMissingIndexes(
    sessionConfig,
    localCacheIndexFiles,
    availableIndexes,
    accountId,
    isOnline
  );

  return {
    activeIndexes,
    savedProjectsList,
    resolvedProjectName: null,
    windowStart: sessionConfig.windowStartYear || null,
  };
}

// Primary Boot Sequence
export async function startOmenland(accountId: string): Promise<OmenlandInitPayload> {
  console.log(`🚀 Booting Omenland Workspace for Account: ${accountId}`);

  await useDATAStore.getState().refreshDataShards();

  // PHASE 1: Fetch Index Registries (Cloud or Local OPFS Fallback)
  const { availableIndexes, localCacheIndexFiles, isOnline } = await getAllIndexes(accountId);

  // PHASE 2: Load Session / Verify Active Indexes
  const { activeIndexes, savedProjectsList, resolvedProjectName, windowStart } = await loadFromSession(
    accountId,
    localCacheIndexFiles,
    availableIndexes,
    isOnline
  );

  // PHASE 3: Mount Active Data Shards into DuckDB
if (activeIndexes && activeIndexes.length > 0) {
  try {
    console.log(`🦆 [DuckDB] Boot mounting active Parquet layers...`);
    const mountedFileNames: string[] = [];

    // 1. Get the actual list of local parquet data shards present in OPFS /data
    const localShards = await useDATAStore.getState().refreshDataShards();
    const localShardNamesSet = new Set(localShards.map((s) => s.fileName));

    for (const item of activeIndexes) {
      const indexFileName = typeof item === "string" ? item : item.fileName;
      if (!indexFileName) continue;

      // 2. Resolve expected data shard names (pre_1900 and post_1900)
      // e.g. "index__free__accidents__v1" -> ["free_accidents_pre_1900_v1.parquet", "free_accidents_post_1900_v1.parquet"]
      const expectedShardNames = getExpectedDataShardNames(indexFileName);
      console.log("XPECTED THESE SHARDS:", expectedShardNames);

      for (const shardFileName of expectedShardNames) {
        // Only attempt to mount shards that actually exist in OPFS /data/
        if (localShardNamesSet.has(shardFileName)) {
          const mountedName = await loadShardIntoEngine("data", shardFileName);
          if (mountedName) {
            mountedFileNames.push(mountedName);
          }
        }
      }
    }

    // 3. Rebuild DuckDB view with the successfully mounted shard files
    await rebuildDataView(mountedFileNames);
    console.log("✅ [DuckDB] Initialized currentDataView at boot with:", mountedFileNames);

  } catch (err) {
    console.error("🚨 [DuckDB] Failed to initialize DuckDB view at boot:", err);
  }
}

  console.log("✅ Engine boot complete. Handing payload back to state manager.");

  return {
    // I think here we need to return the windowStart
    availableIndexes,
    downloadedIndexes: localCacheIndexFiles.map((entry) => entry.name),
    localProjects: savedProjectsList,
    activeDataViewIndexes: activeIndexes,
    activeProjectName: resolvedProjectName,
    windowStartYear: windowStart,
  };
}