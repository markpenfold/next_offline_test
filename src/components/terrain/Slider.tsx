"use client";

import { useEffect, useMemo } from "react";
import { useDATAStore } from "@/stores/useDataStore";

export function TimelineSlider() {
  const windowStartYear = useDATAStore((s) => s.windowStartYear);
  const setWindowStartYear = useDATAStore((s) => s.setWindowStartYear);
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);
  
  // 1. Hook directly into the derived totalYearSpan from our Zustand store
  const totalYearSpan = useDATAStore((s) => s.totalYearSpan);

  // 2. Calculate boundaries for full dataset
  const { minYear, maxYear, sliderMax } = useMemo(() => {
    const [absoluteMin, max] = totalYearSpan || [1000, 2024];

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
    <div className="w-full max-w-xl p-4 bg-gray-950 rounded-lg border border-gray-800 flex flex-col gap-3">
      <div className="flex justify-between items-end text-xs font-mono">
        <span className="text-gray-500">Min: {minYear}</span>
        <span className="text-green-400 text-sm font-bold bg-gray-900 px-3 py-1 rounded border border-gray-800">
          Viewing: {currentStart} — {currentEnd}
        </span>
        <span className="text-gray-500">Max: {maxYear}</span>
      </div>

      <input
        type="range"
        min={minYear}
        max={sliderMax}
        value={currentStart}
        onChange={(e) => setWindowStartYear(Number(e.target.value))}
        className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
      />
    </div>
  );
}