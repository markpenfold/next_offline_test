"use client";

import { useEffect, useMemo } from "react";
import { useDATAStore } from "@/stores/useDataStore";

export function TimelineSlider() {
  const windowStartYear = useDATAStore((s) => s.windowStartYear);
  const setWindowStartYear = useDATAStore((s) => s.setWindowStartYear);
  
  // Bring in the toggle state for geological time
  const isGeologicalTime = useDATAStore((s) => s.isGeologicalTime);

  // Calculate boundaries for full data set - 50,000-year limit
  const { minYear, maxYear, sliderMax } = useMemo(() => {
    if (!terrainData || terrainData.length === 0) {
      return { minYear: 0, maxYear: 0, sliderMax: 0 };
    }
    
    const absoluteMin = Number(terrainData[0][0]);
    const max = Number(terrainData[terrainData.length - 1][0]);
    
    // The 50k cutoff limit
    const humanEraMin = max - 50000;
    
    // Determine the effective minimum based on the toggle
    const min = isGeologicalTime ? absoluteMin : Math.max(absoluteMin, humanEraMin);
    const sMax = Math.max(min, max - 1024);
    
    return { minYear: min, maxYear: max, sliderMax: sMax };
  }, [isGeologicalTime]);

  // 3. Initialize default window, or "rescue" the window if it falls out of bounds
  useEffect(() => {

    if (windowStartYear === null) {
      setWindowStartYear(sliderMax);
    } else if (!isGeologicalTime && windowStartYear < minYear) {
      // If user turns OFF geological time while in deep past, snap them to 'now'
      setWindowStartYear(sliderMax);
    }
  }, [

    windowStartYear, 
    sliderMax, 
    minYear, 
    isGeologicalTime, 
    setWindowStartYear
  ]);


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