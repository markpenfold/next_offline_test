import OmenWrap from '@/components/data/omenWrap';
import { OmenMenu } from '@/components/omenland/OmenlandMenu';
import { IndexLoader } from '@/components/data/IndexLoader';
import {TerrainWindow} from '@/components/terrain/TerrainWindow'
import styles from "@/app/styles/omenland.module.css";

// Force static rendering so this page shell can be served straight from cache offline
export const dynamic = "force-static";

export default function OmenPage() {
  return (
    <OmenWrap>
      {/* Left Column: IndexLoader takes full 100% height */}
      <div className={styles.quarter_section}>
        <IndexLoader />
      </div>

      {/* Right Column: Combined Canvas + Bottom Timeline Slider */}
      <div className={styles.three_quarter_section}>

    <TerrainWindow />
        
      </div>

      <OmenMenu />
    </OmenWrap>
  );
}