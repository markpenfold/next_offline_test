'use client';

import { useState } from "react";
import { Globe, Maximize2, Minimize2, Settings, FolderOpen, Save  } from "lucide-react";
import { WindowBar, WindowBarIconButton } from "@/components/omenland/WindowBar";
import { TimelineSlider } from '@/components/terrain/Slider';
import { MasterBufferHUD } from "@/components/terrain/terrainHUD";
import { MyCanvas } from '@/components/terrain/MyCanvas';
import styles from "@/app/styles/omenland.module.css";
import { useUIStore } from "@/stores/useUIStore";

export function TerrainWindow() {
  
  const setFinderOpen = useUIStore((state) => state.setFinderOpen);
  const setSaverOpen = useUIStore((state) => state.setSaverOpen);
  const setTerrainMax = useUIStore((state) => state.setTerrainMax);
  const terrainMax = useUIStore((state) => state.terrainMax);

  return (
    <div className={`${styles.stageContainer} ${terrainMax ? styles.maximized : ''}`}>
      <WindowBar
          title="Terrain View" icon={<Globe size={14} />}>
        <WindowBarIconButton
          icon={<FolderOpen size={13} />}
          tooltip="Open Project"
          onClick={() => setFinderOpen(true)}
        />
        <WindowBarIconButton
          icon={<Save size={13} />}
          tooltip="Save Project"
          onClick={() => setSaverOpen(true)}
        />
        {/* Pass WindowBarIconButton as the trigger into OmenMenu */}


        <WindowBarIconButton
          icon={terrainMax ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          tooltip={terrainMax ? "Restore Window" : "Maximize Window"}
          onClick={() => setTerrainMax(!terrainMax)}
        />
      </WindowBar>

      <div className={styles.canvasWrapper}>
        <MyCanvas />
        <MasterBufferHUD />
      </div>
      <div className={styles.sliderWrapper}>
        <TimelineSlider />
      </div>
    </div>
  );
}