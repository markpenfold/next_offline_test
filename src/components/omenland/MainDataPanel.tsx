// components/omenland/MainDataPanel.tsx
"use client";

import React from "react";
import { useUIStore } from "@/stores/useUIStore";
import { IndexLoader } from "./IndexLoader";
import { EventsList } from "./EventList";
import { WindowBar } from "./WindowBar";
import { Layers, ShieldCheck, CheckSquare, ListFilter } from "lucide-react";
import styles from "@/app/styles/omenland.module.css";

export function MainDataPanel() {
  const activePanelTab = useUIStore((state) => state.activePanelTab);
  const setActivePanelTab = useUIStore((state) => state.setActivePanelTab);
  const latestClickedEvents = useUIStore((state) => state.latestClickedEvents);

  return (
    <div className={styles.panelContainer}>
      <WindowBar
        className={styles.windowbarHeader}
        title={
          <div className={styles.windowBarTabGroup}>
            {/* Free Tab */}
            <button
              type="button"
              className={`${styles.windowBarTab} ${
                activePanelTab === "free" ? styles.windowBarTabActive : ""
              }`}
              onClick={() => setActivePanelTab("free")}
            >
              <Layers size={13} />
              <span>Free</span>
            </button>

            {/* Pro Tab */}
            <button
              type="button"
              className={`${styles.windowBarTab} ${
                activePanelTab === "pro" ? styles.windowBarTabActive : ""
              }`}
              onClick={() => setActivePanelTab("pro")}
            >
              <ShieldCheck size={13} />
              <span>Pro</span>
            </button>

            {/* Selected Tab */}
            <button
              type="button"
              className={`${styles.windowBarTab} ${
                activePanelTab === "selected" ? styles.windowBarTabActive : ""
              }`}
              onClick={() => setActivePanelTab("selected")}
            >
              <CheckSquare size={13} />
              <span>Selected</span>
            </button>

            {/* Events Tab */}
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
      />

      <div className={styles.tabContentArea}>
        {activePanelTab === "free" && <IndexLoader source="free" />}
        {activePanelTab === "pro" && <IndexLoader source="pro" />}
        {activePanelTab === "selected" && <IndexLoader source="selected" />}
        {activePanelTab === "events" && <EventsList />}
      </div>
    </div>
  );
}