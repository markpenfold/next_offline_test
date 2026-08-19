"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { TimelineEvent } from "@/components/omenland/omenTypes";
import { EventCard } from "./TimelineEventCard";
import { formatYear } from "@/components/data/dataHelpers";
import { WindowBar, WindowBarIconButton } from "./WindowBar";
import { Film, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import styles from "@/app/styles/omenland.module.css";

export function TimelineBuilder() {
  const [isOpen, setIsOpen] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const timelineBuilderEvents = useUIStore((state) => state.timelineBuilderEvents);
  const removeFromTimeline = useUIStore((state) => state.removeFromTimeline);
  const clearTimelineBuilder = useUIStore((state) => state.clearTimelineBuilder);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(element);
    setContainerWidth(element.getBoundingClientRect().width);

    return () => resizeObserver.disconnect();
  }, []);

  const itemYearRange = useMemo(() => {
    if (!timelineBuilderEvents || timelineBuilderEvents.length === 0) return null;

    const years = timelineBuilderEvents
      .map((item: TimelineEvent) => item?.year)
      .filter((year): year is number => typeof year === "number");

    if (years.length === 0) return null;

    return {
      min: Math.min(...years),
      max: Math.max(...years),
    };
  }, [timelineBuilderEvents]);

  const [rangeStart, rangeEnd] = useMemo(() => {
    if (itemYearRange) {
      const span = itemYearRange.max - itemYearRange.min;
      const buffer = Math.max(Math.floor(span * 0.08), 10);
      return [itemYearRange.min - buffer, itemYearRange.max + buffer];
    }
    return [0, 2025];
  }, [itemYearRange]);

  // 🟢 1. FIX RULER DENSITY: 10 step fractions for 11 ruler markings
  const rulerFractions = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

  return (
    <div className={styles.timelineBuilderWrapper}>
      <WindowBar
        title={
          <div className={styles.windowBarTitleGroup}>
            <span className={styles.windowBarIcon}>
              <Film size={14} />
            </span>
            <span className={styles.windowBarTitle}>Sequence Track</span>
            {timelineBuilderEvents?.length > 0 && (
              <span className={styles.tabBadge}>{timelineBuilderEvents.length}</span>
            )}
          </div>
        }
      >
        {timelineBuilderEvents?.length > 0 && (
          <WindowBarIconButton
            icon={<Trash2 size={13} />}
            tooltip="Clear Sequence Track"
            onClick={clearTimelineBuilder}
          />
        )}
        <WindowBarIconButton
          icon={isOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          tooltip={isOpen ? "Collapse Track" : "Expand Track"}
          onClick={() => setIsOpen(!isOpen)}
        />
      </WindowBar>

      {isOpen && (
        <>
          {/* 🟢 1. FIX PADDING & ALIGNMENT: 16px horizontal inset and text alignment transforms */}
          <div className={styles.timelineRuler} style={{ padding: "0 16px" }}>
            <div className={styles.timelineRulerLabels} style={{ position: "relative", height: "18px" }}>
              {rulerFractions.map((fraction, idx) => {
                const year = Math.round(rangeStart + (rangeEnd - rangeStart) * fraction);

                // Align start text to left, end text to right, middle text centered
                const transform =
                  idx === 0
                    ? "translateX(0%)"
                    : idx === rulerFractions.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)";

                return (
                  <div
                    key={fraction}
                    className={styles.timelineRulerLabel}
                    style={{
                      position: "absolute",
                      left: `${fraction * 100}%`,
                      transform,
                      fontSize: "10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatYear(year)}
                  </div>
                );
              })}
            </div>

            <div className={styles.timelineRulerTrack} style={{ position: "relative", height: "6px" }}>
              {rulerFractions.map((fraction) => (
                <div
                  key={fraction}
                  className={styles.timelineRulerTick}
                  style={{
                    position: "absolute",
                    left: `${fraction * 100}%`,
                    width: "1px",
                    height: "100%",
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                  }}
                />
              ))}
            </div>
          </div>

          <div
            className={styles.timelineTracksZone}
            ref={containerRef}
            style={{ padding: "0 16px", position: "relative" }}
          >
            <div className={styles.timelineZebraBg} />

            {!timelineBuilderEvents || timelineBuilderEvents.length === 0 ? (
              <div className={styles.timelineEmptyState}>
                <span>Add events from the Events tab to assemble sequence</span>
              </div>
            ) : (
              <div className={styles.timelineTracksInner}>
                {timelineBuilderEvents.map((item: TimelineEvent, index: number) => (
                  <div
                    key={item._id || `seq-item-${index}`}
                    className={styles.timelineTrackRow}
                  >
                    <EventCard
                      item={item}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      onRemove={(id) => removeFromTimeline(id)}
                      containerWidth={containerWidth}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}