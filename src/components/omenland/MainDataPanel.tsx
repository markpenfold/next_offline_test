"use client";

import React from "react";
import { useUIStore } from "@/stores/useUIStore";
import { IndexLoader } from "@/components/omenland/IndexLoader";
import { EventsList } from "@/components/omenland/EventList";
import { Layers, ListFilter } from "lucide-react";
import styles from "@/app/styles/omenland.module.css";

export function MainDataPanel() {
  const activePanelTab = useUIStore((state) => state.activePanelTab);
  const setActivePanelTab = useUIStore((state) => state.setActivePanelTab);
  const latestClickedEvents = useUIStore((state) => state.latestClickedEvents);

  return (
    <div className={styles.mainDataPanelContainer}>
      {/* Navigation Header */}
      <div className={styles.tabHeaderBar}>
        <button
          className={`${styles.tabButton} ${
            activePanelTab === "histories" ? styles.tabButtonActive : ""
          }`}
          onClick={() => setActivePanelTab("histories")}
        >
          <Layers size={14} />
          <span>Histories</span>
        </button>

        <button
          className={`${styles.tabButton} ${
            activePanelTab === "events" ? styles.tabButtonActive : ""
          }`}
          onClick={() => setActivePanelTab("events")}
        >
          <ListFilter size={14} />
          <span>Events</span>
          {latestClickedEvents && latestClickedEvents.length > 0 && (
            <span className={styles.eventCountBadge}>
              {latestClickedEvents.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Body */}
      <div className={styles.tabContentArea}>
        {activePanelTab === "histories" ? (
          <IndexLoader />
        ) : (
          <EventsList />
        )}
      </div>
    </div>
  );
}