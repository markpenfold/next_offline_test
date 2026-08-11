import OmenWrap from '@/components/data/omenWrap';
import { IndexLoader } from '@/components/omenland/IndexLoader';
import {TerrainWindow} from '@/components/terrain/TerrainWindow'
import {MainDataPanel} from '@/components/omenland/MainDataPanel'
import styles from "@/app/styles/omenland.module.css";

// Force static rendering so this page shell can be served straight from cache offline
export const dynamic = "force-static";

export default function OmenPage() {
  return (
    <OmenWrap>
      {/* Left Column: IndexLoader takes full 100% height */}
      <div className={styles.quarter_section}>
        <MainDataPanel />
      </div>

      {/* Right Column: Combined Canvas + Bottom Timeline Slider */}
      <div className={styles.three_quarter_section}>

    <TerrainWindow />
        
      </div>
    </OmenWrap>
  );
}