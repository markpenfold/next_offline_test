"use client";

import { useEffect, useState } from "react";
import { getLocalCacheManifest, AvailableIndex } from "./storage"; 
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { getTerrainShaderMatrix, syncTerrainTable, TerrainTuple } from '@/components/data/analytics';

export function DataView() {
  const [loading, setLoading] = useState<boolean>(true);
  const [dataView, setDataView] = useState<TerrainTuple[] | null>(null);  
  // FROM THE STORES 
  const loadedIndexes = useDATAStore((s) => s.loadedIndexes);
  const activeAccount = useAppStore((s) => s.activeAccount);

  // Live Scan & Initialize on Mount
  useEffect(() => {
    let isMounted = true;

    async function updateView() {
      if (!activeAccount?.id || loadedIndexes.length === 0) {
        if (isMounted) {
          setDataView(null);
          setLoading(false);
        }
        return;
      }

      try {
        if (isMounted) setLoading(true);

        // 1. Sync DuckDB table
        await syncTerrainTable(loadedIndexes);
        
        // 2. Query shader matrix
        const result = await getTerrainShaderMatrix();

        if (isMounted) {
          setDataView(result);
        }
      } catch (err) {
        console.error("❌ Failed to generate DataView:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    updateView();

    return () => {
      isMounted = false;
    };
  }, [activeAccount?.id, loadedIndexes]);

  if (loading) {
    return <div>Loading terrain matrix...</div>;
  }

  if (!dataView) {
    return <div>No index or active account selected.</div>;
  }

  // Option A: If you want to inspect/debug the raw output
return (
    <div>
      <h3>Terrain Data Loaded</h3>
      <pre className="p-4 bg-gray-900 text-green-400 rounded overflow-auto text-xs">
        {JSON.stringify(
          dataView.slice(0, 5).map((row) => [
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
  /* Option B: If you are passing shaderMatrix & categoryLegend to Canvas/UI components:
  return (
    <div>
      <TerrainCanvas matrix={dataView.shaderMatrix} />
      <CategoryLegend legend={dataView.categoryLegend} />
    </div>
  );
  */
}