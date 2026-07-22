"use client";

import { useEffect, useState, useMemo } from "react";
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { getTSM } from '@/components/data/analytics';
import { TerrainYearStep } from "./dataTypes";

/**
 * Fast client-side 1024-year slice generator.
 * Fills gaps with zero-count baseline rows for standard matrix dimensions.
 */
function get1024WindowSlice(
  fullTerrainData: TerrainYearStep[],
  startYear: number,
  categories: string[]
): TerrainYearStep[] {
  const yearMap = new Map<number, TerrainYearStep>();
  for (let i = 0; i < fullTerrainData.length; i++) {
    yearMap.set(Number(fullTerrainData[i][0]), fullTerrainData[i]);
  }

  // Pre-allocate template for missing zero-event years (number[] avoids TS errors)
  const zeroCounts: number[] = new Array(categories.length).fill(0);
  const emptyUuids: string[][] = categories.map(() => []);

  const windowSlice: TerrainYearStep[] = new Array(1024);

  for (let i = 0; i < 1024; i++) {
    const year = startYear + i;
    const match = yearMap.get(year);

    if (match) {
      windowSlice[i] = match;
    } else {
      windowSlice[i] = [year, categories, zeroCounts, emptyUuids];
    }
  }

  return windowSlice;
}

export function DataView() {
  const [loading, setLoading] = useState<boolean>(true);
  
  // 1. Placeholder state for startYear - ready for interactive timeline controls
  const [startYear, setStartYear] = useState<number | null>(null);

  // Store Selectors
  const setTerrainData = useDATAStore((s) => s.setTerrainData);
  const terrainData = useDATAStore((s) => s.terrainData);

  const setTerrainDataViewWindow = useDATAStore((s) => s.setTerrainDataViewWindow);
  const terrainDataViewWindow = useDATAStore((s) => s.terrainDataViewWindow);

  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const isTerrainReady = useDATAStore((s) => s.isTerrainReady);

  // ---------------------------------------------------------------------------
  // EFFECT 1: Update `terrainData` when active indexes change or DuckDB mounts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isTerrainReady || !activeAccount?.id || !activeDataViewIndexes) {
      setLoading(true);
      return;
    }
    
    async function fetchTerrain() {
      setLoading(true);
      try {
        const matrix = await getTSM();
        console.log("MATRIX RETURNED BY TSM:", matrix.length, "items");
        
        setTerrainData(matrix); 
        
        // Default startYear to the earliest year if not set
        if (matrix.length > 0) {
          const firstYear = 900;
          //Number(matrix[0][0]);
          setStartYear((prev) => (prev === null ? firstYear : prev));
        }
      } catch (err) {
        console.error("Failed to fetch terrain matrix:", err);
        setTerrainData(null);
      } finally {
        setLoading(false);
      }
    }
  
    fetchTerrain();
  }, [isTerrainReady, activeAccount?.id, activeDataViewIndexes, setTerrainData]);

  // ---------------------------------------------------------------------------
  // EFFECT 2: Update `terrainDataViewWindow` when `terrainData` OR `startYear` changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!terrainData || terrainData.length === 0) {
      setTerrainDataViewWindow(null);
      return;
    }

    const effectiveStartYear = startYear ?? Number(terrainData[0][0]);

    // Extract all unique categories to build uniform baseline rows
    const allCategories = Array.from(
      new Set(terrainData.flatMap((step) => step[1]))
    );

    // Slice continuous 1,024 year span
    const windowSlice = get1024WindowSlice(terrainData, effectiveStartYear, allCategories);
    
    setTerrainDataViewWindow(windowSlice);
    console.log(`🪟 Updated terrainDataViewWindow: ${windowSlice.length} years (Starting: ${effectiveStartYear})`);
  }, [terrainData, startYear, setTerrainDataViewWindow]);

  // ---------------------------------------------------------------------------
  // RENDER GUARDS & UI
  // ---------------------------------------------------------------------------
  if (!isTerrainReady || loading) {
    return <div className="p-4 text-sm text-gray-400">Loading terrain matrix...</div>;
  }

  if (!activeDataViewIndexes || !activeAccount?.id) {
    return <div className="p-4 text-sm text-gray-400">No active index or account selected.</div>;
  }

  if (!terrainData || terrainData.length === 0) {
    return <div className="p-4 text-sm text-gray-400">No Terrain data loaded.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-lg font-medium text-white">Terrain Data Loaded</h3>
        <p className="text-xs text-gray-400 mt-1">
          Loaded <span className="text-green-400 font-mono">{terrainData.length}</span> total yearly intervals. 
          Active window size: <span className="text-blue-400 font-mono">{terrainDataViewWindow?.length ?? 0}</span> years.
        </p>
      </div>

      <div className="bg-gray-950 rounded-lg border border-gray-800 overflow-hidden">
        <div className="p-2 bg-gray-900 border-b border-gray-800 text-xs text-gray-400">
          Raw Matrix Preview (Top 5 items)
        </div>
        <pre className="p-4 bg-gray-900 text-green-400 overflow-auto text-xs font-mono max-h-[200px]">
          {JSON.stringify(
            terrainData.slice(0, 5).map(([year, categories, counts]) => [year, counts]), 
            null, 
            2
          )}
        </pre>

        <div className="p-2 bg-gray-900 border-b border-t border-gray-800 text-xs text-gray-400">
          View Window Preview (Top 5 items in 1,024-year slice)
        </div>
        <pre className="p-4 bg-gray-900 text-blue-400 overflow-auto text-xs font-mono max-h-[250px]">
          {JSON.stringify(
            (terrainDataViewWindow || []).slice(0, 5).map(([year, categories, counts, uuids]) => [
              year,
              categories,
              counts,
              uuids.map((catUuids) => 
                catUuids.length > 2 
                  ? [catUuids[0], `... +${catUuids.length - 1} more UUIDs`] 
                  : catUuids
              )
            ]), 
            null, 
            2
          )}
        </pre>
      </div>
    </div>
  );
}