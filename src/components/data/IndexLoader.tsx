"use client";

import { useEffect, useState } from "react";
import { 
  fetchAvailableIndexes,
  getLocalCacheManifest, 
  getMasterIndex,
  AvailableIndex,
  buildLocalIndex,
} from "./storage"; 
import { useAppStore } from '@/providers/AppStoreProvider';
import { deleteOPFSFile } from './manageOPFS';
import { getIndex } from './analytics';

const white = 'rgb(245,245,245)';
const red = 'rgb(162, 5, 5)';
const blue = 'rgb(65,105,225)';

export function IndexLoader() {
  const [availableIndexes, setAvailableIndexes] = useState<AvailableIndex[]>([]);
  const [localCache, setLocalCache] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [index, setIndex] = useState<any[]>([]);

  const activeAccount = useAppStore((s) => s.activeAccount);
  
  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  // Complete loop state sync coordinator
  const syncWorkspaceState = async () => {
    const manifest = await getLocalCacheManifest('indexes');
    addLog(`[syncWorkspaceState] Cache manifest contains ${manifest.size} cached indexes.`);
    setLocalCache(manifest);
    return manifest;
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

        await syncWorkspaceState();
        await rebuildAndLoadIndex();

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

    addLog(`Preparing download parameters for: "${item.fileName}"...`);

    const { success, targetFileName } = await getMasterIndex({
      item,
      accountId: activeAccount.id,
      onLog: addLog,
    });

    if (success) {
      await syncWorkspaceState();
      await rebuildAndLoadIndex();
    }
  };

  // 🗑️ Handle Cache Eviction Action
  const handleDeleteClick = async (fileName: string) => {
    addLog(`Evicting index byte fragments from browser OPFS disk: "${fileName}"...`);
    const result = await deleteOPFSFile('indexes', fileName);
    
    if (!result) {
      addLog(`❌ Delete failed for ${fileName}`);
    } else {
      await syncWorkspaceState();
      await rebuildAndLoadIndex();
      addLog(`🟢 Cache maps cleared for ${fileName}. Metrics updated.`);
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
              const isCached = localCache.has(item.fileName);
              const cleanEraLabel = item.era.replace("_", " ");
              
              const readableCube = item.cube
                ? item.cube
                    .replace("history_cube", "")
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
                      {readableEra} <span style={{ opacity: 0.6, fontWeight: "normal" }}>Index</span>
                    </span>
                  </div>

                  {/* MIDDLE: Download / Delete */}
                  <div style={{ minWidth: "75px", textAlign: "center" }}>
                    {!isCached ? (
                      <button
                        onClick={() => handleDownloadAndMountClick(item)}
                        style={{ 
                          background: "transparent", 
                          color: white, 
                          border: "1px solid rgba(255,255,255,0.3)", 
                          borderRadius: "999px", 
                          padding: "4px 10px", 
                          fontSize: "0.75rem", 
                          cursor: "pointer", 
                          width: "100%" 
                        }}
                      >
                        Download
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(item.fileName)}
                        style={{ 
                          background: "transparent", 
                          color: red, 
                          border: `1px solid ${red}`, 
                          borderRadius: "999px", 
                          padding: "4px 10px", 
                          fontSize: "0.75rem", 
                          cursor: "pointer", 
                          width: "100%" 
                        }}
                      >
                        Delete
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

    {/* WINDOW 2: ENGINE EXECUTION CONSOLE */}
    <div style={{ 
      background: "#1e1e1e", 
      color: "#00ff00", 
      padding: "1rem", 
      borderRadius: "8px", 
      fontFamily: "monospace", 
      fontSize: "0.75rem",
      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)"
    }}>
      <div style={{ borderBottom: "1px solid #333", paddingBottom: "0.35rem", marginBottom: "0.5rem", color: "#aaa", fontSize: "0.8rem", fontWeight: "bold" }}>
        Engine Execution Console
      </div>
      <div style={{ maxHeight: "110px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
        {logs.length === 0 ? (
          <div style={{ color: "#555", fontStyle: "italic" }}>Console ready. Awaiting commands...</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} style={{ lineHeight: "1.3" }}>{log}</div>
          ))
        )}
      </div>
    </div>

    {/* WINDOW 3: PRE-AGGREGATED INDEX MATRIX SUMMARY GRID */}
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