"use client";

import { useState } from "react";
import { Plus, X, Loader2, CheckCircle2, AlertCircle, GripVertical } from "lucide-react";
import { getMasterIndex } from "./cloudR2";
import { checkFileExists } from "./diskOPFS";
import { AvailableIndex } from "@/components/data/dataTypes";
import { useAppStore } from "@/providers/AppStoreProvider";
import { useDATAStore } from "@/stores/useDataStore";
import { useUIStore } from '@/stores/useUIStore';
import styles from "@/app/styles/omenland.module.css";
import {formatIndexDisplayName, formatYear} from "@/components/data/dataHelpers"
import { WindowBar, WindowBarIconButton } from "@/components/omenland/WindowBar";
import { FolderOpen, Save, Layers, Minimize2 } from "lucide-react";


export function IndexLoader() {
  const [draggedSlotIndex, setDraggedSlotIndex] = useState<number | null>(null);
  const setFinderOpen = useUIStore((s) => s.setFinderOpen);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const availableIndexes = useDATAStore((s) => s.availableIndexes);
  const loadingKeys = useUIStore((s) => s.loadingKeys);
  const isInitializing = useDATAStore((s) => s.isInitializing);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);
  const slots = useDATAStore((s) => s.slots);
  const downloadStatuses = useDATAStore((s) => s.downloadStatuses);

  const setKeyLoading = useUIStore((s) => s.setKeyLoading);
  const addToSlot = useDATAStore((s) => s.addToSlot);
  const removeFromSlot = useDATAStore((s) => s.clearFileFromSlots);
  const setSlotColor = useDATAStore((s) => s.setSlotColor);
  const syncFullDataShards = useDATAStore((s) => s.syncFullDataShards);
  const reorderSlots = useDATAStore((s) => s.reorderSlots);

  // Dynamic sorting: Active slots adhere strictly to stack index order (newest top, oldest bottom)
  const sortedAvailableIndexes = [...availableIndexes].sort((a, b) => {
    const slotIdxA = slots.findIndex((s) => s.fileName === a.fileName);
    const slotIdxB = slots.findIndex((s) => s.fileName === b.fileName);

    const isAActive = slotIdxA !== -1;
    const isBActive = slotIdxB !== -1;

    // Active slots strictly follow slot index
    if (isAActive && isBActive) {
      return slotIdxB - slotIdxA;
    }

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
        return;
      }

      if (slots.length >= 12) return;

      const existsOnDisk = await checkFileExists("indexes", fileName);
      if (!existsOnDisk) {
        const result = await getMasterIndex({ item, accountId });
        if (!result.success) throw new Error(`Failed to download ${fileName}`);
      }

      await addToSlot(item);
      syncFullDataShards(item, accountId);
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

              return (
                <div
                  key={item.fileName}
                  draggable={isActive}
                  onDragStart={(e) => isActive && handleDragStart(e, matchingSlotIndex)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => isActive && handleDrop(e, matchingSlotIndex)}
                  className={`${styles.itemRow} ${isActive ? styles.itemRowActive : ""} ${
                    draggedSlotIndex === matchingSlotIndex ? styles.itemRowDragging : ""
                  }`}
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