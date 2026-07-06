"use client";

import { useEffect, useState } from "react";
import { 
  getLocalCacheManifest, 
  getShard, 
  loadShardIntoEngine, 
  syncSessionAggregations, 
  unloadShardFromEngine 
} from "./storage";

// Assume your storage utils has a delete mechanism or cache clearance.
// If it's pure OPFS, this typically removes the file handle from root directory.
// For the sake of this code, we'll assume it handles removing the file from OPFS.
import { deleteShardFromCache } from "./storage"; 

const black = 'rgb(31,31,31)';
const white = 'rgb(245,245,245)';
const red = 'rgb(162, 5, 5)';
const green ='rgb(27, 99, 116)';
const blue = 'rgb(65,105,225)';
const brick = 'rgb(152, 91, 12)';

const BUCKET_CONFIGS = [
  { id: "free", name: "history-files-free", label: "Free Shards", color: green },
  { id: "pro", name: "history-files", label: "Pro Shards", color: brick },
];


export function ShardSelector() {
  const [shardData, setShardData] = useState<Record<string, string[]>>({ free: [], pro: [] });
  const [localCache, setLocalCache] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [timelineMatrix, setTimelineMatrix] = useState<any[]>([]);
  const [activeSessionShards, setActiveSessionShards] = useState<Set<string>>(new Set());

  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  const syncCacheManifest = async () => {
    const manifest = await getLocalCacheManifest();
    setLocalCache(manifest);
  };

  useEffect(() => {
    async function initComponent() {
      try {
        setLoading(true);
        setError(null);
        await syncCacheManifest();

        // set up the data fetch
        const fetchPromises = BUCKET_CONFIGS.map(async (bucket) => {
          const res = await fetch(`/api/categories?bucket=${bucket.name}`);
          if (!res.ok) throw new Error(`Failed fetching ${bucket.label}`);
          const categories = await res.json();
          return { id: bucket.id, categories };
        });

          // get results then make into usable shape
        const results = await Promise.all(fetchPromises);
        const newDataMap = results.reduce((acc, curr) => {
          acc[curr.id] = curr.categories;
          return acc;
        }, {} as Record<string, string[]>);

        // display the data
        setShardData(newDataMap);

        addLog(`Loaded catalog. Cross-referencing local cache structures...`);
      } catch (err: any) {
        setError(err.message);
        addLog(`❌ Error loading layout: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    initComponent();
  }, []);

  const handleDownloadClick = async (category: string, bucketName: string) => {
    const success = await getShard(category, bucketName, addLog);
    if (success) {
      await syncCacheManifest();
    }
  };

  const handleLoadClick = async (category: string, bucketName: string) => {
    addLog(`🚀 Processing session timeline matrix update for "${category}"...`);

    const { success, fileName } = await getShard(category, bucketName, addLog);
    if (!success) return;

    await syncCacheManifest();

    const updatedShards = new Set(activeSessionShards);
    const isCurrentlyMounted = updatedShards.has(fileName);

    if (isCurrentlyMounted) {
      await unloadShardFromEngine(fileName, addLog);
      updatedShards.delete(fileName);
    } else {
      await loadShardIntoEngine(fileName, addLog);
      updatedShards.add(fileName);
    }
    
    setActiveSessionShards(updatedShards);

    const activeFileList = Array.from(updatedShards);
    const dynamicMatrix = await syncSessionAggregations(activeFileList, addLog);
    
    setTimelineMatrix(dynamicMatrix || []);
  };

  const handleDeleteClick = async (category: string, bucketName: string) => {
    const fileName = `${bucketName}__${category}__post_1900.parquet`;
    addLog(`🗑️ Requesting deletion for cached shard "${fileName}"...`);

    // Safety check: If it's loaded in DuckDB engine, unmount it first
    if (activeSessionShards.has(fileName)) {
      addLog(`⚠️ Shard active in engine. Unmounting before deletion...`);
      await unloadShardFromEngine(fileName, addLog);
      
      const updatedShards = new Set(activeSessionShards);
      updatedShards.delete(fileName);
      setActiveSessionShards(updatedShards);
      
      // Refresh the timeline matrix since a shard was dropped
      const activeFileList = Array.from(updatedShards);
      const dynamicMatrix = await syncSessionAggregations(activeFileList, addLog);
      setTimelineMatrix(dynamicMatrix || []);
    }

    // Call deletion storage handler (ensure this exists in your storage layer)
    if (typeof deleteShardFromCache === 'function') {
      await deleteShardFromCache(fileName, addLog);
    }
    
    await syncCacheManifest();
    addLog(`✅ Successfully purged "${fileName}" from local cache.`);
  };

  return (
    <div style={{backgroundColor:blue, padding: "2rem", fontFamily: "sans-serif", width: "auto", margin: "0 auto" }}>
      <h2 style={{color: white}} >Historical Data Shards</h2>
  
      
      <hr style={{ margin: "1.5rem 0", borderColor: "#eaeaea" }} />

      {loading && <p style={{ color: "#0070f3" }}>Loading available shards from R2...</p>}
      {error && (
        <div style={{ padding: "1rem", background: "#fee2e2", color: "#991b1b", borderRadius: "6px", marginBottom: "1rem" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && !error && BUCKET_CONFIGS.map((config) => {
        const categories = shardData[config.id] || [];
        return (
          <div key={config.id} style={{ marginBottom: "2rem" }}>
            <h3 style={{ fontSize: "1.1rem", color: white, marginBottom: "0.5rem" }}>{config.label}</h3>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {categories.length === 0 ? (
                <p style={{ color: "#888", fontSize: "0.9rem" }}>No shards available in this tier.</p>
              ) : (
                categories.map((category) => {
                  const currentFileName = `${config.name}__${category}__post_1900.parquet`;
                  const isCached = localCache.has(currentFileName);
                  const isLoaded = activeSessionShards.has(currentFileName);

                  return (
                    /* 💊 CAPSULE PILL CONTAINER */
                    <div 
                      key={category}
                      style={{
                        display: "inline-flex",
                        borderRadius: "24px", 
                        overflow: "hidden",
                        border: `1px solid ${isCached ? "#333" : config.color}`,
                        boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                      }}
                    >
                      {/* Left Segment: Download / Sync Status */}
                      <button
                        onClick={() => handleDownloadClick(category, config.name)}
                        style={{
                          padding: "0.15rem 1rem",
                          background: isCached ? "#111111" : config.color,
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: "bold",
                          textTransform: "capitalize",
                          fontSize: "0.55rem",
                          transition: "opacity 0.2s ease"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                        {isCached ? `✓ ${category}` : `${category}`}
                      </button>

                      {/* Middle Segment: Load Controller */}
                      <button
                        onClick={() => handleLoadClick(category, config.name)}
                        style={{
                          padding: "0.15rem 1rem",
                          background: isLoaded ? "#79797b" : "#ffffff",
                          color: isCached ? black : config.color, 
                          border: "none",
                          borderLeft: `1px solid ${isCached ? black : config.color}`,
                          cursor: "pointer",
                          fontWeight: "bold",
                          fontSize: "0.55rem",
                          transition: "background 0.2s ease"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = isLoaded ? "#d4d4d8" : "#f4f4f5")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isLoaded ? "#e4e4e7" : "#ffffff")}
                      >
                        {isLoaded ? "Unload" : "Load"}
                      </button>

                      {/* Right Segment: Delete (Only active/visible if file is cached) */}
                      {isCached && (
                        <button
                          onClick={() => handleDeleteClick(category, config.name)}
                          title="Delete local cache file"
                          style={{
                            padding: "0.15rem 0.75rem",
                            background: white,
                            color: red, 
                            border: "none",
                            borderLeft: `1px solid #333`,
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "0.55rem",
                            transition: "all 0.2s ease text-align"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#fee2e2";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#ffffff";
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}

      {/* Log Console */}
      <div style={{ background: "#1e1e1e", color: "#00ff00", padding: "1rem", borderRadius: "6px", fontFamily: "monospace", minHeight: "150px", maxHeight: "250px", overflowY: "auto" }}>
        <div style={{ borderBottom: "1px solid #333", paddingBottom: "0.25rem", marginBottom: "0.5rem", color: "#aaa", fontSize: "0.85rem" }}>
         Log Console
        </div>
        {logs.length === 0 && <span style={{ color: "#555" }}>Waiting for interaction...</span>}
        {logs.map((log, idx) => (
          <div key={idx} style={{ marginBottom: "0.25rem", fontSize: "0.7rem" }}>{log}</div>
        ))}
      </div>
      <br/>

      {/* Debug Timeline Matrix */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300">
        <div className="flex justify-between items-center mb-2 border-b border-zinc-800 pb-2">
          <h3 className="font-bold text-zinc-100 text-sm">📈 Active Timeline Matrix Slice (Top 10)</h3>
          <span className="text-[10px] text-zinc-500">
            Total active intersections: {timelineMatrix.length}
          </span>
        </div>

        {timelineMatrix.length === 0 ? (
          <p className="text-zinc-500 italic py-2">No shards active. Toggle data categories above to compile the timeline matrix.</p>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1 pr-2">
            <div className="grid grid-cols-4 gap-2 border-b border-zinc-800 pb-1 text-zinc-400 font-bold mb-2">
              <div>Year</div>
              <div>Category Segment</div>
              <div>Event Count</div>
              <div>UUIDs Array Sample</div>
            </div>
            
            {timelineMatrix.slice(0, 10).map((row, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 hover:bg-zinc-800/50 py-1 rounded transition-colors">
                <div className="text-amber-400 font-bold">{row.year}</div>
                <div className="text-sky-400 truncate">{row.shard_category}</div>
                <div className="text-emerald-400">{row.event_count} events</div>
                <div className="text-zinc-500 truncate">
                  {(() => {
                    const jsArray = row.uuids && typeof row.uuids.toArray === 'function' 
                      ? row.uuids.toArray() 
                      : (Array.isArray(row.uuids) ? row.uuids : []);

                    return (
                      <>
                        [{jsArray.slice(0, 2).join(', ')}{jsArray.length > 2 ? '...' : ''}]
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}