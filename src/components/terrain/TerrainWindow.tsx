'use client';

import { useState } from "react";
import { Globe, Maximize2, Minimize2, Flag, FolderOpen, Save, Palette  } from "lucide-react";
import { WindowBar, WindowBarIconButton } from "@/components/omenland/WindowBar";
import { TimelineSlider } from '@/components/terrain/Slider';
import { MasterBufferHUD } from "@/components/terrain/terrainHUD";
import { MyCanvas } from '@/components/terrain/MyCanvas';
import styles from "@/app/styles/omenland.module.css";
import { useUIStore } from "@/stores/useUIStore";
import { useDATAStore } from '@/stores/useDataStore';
import { COLLECTION_COLORS_T6_GREYSCALE } from "@/lib/utils/col_constants"

export function TerrainWindow() {
  
  const setFinderOpen = useUIStore((state) => state.setFinderOpen);
  const setSaverOpen = useUIStore((state) => state.setSaverOpen);
  const setTerrainMax = useUIStore((state) => state.setTerrainMax);
  const terrainMax = useUIStore((state) => state.terrainMax);

  const currentPalette = useDATAStore((state) => state.currentPalette);
  const togglePalette = useDATAStore((state) => state.togglePalette);
  
  const isGreyscale = currentPalette === COLLECTION_COLORS_T6_GREYSCALE;

  // Read flag state & toggle action from Zustand store
  const showFlags = useUIStore((state) => state.showFlags);
  const toggleFlagsVisibility = useUIStore((state) => state.toggleFlagsVisibility);

  return (
    <div className={`${styles.stageContainer} ${terrainMax ? styles.maximized : ''}`}>
      <WindowBar
          title="Terrain View" icon={<Globe size={14} />}>

            <WindowBarIconButton
              icon={<Palette size={13} style={{ opacity: isGreyscale ? 1 : 0.4 }} />}
              tooltip={isGreyscale ? "Switch to Color Palette" : "Switch to Greyscale Palette"}
              onClick={togglePalette}
            />

        <WindowBarIconButton
          icon={<Flag size={13} style={{ opacity: showFlags ? 1 : 0.4 }} />}
          tooltip={showFlags ? "Hide Timeline Flags" : "Show Timeline Flags"}
          onClick={toggleFlagsVisibility}
        />


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