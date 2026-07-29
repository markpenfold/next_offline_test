"use client";

import { useEffect, useState } from "react";
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import MyCanvas from '@/components/terrain/MyCanvas'
import { TimelineSlider } from '@/components/terrain/Slider';
import { IndexLoader } from '@/components/data/IndexLoader';
import styles from '@/app/styles/styles.module.css';



export function DataView() {
  const [loading, setLoading] = useState<boolean>(false);
  const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
  const activeAccount = useAppStore((s) => s.activeAccount);

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