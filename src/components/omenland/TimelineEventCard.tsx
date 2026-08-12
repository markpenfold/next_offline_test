"use client";

import React, { useState, useEffect, useMemo } from "react";
import { TimelineEvent } from "@/components/omenland/omenTypes";
import { X, BookUp, NotebookPen, Globe } from "lucide-react";
import { useDATAStore } from "@/stores/useDataStore";
import { EventRow } from "./EventRow";

interface EventCardProps {
  item: TimelineEvent;
  rangeStart: number;
  rangeEnd: number;
  onRemove: (id: string) => void;
  containerWidth?: number;
}

export function EventCard({
  item,
  rangeStart,
  rangeEnd,
  onRemove,
  containerWidth = 0,
}: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");

  const slots = useDATAStore((state) => state.slots);

  const year = item?.year;
  const id = item?._id || `item-${Math.random()}`;
  const rangeSpan = rangeEnd - rangeStart;

  // 🟢 3. FIX COLOR MATCHING: Match master_category against slot metadata
  const collectionColor = useMemo(() => {
    if (!item) return "#6b7280";

    const targetCategory =
      item.master_category || (item as any).category || (item as any).collection;

    // Search active slots by fileName, category, or ID
    const matchedSlot = slots.find(
      (s) =>
        s.fileName === targetCategory ||
        s.category === targetCategory ||
        s.id.toString() === targetCategory
    );

    if (matchedSlot?.color) return matchedSlot.color;

    // Fallback check if category is numeric index matching slot position
    const slotIdx = parseInt(targetCategory, 10);
    if (!isNaN(slotIdx) && slots[slotIdx]?.color) {
      return slots[slotIdx].color;
    }

    return "#6b7280";
  }, [slots, item]);

  // Notes state persistence
  useEffect(() => {
    if (!id) return;
    const storageKey = `timeline-notes-${id}`;
    const savedNotes = localStorage.getItem(storageKey);
    if (savedNotes) setNotes(savedNotes);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const storageKey = `timeline-notes-${id}`;
    if (notes) localStorage.setItem(storageKey, notes);
    else localStorage.removeItem(storageKey);
  }, [notes, id]);

  // Compute position percentage along timeline span
  let positionPercent = 0;
  if (typeof year === "number" && rangeSpan > 0) {
    positionPercent = ((year - rangeStart) / rangeSpan) * 100;
    positionPercent = Math.max(0, Math.min(100, positionPercent));
  }

  const isLeftHalf = positionPercent <= 50;

  // Calculate dynamic max card width
  const maxAvailablePercent = isLeftHalf ? 100 - positionPercent : positionPercent;
  const calculatedMaxWidth =
    containerWidth > 0
      ? Math.min((containerWidth - 32) / 2, (containerWidth * maxAvailablePercent) / 100)
      : 280;

  return (
    <div
      key={id}
      className={isExpanded ? "timeline-card-expanded" : ""}
      style={{
        position: "relative",
        width: "100%",
      }}
    >
      {/* 🟢 2. FIX ALIGNMENT: Left half anchors left edge; Right half anchors right edge */}
      <div
        style={{
          position: "absolute",
          top: 0,
          ...(isLeftHalf
            ? { left: `${positionPercent}%` }
            : { right: `${100 - positionPercent}%` }),
          maxWidth: `${Math.max(calculatedMaxWidth, 120)}px`,
          minWidth: "0",
          width: "auto",
          zIndex: 5,
        }}
      >
        <EventRow
          item={item}
          collectionColor={collectionColor}
          showYear={true}
          reversed={!isLeftHalf} // reversed=true places color tab on right edge
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
          rightButton={
            <>
              <button
                type="button"
                onClick={() => {/* TODO: Bookmark action */}}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Bookmark"
              >
                <BookUp size={13} color="#9ca3af" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => setShowNotes(!showNotes)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Toggle notes"
              >
                <NotebookPen
                  size={13}
                  color={showNotes ? "#60a5fa" : "#9ca3af"}
                  strokeWidth={1.5}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  const yearStr =
                    typeof year === "number"
                      ? year > 0
                        ? `${year} AD`
                        : `${Math.abs(year)} BC`
                      : "";
                  const query = `${item.subject || item.description || "event"} ${yearStr}`.trim();
                  window.open(
                    `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Search Google"
              >
                <Globe size={13} color="#9ca3af" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Remove from sequence track"
              >
                <X size={13} color="#ef4444" strokeWidth={1.5} />
              </button>
            </>
          }
        />

        {showNotes && (
          <div
            style={{
              backgroundColor: "#1e1e28",
              padding: "6px 8px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "0 0 3px 3px",
            }}
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add track notes..."
              style={{
                width: "100%",
                minHeight: "54px",
                backgroundColor: "#121218",
                color: "#e2e8f0",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "3px",
                padding: "6px",
                fontSize: "11px",
                fontFamily: "monospace",
                lineHeight: "1.3",
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>
        )}
      </div>

      {/* Hidden Height Reserve Spacer */}
      <div
        style={{
          visibility: "hidden",
          pointerEvents: "none",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <EventRow
          item={item}
          collectionColor="transparent"
          showYear={true}
          reversed={!isLeftHalf}
          isExpanded={isExpanded}
          onToggleExpand={() => {}}
          rightButton={
            <>
              <BookUp size={13} />
              <NotebookPen size={13} />
              <Globe size={13} />
              <X size={13} />
            </>
          }
        />
        {showNotes && (
          <div style={{ padding: "6px 8px" }}>
            <textarea disabled value={notes} style={{ width: "100%", minHeight: "54px" }} />
          </div>
        )}
      </div>
    </div>
  );
}