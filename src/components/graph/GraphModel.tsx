'use client';
import GraphView from './GraphView2';
import GraphEditor from './GraphEditor';
import classes from './graph.module.css';

////////////////////////////////////////////////////////////////////
/// A COMPONENT TO HOLD THE TWO OTHER GRAPH GIZMOS /////////////////
////////////////////////////////////////////////////////////////////
const GraphModel = () => {
  return (
    <div className={classes.graphContainerSplit}>
      <div className={classes.timelineGraphGrid}>
        <GraphView />
      </div>

      <div className={classes.graphEditorGrid}>
        <GraphEditor />
      </div>
    </div>
  );
};

export default GraphModel;