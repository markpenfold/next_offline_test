"use client";

import { useEffect, useState } from "react";
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { getTerrainShaderMatrix, setTerrainTable} from '@/components/data/analytics';
import { TerrainTuple } from "./dataTypes";

export function DataView() {
  const [loading, setLoading] = useState<boolean>(true);
  const [terrainData, setTerrainData] = useState<TerrainTuple[] | null>(null);

  // FROM THE STORES 
  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const isTerrainReady = useDATAStore((s) => s.isTerrainReady); //  Listen to the gate

  // Live Scan & Initialize on Mount
  useEffect(() => {
    if (!isTerrainReady || !activeAccount?.id) {
      setLoading(true);
      return;
    }
    // 1. Guard clause: Don't fetch if no account
    if (!activeAccount?.id) {
      setLoading(false);
      return;
    }
    async function fetchTerrain() {
      setLoading(true);
      try {
        // 2. Fetch the matrix
        const matrix = await getTerrainShaderMatrix();
        
        // 3. Update React State (this triggers the UI re-render)
        setTerrainData(matrix);
      } catch (err) {
        console.error("Failed to fetch terrain matrix:", err);
        setTerrainData(null);
      } finally {
        setLoading(false);
      }
    }
  
    fetchTerrain();

  }, [isTerrainReady, activeAccount?.id, activeDataViewIndexes]);

  if (loading|| !isTerrainReady) {
    return <div>Loading terrain matrix...</div>;
  }

  if (!activeDataViewIndexes) {
    return <div>No index or active account selected.</div>;
  }

  if(!terrainData) {
    return <div>No Terrain data loaded.</div>;
  }
return (
    <div>
      <h3>Terrain Data Loaded</h3>
      <pre className="p-4 bg-gray-900 text-green-400 rounded overflow-auto text-xs">
        {JSON.stringify(
          terrainData.slice(0, 5).map((row) => [
            row[0], // Year
            row[1], // Categories
            row[2], // Counts
            row[3], // Precision
            row[4].map((uuids) => 
              uuids.length > 2 
                ? [uuids[0], `... +${uuids.length - 1} more UUIDs`] 
                : uuids
            )
          ]), 
          null, 
          2
        )}
      </pre>
    </div>
  );

}