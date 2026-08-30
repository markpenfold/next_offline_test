import OmenWrap from '@/components/data/omenWrap';
import { TerrainWindow } from '@/components/terrain/TerrainWindow';
import { MainDataPanel } from '@/components/omenland/MainDataPanel';
import { TimelineBuilder } from '@/components/omenland/TimelineBuilder';
import GraphModel from "@/components/graph/GraphModel";
import {Footer} from '@/components/omenland/Footer'
import styles from "@/app/styles/omenland.module.css";
export const dynamic = "force-static";
import { ModalManager } from './ModalManager';
import {AskGeminiButton} from '@/components/helpers/AskGeminiButton';

export default function OmenPage() {
  return (
    <OmenWrap>
      <ModalManager />
      <div className={styles.pageContainer}>
        {/* Top Workspace Row */}
        <div className={styles.topWorkspaceRow}>
          <div className={styles.quarter_section}>
            <MainDataPanel />
          </div>

          <div className={styles.three_quarter_section}>
            <TerrainWindow />
          </div>
        </div>

        {/* Full-Width Bottom Timeline */}
        <div className={styles.full_width}>
          <TimelineBuilder />
        </div>

        <div className={styles.full_width}>

          <GraphModel />
        </div>

        <div className={styles.full_width}>
        <AskGeminiButton />
        </div>
       
        {/* Full-Width Bottom Timeline */}
        <div className={styles.full_width}>
          
          <Footer />
            
        </div>

      </div>
    </OmenWrap>
  );
}