"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  GripVertical, 
  FolderOpen, 
  Save, 
  Layers, 
  HardDrive, 
  WifiOff 
} from "lucide-react";
import { getMasterIndex, getShardsFromIndex, getLocalShardNamesFromIndex } from "./cloudR2";
import { checkFileExists } from "./diskOPFS";
import { AvailableIndex } from "@/components/data/dataTypes";
import { useAppStore } from "@/providers/AppStoreProvider";
import { useDATAStore } from "@/stores/useDataStore";
import { useUIStore } from '@/stores/useUIStore';
import styles from "@/app/styles/omenland.module.css";
import { formatIndexDisplayName, formatYear } from "@/components/data/dataHelpers";
import { WindowBar, WindowBarIconButton } from "@/components/omenland/WindowBar";
import { loadShardIntoEngine, rebuildDataView } from "@/components/data/duckDATA";

export function IndexLoader() {
  const [draggedSlotIndex, setDraggedSlotIndex] = useState<number | null>(null);
  
  // OPFS Cache Map for index files
  const [opfsMap, setOpfsMap] = useState<Record<string, boolean>>({});

  // 🟢 Online Status & Stores
  const isOnline = useAppStore((s) => s.isOnline);
  const setFinderOpen = useUIStore((s) => s.setFinderOpen);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const availableIndexes = useDATAStore((s) => s.availableIndexes);
  const loadingKeys = useUIStore((s) => s.loadingKeys);
  const isInitializing = useDATAStore((s) => s.isInitializing);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);
  const slots = useDATAStore((s) => s.slots);
  const downloadStatuses = useDATAStore((s) => s.downloadStatuses);

  // 🟢 OPFS Data Shards State & Store Actions
  const dataShards = useDATAStore((s) => s.dataShards);
  const refreshDataShards = useDATAStore((s) => s.refreshDataShards);

  const setKeyLoading = useUIStore((s) => s.setKeyLoading);
  const addToSlot = useDATAStore((s) => s.addToSlot);
  const removeFromSlot = useDATAStore((s) => s.clearFileFromSlots);
  const setSlotColor = useDATAStore((s) => s.setSlotColor);
  const syncFullDataShards = useDATAStore((s) => s.syncFullDataShards);
  const reorderSlots = useDATAStore((s) => s.reorderSlots);

  // Helper to re-sync active slots into DuckDB and rebuild currentDataView
const syncDuckDBView = async (activeSlots: typeof slots) => {
  try {
    const mountedFileNames: string[] = [];

    for (const slot of activeSlots) {
      if (!slot.fileName) continue;

      // 1. Derive the expected local shard names (pre_1900 and post_1900)
      const shardMetas = getLocalShardNamesFromIndex(slot.fileName);

      for (const { localFileName } of shardMetas) {
        // 2. Check if the Parquet file exists in OPFS /data directory
        const exists = await checkFileExists("data", localFileName);
        
        if (exists) {
          // 3. Mount existing shard into DuckDB VFS
          const mountedName = await loadShardIntoEngine("data", localFileName);
          if (mountedName) {
            mountedFileNames.push(mountedName);
          }
        }
      }
    }

    // 4. Rebuild the DuckDB currentDataView over all active, mounted shards
    await rebuildDataView(mountedFileNames);
    console.log("✅ [DuckDB] Synchronized view with active shards:", mountedFileNames);
  } catch (err) {
    console.error("🚨 [DuckDB] Failed to rebuild currentDataView:", err);
  }
};

  // 🟢 Scan OPFS indexes and data shards on mount / when availableIndexes update
  useEffect(() => {
    let isMounted = true;

    async function scanLocalFiles() {
      // 1. Check OPFS for index JSON/meta files
      const checks = await Promise.all(
        availableIndexes.map(async (item) => {
          const exists = await checkFileExists("indexes", item.fileName);
          return [item.fileName, exists] as const;
        })
      );

      // 2. 🟢 Scan OPFS /data directory for Parquet shards and auto-update store
      let shardsAvailable = await refreshDataShards();
      console.log("AVAILABLE SHARDS: ", shardsAvailable)

      if (isMounted) {
        setOpfsMap(Object.fromEntries(checks));
      }
    }

    if (availableIndexes.length > 0) {
      scanLocalFiles();
    }

    return () => {
      isMounted = false;
    };
  }, [availableIndexes, refreshDataShards]);

  // Dynamic sorting: Active slots adhere strictly to stack index order
  const sortedAvailableIndexes = [...availableIndexes].sort((a, b) => {
    const slotIdxA = slots.findIndex((s) => s.fileName === a.fileName);
    const slotIdxB = slots.findIndex((s) => s.fileName === b.fileName);

    const isAActive = slotIdxA !== -1;
    const isBActive = slotIdxB !== -1;

    if (isAActive && isBActive) return slotIdxB - slotIdxA;
    if (isAActive) return -1;
    if (isBActive) return 1;

    const isAFree = a.tier !== "pro";
    const isBFree = b.tier !== "pro";
    if (isAFree && !isBFree) return -1;
    if (!isAFree && isBFree) return 1;

    return a.fileName.localeCompare(b.fileName);
  });

  // Add and remove timelines from the terrain
  const handleToggleDataView = async (item: AvailableIndex) => {
    const fileName = item.fileName;
    const accountId = typeof activeAccount === "object" ? activeAccount?.id : activeAccount;
    if (!accountId) return;

    if (loadingKeys.includes(fileName)) return;
    const isActive = slots.some((s) => s.fileName === fileName);

    try {
      setKeyLoading(fileName, true);

      if (isActive) {
        removeFromSlot(fileName);
        // Rebuild DuckDB view with remaining active slots
        const nextSlots = slots.filter((s) => s.fileName !== fileName);
        await syncDuckDBView(nextSlots);
        return;
      }

      if (slots.length >= 12) return;

      // Check OPFS locally first ////////////////////////////////////////
      let existsOnDisk = opfsMap[fileName];
      if (existsOnDisk === undefined) {
        existsOnDisk = await checkFileExists("indexes", fileName);
      }

      // If missing locally AND offline, abort //////////////////////////////////
      if (!existsOnDisk && !isOnline) {
        console.warn(`Cannot fetch ${fileName} - offline and not found in OPFS.`);
        return;
      }

      // Fetch index from R2 if not local //////////////////////////////////////////
      if (!existsOnDisk) {
        const result = await getMasterIndex({ item, accountId });
        if (!result.success) throw new Error(`Failed to download ${fileName}`);
        // Update OPFS local state map
        setOpfsMap((prev) => ({ ...prev, [fileName]: true }));
      }

      await addToSlot(item);
      await syncFullDataShards(item, accountId);

      // 🟢 Auto-refresh local OPFS dataShards in store after sync
      await refreshDataShards();

      // 🟢 Rebuild DuckDB view with the newly added slot
      const updatedSlots = useDATAStore.getState().slots;
      await syncDuckDBView(updatedSlots);

    } catch (err) {
      console.error(`Failed to toggle ${fileName}:`, err);
    } finally {
      setKeyLoading(fileName, false);
    }
  };

  // Drag-and-Drop Handlers
  const handleDragStart = (e: React.DragEvent, slotIndex: number) => {
    setDraggedSlotIndex(slotIndex);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetSlotIndex: number) => {
    e.preventDefault();
    if (draggedSlotIndex !== null && draggedSlotIndex !== targetSlotIndex) {
      reorderSlots(draggedSlotIndex, targetSlotIndex);
    }
    setDraggedSlotIndex(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.panelContainer}>
        <WindowBar title="Histories" icon={<Layers size={14} />}>
          <WindowBarIconButton
            icon={<FolderOpen size={13} />}
            tooltip="Open Project"
            onClick={() => setFinderOpen(true)}
          />
          <WindowBarIconButton
            icon={<Save size={13} />}
            tooltip="Save Project"
            onClick={() => console.log("Save clicked")}
          />
        </WindowBar>

        {isInitializing ? (
          <p className={styles.initializingText}>Loading histories</p>
        ) : (
          <div className={styles.itemList}>
            {sortedAvailableIndexes.map((item) => {
              const isLoading = loadingKeys.includes(item.fileName);
              const displayName = formatIndexDisplayName(item.category, item.version);
              const matchingSlotIndex = slots.findIndex((s) => s.fileName === item.fileName);
              const isActive = matchingSlotIndex !== -1;
              const matchingSlot = isActive ? slots[matchingSlotIndex] : null;
              const slotColor = matchingSlot?.color;
              const downloadStatus = downloadStatuses[item.fileName] || "idle";

              // 🟢 Offline Availability Determination
              const isCachedInOpfs = opfsMap[item.fileName] ?? false;
              const canActivate = isActive || isCachedInOpfs || isOnline;

              return (
                <div
                  key={item.fileName}
                  draggable={isActive}
                  onDragStart={(e) => isActive && handleDragStart(e, matchingSlotIndex)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => isActive && handleDrop(e, matchingSlotIndex)}
                  className={`${styles.itemRow} ${isActive ? styles.itemRowActive : ""} ${
                    draggedSlotIndex === matchingSlotIndex ? styles.itemRowDragging : ""
                  } ${!canActivate ? styles.itemRowDisabled : ""}`}
                >
                  <div className={styles.itemLeft}>
                    {/* Drag Handle Icon for active items */}
                    {isActive && (
                      <span className={styles.dragHandle} title="Drag to reorder strata position">
                        <GripVertical size={12} />
                      </span>
                    )}

                    {/* Tier Badge */}
                    <span
                      className={`${styles.tierBadge} ${
                        item.tier === "pro" ? styles.tierBadgePro : styles.tierBadgeFree
                      }`}
                    >
                      {item.tier ? item.tier.charAt(0) : "F"}
                    </span>

                    {/* Color Swatch */}
                    <div
                      className={`${styles.colorSwatch} ${
                        isActive ? styles.colorSwatchActive : styles.colorSwatchInactive
                      }`}
                      style={{
                        backgroundColor: isActive && slotColor ? slotColor : "rgba(255, 255, 255, 0.05)",
                        opacity: isLoading ? 0.6 : 1,
                      }}
                    >
                      {isActive && matchingSlot && (
                        <input
                          type="color"
                          value={slotColor || "#000000"}
                          onChange={(e) => setSlotColor(matchingSlotIndex, e.target.value)}
                          className={styles.colorInput}
                        />
                      )}
                    </div>

                    {/* Display Name */}
                    <span className={styles.displayName}>{displayName}</span>

                    {/* 🟢 Storage / Network Badge */}
                    {isCachedInOpfs && !isActive && (
                      <span title="Stored locally in OPFS" className={styles.localBadge}>
                        <HardDrive size={11} />
                      </span>
                    )}

                    {/* Download Indicator */}
                    {downloadStatus === "downloading" && (
                      <span className={styles.statusDownloading}>
                        <Loader2 className="animate-spin" size={11} />
                      </span>
                    )}
                    {downloadStatus === "ready" && (
                      <span className={styles.statusReady}>
                        <CheckCircle2 size={11} />
                      </span>
                    )}
                    {downloadStatus === "error" && (
                      <span className={styles.statusError}>
                        <AlertCircle size={11} />
                      </span>
                    )}
                  </div>

                  <div className={styles.itemRight}>
                    {/* Ticket Stub Years Container */}
                    {isActive && matchingSlot && (
                      <div className={styles.yearsContainer}>
                        <span className={styles.yearText}>
                          {formatYear(matchingSlot.minYear, isGeologicalTime)}
                        </span>
                        <span className={styles.yearText}>
                          {formatYear(matchingSlot.maxYear, isGeologicalTime)}
                        </span>
                      </div>
                    )}

                    {/* Event Count Box */}
                    {isActive && matchingSlot && (
                      <span className={styles.countBox}>
                        {(matchingSlot.totalEvents ?? 0).toLocaleString()}
                      </span>
                    )}

                    {/* Action Button */}
                    <button
                      disabled={isLoading || (!isActive && !canActivate)}
                      onClick={() => handleToggleDataView(item)}
                      title={
                        isActive
                          ? "Remove dataset"
                          : !canActivate
                          ? "Offline: File not downloaded to device"
                          : "Add dataset"
                      }
                      className={`${styles.actionButton} ${
                        isLoading
                          ? styles.buttonLoading
                          : isActive
                          ? styles.buttonRemove
                          : !canActivate
                          ? styles.buttonDisabled
                          : styles.buttonAdd
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 className="animate-spin" size={11} />
                      ) : isActive ? (
                        <X size={11} />
                      ) : !canActivate ? (
                        <WifiOff size={11} />
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