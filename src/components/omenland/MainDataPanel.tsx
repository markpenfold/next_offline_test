// components/omenland/MainDataPanel.tsx
"use client";

import React from "react";
import { useUIStore } from "@/stores/useUIStore";
import { IndexLoader } from "./IndexLoader";
import { EventsList } from "./EventList";
import { WindowBar, WindowBarIconButton } from "./WindowBar";
import { Layers, ListFilter, FolderOpen, Save } from "lucide-react";
import styles from "@/app/styles/omenland.module.css";

export function MainDataPanel() {
  const activePanelTab = useUIStore((state) => state.activePanelTab);
  const setActivePanelTab = useUIStore((state) => state.setActivePanelTab);
  const setFinderOpen = useUIStore((state) => state.setFinderOpen);
  const latestClickedEvents = useUIStore((state) => state.latestClickedEvents);

  return (
    <div className={styles.panelContainer}>
      <WindowBar
        className={styles.windowbarHeader}
        title={
          <div className={styles.windowBarTabGroup}>
            <button
              type="button"
              className={`${styles.windowBarTab} ${
                activePanelTab === "histories" ? styles.windowBarTabActive : ""
              }`}
              onClick={() => setActivePanelTab("histories")}
            >
              <Layers size={13} />
              <span>Histories</span>
            </button>

            <button
              type="button"
              className={`${styles.windowBarTab} ${
                activePanelTab === "events" ? styles.windowBarTabActive : ""
              }`}
              onClick={() => setActivePanelTab("events")}
            >
              <ListFilter size={13} />
              <span>Events</span>
              {latestClickedEvents && latestClickedEvents.length > 0 && (
                <span className={styles.tabBadge}>
                  {latestClickedEvents.length}
                </span>
              )}
            </button>
          </div>
        }
      >
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

      <div className={styles.tabContentArea}>
        {activePanelTab === "histories" ? <IndexLoader /> : <EventsList />}
      </div>
    </div>
  );
}