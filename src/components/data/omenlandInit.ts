// @/components/data/omenlandOrchestrator.ts

import { fetchAvailableIndexes, getMasterIndex } from "@/components/data/cloudR2";
import { loadShardIntoEngine, getSharedDuckDBEngine } from "@/components/data/duckDATA";
import { 
  getOPFSEntries, 
  getSavedProjects, 
  loadProject,
  saveProject 
} from '@/components/data/diskOPFS';
import { AvailableIndex, OmenlandInitPayload, ProjectConfig, OPFSFile, ActiveDataViewIndex } from "@/components/data/dataTypes";
import { useDATAStore } from '@/stores/useDataStore';
import { setTerrainTable } from "./analytics";

// ---------------------------------------------------------
// HELPER: Parallel Discovery (Cloud + Disk)
// ---------------------------------------------------------
async function getAllIndexes(accountId: string) {
  const [scannedCloudIndexList, localCacheIndexFiles] = await Promise.all([
    fetchAvailableIndexes(accountId).catch((err) => {
      console.warn("☁️ Cloud fetch failed (User might be offline):", err);
      return [] as AvailableIndex[];
    }),
    getOPFSEntries('indexes').catch((err) => {
      console.error("💾 OPFS index scan failed:", err);
      return [] as Array<{ name: string; handle: FileSystemFileHandle }>;
    })
  ]);

  return { scannedCloudIndexList, localCacheIndexFiles };
}

// ---------------------------------------------------------
// HELPER: VFS Auto-Mounting
// ---------------------------------------------------------
async function getCurrentVFSFiles(localCacheIndexFiles: Array<{ name: string; handle: FileSystemFileHandle }>) {
  const runningVFSFiles: string[] = [];

  // Ensure the engine is awake before we start mounting
  await getSharedDuckDBEngine().catch(err => console.error("🦆 DuckDB boot failed:", err));

  if (localCacheIndexFiles.length > 0) {
    await Promise.all(
      localCacheIndexFiles.map(async (fileEntry) => {
        try {
          const mountedName = await loadShardIntoEngine('indexes', fileEntry.name, fileEntry.handle);
          if (mountedName) {
            runningVFSFiles.push(fileEntry.name);
          }
        } catch (error) {
          console.error(`🚨 Failed to auto-mount ${fileEntry.name} into DuckDB:`, error);
        }
      })
    );
  }

  return runningVFSFiles;
}

// ---------------------------------------------------------
// MAIN BOOTLOADER PIPELINE
// ---------------------------------------------------------

/**
 * Self-Healing Layer: Verifies active data layers, auto-downloads missing cloud indexes,
 * mounts them into DuckDB VFS, and drops any unresolvable items.
 */
export async function loadMissingIndexes(
  projectConfig: ProjectConfig,
  loadedVFSFiles: string[],
  availableCloudIndexes: AvailableIndex[],
  accountId: string
): Promise<ActiveDataViewIndex[]> {
  if (!projectConfig?.activeDataViewIndexes || !accountId) {
    return [];
  }

  const activeIndexes: ActiveDataViewIndex[] = [];

  for (const item of projectConfig.activeDataViewIndexes) {
    const fileName = typeof item === "string" ? item : item.fileName;

    // Case A: File is already cached and mounted in DuckDB VFS
    if (loadedVFSFiles.includes(fileName)) {
      activeIndexes.push(item);
      continue;
    }

    // Case B: File is missing from local VFS. Attempt cloud auto-recovery.
    console.log(`☁️ Missing active file: ${fileName}. Attempting auto-recovery download...`);
    const cloudItemMeta = availableCloudIndexes.find((idx) => idx.fileName === fileName);

    if (!cloudItemMeta) {
      console.warn(`❌ ${fileName} not found in cloud registry. Dropping from active view.`);
      continue;
    }

    try {
      // 1. Download from R2 cloud storage to OPFS
      const { success } = await getMasterIndex({ item: cloudItemMeta, accountId });
      if (!success) throw new Error("Cloud download failed");

      // 2. Grab the new OPFS file handle
      const opfsRoot = await navigator.storage.getDirectory();
      const indexesDir = await opfsRoot.getDirectoryHandle("indexes", { create: true });
      const fileHandle = await indexesDir.getFileHandle(fileName);

      // 3. Mount newly downloaded shard into DuckDB engine
      const mountedName = await loadShardIntoEngine("indexes", fileName, fileHandle);
      if (mountedName) {
        console.log(`✅ Auto-recovered and mounted ${fileName}.`);
        loadedVFSFiles.push(fileName);
        activeIndexes.push(item);
      } else {
        throw new Error("DuckDB VFS mount rejected the file");
      }
    } catch (error: any) {
      console.error(
        `🚨 Failed to recover ${fileName}: ${error?.message ?? error}. Dropping from view.`
      );
    }
  }

  return activeIndexes;
}

/**
 * Loads active workspace session from session.json or sets up a blank scratchpad.
 */
/**
 * Loads active workspace session from session.json or sets up a blank scratchpad.
 */
async function loadFromSession(
  accountId: string,
  loadedVFSFiles: string[],
  availableCloudIndexes: AvailableIndex[]
): Promise<{
  activeIndexes: ActiveDataViewIndex[];
  savedProjectsList: Array<{ name: string; handle: FileSystemFileHandle }>;
  resolvedProjectName: null;
}> {
  // 1. Fetch available saved projects for project picker UI
  const savedProjectsList = await getSavedProjects(accountId).catch(() => []);

  // 2. Read current scratchpad session (session.json)
  const sessionConfig = await loadProject(accountId, null).catch(() => null);

  // 3. Check if session.json is missing or blank
  const isBlankSession =
    !sessionConfig || !sessionConfig.activeDataViewIndexes?.length;

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
    };
  }

  // 4. Scratchpad session exists: heal & recover missing active indexes
  const activeIndexes = await loadMissingIndexes(
    sessionConfig,
    loadedVFSFiles,
    availableCloudIndexes,
    accountId
  );

  return {
    activeIndexes,
    savedProjectsList,
    resolvedProjectName: null, // Always null for session.json scratchpad
  };
}

/**
 * Primary Boot Sequence: Initializes DuckDB VFS, recovers session state, and compiles terrain layout.
 */
export async function startOmenland(accountId: string): Promise<OmenlandInitPayload> {
  console.log(`🚀 Booting Omenland Workspace for Account: ${accountId}`);

  // PHASE 1: Fetch Index Registries (Cloud & Local)
  const { scannedCloudIndexList, localCacheIndexFiles } = await getAllIndexes(accountId);

  // PHASE 2: Mount local indexes into DuckDB VFS
  const loadedVFSFiles = await getCurrentVFSFiles(localCacheIndexFiles);

  // PHASE 3: Load Session / Auto-Heal Missing Shards
  const { activeIndexes, savedProjectsList, resolvedProjectName } = await loadFromSession(
    accountId,
    loadedVFSFiles,
    scannedCloudIndexList
  );

  // PHASE 4: Compile SQL Terrain Analytics Table
  console.log(`Initializing analytical layout space using:`, activeIndexes);

  const fileNamesToCompile = activeIndexes.map((item) =>
    typeof item === "string" ? item : item.fileName
  );

  const { success: isTerrainCompiled } = await setTerrainTable(fileNamesToCompile).catch((err) => {
    console.error("📊 Failed to compile analytics master table during boot pipeline:", err);
    return { success: false };
  });

  // PHASE 5: Un-gate UI state for query execution
  useDATAStore.getState().setTerrainReady(isTerrainCompiled);

  console.log("✅ Engine boot complete. Handing payload back to state manager.");

  return {
    availableIndexes: scannedCloudIndexList,
    downloadedIndexes: localCacheIndexFiles.map((entry) => entry.name),
    loadedIndexes: loadedVFSFiles,
    localProjects: savedProjectsList,
    activeDataViewIndexes: activeIndexes,
    activeProjectName: resolvedProjectName,
  };
}
