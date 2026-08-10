'use client'

import { WindowBar, WindowBarIconButton } from "@/components/omenland/WindowBar";
import { Globe, Maximize2, Minimize2, Settings } from "lucide-react";
import { TimelineSlider } from '@/components/terrain/Slider';
import { MasterBufferHUD } from "@/components/terrain/terrainHUD";
import { MyCanvas } from '@/components/terrain/MyCanvas'
import styles from "@/app/styles/omenland.module.css";
import { useState } from "react";



export function TerrainWindow() {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <div className={styles.stageContainer}>
      <WindowBar title="Terrain View" icon={<Globe size={14} />}>
        <WindowBarIconButton
          icon={<Settings size={13} />}
          tooltip="Terrain Settings"
          onClick={() => console.log("Settings")}
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
        
        

 