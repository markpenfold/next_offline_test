"use client";

import { useState } from "react";
import { Plus, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getMasterIndex } from "./cloudR2";
import { checkFileExists } from "./diskOPFS";
import { AvailableIndex } from "@/components/data/dataTypes";
import { useAppStore } from "@/providers/AppStoreProvider";
import { useDATAStore } from "@/stores/useDataStore";
import styles from "@/app/styles/omenland.module.css";

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

// Helper: Formats min/max years into BC / AD or geological notation
function formatYear(year?: number, isGeologicalTime?: boolean): string {
  if (year === undefined || year === null) return "N/A";
  
  const roundedYear = Math.round(year);

  // If geological flag is explicitly true OR number is massive (> 1 Million years ago)
  const absYear = Math.abs(roundedYear);

  if (isGeologicalTime || absYear >= 1_000_000) {
    if (absYear >= 1_000_000_000) {
      const billion = (absYear / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 });
      return `${billion}B BC`; // e.g. "1.5B YA" (or "1.5 Ga")
    }
    if (absYear >= 1_000_000) {
      const million = (absYear / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 });
      return `${million}M BC`; // e.g. "88M YA" (or "88 Ma")
    }
    if (isGeologicalTime) {
      return `${absYear.toLocaleString()} YA`;
    }
  }

  // Standard historical BC / AD formatting
  return roundedYear < 0 ? `${Math.abs(roundedYear).toLocaleString()} BC` : `${roundedYear} AD`;
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
  const downloadStatuses = useDATAStore((s) => s.downloadStatuses);

  // Zustand Store Actions
  const setKeyLoading = useDATAStore((s) => s.setKeyLoading);
  const addToSlot = useDATAStore((s) => s.addToSlot);
  const removeFromSlot = useDATAStore((s) => s.clearFileFromSlots);
  const setSlotColor = useDATAStore((s) => s.setSlotColor);
  const syncFullDataShards = useDATAStore((s) => s.syncFullDataShards);

  // DYNAMIC SORTING LOGIC
  const sortedAvailableIndexes = [...availableIndexes].sort((a, b) => {
    const slotIdxA = slots.findIndex((s) => s.fileName === a.fileName);
    const slotIdxB = slots.findIndex((s) => s.fileName === b.fileName);

    const isAActive = slotIdxA !== -1;
    const isBActive = slotIdxB !== -1;

    // 1. Both active: Reverse order of slots so newest item is at position 0
    if (isAActive && isBActive) {
      return slotIdxB - slotIdxA;
    }

    // 2. Active items always sit above inactive items
    if (isAActive) return -1;
    if (isBActive) return 1;

    // 3. Inactive items: Free tier above Pro tier
    const isAFree = a.tier !== "pro";
    const isBFree = b.tier !== "pro";
    if (isAFree && !isBFree) return -1;
    if (!isAFree && isBFree) return 1;

    // 4. Default fallback: Alphabetical sorting
    return a.fileName.localeCompare(b.fileName);
  });

  /**
   * Toggles an index shard: Checks local slot state -> OPFS disk cache -> Remote R2 download -> Slot Hydration
   */
  const handleToggleDataView = async (item: AvailableIndex) => {
    const fileName = item.fileName;
    const accountId = typeof activeAccount === "object" ? activeAccount?.id : activeAccount;
    if (!accountId) {
      addLog("❌ Action aborted: Active account context is missing.");
      return;
    }

    if (loadingKeys.includes(fileName)) return;

    const isActive = slots.some((s) => s.fileName === fileName);

    try {
      setKeyLoading(fileName, true);
      if (isActive) {
        removeFromSlot(fileName);
        return;
      }

      const MAX_SLOTS = 12;
      if (slots.length >= MAX_SLOTS) {
        console.log(`⚠️ Maximum slot capacity reached (${MAX_SLOTS}). Remove a dataset first.`);
        return;
      }

      addLog(`Checking local OPFS cache for /indexes/${fileName}...`);
      const existsOnDisk = await checkFileExists("indexes", fileName);

      if (!existsOnDisk) {
        console.log(`📡 Cache Miss. Fetching master index from remote storage...`);
        const result = await getMasterIndex({ item, accountId });

        if (!result.success) {
          throw new Error(`Failed to download ${fileName} from remote storage.`);
        }
        console.log(`🟢 Downloaded and saved to OPFS: /indexes/${fileName}`);
      } else {
        addLog(`⚡ Local Cache Hit! Found /indexes/${fileName} on disk.`);
      }

      console.log(`Loading ${fileName} into execution slot...`);
      await addToSlot(item);

      syncFullDataShards(item, accountId);
      console.log(`Successfully activated ${fileName}`);

    } catch (err: any) {
      console.error(`❌ Failed to toggle ${fileName}:`, err);
      console.log(`❌ Error: ${err.message}`);
    } finally {
      setKeyLoading(fileName, false);
    }
  };

  return (
    <div className={styles.container}>
      {/* WINDOW 1: INDEX SHARD SELECTION PILLS */}
      <div className={styles.panelContainer}>


        {isInitializing ? (
          <p className={styles.initializingText}>Loading histories</p>
        ) : (
          <div className={styles.itemList}>
            {sortedAvailableIndexes.map((item) => {
              const isLoading = loadingKeys.includes(item.fileName);
              const displayName = formatIndexDisplayName(item.category, item.version);

              // ACTIVE STACK LOOKUP
              const matchingSlotIndex = slots.findIndex((s) => s.fileName === item.fileName);
              const isActive = matchingSlotIndex !== -1;
              const matchingSlot = isActive ? slots[matchingSlotIndex] : null;
              const slotColor = matchingSlot?.color;

              // Download status
              const downloadStatus = downloadStatuses[item.fileName] || "idle";

              return (
                <div 
                  key={item.fileName} 
                  className={`${styles.itemRow} ${isActive ? styles.itemRowActive : ""}`}
                >
                  {/* LEFT GROUP: Tier Badge (Full Height) -> Color Swatch (Full Height) -> Name -> Download Status */}
                  <div className={styles.itemLeft}>
                    {/* 1. TIER BADGE (Full Height) */}
                    <span 
                      className={`${styles.tierBadge} ${
                        item.tier === "pro" ? styles.tierBadgePro : styles.tierBadgeFree
                      }`}
                    >
                      {item.tier ? item.tier.charAt(0) : "F"}
                    </span>

                    {/* 2. COLOR SWATCH (Full Height) */}
                    <div
                      className={`${styles.colorSwatch} ${
                        isActive ? styles.colorSwatchActive : styles.colorSwatchInactive
                      }`}
                      style={{
                        backgroundColor: isActive && slotColor ? slotColor : "rgba(255, 255, 255, 0.05)",
                        opacity: isLoading ? 0.6 : 1,
                      }}
                      title={isActive ? "Click to change timeline color" : undefined}
                    >
                      {isActive && matchingSlot && (
                        <input
                          type="color"
                          value={slotColor || "#000000"}
                          onChange={(e) => {
                            if (setSlotColor && matchingSlotIndex !== -1) {
                              setSlotColor(matchingSlotIndex, e.target.value);
                            }
                          }}
                          className={styles.colorInput}
                        />
                      )}
                    </div>

                    {/* 3. DISPLAY NAME */}
                    <span className={styles.displayName}>
                      {displayName}
                    </span>

                    {/* 4. UI DOWNLOAD INDICATOR */}
                    {downloadStatus === "downloading" && (
                      <span className={styles.statusDownloading} title="Downloading full dataset to OPFS...">
                        <Loader2 className="animate-spin" size={11} />
                      </span>
                    )}
                    {downloadStatus === "ready" && (
                      <span className={styles.statusReady} title="Full data cached in OPFS (Offline Ready)">
                        <CheckCircle2 size={11} />
                      </span>
                    )}
                    {downloadStatus === "error" && (
                      <span className={styles.statusError} title="Full data download failed (Index mode only)">
                        <AlertCircle size={11} />
                      </span>
                    )}
                  </div>

                  {/* RIGHT GROUP: Stacked Years (Full Height Dunn BG) -> Event Count Box (Full Height) -> Action Button (+ / X) */}
                  <div className={styles.itemRight}>
                    {/* 5. STACKED YEARS (Full Height Dunn Background) */}
                    {isActive && matchingSlot && (matchingSlot.minYear !== undefined || matchingSlot.maxYear !== undefined) && (
                      <div className={styles.yearsContainer}>
                        <span>{formatYear(matchingSlot.minYear, isGeologicalTime)}</span>
                        <span>{formatYear(matchingSlot.maxYear, isGeologicalTime)}</span>
                      </div>
                    )}

                    {/* 6. EVENT COUNT BOX (Full Height) */}
                    {isActive && matchingSlot && (
                      <span className={styles.countBox}>
                        {(matchingSlot.totalEvents ?? 0).toLocaleString()}
                      </span>
                    )}

                    {/* 7. ACTION BUTTON (+ or X) */}
                    <button
                      disabled={isLoading}
                      onClick={() => handleToggleDataView(item)}
                      title={isActive ? "Remove dataset" : "Add dataset"}
                      className={`${styles.actionButton} ${
                        isLoading
                          ? styles.buttonLoading
                          : isActive
                          ? styles.buttonRemove
                          : styles.buttonAdd
                      }`}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}