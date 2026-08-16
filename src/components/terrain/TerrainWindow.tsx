'use client';

import { useState } from "react";
import { Globe, Maximize2, Minimize2, Settings } from "lucide-react";
import { WindowBar, WindowBarIconButton } from "@/components/omenland/WindowBar";
import { OmenMenu } from '@/components/omenland/OmenlandMenu';
import { TimelineSlider } from '@/components/terrain/Slider';
import { MasterBufferHUD } from "@/components/terrain/terrainHUD";
import { MyCanvas } from '@/components/terrain/MyCanvas';
import styles from "@/app/styles/omenland.module.css";

export function TerrainWindow() {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <div className={styles.stageContainer}>
      <WindowBar
          title="Terrain View" icon={<Globe size={14} />}>
        {/* Pass WindowBarIconButton as the trigger into OmenMenu */}
        <OmenMenu
          align="right"
          trigger={
            <WindowBarIconButton
              icon={<Settings size={13} />}
              tooltip="Terrain & App Settings"
            />
          }
        />

        <WindowBarIconButton
          icon={isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          tooltip={isMaximized ? "Restore Window" : "Maximize Window"}
          onClick={() => setIsMaximized(!isMaximized)}
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