"use client";

import { useEffect, useState } from "react";
import { 
  fetchAvailableIndexes,
  getLocalCacheManifest, 
  getMasterIndex,
  AvailableIndex,
  buildLocalIndex,
  loadShardIntoEngine
} from "./storage"; 
import { useAppStore } from '@/providers/AppStoreProvider';
import { deleteOPFSFile } from './manageOPFS';
import { getIndex } from './analytics';
import { useDATAStore } from '@/stores/useDataStore';

const white = 'rgb(245,245,245)';
const red = 'rgb(162, 5, 5)';
const blue = 'rgb(65,105,225)';

export function IndexLoader() {
  const [availableIndexes, setAvailableIndexes] = useState<AvailableIndex[]>([]);
  const [localCache, setLocalCache] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [index, setIndex] = useState<any[]>([]);

  // App Store Context
  const activeAccount = useAppStore((s) => s.activeAccount);

  // Zustand DATA Store Integration
  const downloadedIndexes = useDATAStore((s) => s.downloadedIndexes);
  const loadedIndexes = useDATAStore((s) => s.loadedIndexes);
  const loadingKeys = useDATAStore((s) => s.loadingKeys);

  const setDownloadedIndexes = useDATAStore((s) => s.setDownloadedIndexes);
  const setLoadedIndexes = useDATAStore((s) => s.setLoadedIndexes);
  const addLoadedIndex = useDATAStore((s) => s.addLoadedIndex);
  const removeLoadedIndex = useDATAStore((s) => s.removeLoadedIndex);
  const setKeyLoading = useDATAStore((s) => s.setKeyLoading);

  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  // Complete loop state sync coordinator
  const syncWorkspaceState = async () => {
    const manifest = await getLocalCacheManifest('indexes');
    const manifestArray = Array.from(manifest);
    console.log("MANIFEST ARRAY in syncWorkspaceState", manifestArray)

    addLog(`[syncWorkspaceState] Cache manifest contains ${manifestArray.length} cached indexes.`);
    
    // Sync with Zustand store & local set
    setDownloadedIndexes(manifestArray);
    setLocalCache(new Set(manifestArray));
    return manifestArray;
  };

  // Rebuild & Reload Pipeline
  const rebuildAndLoadIndex = async () => {
    addLog("🏗️ Reassembling master index tables from OPFS storage...");
    const buildReport = await buildLocalIndex(addLog);

    if (!buildReport.success) {
      addLog(`⚠️ Local index built with warnings! Failed targets: ${buildReport.failedFiles.join(', ')}`);
    } else if (buildReport.totalFilesProcessed > 0) {
      addLog("🟢 Local unified master index successfully compiled.");
    } else {
      addLog("Local disk storage cache is currently empty.");
    }

    const { data, error } = await getIndex(100);
    if (error) {
      addLog(`Index Query Failed: ${error}`);
      setIndex([]);
    } else {
      addLog(`Successfully loaded ${data.length} rows into view.`);
      setIndex(data);
    }
  };

  // 🚀 Live Scan & Initialize on Mount
  useEffect(() => {
    let isMounted = true;

    async function initComponent() {
      if (!activeAccount?.id) {
        addLog("⚠️ Waiting for active account context...");
        if (isMounted) setLoading(false);
        return;
      }

      try {
        if (isMounted) setLoading(true);
        addLog("Scanning R2 buckets for available historical indexes...");
        
        const scannedList = await fetchAvailableIndexes(activeAccount.id);
        if (!isMounted) return;
        
        setAvailableIndexes(scannedList);
        addLog(`Scan complete! Discovered ${scannedList.length} total indexes available for download.`);

        const manifest = await syncWorkspaceState();
        //await rebuildAndLoadIndex();

        // Populate store with active cached indexes
        setLoadedIndexes(manifest);

      } catch (err: any) {
        if (isMounted) addLog(`❌ Sync Error during boot sequence: ${err.message}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initComponent();

    return () => {
      isMounted = false;
    };
  }, [activeAccount?.id]);

  // Handle Dynamic Download Action
  const handleDownloadAndMountClick = async (item: AvailableIndex) => {
    if (!activeAccount?.id) {
      addLog(`Cannot download index: No active account selected.`);
      return;
    }

    // Lock UI state for this item key
    setKeyLoading(item.key, true);
    

    try {
      const { success, targetFileName } = await getMasterIndex({
        item,
        accountId: activeAccount.id,
        onLog: addLog,
      });

      if (success) {
        const fileNameToRegister = targetFileName || item.fileName;

        // 1️⃣ FIRST: Mount the downloaded file into DuckDB WASM VFS
        addLog(`Mounting "${fileNameToRegister}" into DuckDB WASM...`);
        const result = await loadShardIntoEngine('indexes',fileNameToRegister);
              
        if (!result) {
          console.error("❌ Problem loading file into DuckDB WASM engine");
          addLog(`❌ Failed to register "${fileNameToRegister}" in DuckDB engine.`);
          return;
        }

        addLoadedIndex(targetFileName || item.fileName);
        // Register newly mounted file in store
        addLog(`✅ Successfully loaded and compiled "${fileNameToRegister}"`);
        }

        

    } catch (err: any) {
      addLog(`❌ Download error: ${err.message}`);
    } finally {
      setKeyLoading(item.key, false);
    }
  };

  // 🗑️ Handle Cache Eviction Action
  const handleDeleteClick = async (item: AvailableIndex) => {
    const fileName = item.fileName;
    setKeyLoading(item.key, true);
    addLog(`Evicting index byte fragments from browser OPFS disk: "${fileName}"...`);

    try {
      const result = await deleteOPFSFile('indexes', fileName);
      
      if (!result) {
        addLog(`❌ Delete failed for ${fileName}`);
      } else {
        removeLoadedIndex(fileName);
        await syncWorkspaceState();
        //await rebuildAndLoadIndex();
        addLog(`🟢 Cache maps cleared for ${fileName}. Metrics updated.`);
      }
    } catch (err: any) {
      addLog(`❌ Eviction error: ${err.message}`);
    } finally {
      setKeyLoading(item.key, false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "600px", margin: "0 auto", fontFamily: "sans-serif" }}>
      
      {/* WINDOW 1: INDEX SHARD SELECTION PILLS */}
      <div style={{ 
        backgroundColor: blue, 
        padding: "1.25rem", 
        color: white, 
        borderRadius: "12px", 
        height: "260px", 
        display: "flex", 
        flexDirection: "column" 
      }}>
        <div style={{ flexShrink: 0, marginBottom: "0.85rem" }}>
          <h2 style={{ color: white, margin: 0, fontSize: "1.1rem" }}>Data-Driven Master Index Matrix</h2>
          <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", opacity: 0.8 }}>
            Select and manage active index buckets loaded into the local engine.
          </p>
        </div>

        {loading ? (
          <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Scanning remote repositories...</p>
        ) : (
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "6px", 
            overflowY: "auto", 
            flex: 1, 
            paddingRight: "6px" 
          }}>
            {availableIndexes.length === 0 ? (
              <p style={{ fontStyle: "italic", opacity: 0.6, fontSize: "0.8rem" }}>No indices found in scanned buckets.</p>
            ) : (
              availableIndexes.map((item) => {
                const isCached = downloadedIndexes.includes(item.fileName) || localCache.has(item.fileName);
                const isMounted = loadedIndexes.includes(item.fileName);
                const isLoading = loadingKeys.includes(item.key);

                const cleanEraLabel = item.era.replace("_", " ");
                
                const readableCube = item.cube
                  ? item.cube
                      .replace("history_", "")
                      .split("_")
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(" ")
                  : "";

                const readableEra = `${cleanEraLabel} ${readableCube}`.trim();

                return (
                  <div 
                    key={`${item.fileName}-${item.era}-${item.cube}-${item.tier}`}
                    style={{ 
                      display: "grid", 
                      gridTemplateColumns: "1fr auto auto", 
                      gap: "12px",
                      alignItems: "center", 
                      background: "rgba(0,0,0,0.2)", 
                      padding: "6px 8px 6px 12px", 
                      borderRadius: "999px", 
                      fontSize: "0.85rem",
                      flexShrink: 0
                    }}
                  >
                    {/* LEFT: Abbreviated Name & Badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", whiteSpace: "nowrap" }}>
                      <span style={{ 
                        fontSize: "0.6rem", 
                        background: item.tier === "pro" ? "rgb(152, 91, 12)" : "rgb(27, 99, 116)", 
                        padding: "2px 6px", 
                        borderRadius: "999px", 
                        fontWeight: "bold", 
                        textTransform: "uppercase" 
                      }}>
                        {item.tier.charAt(0)}
                      </span>
                      <span style={{ fontWeight: "600", textOverflow: "ellipsis", overflow: "hidden", textTransform: "capitalize" }}>
                        {readableEra} 
                      </span>
                    </div>

            {/* MIDDLE: Download / Delete Button */}
            <div style={{ minWidth: "85px", textAlign: "center" }}>
                {!isCached ? (
                  <button
                    disabled={isLoading}
                    onClick={() => handleDownloadAndMountClick(item)}
                    style={{ 
                      background: "transparent", 
                      color: white, 
                      border: "1px solid rgba(255,255,255,0.4)", 
                      borderRadius: "999px", 
                      padding: "4px 10px", 
                      fontSize: "0.75rem", 
                      cursor: isLoading ? "not-allowed" : "pointer", 
                      opacity: isLoading ? 0.5 : 1,
                      width: "100%",
                      fontWeight: "500"
                    }}
                  >
                    {isLoading ? "Adding..." : "Add"}
                  </button>
                ) : (
                  <button
                    disabled={isLoading}
                    onClick={() => handleDeleteClick(item)}
                    style={{ 
                      background: "transparent", 
                      color: red, 
                      border: `1px solid ${red}`, 
                      borderRadius: "999px", 
                      padding: "4px 10px", 
                      fontSize: "0.75rem", 
                      cursor: isLoading ? "not-allowed" : "pointer", 
                      opacity: isLoading ? 0.5 : 1,
                      width: "100%",
                      fontWeight: "500"
                    }}
                  >
                    {isLoading ? "Removing..." : "Remove"}
                  </button>
                )}
              </div>

                    {/* RIGHT: Engine Status */}
                    <div style={{ minWidth: "85px", textAlign: "center" }}>
                      <span style={{ 
                        display: "block",
                        background: isCached ? "#15803d" : "transparent", 
                        color: isCached ? white : "rgba(255,255,255,0.4)", 
                        border: `1px solid ${isCached ? "#15803d" : "rgba(255,255,255,0.2)"}`, 
                        borderRadius: "999px", 
                        padding: "4px 8px", 
                        fontSize: "0.7rem", 
                        fontWeight: isCached ? "bold" : "normal"
                      }}>
                        {isCached ? "✓ Mounted" : "Unmounted"}
                      </span>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* WINDOW 2: PRE-AGGREGATED INDEX MATRIX SUMMARY GRID */}
      <div style={{ 
        background: "#18181b", 
        border: "1px solid #27272a", 
        borderRadius: "8px", 
        padding: "1rem", 
        fontFamily: "monospace", 
        color: "#d4d4d8", 
        fontSize: "0.75rem",
        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #27272a", paddingBottom: "8px", marginBottom: "10px" }}>
          <h3 style={{ margin: 0, color: "#f4f4f5", fontSize: "0.8rem" }}>📈 Pre-Aggregated Index Matrix Summary</h3>
          <span style={{ fontSize: "10px", color: "#71717a" }}>Total Groups: {index.length}</span>
        </div>

        {index.length === 0 ? (
          <p style={{ color: "#71717a", fontStyle: "italic", margin: 0 }}>
            No indices loaded into context. Download any repository shard layer above to populate the local engine.
          </p>
        ) : (
          <div style={{ maxHeight: "180px", overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 2fr", gap: "8px", borderBottom: "1px solid #27272a", paddingBottom: "6px", color: "#a1a1aa", fontWeight: "bold", position: "sticky", top: 0, background: "#18181b" }}>
              <div>Year</div>
              <div>Category Group</div>
              <div>Count</div>
              <div>UUID Vectors</div>
            </div>
            
            {index.slice(0, 100).map((row, idx) => {
              const uuids = Array.from(row.uuids || []);
              return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 2fr", gap: "8px", padding: "4px 0", borderBottom: "1px solid #222" }}>
                  <div style={{ color: "#fbbf24", fontWeight: "bold" }}>{row.year}</div>
                  <div style={{ color: "#38bdf8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.category}</div>
                  <div style={{ color: "#34d399" }}>{row.event_count}</div>
                  <div style={{ color: "#52525b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    [{uuids.slice(0, 2).join(', ')}{uuids.length > 2 ? '...' : ''}] ({uuids.length})
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}