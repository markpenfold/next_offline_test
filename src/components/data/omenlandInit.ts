// @/components/data/omenlandOrchestrator.ts

import { fetchAvailableIndexes, getMasterIndex } from "@/components/data/cloudR2";
import { loadShardIntoEngine, getSharedDuckDBEngine } from "@/components/data/duckDATA";
import { 
  getOPFSEntries, 
  getSavedProjects, 
  readSession, 
  loadProject,
  saveSession,
  saveProject 
} from '@/components/data/diskOPFS';
import { AvailableIndex, OmenlandInitPayload, ProjectConfig, OPFSFile } from "@/components/data/dataTypes";
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
// HELPER: Self-Healing Workspace & Session Rehydration
// ---------------------------------------------------------
async function loadProjectFromSession(
  accountId: string, 
  runningVFSFiles: string[],
  availableCloudIndexes: AvailableIndex[] // 👈 Add this parameter
) {
  // 1. Fetch current list of saved projects
  let savedProjectsList: OPFSFile[] = await getSavedProjects(accountId).catch(() => []);

  // 2. Resolve target session layout
  let resolvedProjectName = await readSession(accountId).catch(() => null);
  
  if (!resolvedProjectName) {
    console.log(`📝 Session file missing. Writing default 'autosave' track to OPFS...`);
    resolvedProjectName = 'autosave';
    await saveSession(accountId, resolvedProjectName).catch((err) => 
      console.error("❌ Failed to initialize session configuration on disk:", err)
    );
  }
  
  // 3. Load or seed project configuration
  let projectConfig = await loadProject(accountId, resolvedProjectName).catch(() => null);

  if (!projectConfig) {
    console.log(`🌱 Scratchpad context '${resolvedProjectName}.json' missing. Seeding fallback framework...`);
    
    const defaultTemplate: Omit<ProjectConfig, 'updatedAt'> = {
      activeDataViewIndexes: [],
    };

    const writeSuccess = await saveProject(accountId, resolvedProjectName, defaultTemplate);
    if (writeSuccess) {
      projectConfig = { ...defaultTemplate, updatedAt: new Date().toISOString() } as ProjectConfig;
      savedProjectsList = await getSavedProjects(accountId).catch(() => savedProjectsList);
    }
  }

  // 4. ✨ SELF-HEALING: Verify data tracks, download if missing, fallback to filter
  const verifiedActiveFiles: any[] = [];
  
  if (projectConfig?.activeDataViewIndexes) {
    for (const item of projectConfig.activeDataViewIndexes) {
      const fileName = typeof item === 'string' ? item : item.fileName;
      
      // Case A: File is already cached and mounted
      if (runningVFSFiles.includes(fileName)) {
        verifiedActiveFiles.push(item);
        continue;
      }

      // Case B: File is missing. Attempt auto-recovery.
      console.log(`☁️ Missing active file: ${fileName}. Attempting auto-recovery download...`);
      const cloudItemMeta = availableCloudIndexes.find(idx => idx.fileName === fileName);

      if (!cloudItemMeta) {
        console.warn(`❌ ${fileName} not found in cloud registry. Dropping from active view.`);
        continue; // Fallback: Filter out
      }

      try {
        // Step 1: Download from R2 to OPFS
        const { success } = await getMasterIndex({ item: cloudItemMeta, accountId });
        if (!success) throw new Error("Cloud download failed");

        // Step 2: Grab the new OPFS file handle
        const opfsRoot = await navigator.storage.getDirectory();
        const indexesDir = await opfsRoot.getDirectoryHandle('indexes', { create: true });
        const fileHandle = await indexesDir.getFileHandle(fileName);

        // Step 3: Mount the newly downloaded shard into DuckDB
        const mountedName = await loadShardIntoEngine('indexes', fileName, fileHandle);
        if (mountedName) {
          console.log(`✅ Auto-recovered and mounted ${fileName}.`);
          runningVFSFiles.push(fileName); // Mutate running list so the UI knows it's loaded
          verifiedActiveFiles.push(item); // Keep it in the active list
        } else {
          throw new Error("DuckDB VFS mount rejected the file");
        }
      } catch (error: any) {
        console.error(`🚨 Failed to recover ${fileName}: ${error.message}. Dropping from view.`);
        // Fallback: It simply isn't pushed to verifiedActiveFiles
      }
    }
  }

  return { resolvedProjectName, verifiedActiveFiles, savedProjectsList };
}

// ---------------------------------------------------------
// MAIN BOOTLOADER PIPELINE
// ---------------------------------------------------------
export async function runOmenlandInit(accountId: string): Promise<OmenlandInitPayload> {
  console.log(`🚀 Booting Omenland Workspace for Account: ${accountId}`);

  // PHASE 1: Fetch Indexes
  const { scannedCloudIndexList, localCacheIndexFiles } = await getAllIndexes(accountId);

  // PHASE 2: Mount Data to DuckDB
  const runningVFSFiles = await getCurrentVFSFiles(localCacheIndexFiles);



  // PHASE 3: Load Workspace Context & Auto-Heal Missing Files
  const { 
    resolvedProjectName, 
    verifiedActiveFiles, 
    savedProjectsList 
  } = await loadProjectFromSession(
    accountId, 
    runningVFSFiles, 
    scannedCloudIndexList // 👈 Pass the cloud list here
  );


  // PHASE 4: Compile Analytics Layout
  console.log(`♻️ Initializing analytical layout space using:`, verifiedActiveFiles);
  
  // Extract file names as strings for DuckDB SQL compilation
  const fileNamesToCompile = verifiedActiveFiles.map((item: any) => 
    typeof item === "string" ? item : item.fileName
  );

  const { success: isTerrainCompiled } = await setTerrainTable(fileNamesToCompile).catch((err) => {
    console.error("📊 Failed to compile analytics master table during boot pipeline:", err);
    return { success: false };
  });

  // PHASE 5: Un-gate UI queries
  useDATAStore.getState().setTerrainReady(isTerrainCompiled);

  console.log("✅ Engine boot complete. Handing payload back to state manager.");
  
  return {
    availableIndexes: scannedCloudIndexList,
    downloadedIndexes: localCacheIndexFiles.map(entry => entry.name),
    loadedIndexes: runningVFSFiles,
    localProjects: savedProjectsList,
    activeDataViewIndexes: verifiedActiveFiles,
    activeProjectName: resolvedProjectName
  };
}