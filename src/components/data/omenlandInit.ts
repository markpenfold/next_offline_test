// @/components/data/omenlandOrchestrator.ts

import { fetchAvailableIndexes } from "@/components/data/cloudR2";
import { loadShardIntoEngine, getSharedDuckDBEngine } from "@/components/data/duckDATA";
import { 
  getOPFSEntries, 
  getSavedProjects, 
  readSession, 
  loadProject,
  saveSession,
  saveProject 
} from '@/components/data/diskOPFS';
import { AvailableIndex, OmenlandInitPayload, ProjectConfig } from "@/components/data/dataTypes";
import { useDATAStore } from '@/stores/useDataStore';
import { setTerrainTable } from "./analytics";

export async function runOmenlandInit(accountId: string): Promise<OmenlandInitPayload> {
  console.log(`🚀 Booting Omenland Workspace for Account: ${accountId}`);
  
  // ---------------------------------------------------------
  // PHASE 1: Parallel Discovery (Cloud + Disk)
  // ---------------------------------------------------------
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

  // ---------------------------------------------------------
  // PHASE 2: Discover Saved Projects
  // ---------------------------------------------------------
  let savedProjectsList = await getSavedProjects(accountId).catch(() => []);

  // ---------------------------------------------------------
  // PHASE 3: VFS Auto-Mounting
  // ---------------------------------------------------------
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

  // ---------------------------------------------------------
  // ✨ PHASE 4: Self-Healing Workspace & Session Rehydration
  // ---------------------------------------------------------
  // 1. Resolve active project context name cleanly
  let resolvedProjectName = await readSession(accountId).catch(() => null);
  
  if (!resolvedProjectName) {
    console.log(`📝 Session file missing. Writing default 'autosave' track to OPFS...`);
    resolvedProjectName = 'autosave';
    await saveSession(accountId, resolvedProjectName).catch((err) => 
      console.error("❌ Failed to initialize session configuration on disk:", err)
    );
  }
  
  // 2. Resolve target file workspace configurations
  let projectConfig = await loadProject(accountId, resolvedProjectName).catch(() => null);

  if (!projectConfig) {
    console.log(`🌱 Scratchpad context '${resolvedProjectName}.json' missing. Seeding fallback framework...`);
    
    // Construct base config shape following your storage contract expectations
    const defaultTemplate: Omit<ProjectConfig, 'updatedAt'> = {
      activeDataViewIndexes: [],
      //filters: {}
    };

    const writeSuccess = await saveProject(accountId, resolvedProjectName, defaultTemplate);
    if (writeSuccess) {
      projectConfig = { ...defaultTemplate, updatedAt: new Date().toISOString() } as ProjectConfig;
      
      // Update our file manifest listing array so the UI instantly discovers the newly materialized file
      savedProjectsList = await getSavedProjects(accountId).catch(() => savedProjectsList);
    }
  }

  // 3. Filter data tracks against successfully mounted VFS modules
  let verifiedActiveFiles: string[] = [];
  if (projectConfig?.activeDataViewIndexes) {
    verifiedActiveFiles = projectConfig.activeDataViewIndexes.filter((fileName) => 
      runningVFSFiles.includes(fileName)
    );
  }

  // 4. CRITICAL: Compile analytics aggregation layout
  // We fire this ALWAYS (even if verifiedActiveFiles is empty []) to force
  // baseline table initialization and shield the components from missing table faults.
  console.log(`♻️ Initializing analytical layout space using:`, verifiedActiveFiles);
  const { success: isTerrainCompiled } = await setTerrainTable(verifiedActiveFiles).catch((err) => {
    console.error("📊 Failed to compile analytics master table during boot pipeline:", err);
    return { success: false };
  });

  // 5. Safely un-gate standard query routines across dependent components
  useDATAStore.getState().setTerrainReady(isTerrainCompiled);

  // ---------------------------------------------------------
  // PHASE 5: Return Unified Data Contract
  // ---------------------------------------------------------
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