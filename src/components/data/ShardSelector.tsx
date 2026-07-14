"use client";

import { useEffect, useState } from "react";
import { 
  fetchAvailableDataShards,
  getLocalCacheManifest, 
  getShard, 
  loadShardIntoEngine, 
  syncSessionAggregations, 
  unloadShardFromEngine,
  deleteShardFromCache,
  type AvailableDataShard 
} from "./storage"; 
import { useAppStore } from '@/providers/AppStoreProvider';

const white = 'rgb(245,245,245)';
const red = 'rgb(162, 5, 5)';
const blue = 'rgb(65,105,225)';
const green = 'rgb(27, 99, 116)';
const brick = 'rgb(152, 91, 12)';

export function ShardSelector() {
  const [availableShards, setAvailableShards] = useState<AvailableDataShard[]>([]);
  const [localCache, setLocalCache] = useState<Set<string>>(new Set());
  const [activeSessionShards, setActiveSessionShards] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [timelineMatrix, setTimelineMatrix] = useState<any[]>([]);

  const activeAccount = useAppStore((s) => s.activeAccount);
  
  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  const syncWorkspaceState = async () => {
    const manifest = await getLocalCacheManifest();
    setLocalCache(manifest);
    return manifest;
  };

  const refreshTimeline = async (currentActiveSet: Set<string>) => {
    const activeFileList = Array.from(currentActiveSet);
    const dynamicMatrix = await syncSessionAggregations(activeFileList, addLog);
    setTimelineMatrix(dynamicMatrix || []);
  };

  useEffect(() => {
    let isMounted = true;

    async function initComponent() {
      if (!activeAccount?.id) {
        addLog("⚠️ Waiting for active account context...");
        if (isMounted) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        addLog("Scanning R2 repositories for available data shards...");
        
        const scannedShards = await fetchAvailableDataShards(activeAccount.id);
        if (!isMounted) return;
        
        setAvailableShards(scannedShards);
        addLog(`Catalog loaded: ${scannedShards.length} shards discovered.`);

        await syncWorkspaceState();
      } catch (err: any) {
        if (isMounted) addLog(`❌ Sync Error: ${err.message}`);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initComponent();
    return () => { isMounted = false; };
  }, [activeAccount?.id]);

  const handleDownloadAndLoad = async (shard: AvailableDataShard) => {
    addLog(`📥 Requesting download: "${shard.fileName}"...`);
    const success = await getShard({
        item: shard,
        accountId: activeAccount?.id, // Pass .id string, not the whole object
        onLog: addLog,
      })
    if (success) {
      await syncWorkspaceState();
      addLog(`🚀 Mounting "${shard.fileName}" into engine...`);
      let result = await loadShardIntoEngine(shard.fileName, addLog);
      
      if(!result){
        console.log("problem loading file into db")
        return null}

      const newActive = new Set(activeSessionShards).add(shard.fileName);
      setActiveSessionShards(newActive);
      await refreshTimeline(newActive);
    }
  };

  const handleToggleLoad = async (shard: AvailableDataShard) => {
    const isLoaded = activeSessionShards.has(shard.fileName);
    const updated = new Set(activeSessionShards);

    if (isLoaded) {
      await unloadShardFromEngine(shard.fileName, addLog);
      updated.delete(shard.fileName);
    } else {
      await loadShardIntoEngine(shard.fileName, addLog);
      updated.add(shard.fileName);
    }

    setActiveSessionShards(updated);
    await refreshTimeline(updated);
  };

  const handleDeleteClick = async (shard: AvailableDataShard) => {
    if (activeSessionShards.has(shard.fileName)) {
      await unloadShardFromEngine(shard.fileName, addLog);
      const updated = new Set(activeSessionShards);
      updated.delete(shard.fileName);
      setActiveSessionShards(updated);
      await refreshTimeline(updated);
    }
    
    await deleteShardFromCache(shard.fileName, addLog);
    await syncWorkspaceState();
  };

  return (
  <div style={{ 
    backgroundColor: blue, 
    padding: "1.5rem", 
    color: white, 
    borderRadius: "4px", 
    maxWidth: "500px", 
    margin: "0 auto",
    height: "300px",         // Fixed height constraint
    display: "flex",         // Flex layout to manage scrolling
    flexDirection: "column" 
  }}>
    {/* flexShrink: 0 prevents the header from getting crushed by the scrolling list */}
    <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.2rem", flexShrink: 0 }}>
      Historical Data Shards
    </h2>

    {loading ? (
      <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Scanning repositories...</p>
    ) : (
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        gap: "6px",
        overflowY: "auto",      // Enables vertical scrolling
        flex: 1,                // Forces this container to take up all remaining height
        paddingRight: "8px"     // Adds breathing room so the scrollbar doesn't touch the buttons
      }}>
        {availableShards.map((shard) => {
          const isCached = localCache.has(shard.fileName);
          const isLoaded = activeSessionShards.has(shard.fileName);
          
          // Create an abbreviated name
          const catName = shard.masterCategory.replace(/^master_category=/, "").replace(/_/g, " ");
          const eraName = shard.era.includes("pre") ? "< 1900" : "1900+";

          return (
            <div 
              key={shard.fileName} 
              style={{ 
                display: "grid", 
                gridTemplateColumns: "1fr auto auto", 
                gap: "12px",
                alignItems: "center", 
                background: "rgba(0,0,0,0.2)", 
                padding: "6px 8px 6px 12px", 
                borderRadius: "999px", 
                fontSize: "0.85rem",
                flexShrink: 0       // Ensures the pill doesn't squish when the list overflows
              }}
            >
              {/* LEFT: Abbreviated Name & Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", whiteSpace: "nowrap" }}>
                <span style={{ 
                  fontSize: "0.6rem", 
                  background: shard.tier === 'pro' ? brick : green, 
                  padding: "2px 6px", 
                  borderRadius: "999px", 
                  fontWeight: "bold",
                  textTransform: "uppercase" 
                }}>
                  {shard.tier.charAt(0)} 
                </span>
                <span style={{ fontWeight: "600", textOverflow: "ellipsis", overflow: "hidden", textTransform: "capitalize" }}>
                  {catName} <span style={{ opacity: 0.6, fontWeight: "normal" }}>{eraName}</span>
                </span>
              </div>

              {/* MIDDLE: Download / Delete */}
              <div style={{ minWidth: "75px", textAlign: "center" }}>
                {!isCached ? (
                  <button 
                    onClick={() => handleDownloadAndLoad(shard)}
                    style={{ background: "transparent", color: white, border: "1px solid rgba(255,255,255,0.3)", borderRadius: "999px", padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer", width: "100%" }}
                  >
                    Download
                  </button>
                ) : (
                  <button 
                    onClick={() => handleDeleteClick(shard)}
                    style={{ background: "transparent", color: red, border: `1px solid ${red}`, borderRadius: "999px", padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer", width: "100%" }}
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* RIGHT: Load / Unload */}
              <div style={{ minWidth: "75px", textAlign: "center" }}>
                <button 
                  onClick={() => isCached && handleToggleLoad(shard)}
                  disabled={!isCached}
                  style={{ 
                    background: isLoaded ? white : "transparent", 
                    color: isLoaded ? blue : white, 
                    border: `1px solid ${isLoaded ? white : "rgba(255,255,255,0.3)"}`, 
                    borderRadius: "999px", 
                    padding: "4px 10px", 
                    fontSize: "0.75rem", 
                    cursor: isCached ? "pointer" : "not-allowed",
                    opacity: isCached ? 1 : 0.3, 
                    width: "100%",
                    fontWeight: isLoaded ? "bold" : "normal"
                  }}
                >
                  {isLoaded ? "Unload" : "Load"}
                </button>
              </div>

            </div>
          );
        })}
      </div>
    )}

    {/* Note: Any Log/Matrix UI sections placed here will stay fixed at the bottom of the 300px container */}
  </div>
);
}