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
      await loadShardIntoEngine(shard.fileName, addLog);
      
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
    <div style={{ backgroundColor: blue, padding: "2rem", color: white, borderRadius: "12px", maxWidth: "900px", margin: "0 auto" }}>
      <h2>Historical Data Shards</h2>
      <hr style={{ margin: "1.5rem 0", borderColor: "rgba(255,255,255,0.2)" }} />

      {loading ? <p>Scanning repositories...</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {availableShards.map((shard) => {
            const isCached = localCache.has(shard.fileName);
            const isLoaded = activeSessionShards.has(shard.fileName);
            
            return (
              <div key={shard.fileName} style={{ display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.15)", padding: "12px", borderRadius: "8px" }}>
                <div>
                  <span style={{ fontSize: "0.7rem", background: shard.tier === 'pro' ? brick : green, padding: "2px 6px", borderRadius: "4px", marginRight: "10px", textTransform: "uppercase" }}>{shard.tier}</span>
                  <span style={{ fontWeight: "bold" }}>{shard.masterCategory.replace(/^master_category=/, "")}</span>
                  <span style={{ fontWeight: "bold" }}> {shard.era}</span>
                </div>
                <div style={{ display: "flex", gap: "5px" }}>
                  <button onClick={() => isCached ? handleToggleLoad(shard) : handleDownloadAndLoad(shard)}>
                    {isLoaded ? "Unload" : (isCached ? "Load" : "Download & Mount")}
                  </button>
                  {isCached && <button onClick={() => handleDeleteClick(shard)} style={{ color: red }}>✕</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log and Matrix UI sections here (as in IndexLoader) */}
    </div>
  );
}