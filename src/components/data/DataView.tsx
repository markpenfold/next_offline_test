"use client";

import { useEffect, useState } from "react";
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { getTSM } from '@/components/data/analytics';
import MyCanvas from '@/components/terrain/MyCanvas'
import { TimelineSlider } from '@/components/terrain/Slider';
import { IndexLoader } from '@/components/data/IndexLoader';
import styles from '@/app/styles/styles.module.css';



export function DataView() {
  const [loading, setLoading] = useState<boolean>(false);
  
  
  const setTerrainData = useDATAStore((s) => s.setTerrainData);
  const terrainData = useDATAStore((s) => s.terrainData);
  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
  const isTerrainReady = useDATAStore((s) => s.isTerrainReady);
  const activeAccount = useAppStore((s) => s.activeAccount);

  // ---------------------------------------------------------------------------
  // Update terrainData
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!activeAccount?.id || !activeDataViewIndexes) return;

    // If active indexes drop to 0, clear BOTH states immediately
    if (activeDataViewIndexes.length === 0) {
      console.log("🧹 Clearing terrain stores (0 active indexes)");
      setTerrainData([]);      
      return;
    }

    if (!isTerrainReady) return;

        
    async function fetchTerrain() {
      console.log("fetchTerrain")
      setLoading(true);
      try {
        const matrix = await getTSM();
        console.log("TERRAIN MATRIX ABOUT TO BE SET WITH: ", matrix);
        setTerrainData(matrix); 
      } catch (err) {
        console.error("Failed to fetch terrain matrix:", err);
        setTerrainData(null);
      } finally {
        setLoading(false);
      }
    }
      
    fetchTerrain();

      }, [activeDataViewIndexes, isTerrainReady]);


  // ---------------------------------------------------------------------------
  // RENDER UI (Stable layout)
  // ---------------------------------------------------------------------------
  
  return (
    <div className="space-y-4 p-4 relative min-h-screen">
   
      {/* Main Content Layout */}
      <div className={styles.container_split_1_3}>
        {/* IndexLoader is ALWAYS mounted so the user can interact with it */}
        <IndexLoader />
        {/* Canvas holds the TerrainShaderTest */}
        <MyCanvas />
      </div>
        <TimelineSlider />
    </div>
  );
}