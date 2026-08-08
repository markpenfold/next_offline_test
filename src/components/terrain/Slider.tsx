"use client";

import { useEffect, useMemo } from "react";
import { useDATAStore } from "@/stores/useDataStore";
import styles from "@/app/styles/omenland.module.css";

// Helper: Formats dates into clean readable strings (or B/M notation for geological dates)
function formatSliderYear(year: number, isGeologicalTime: boolean): string {
  const rounded = Math.round(year);
  const abs = Math.abs(rounded);

  if (isGeologicalTime || abs >= 1_000_000) {
    if (abs >= 1_000_000_000) {
      return `${(abs / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}B YA`;
    }
    if (abs >= 1_000_000) {
      return `${(abs / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M YA`;
    }
  }

  return rounded < 0 ? `${Math.abs(rounded).toLocaleString()} BC` : `${rounded} AD`;
}

export function TimelineSlider() {
  const windowStartYear = useDATAStore((s) => s.windowStartYear);
  const setWindowStartYear = useDATAStore((s) => s.setWindowStartYear);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);
  
  // 1. Hook directly into the derived totalYearSpan from our Zustand store
  const totalYearSpan = useDATAStore((s) => s.totalYearSpan);

  // 2. Calculate boundaries for full dataset
  const { minYear, maxYear, sliderMax } = useMemo(() => {
    const [absoluteMin, max] = totalYearSpan || [1000, 2026];

    // The 50k cutoff limit for human era
    const humanEraMin = max - 50000;

    // Determine the effective minimum based on the toggle
    const min = isGeologicalTime
      ? absoluteMin
      : Math.max(absoluteMin, humanEraMin);

    // Ensure sliderMax doesn't fall below min if total dataset span is under 1024 years
    const sMax = Math.max(min, max - 1024);

    return { minYear: min, maxYear: max, sliderMax: sMax };
  }, [totalYearSpan, isGeologicalTime]);

  // 3. Keep windowStartYear safely clamped within bounds whenever data or mode changes
  useEffect(() => {
    if (windowStartYear === null) {
      setWindowStartYear(sliderMax);
    } else if (windowStartYear < minYear) {
      // Snap to minYear if user turns OFF geological time while in deep past
      setWindowStartYear(minYear);
    } else if (windowStartYear > sliderMax) {
      // Prevent overshooting when slots change
      setWindowStartYear(sliderMax);
    }
  }, [windowStartYear, sliderMax, minYear, setWindowStartYear]);

  const currentStart = windowStartYear ?? sliderMax;
  const currentEnd = currentStart + 1024;

  return (
    <div className={styles.sliderContainer}>
      {/* Active Viewing Window Text */}
      <div className={styles.sliderHeader}>
        <span className={styles.viewingLabel}>
          Viewing:{" "}
          <span className={styles.viewingValue}>
            {formatSliderYear(currentStart, isGeologicalTime)} — {formatSliderYear(currentEnd, isGeologicalTime)}
          </span>
        </span>
      </div>

      {/* Full-Width Horizontal Track Row */}
      <div className={styles.sliderTrackRow}>
        <span className={styles.dateBoundLabel}>
          {formatSliderYear(minYear, isGeologicalTime)}
        </span>

        <input
          type="range"
          min={minYear}
          max={sliderMax}
          value={currentStart}
          onChange={(e) => setWindowStartYear(Number(e.target.value))}
          className={styles.fullWidthInput}
        />

        <span className={styles.dateBoundLabel}>
          {formatSliderYear(maxYear, isGeologicalTime)}
        </span>
      </div>
    </div>
  );
}