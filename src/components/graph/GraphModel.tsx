'use client';
import GraphView from './GraphView2';
import GraphEditor from './GraphEditor';
import classes from './graph.module.css';
import { WindowBar, WindowBarIconButton } from "@/components/omenland/WindowBar";
import {  Share2 ,FolderOpen, Save} from "lucide-react";
import styles from "@/app/styles/omenland.module.css";
////////////////////////////////////////////////////////////////////
/// A COMPONENT TO HOLD THE TWO OTHER GRAPH GIZMOS /////////////////
////////////////////////////////////////////////////////////////////
const GraphModel = () => {
  return (
    <div className={classes.graphContainerSplit}>
      
      <div className={classes.timelineGraphGrid}>
      <WindowBar
        className={classes.windowbarHeaderLight}
        title={
          <div className={styles.windowBarTitleGroup}>
            <span className={styles.windowBarIcon}>
              <Share2 size={14} />
            </span>
            <span className={styles.windowBarTitle}>GraphTHING</span>
           
          </div>
        }
      >
       
      </WindowBar>
        <GraphView />
      </div>

      <div className={classes.graphEditorGrid}>
      <WindowBar
        className={classes.windowbarHeaderDark}
        title={
          <div className={styles.windowBarTitleGroup}>
            <span className={styles.windowBarIcon}>
              <Share2 size={14} />
            </span>
            <span className={styles.windowBarTitle}>GraphEDITOR</span>
           
          </div>
        }
      >
        
      </WindowBar>
        <GraphEditor />
      </div>
    </div>
  );
};

export default GraphModel;