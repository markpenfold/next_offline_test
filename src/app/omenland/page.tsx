import OmenWrap from '@/components/data/omenWrap';
import MyCanvas from '@/components/terrain/MyCanvas';
import { OmenMenu } from '@/components/omenland/OmenlandMenu';
import { TimelineSlider } from '@/components/terrain/Slider';
import { IndexLoader } from '@/components/data/IndexLoader';
import { MasterBufferHUD } from "@/components/terrain/terrainHUD";
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
        <div className={styles.stageContainer}>
          <div className={styles.canvasWrapper}>
            <MyCanvas />
            <MasterBufferHUD />
          </div>
          <div className={styles.sliderWrapper}>
            <TimelineSlider />
          </div>
        </div>
      </div>

      <OmenMenu />
    </OmenWrap>
  );
}