"use client";

import { useEffect, useState } from "react";
import { getLocalCacheManifest, getShard, loadShardIntoEngine, getRandomRows } from "./storage";

const BUCKET_CONFIGS = [
  { id: "free", name: "history-files-free", label: "Free Shards", color: "#0070f3" },
  { id: "pro", name: "history-files", label: "Pro Shards", color: "#985b0c" },
];

export function ShardSelector() {
  const [shardData, setShardData] = useState<Record<string, string[]>>({ free: [], pro: [] });
  const [localCache, setLocalCache] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [samples, setSamples] = useState<any[]>([]);

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

        const fetchPromises = BUCKET_CONFIGS.map(async (bucket) => {
          const res = await fetch(`/api/categories?bucket=${bucket.name}`);
          if (!res.ok) throw new Error(`Failed fetching ${bucket.label}`);
          const categories = await res.json();
          return { id: bucket.id, categories };
        });

        const results = await Promise.all(fetchPromises);
        const newDataMap = results.reduce((acc, curr) => {
          acc[curr.id] = curr.categories;
          return acc;
        }, {} as Record<string, string[]>);

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

// Triggered when clicking the left side of the pill (Download)
  const handleDownloadClick = async (category: string, bucketName: string) => {
    const success = await getShard(category, bucketName, addLog);
    if (success) {
      await syncCacheManifest(); // Turns button black
    }
  };

const handleLoadClick = async (category: string, bucketName: string) => {
    setSamples([]); 
    addLog(`🚀 Load workflow initiated for "${category}"...`);

    // 1. Run the safety check and grab the verified filename string from getShard
    const { success, fileName } = await getShard(category, bucketName, addLog);
    
    if (!success) {
      addLog(`❌ Load aborted because the file could not be retrieved.`);
      return;
    }

    // Print the definitive filename out to your UI logs for validation
    addLog(`filename is ${fileName}`);

    await syncCacheManifest();
    
    // 2. Pass that exact verified string straight into the loaders
    const mountedSuccessfully = await loadShardIntoEngine(fileName, addLog);
    if (!mountedSuccessfully) return;

    // 3. Query the exact same verified filename workspace
    const dataSample = await getRandomRows(fileName, 5, addLog);
    
    if (dataSample && dataSample.length > 0) {
      setSamples(dataSample); 
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", width: "700px", margin: "0 auto" }}>
      <h2>Historical Data Shards</h2>
      <p style={{ color: "#666" }}>Select a category shard to pull from Cloudflare R2 storage.</p>
      
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
            <h3 style={{ fontSize: "1.1rem", color: "#333", marginBottom: "0.5rem" }}>{config.label}</h3>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {categories.length === 0 ? (
                <p style={{ color: "#888", fontSize: "0.9rem" }}>No shards available in this tier.</p>
              ) : (
                categories.map((category) => {
                  const currentFileName = `${config.name}__${category}__post_1900.parquet`;
                  const isCached = localCache.has(currentFileName);

                  return (
                    /* 💊 CAPSULE PILL CONTAINER */
                    <div 
                      key={category}
                      style={{
                        display: "inline-flex",
                        borderRadius: "24px", // High rounding enforces the pill shape
                        overflow: "hidden",
                        border: `1px solid ${isCached ? "#333" : config.color}`,
                        boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                      }}
                    >
                      {/* Left Side: Sync Controller */}
                      <button
                        onClick={() => handleDownloadClick(category, config.name)}
                        style={{
                          padding: "0.5rem 1rem",
                          background: isCached ? "#111111" : config.color,
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: "bold",
                          textTransform: "capitalize",
                          fontSize: "0.85rem",
                          transition: "opacity 0.2s ease"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                        {isCached ? `✓ ${category}` : `Download ${category}`}
                      </button>

                      {/* Right Side: Load Controller */}
                      <button
                        onClick={() => handleLoadClick(currentFileName, config.name)}
                        style={{
                          padding: "0.5rem 1rem",
                          background: "#ffffff",
                          // Text color matches its parent tier context for visual balance
                          color: isCached ? "#111111" : config.color, 
                          border: "none",
                          borderLeft: `1px solid ${isCached ? "#333" : config.color}`,
                          cursor: "pointer",
                          fontWeight: "bold",
                          fontSize: "0.85rem",
                          transition: "background 0.2s ease"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f4f5")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                      >
                        Load
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}


        {/* 1. The Log Console layout (Existing) */}
      <div style={{ background: "#1e1e1e", color: "#00ff00", padding: "1rem", borderRadius: "6px", fontFamily: "monospace", minHeight: "150px", maxHeight: "250px", overflowY: "auto" }}>
        <div style={{ borderBottom: "1px solid #333", paddingBottom: "0.25rem", marginBottom: "0.5rem", color: "#aaa", fontSize: "0.85rem" }}>
         Log Console
        </div>
        {logs.length === 0 && <span style={{ color: "#555" }}>Waiting for interaction...</span>}
        {logs.map((log, idx) => (
          <div key={idx} style={{ marginBottom: "0.25rem", fontSize: "0.7rem" }}>{log}</div>
        ))}
      </div>

      {/* 💡 2. NEW: Shard Sampling Results Block (Placed right underneath the logs) */}
      {samples.length > 0 && (
        <div 
          style={{ 
            marginTop: "2rem", 
            padding: "1.25rem", 
            background: "#ffffff", 
            borderRadius: "8px", 
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" 
          }}
        >
          <div style={{ display: "flex", justifyContent: "between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, color: "#1e293b", fontSize: "1.1rem", fontWeight: "bold" }}>
              🎲 Random Shard Sampling Results (5 Rows)
            </h3>
            <span style={{ fontSize: "0.75rem", background: "#f1f5f9", color: "#64748b", padding: "0.25rem 0.5rem", borderRadius: "4px", fontFamily: "monospace" }}>
              source: duckdb
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {samples.map((row, index) => (
              <div 
                key={index}
                style={{
                  position: "relative",
                  background: "#f8fafc",
                  border: "1px solid #f1f5f9",
                  borderRadius: "6px",
                  padding: "1rem",
                  overflow: "hidden"
                }}
              >
                {/* Small indicator label for row sequencing */}
                <div style={{ position: "absolute", top: "4px", right: "8px", fontSize: "0.65rem", color: "#cbd5e1", fontFamily: "monospace" }}>
                  ROW #{index + 1}
                </div>
                
                <pre 
                  style={{ 
                    margin: 0, 
                    fontSize: "0.8rem", 
                    fontFamily: "monospace",
                    color: "#334155",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all"
                  }}
                >
                  {JSON.stringify(row, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}






    </div>
  );
}