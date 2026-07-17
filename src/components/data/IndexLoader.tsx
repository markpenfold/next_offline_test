"use client";

import { useState } from "react";
import { getMasterIndex } from "./cloudR2";
import { loadShardIntoEngine } from "./duckDATA";
import { AvailableIndex } from "./dataTypes";
import { useAppStore } from '@/providers/AppStoreProvider';
import { deleteOPFSFile } from './diskOPFS';
import { useDATAStore } from '@/stores/useDataStore';
import { setTerrainTable } from "./analytics";

const white = 'rgb(245,245,245)';
const red = 'rgb(162, 5, 5)';
const blue = 'rgb(65,105,225)';
const green ='rgb(27, 99, 116)';

export function IndexLoader() {
  // Local UI State (Just for the debug log window)
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  // App Store Context
  const activeAccount = useAppStore((s) => s.activeAccount);

  // Zustand State (Single Source of Truth)
  const availableIndexes = useDATAStore((s) => s.availableIndexes);
  const downloadedIndexes = useDATAStore((s) => s.downloadedIndexes);
  const loadedIndexes = useDATAStore((s) => s.loadedIndexes);
  const loadingKeys = useDATAStore((s) => s.loadingKeys);
  const isInitializing = useDATAStore((s) => s.isInitializing);
  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);

  // Zustand Actions
  const addDownloadedIndex = useDATAStore((s) => s.addDownloadedIndex);
  const setDownloadedIndexes = useDATAStore((s) => s.setDownloadedIndexes);
  const addLoadedIndex = useDATAStore((s) => s.addLoadedIndex);
  const addToDataView = useDATAStore((s) => s.addToDataView);
  const removeFromDataView = useDATAStore((s) => s.removeFromDataView);
  const setKeyLoading = useDATAStore((s) => s.setKeyLoading);
  const setTerrainReady = useDATAStore((s) => s.setTerrainReady);

  const handleToggleDataView = async (item: AvailableIndex) => {
    if (!activeAccount?.id) return;
    
    const fileName = item.fileName;
    const isActive = activeDataViewIndexes.includes(fileName);
    
    setKeyLoading(item.key, true);

    try {
      setTerrainReady(false); // 🔒 Lock the gate: Views shouldn't query yet

      if (!isActive) {
        // --- ADD FLOW ---
        
        // 1. Download if missing from local OPFS disk
        if (!downloadedIndexes.includes(fileName)) {
          addLog(`☁️ Downloading ${fileName}...`);
          const { success } = await getMasterIndex({
            item,
            accountId: activeAccount.id,
            onLog: addLog,
          });
          if (!success) throw new Error("Cloud download failed.");
          addDownloadedIndex(fileName); // Sync disk state
        }
        // 2. Prepare the new active list
        const nextActiveList = [...activeDataViewIndexes, fileName];
        addToDataView(fileName, activeAccount.id); // Optimistic UI update

        // 3. Let analytics.ts handle the VFS mounting and table compilation
        console.log(`🦆 Recompiling master_terrain...`);
        const { success, error } = await setTerrainTable(nextActiveList);
        
        if (success) {
          setTerrainReady(true)
          addLog(`✅ Successfully integrated ${fileName}.`);
        } else {
          setTerrainReady(false);
          throw new Error("Failed to compile terrain.");
        }
      } else {
        // --- REMOVE FLOW ---
        
        // 1. Prepare remaining active list
        const nextActiveList = activeDataViewIndexes.filter(f => f !== fileName);
        removeFromDataView(fileName, activeAccount.id); // Optimistic UI update

        // 2. Recompile master table without this file
        addLog(`🦆 Removing ${fileName} from terrain...`);
        await setTerrainTable(nextActiveList);
        setTerrainReady(true)
        addLog(`🟢 Cleared ${fileName} from active view.`);
        
        // Note: We deliberately do NOT delete the file from OPFS here.
        // It stays on disk so re-adding it later is instant.
      }
    } catch (err: any) {
      addLog(`❌ Action failed: ${err.message}`);
      // Revert Zustand state on failure
      if (!isActive) removeFromDataView(fileName, activeAccount.id);
      else addToDataView(fileName, activeAccount.id);
      setTerrainReady(false);
    } finally {
      setKeyLoading(item.key, false);
    }
  };

return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "600px", margin: "0 auto", fontFamily: "sans-serif" }}>
      
      {/* WINDOW 1: INDEX SHARD SELECTION PILLS */}
      <div style={{ backgroundColor: blue, padding: "1.25rem", color: white, borderRadius: "12px", height: "300px", display: "flex", flexDirection: "column" }}>
        <div style={{ flexShrink: 0, marginBottom: "0.85rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Terrain Matrix Orchestrator</h2>
          <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", opacity: 0.8 }}>
            Add index buckets to recompile your active master_terrain view.
          </p>
        </div>

        {isInitializing ? (
          <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Starting Analytical Engine...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flex: 1, paddingRight: "6px" }}>
            {availableIndexes.map((item) => {
              const isDownloaded = downloadedIndexes.includes(item.fileName);
              const isActive = activeDataViewIndexes.includes(item.fileName);
              const isLoading = loadingKeys.includes(item.key);

              const readableEra = `${item.era.replace("_", " ")} ${item.cube ? item.cube.replace("history_", "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : ""}`.trim();

              return (
                <div key={item.key} style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1fr auto auto", 
                  gap: "12px", 
                  alignItems: "center", 
                  background: isActive ? "rgba(21, 128, 61, 0.3)" : "rgba(0,0,0,0.2)", 
                  padding: "6px 8px 6px 12px", 
                  borderRadius: "999px", 
                  fontSize: "0.85rem",
                  border: isActive ? `1px solid ${green}` : "1px solid transparent"
                }}>
                  
                  {/* LEFT: Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: "0.6rem", background: item.tier === "pro" ? "rgb(152, 91, 12)" : "rgb(27, 99, 116)", padding: "2px 6px", borderRadius: "999px", fontWeight: "bold", textTransform: "uppercase" }}>
                      {item.tier.charAt(0)}
                    </span>
                    <span style={{ fontWeight: "600", textOverflow: "ellipsis", overflow: "hidden", textTransform: "capitalize" }}>
                      {readableEra} 
                    </span>
                  </div>

                  {/* MIDDLE: Button */}
                  <div style={{ minWidth: "90px", textAlign: "center" }}>
                    <button
                      disabled={isLoading}
                      onClick={() => handleToggleDataView(item)}
                      style={{ 
                        background: isActive ? "transparent" : "rgba(255,255,255,0.1)", 
                        color: isActive ? red : white, 
                        border: `1px solid ${isActive ? red : "rgba(255,255,255,0.4)"}`, 
                        borderRadius: "999px", 
                        padding: "4px 10px", 
                        fontSize: "0.75rem", 
                        cursor: isLoading ? "not-allowed" : "pointer", 
                        opacity: isLoading ? 0.5 : 1, 
                        width: "100%", 
                        fontWeight: "500",
                        transition: "all 0.2s"
                      }}
                    >
                      {isLoading ? "Working..." : isActive ? "Remove" : (isDownloaded ? "Add (Local)" : "Add (Cloud)")}
                    </button>
                  </div>

                  {/* RIGHT: Engine Status */}
                  <div style={{ minWidth: "90px", textAlign: "center" }}>
                    <span style={{ 
                      display: "block", 
                      color: isActive ? green : (isDownloaded ? "#a3e635" : "rgba(255,255,255,0.4)"), 
                      fontSize: "0.7rem", 
                      fontWeight: isActive ? "bold" : "normal" 
                    }}>
                      {isActive ? "● Active View" : (isDownloaded ? "○ Cached" : "○ Remote")}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* WINDOW 2: LOGS */}
      <div style={{ background: "#111", color: "#0f0", padding: "12px", borderRadius: "8px", height: "150px", overflowY: "auto", fontSize: "0.75rem", fontFamily: "monospace" }}>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>
    </div>
  );
}