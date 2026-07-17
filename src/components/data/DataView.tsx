"use client";

import { useEffect, useState } from "react";
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { getTSM } from '@/components/data/analytics';
import { TerrainShaderTuple } from "./dataTypes";

export function DataView() {
  const [loading, setLoading] = useState<boolean>(true);
  const [terrainData, setTerrainData] = useState<TerrainShaderTuple | null>(null);

  // FROM THE STORES 
  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const isTerrainReady = useDATAStore((s) => s.isTerrainReady);

  useEffect(() => {
    if (!isTerrainReady || !activeAccount?.id || !activeDataViewIndexes) {
      setLoading(true);
      return;
    }
    
    async function fetchTerrain() {
      setLoading(true);
      try {
        const matrixTuple = await getTSM();
        setTerrainData(matrixTuple);
      } catch (err) {
        console.error("Failed to fetch terrain matrix:", err);
        setTerrainData(null);
      } finally {
        setLoading(false);
      }
    }
  
    fetchTerrain();
  }, [isTerrainReady, activeAccount?.id, activeDataViewIndexes]);

  if (!isTerrainReady || loading) {
    return <div className="p-4 text-sm text-gray-400">Loading terrain arrays...</div>;
  }

  if (!activeDataViewIndexes || !activeAccount?.id) {
    return <div className="p-4 text-sm text-gray-400">No active tracking indices selected.</div>;
  }

  // Fail safely if data arrays are unpopulated or unallocated
  if (!terrainData || !terrainData[0] || terrainData[0].length === 0) {
    return <div className="p-4 text-sm text-gray-400">No Terrain arrays loaded.</div>;
  }

  // Destructure array components positionally 
  const [indexNames, heights, summedHeights, uuids] = terrainData;

  // Construct readable visualization mapping indices relative to timeline arrays
  const formattedPreview = heights.slice(0, 5).map((yearRow, yearIdx) => {
    return {
      timelineStep: yearIdx,
      totalHeightValue: summedHeights[yearIdx],
      bands: indexNames.map((name, catIdx) => {
        const bandUuids = uuids[yearIdx]?.[catIdx] || [];
        return {
          bandKey: name,
          height: yearRow[catIdx],
          uuidsCount: bandUuids.length,
          uuidsSample: bandUuids.length > 2 
            ? [bandUuids[0], `... +${bandUuids.length - 1} more`] 
            : bandUuids
        };
      })
    };
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-lg font-medium text-white">Terrain Shader Arrays Initialized</h3>
        <p className="text-xs text-gray-400 mt-1">
          Positions allocated: <span className="text-green-400 font-mono">{indexNames.length}</span> index configurations across{" "}
          <span className="text-green-400 font-mono">{heights.length}</span> explicit years.
        </p>
      </div>

      <div className="bg-gray-950 rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
          <span className="text-xs font-mono text-gray-400">Tuple Deconstruction Preview (Indices 0 - 4)</span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono">Parallel Order Confirmed</span>
        </div>
        <pre className="p-4 text-emerald-400 overflow-auto text-xs font-mono max-h-[450px] leading-relaxed">
          {JSON.stringify(formattedPreview, null, 2)}
        </pre>
      </div>
    </div>
  );
}