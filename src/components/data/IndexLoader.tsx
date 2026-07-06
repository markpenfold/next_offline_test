"use client";

import { useEffect, useState } from "react";
import { 
  fetchAvailableIndexes,
  getLocalCacheManifest, 
  getMasterIndex,
  deleteShardFromCache,
  AvailableIndex,
  readIndexToTable
} from "./storage"; 

const white = 'rgb(245,245,245)';
const red = 'rgb(162, 5, 5)';
const blue = 'rgb(65,105,225)';

export function IndexLoader() {
  const [availableIndexes, setAvailableIndexes] = useState<AvailableIndex[]>([]);
  const [localCache, setLocalCache] = useState<Set<string>>(new Set());
  const [timelineMatrix, setTimelineMatrix] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [index, setIndex] = useState<any[]>([]);
  


  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  // Complete loop state sync coordinator
  const syncWorkspaceState = async () => {
    // 3. Update cache mapping flags and table readouts
    const manifest = await getLocalCacheManifest();
    console.log("Cache manifest for index ", manifest)
    setLocalCache(manifest);
  };

  // 🚀 Live Scan & Initialize on Mount
  useEffect(() => {
    async function initComponent() {
      try {
        setLoading(true);
        addLog("Scanning R2 buckets for available historical indexes...");
        
        const scannedList = await fetchAvailableIndexes();
        setAvailableIndexes(scannedList);
        addLog(`Scan complete! Discovered ${scannedList.length} total index components available.`);

        await syncWorkspaceState();

        let results = await readIndexToTable((msg: string) => {
        // Append each database log directly to our UI state
          setLogs((prev) => [...prev, msg]);
          
        });
        setIndex(results);


      } catch (err: any) {
        addLog(`❌ Sync Error during boot sequence: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
    initComponent();
  }, []);

  // 📡 Handle Dynamic Download Action
  const handleDownloadAndMountClick = async (item: AvailableIndex) => {
    addLog(`📡 Preparing download parameters for: "${item.fileName}"...`);
    const { success } = await getMasterIndex(item.era, item.tier, item.fileName, addLog);
    
    if (success) {
      await syncWorkspaceState();
      addLog(`🟢 "${item.fileName}" loaded and synced into unified database space.`);
    }
  };

  // 🗑️ Handle Cache Eviction Action
  const handleDeleteClick = async (fileName: string) => {
    addLog(`🗑️ Evicting index byte fragments from browser OPFS disk: "${fileName}"...`);
    await deleteShardFromCache(fileName, addLog);
    await syncWorkspaceState();
    addLog(`🟢 Cache maps cleared for ${fileName}. Metrics updated.`);
  };



  return (
    <div style={{ backgroundColor: blue, padding: "2rem", fontFamily: "sans-serif", color: white, maxWidth: "900px", borderRadius: "12px" }}>
      <h2 style={{ color: white, marginTop: 0 }}>Data-Driven Master Index Matrix</h2>
      <p style={{ marginTop: "-10px", fontSize: "0.85rem", opacity: 0.8 }}>System dynamically reads bucket allocations to populate application controllers.</p>
      
      <hr style={{ margin: "1.5rem 0", borderColor: "rgba(255,255,255,0.2)" }} />

      {/* 💾 LIVE STORAGE SIZE FOOTPRINT METRICS PANE */}
      <div style={{ 
        background: "rgba(0, 0, 0, 0.25)", 
        border: "1px solid rgba(255,255,255,0.1)", 
        borderRadius: "8px", 
        padding: "1.2rem 1.5rem", 
        marginBottom: "2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1.5rem"
      }}>
        

      {loading && <p>Scanning remote repositories and reading current cache structures...</p>}

      {!loading && (
        <div style={{ marginBottom: "2rem" }}>
          <h3 style={{ fontSize: "1.1rem", color: white, marginBottom: "0.8rem" }}>Available Repositories (Discovered dynamically)</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {availableIndexes.length === 0 ? (
              <p style={{ fontStyle: "italic", opacity: 0.6 }}>No indices found in the scanned buckets.</p>
            ) : (
              availableIndexes.map((item) => {
                const isCached = localCache.has(item.fileName);
                const cleanEraLabel = item.era.replace("_", " ");
                const readableEra = cleanEraLabel.charAt(0).toUpperCase() + cleanEraLabel.slice(1);
                
                return (
                  <div 
                    key={item.fileName} 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      background: "rgba(0,0,0,0.15)", 
                      padding: "12px 18px", 
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.05)"
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "0.75rem", background: item.tier === "pro" ? "rgb(152, 91, 12)" : "rgb(27, 99, 116)", padding: "2px 6px", borderRadius: "4px", marginRight: "10px", fontWeight: "bold", textTransform: "uppercase" }}>
                        {item.tier}
                      </span>
                      <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>{readableEra} Matrix Segment</span>
                    </div>
                    
                    <div style={{ display: "inline-flex", borderRadius: "20px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)" }}>
                      <button
                        onClick={() => !isCached && handleDownloadAndMountClick(item)}
                        disabled={isCached}
                        style={{
                          padding: "6px 14px",
                          background: isCached ? "#15803d" : "rgba(255,255,255,0.2)",
                          color: white,
                          border: "none",
                          cursor: isCached ? "default" : "pointer",
                          fontSize: "0.7rem",
                          fontWeight: "bold"
                        }}
                      >
                        {isCached ? "✓ Loaded into Engine" : "Download & Mount"}
                      </button>

                      {isCached && (
                        <button
                          onClick={() => handleDeleteClick(item.fileName)}
                          style={{
                            padding: "6px 10px",
                            background: white,
                            color: red,
                            border: "none",
                            borderLeft: "1px solid rgba(0,0,0,0.15)",
                            cursor: "pointer",
                            fontSize: "0.7rem",
                            fontWeight: "bold"
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Activity Logger Tracking UI */}
      <div style={{ background: "#1e1e1e", color: "#00ff00", padding: "1rem", borderRadius: "6px", fontFamily: "monospace", minHeight: "120px", maxHeight: "150px", overflowY: "auto", marginBottom: "20px" }}>
        <div style={{ borderBottom: "1px solid #333", paddingBottom: "0.25rem", marginBottom: "0.5rem", color: "#aaa", fontSize: "0.85rem" }}>
          Engine Execution Console
        </div>
        {logs.map((log, idx) => (
          <div key={idx} style={{ marginBottom: "0.25rem", fontSize: "0.7rem" }}>{log}</div>
        ))}
      </div>

      {/* Real-time Compiled Data Matrix Preview Grid */}
      <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "16px", fontFamily: "monospace", color: "#d4d4d8", fontSize: "0.75rem" }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #27272a", paddingBottom: "8px", marginBottom: "12px" }}>
    <h3 style={{ margin: 0, color: "#f4f4f5", fontSize: "0.85rem" }}>📈 Pre-Aggregated Index Matrix Summary (Top 10 rows from master_index)</h3>
    <span style={{ fontSize: "10px", color: "#71717a" }}>
      Total unique groups matched: {index.length}
    </span>
  </div>

  {index.length === 0 ? (
    <p style={{ color: "#71717a", fontStyle: "italic"}}>No indices loaded into context. Download any repository shard layer capsule above to populate the local engine.</p>
  ) : (
    <div style={{ maxHeight: "240px", overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 2fr", gap: "8px", borderBottom: "1px solid #27272a", paddingBottom: "4px", color: "#a1a1aa", fontWeight: "bold", marginBottom: "8px" }}>
        <div>Year</div>
        <div>Category Group</div>
        <div>Calculated Count</div>
        <div>UUID Vectors Snapshot</div>
      </div>
      
      {index.slice(0, 10).map((row, idx) => {
        // ✨ Clean Win: row.eventUuids is already a guaranteed JS Array from our fetch function!
        const uuids = row.eventUuids; 

        return (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 2fr", gap: "8px", padding: "4px 0", borderBottom: "1px solid #222" }}>
            <div style={{ color: "#fbbf24", fontWeight: "bold" }}>{row.year}</div>
            <div style={{ color: "#38bdf8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.folderName}
            </div>
            <div style={{ color: "#34d399" }}>{row.eventCount} events</div>
            <div style={{ color: "#52525b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              [{uuids.slice(0, 2).join(', ')}{uuids.length > 2 ? '...' : ''}] ({uuids.length} items)
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>

    </div>
    </div>
  );
}