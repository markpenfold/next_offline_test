// @/components/data/omenlandOrchestrator.ts

import { fetchAvailableIndexes } from "@/components/data/cloudR2";
import { loadShardIntoEngine, getSharedDuckDBEngine, } from "@/components/data/duckDATA";
import { getOPFSEntries, getSavedProjects, readSession, loadProject} from '@/components/data/diskOPFS';
import { AvailableIndex, OmenlandInitPayload } from "@/components/data/dataTypes";
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
  const savedProjectsList = await getSavedProjects(accountId).catch(() => []);

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
  // ✨ PHASE 4: Workspace & Session Rehydration
  // ---------------------------------------------------------
  // 1. Read what file tracking context the account left off on
  const lastActiveProjectName = await readSession(accountId).catch(() => null);
  
  // 2. Resolve target configuration file (revert to 'autosave' if no active project name)
  const targetConfigName = lastActiveProjectName || 'autosave';
  const projectConfig = await loadProject(accountId, targetConfigName).catch(() => null);

  let verifiedActiveFiles: string[] = [];
  if (projectConfig?.activeDataViewIndexes) {
    // Cross-reference saved selection context against files successfully mounted into DuckDB
    verifiedActiveFiles = projectConfig.activeDataViewIndexes.filter((fileName) => 
      runningVFSFiles.includes(fileName)
    );
  }

  // 3. Compile the master analytical aggregation table inside DuckDB
  let isTerrainCompiled = false;
  if (verifiedActiveFiles.length > 0) {
    console.log(`♻️ Restoring aggregated terrain map for index collection:`, verifiedActiveFiles);
    const { success } = await setTerrainTable(verifiedActiveFiles).catch((err) => {
      console.error("📊 Failed to compile analytics master table during boot pipeline:", err);
      return { success: false };
    });
    isTerrainCompiled = success;
  } else {
    // Blank canvas environment, open the engine query gate immediately
    isTerrainCompiled = true;
  }

  // Set the store's rendering gate directly
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
    // Add these fields to your OmenlandInitPayload interface definition so the store processes them
    activeDataViewIndexes: verifiedActiveFiles,
    activeProjectName: lastActiveProjectName
  };
}