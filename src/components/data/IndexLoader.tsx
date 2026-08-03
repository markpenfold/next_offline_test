"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { getMasterIndex } from "./cloudR2";
import { checkFileExists } from "./diskOPFS";
import { AvailableIndex } from "@/components/data/dataTypes";
import { useAppStore } from "@/providers/AppStoreProvider";
import { useDATAStore } from "@/stores/useDataStore";

const white = "rgb(245,245,245)";
const blue = "rgb(65,105,225)";

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
  // Local UI Debug Logs
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  // App Store Context (Account Info)
  const activeAccount = useAppStore((s) => s.activeAccount);

  // Zustand State (Single Source of Truth)
  const availableIndexes = useDATAStore((s) => s.availableIndexes);
  const loadingKeys = useDATAStore((s) => s.loadingKeys);
  const isInitializing = useDATAStore((s) => s.isInitializing);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);
  const slots = useDATAStore((s) => s.slots);

  // Zustand Store Actions
  const setKeyLoading = useDATAStore((s) => s.setKeyLoading);
  const setIsGeologicalTime = useDATAStore((s) => s.setIsGeologicalTime);
  const addToSlot = useDATAStore((s) => s.addToSlot);
  const removeFromSlot = useDATAStore((s) => s.clearFileFromSlots);
  const setSlotColor = useDATAStore((s) => s.setSlotColor);

  /**
   * Toggles an index shard: Checks local slot state -> OPFS disk cache -> Remote R2 download -> Slot Hydration
   */
  const handleToggleDataView = async (item: AvailableIndex) => {
    const fileName = item.fileName;
    // Resolve active account ID (supports object or raw string ID)
    const accountId = typeof activeAccount === "object" ? activeAccount?.id : activeAccount;
    if (!accountId) {
      addLog("❌ Action aborted: Active account context is missing.");
      return;
    }

    // Guard 1: Prevent duplicate concurrent requests
    if (loadingKeys.includes(fileName)) return;

    const isActive = slots.some((s) => s.fileName === fileName);

    try {
      setKeyLoading(fileName, true);
      // ========================================================================
      // 1. REMOVAL PATH: Index is already active in a hardware slot
      // ========================================================================
      if (isActive) {
        removeFromSlot(fileName);
        return;
      }

      // ========================================================================
      // 2. CAPACITY GUARD: Max 12 dynamic stack slots
      // ========================================================================
      const MAX_SLOTS = 12;
      if (slots.length >= MAX_SLOTS) {
        console.log(`⚠️ Maximum slot capacity reached (${MAX_SLOTS}). Remove a dataset first.`);
        return;
      }

      // ========================================================================
      // 3. CHECK LOCAL DISK (OPFS)
      // ========================================================================
      addLog(`Checking local OPFS cache for /indexes/${fileName}...`);
      const existsOnDisk = await checkFileExists("indexes", fileName);

      if (!existsOnDisk) {
        // ======================================================================
        // 4. FETCH FROM REMOTE R2 STORAGE
        // ======================================================================
        console.log(`📡 Cache Miss. Fetching master index from remote storage...`);
        
        const result = await getMasterIndex({
          item,
          accountId,
        });

        if (!result.success) {
          throw new Error(`Failed to download ${fileName} from remote storage.`);
        }
        console.log(`🟢 Downloaded and saved to OPFS: /indexes/${fileName}`);
      } else {
        addLog(`⚡ Local Cache Hit! Found /indexes/${fileName} on disk.`);
      }

      // ========================================================================
      // 5. HYDRATE INTO HARDWARE SLOT & MEMORY
      // ========================================================================
      console.log(`Loading ${fileName} into execution slot...`);
      await addToSlot(item);
 
      console.log(`Successfully activated ${fileName}`);

    } catch (err: any) {
      console.error(`❌ Failed to toggle ${fileName}:`, err);
      console.log(`❌ Error: ${err.message}`);
    } finally {
      // Ensure loading flag is ALWAYS cleared
      setKeyLoading(fileName, false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: "250px", margin: "0 auto", fontFamily: "sans-serif" }}>
      
      {/* GEOLOGICAL TIME TOGGLE */}
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
      <div style={{ backgroundColor: blue, color: white, height: "auto", maxHeight: "700px", display: "flex", flexDirection: "column" }}>
        <div style={{ flexShrink: 0, marginBottom: "0.85rem", padding: "8px 8px 0px 8px" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Select your histories</h2>
        </div>

        {isInitializing ? (
          <p style={{ fontSize: "0.85rem", opacity: 0.7, padding: "8px" }}>Starting Analytical Engine...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", flex: 1 }}>
            {availableIndexes.map((item) => {
              const isLoading = loadingKeys.includes(item.fileName);
              const displayName = formatIndexDisplayName(item.category, item.version);

              // 💡 ACTIVE STACK LOOKUP: Find position in dynamic stack directly
              const matchingSlotIndex = slots.findIndex((s) => s.fileName === item.fileName);
              const isActive = matchingSlotIndex !== -1;
              const matchingSlot = isActive ? slots[matchingSlotIndex] : null;
              const slotColor = matchingSlot?.color;

              return (
                <div 
                  key={item.fileName} 
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "1px",
                    alignItems: "center",
                    background: isActive ? "rgba(181, 218, 195, 0.3)" : "rgba(0,0,0,0.2)",
                    padding: "2px 4px",
                    fontSize: "0.6rem",
                  }}
                >
                  {/* LEFT: Tier Badge & Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", overflow: "hidden", whiteSpace: "nowrap" }}>
                    <span style={{
                      fontSize: "0.6rem",
                      background: item.tier === "pro" ? "rgb(152, 91, 12)" : "rgb(27, 99, 116)",
                      padding: "4px 6px",
                      fontWeight: "normal",
                      textTransform: "uppercase"
                    }}>
                      {item.tier ? item.tier.charAt(0) : "F"}
                    </span>
                    <span style={{ paddingLeft: "4px", fontWeight: "100", fontSize: "0.6rem", textOverflow: "ellipsis", overflow: "hidden" }}>
                      {displayName}
                    </span>
                  </div>

                  {/* RIGHT: Split Control Container */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginLeft: "8px",
                        borderRadius: "2px",
                        overflow: "hidden",
                        opacity: isLoading ? 0.6 : 1,
                      }}
                    >
                      {/* LEFT BOX: Color Swatch & Native Color Picker Overlay */}
                      <div
                        style={{
                          position: "relative",
                          width: "20px",
                          height: "20px",
                          backgroundColor: isActive && slotColor ? slotColor : "rgba(255, 255, 255, 0.05)",
                          border: isActive ? "none" : "1px dashed rgba(255, 255, 255, 0.2)",
                          boxSizing: "border-box",
                          transition: "background-color 0.2s ease",
                          cursor: isActive ? "pointer" : "default",
                        }}
                        title={isActive ? "Click to change timeline color" : undefined}
                      >
                        {/* Invisible native color input over active swatch */}
                        {isActive && matchingSlot && (
                          <input
                            type="color"
                            value={slotColor || "#000000"}
                            onChange={(e) => {
                              if (setSlotColor && matchingSlotIndex !== -1) {
                                setSlotColor(matchingSlotIndex, e.target.value);
                              }
                            }}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              opacity: 0,
                              cursor: "pointer",
                              border: "none",
                              padding: 0,
                            }}
                          />
                        )}
                      </div>

                      {/* RIGHT BOX: Add/Remove Action Trigger */}
                      <button
                        disabled={isLoading}
                        onClick={() => handleToggleDataView(item)}
                        title={isActive ? "Remove dataset" : "Add dataset"}
                        style={{
                          width: "20px",
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          backgroundColor: isLoading
                            ? "rgba(255, 255, 255, 0.2)"
                            : isActive
                            ? "rgb(180, 35, 35)"  // Red box
                            : "rgb(34, 139, 34)", // Green box
                          color: white,
                          cursor: isLoading ? "not-allowed" : "pointer",
                          transition: "background-color 0.2s ease",
                          padding: 0,
                        }}
                      >
                        {isLoading ? (
                          <Loader2 className="animate-spin" size={11} />
                        ) : isActive ? (
                          <X size={11} />
                        ) : (
                          <Plus size={11} />
                        )}
                      </button>
                    </div>
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