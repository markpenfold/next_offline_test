// @/components/data/omenlandOrchestrator.ts

import { fetchAvailableIndexes, getMasterIndex } from "@/components/data/cloudR2";
import { 
  getOPFSEntries, 
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


// HELPER: Parallel Discovery (Cloud + Disk)
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

// Self-Healing Layer: Verifies active data layers, auto-downloads missing cloud indexes
export async function loadMissingIndexes(
  projectConfig: ProjectConfig,
  localCacheIndexFiles: Array<{ name: string; handle: FileSystemFileHandle }>,
  availableCloudIndexes: AvailableIndex[],
  accountId: string
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

    // Case B: File is missing locally. Attempt cloud auto-recovery download.
    console.log(`☁️ Missing active file: ${fileName}. Attempting auto-recovery download...`);
    const cloudItemMeta = availableCloudIndexes.find((idx) => idx.fileName === fileName);

    if (!cloudItemMeta) {
      console.warn(`❌ ${fileName} not found in cloud registry. Dropping from active view.`);
      continue;
    }

    try {
      // Download from R2 cloud storage to OPFS
      const { success } = await getMasterIndex({ item: cloudItemMeta, accountId });
      if (success) {
        console.log(`✅ Recovered missing index to OPFS: ${fileName}`);
        activeIndexes.push(item); // 👈 Fixed: Restored active index push
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
  availableCloudIndexes: AvailableIndex[]
): Promise<{
  activeIndexes: ActiveDataViewIndex[];
  savedProjectsList: Array<{ name: string; handle: FileSystemFileHandle }>;
  resolvedProjectName: null;
}> {
  const savedProjectsList = await getSavedProjects(accountId).catch(() => []);
  const sessionConfig = await loadProject(accountId, null).catch(() => null);
  //console.log("SESSSSSSSSSSSSSSSSSSSSSSSSION: ", sessionConfig)
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
    };
  }

  // Scratchpad session exists: recover missing active indexes
  const activeIndexes = await loadMissingIndexes(
    sessionConfig,
    localCacheIndexFiles,
    availableCloudIndexes,
    accountId
  );

  return {
    activeIndexes,
    savedProjectsList,
    resolvedProjectName: null,
  };
}

// Primary Boot Sequence
export async function startOmenland(accountId: string): Promise<OmenlandInitPayload> {
  console.log(`🚀 Booting Omenland Workspace for Account: ${accountId}`);

  // PHASE 1: Fetch Index Registries (Cloud & Local OPFS)
  const { scannedCloudIndexList, localCacheIndexFiles } = await getAllIndexes(accountId);

  // PHASE 2: Load Session / Auto-Heal Missing Shards
  const { activeIndexes, savedProjectsList, resolvedProjectName } = await loadFromSession(
    accountId,
    localCacheIndexFiles,
    scannedCloudIndexList
  );

  console.log("✅ Engine boot complete. Handing payload back to state manager.");

  return {
    availableIndexes: scannedCloudIndexList,
    downloadedIndexes: localCacheIndexFiles.map((entry) => entry.name),
    localProjects: savedProjectsList,
    activeDataViewIndexes: activeIndexes,
    activeProjectName: resolvedProjectName,
  };
}