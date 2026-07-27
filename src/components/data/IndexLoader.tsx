"use client";

import { useState } from "react";
import { getMasterIndex } from "./cloudR2";
import { AvailableIndex } from "./dataTypes";
import { useAppStore } from "@/providers/AppStoreProvider";
import { useDATAStore } from "@/stores/useDataStore";
import { setTerrainTable } from "./analytics";

const white = "rgb(245,245,245)";
const red = "rgb(162, 5, 5)";
const blue = "rgb(65,105,225)";
const green = "rgb(27, 99, 116)";

// Helper: Formats category and version into clean title (e.g., "Music Albums V1")
function formatIndexDisplayName(category = "", version = "v1"): string {
  const formattedCategory = category
    .replace(/^category=/i, "")
    .replace(/^history_/i, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const formattedVersion = version.replace(/^version=/i, "").trim().toUpperCase();

  return `${formattedCategory} ${formattedVersion}`.trim();
}

export function IndexLoader() {
  // Local UI State (Debug Log Window)
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  // App Store Context
  const activeAccount = useAppStore((s) => s.activeAccount);

  // Zustand State (Single Source of Truth)
  const availableIndexes = useDATAStore((s) => s.availableIndexes);
  const downloadedIndexes = useDATAStore((s) => s.downloadedIndexes);
  const loadingKeys = useDATAStore((s) => s.loadingKeys);
  const isInitializing = useDATAStore((s) => s.isInitializing);
  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);

  // Zustand Actions
  const addDownloadedIndex = useDATAStore((s) => s.addDownloadedIndex);
  const addToDataView = useDATAStore((s) => s.addToDataView);
  const removeFromDataView = useDATAStore((s) => s.removeFromDataView);
  const setKeyLoading = useDATAStore((s) => s.setKeyLoading);
  const setTerrainReady = useDATAStore((s) => s.setTerrainReady);
  const setIsGeologicalTime = useDATAStore((s) => s.setIsGeologicalTime);

  const handleToggleDataView = async (item: AvailableIndex) => {
    if (!activeAccount?.id) return;

    const  fileName  = item.fileName;
    //do we already have this item in the activeIndexes array?
    const isActive = activeDataViewIndexes.some((active) => active.fileName === fileName);

    setKeyLoading(fileName, true);

    try {
      setTerrainReady(false); // Lock the gate while updating terrain

      // IF we DON'T have the index in the dataView already
      if (!isActive) {
        // --- ADD FLOW ---
        if (!downloadedIndexes.includes(fileName)) {
          addLog(`☁️ Downloading ${fileName}...`);
          const { success } = await getMasterIndex({
            item,
            accountId: activeAccount.id,
          });
          if (!success) throw new Error("Cloud download failed.");
          addDownloadedIndex(fileName); // Sync local disk state
        }
        // Then add to data view
        await addToDataView(item, activeAccount.id);
      } else {
        // --- REMOVE FLOW ---
        await removeFromDataView(fileName, activeAccount.id);
      }

      // --- RECOMPILE DUCKDB TABLE ---
      const activeFileNames = useDATAStore
        .getState()
        .activeDataViewIndexes.map((i) => i.fileName);

      console.log(`🦆 Recompiling master_terrain...`);
      const { success } = await setTerrainTable(activeFileNames);

      if (success) {
        setTerrainReady(true);
        addLog(
          isActive
            ? `🟢 Cleared ${fileName} from active view.`
            : `✅ Successfully integrated ${fileName}.`
        );
      } else {
        setTerrainReady(false);
        throw new Error("Failed to compile terrain.");
      }
    } catch (err: any) {
      addLog(`❌ Action failed: ${err.message}`);

      // Revert Zustand state on failure
      if (!isActive) {
        await removeFromDataView(fileName, activeAccount.id);
      } else {
        await addToDataView(item, activeAccount.id);
      }
      setTerrainReady(false);
    } finally {
      setKeyLoading(fileName, false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column",  minWidth: "250px", margin: "0 auto", fontFamily: "sans-serif" }}>


<div className="flex items-center gap-3 p-2">
  <label className="text-sm text-gray-300 cursor-pointer flex items-center gap-2">
    <input 
      type="checkbox" 
      checked={isGeologicalTime}
      onChange={(e) => setIsGeologicalTime(e.target.checked)}
      className="w-4 h-4 accent-green-500 bg-gray-800 border-gray-700 rounded"
    />
    Enable Deep Geological Time
  </label>
  <span className="text-xs text-gray-500">
    {isGeologicalTime ? "(Full History)" : "(Limited to 50,000 years)"}
  </span>
</div>


      {/* WINDOW 1: INDEX SHARD SELECTION PILLS */}
      <div style={{ backgroundColor: blue,  color: white, height: "auto", maxHeight: "700px", display: "flex", flexDirection: "column" }}>
        <div style={{ flexShrink: 0, marginBottom: "0.85rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Select your histories</h2>
        </div>

        {isInitializing ? (
          <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Starting Analytical Engine...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", flex: 1}}>
            {availableIndexes.map((item) => {
              const isDownloaded = downloadedIndexes.includes(item.fileName);
              const isActive = activeDataViewIndexes.some((active) => active.fileName === item.fileName);
              const isLoading = loadingKeys.includes(item.fileName);
              const displayName = formatIndexDisplayName(item.category, item.version);

              return (
                <div key={item.fileName} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1px",
                  alignItems: "center",
                  background: isActive ? "rgba(181, 218, 195, 0.3)" : "rgba(0,0,0,0.2)",
                  padding: "0px",
                  fontSize: "0.6rem",
                }}>

                  {/* LEFT: Tier Badge & Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{
                      fontSize: "0.6rem",
                      background: item.tier === "pro" ? "rgb(152, 91, 12)" : "rgb(27, 99, 116)",
                      padding: "4px 6px",
                      fontWeight: "light",
                      textTransform: "uppercase"
                    }}>
                      {item.tier ? item.tier.charAt(0) : "F"}
                    </span>
                    <span style={{ paddingLeft:"4px", fontWeight: "100", fontSize: "0.6rem", textOverflow: "ellipsis", overflow: "hidden" }}>
                      {displayName}
                    </span>
                  </div>

                  {/* RIGHT: Action Button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      disabled={isLoading}
                      onClick={() => handleToggleDataView(item)}
                      style={{
                        border: "none",
                        background: isActive ? "rgba(222,222,222,0.7)" : "rgba(239, 166, 237, 0.1)",
                        color: isActive ? red : white,
                        fontSize: "0.6rem",
                        cursor: isLoading ? "not-allowed" : "pointer",
                        opacity: isLoading ? 0.5 : 1,
                        padding: "4px 8px",
                        marginLeft: "8px",
                        fontWeight: "400",
                        transition: "all 0.2s"
                      }}
                    >
                      {isLoading ? "Working..." : isActive ? "Remove" : "Add"}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WINDOW 2: LOGS 
      <div style={{ background: "#111", color: "#0f0", padding: "12px", borderRadius: "8px", height: "150px", overflowY: "auto", fontSize: "0.75rem", fontFamily: "monospace" }}>
        {logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>*/}
    </div>
  );
}
