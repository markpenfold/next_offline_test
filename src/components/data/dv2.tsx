"use client";

import { useEffect, useState } from "react";
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { getTSM } from '@/components/data/analytics';
import { TerrainYearStep } from "./dataTypes";
import MyCanvas from '@/components/terrain/MyCanvas'
import { TimelineSlider } from '@/components/terrain/Slider';
import { IndexLoader } from '@/components/data/IndexLoader';
import styles from '@/app/styles/styles.module.css';

function get1024WindowSlice(
  fullTerrainData: TerrainYearStep[],
  startYear: number,
  categories: string[]
): TerrainYearStep[] {
  // ... keep your existing get1024WindowSlice logic exact as is ...
  const yearMap = new Map<number, TerrainYearStep>();
  for (let i = 0; i < fullTerrainData.length; i++) {
    yearMap.set(Number(fullTerrainData[i][0]), fullTerrainData[i]);
  }

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
  const [loading, setLoading] = useState<boolean>(false);
  
  const windowStartYear = useDATAStore((s) => s.windowStartYear);
  const setTerrainData = useDATAStore((s) => s.setTerrainData);
  const terrainData = useDATAStore((s) => s.terrainData);
  const setTerrainDataViewWindow = useDATAStore((s) => s.setTerrainDataViewWindow);
  const terrainDataViewWindow = useDATAStore((s) => s.terrainDataViewWindow);
  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
  const isTerrainReady = useDATAStore((s) => s.isTerrainReady);
  const activeAccount = useAppStore((s) => s.activeAccount);

  // ---------------------------------------------------------------------------
  // EFFECT 1: Update terrainData
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isTerrainReady || !activeAccount?.id || !activeDataViewIndexes) {
      return; 
    }
    
    async function fetchTerrain() {
      setLoading(true);
      try {
        const matrix = await getTSM();
        setTerrainData(matrix); 
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
  // EFFECT 2: Update Window slice
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!terrainData || terrainData.length === 0 || windowStartYear === null) {
      return;
    }
    const allCategories = Array.from(new Set(terrainData.flatMap((step) => step[1])));
    const windowSlice = get1024WindowSlice(terrainData, windowStartYear, allCategories);
    setTerrainDataViewWindow(windowSlice);
  }, [terrainData, windowStartYear, setTerrainDataViewWindow]);

  // ---------------------------------------------------------------------------
  // RENDER UI (Stable layout)
  // ---------------------------------------------------------------------------
  
  return (
    <div className="space-y-4 p-4 relative min-h-screen">
      
      {/* Loading Overlay: Shows on top while fetching, without unmounting the canvas */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
          <div className="text-white text-lg font-medium animate-pulse">
            Loading terrain matrix...
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="min-h-[4rem]">
        {!activeDataViewIndexes || !activeAccount?.id ? (
          <p className="text-sm text-gray-400">Please select an index and account.</p>
        ) : !terrainData || terrainData.length === 0 ? (
          <p className="text-sm text-gray-400">No Terrain data loaded.</p>
        ) : (
          <div>
            <p>hello there</p>
            <h3 className="text-lg font-medium text-white">Terrain Data Loaded</h3>
            <p className="text-xs text-gray-400 mt-1">
              Loaded <span className="text-green-400 font-mono">{terrainData.length}</span> total yearly intervals. 
              Active window size: <span className="text-blue-400 font-mono">{terrainDataViewWindow?.length ?? 0}</span> years.
            </p>
          </div>
        )}
      </div>

      {/* Main Content Layout */}
      <div className={styles.container_split_1_3}>
        {/* IndexLoader is ALWAYS mounted so the user can interact with it */}
        <IndexLoader />
        
        {/* Only hide Canvas if there is literally no data to render yet, 
            but otherwise keep it mounted during background loading */}
        {terrainData && terrainData.length > 0 ? (
           <MyCanvas />
        ) : (
           <div className="flex items-center justify-center border border-gray-800 rounded bg-gray-900/50 min-h-[400px]">
              <span className="text-gray-500">Canvas awaiting data...</span>
           </div>
        )}
      </div>
      
      <div className={styles.container_split_1_3}>
        <div></div>
        <TimelineSlider />
      </div>
      
    </div>
  );
}