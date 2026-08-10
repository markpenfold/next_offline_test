// components/omenland/EventsList.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import styles from "@/app/styles/omenland.module.css";
import { EventRow } from "./EventRow";
import { TimelineEvent } from "@/components/omenland/omenTypes";
import { useUIStore } from "@/stores/useUIStore";
import { useDATAStore } from "@/stores/useDataStore";

export type SortOption =
  | "timeline"
  | "reverse-timeline"
  | "alphabetic"
  | "collection"
  | "random";

interface EventsListProps {
  expandAll?: boolean;
}

export function EventsList({ expandAll }: EventsListProps) {
  const [sortBy, setSortBy] = useState<SortOption>("timeline");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Subscribed to useUIStore
  const latestClickedEvents = useUIStore((state) => state.latestClickedEvents);
  const timelineBuilderEvents = useUIStore((state) => state.timelineBuilderEvents);
  const addToTimeline = useUIStore((state) => state.addToTimeline);
  const removeFromTimeline = useUIStore((state) => state.removeFromTimeline);

  // Subscribed to useDATAStore for dynamic theme colors
  const slots = useDATAStore((state) => state.slots);

  const getCollectionColor = (masterCategory?: string): string => {
    if (!masterCategory) return "#3b82f6";

    const matchingSlot = slots.find(
      (slot) => slot.category?.toLowerCase() === masterCategory.toLowerCase()
    );
    if (matchingSlot?.color) return matchingSlot.color;

    const matchingFile = slots.find(
      (slot) => slot.fileName?.toLowerCase() === masterCategory.toLowerCase()
    );
    if (matchingFile?.color) return matchingFile.color;

    return "#3b82f6";
  };

  const toggleEventSelection = (event: TimelineEvent) => {
    const isAdded = timelineBuilderEvents.some((e) => e._id === event._id);
    if (isAdded) {
      removeFromTimeline(event._id);
    } else {
      addToTimeline(event);
    }
  };

  const toggleItemExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (expandAll !== undefined && latestClickedEvents) {
      if (expandAll) {
        setExpandedItems(new Set(latestClickedEvents.map((e) => e._id)));
      } else {
        setExpandedItems(new Set());
      }
    }
  }, [expandAll, latestClickedEvents]);

  const sortedEvents = useMemo(() => {
    if (!latestClickedEvents || latestClickedEvents.length === 0) return [];
    const events = [...latestClickedEvents];

    switch (sortBy) {
      case "timeline":
        return events.sort((a, b) => (a.date_obj?.year ?? 0) - (b.date_obj?.year ?? 0));
      case "reverse-timeline":
        return events.sort((a, b) => (b.date_obj?.year ?? 0) - (a.date_obj?.year ?? 0));
      case "alphabetic":
        return events.sort((a, b) =>
          (a.subject || "").localeCompare(b.subject || "")
        );
      case "collection":
        return events.sort((a, b) =>
          (a.master_category || "").localeCompare(b.master_category || "")
        );
      case "random":
        return events.sort(() => Math.random() - 0.5);
      default:
        return events;
    }
  }, [latestClickedEvents, sortBy]);

  if (!latestClickedEvents || latestClickedEvents.length === 0) {
    return (
      <div className={styles.eventsEmpty}>
        <p>No events loaded</p>
        <p style={{ fontSize: "0.65rem", opacity: 0.6, marginTop: "4px" }}>
          Double-click terrain to inspect data
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <div className={styles.eventControlsBar}>
        <span>{sortedEvents.length} Events</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className={styles.eventSelect}
        >
          <option value="timeline">Earliest First</option>
          <option value="reverse-timeline">Latest First</option>
          <option value="alphabetic">Alphabetical</option>
          <option value="collection">By Collection</option>
        </select>
      </div>

      <div className={styles.eventsContainer}>
        {sortedEvents.map((item) => {
          const isAdded = timelineBuilderEvents.some((e) => e._id === item._id);
          const color = getCollectionColor(item.master_category);
          const isExpanded = expandedItems.has(item._id);

          return (
            <EventRow
              key={item._id}
              item={item}
              collectionColor={color}
              isAdded={isAdded}
              onToggleAdd={toggleEventSelection}
              isExpanded={isExpanded}
              onToggleExpand={() => toggleItemExpand(item._id)}
            />
          );
        })}
      </div>
    </div>
  );
}