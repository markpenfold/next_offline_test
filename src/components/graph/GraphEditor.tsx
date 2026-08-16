'use client';
import { useRef } from 'react';
import { TimelineEvent } from "@/components/omenland/omenTypes";
import { useUIStore } from "@/stores/useUIStore";
import { useDATAStore } from "@/stores/useDataStore";
import { GraphEventCard } from './GraphEventCard';
import classes from './graph.module.css';

const GraphEditor = () => {

  //////////////////////////////////////////////////////////////////////////////////////////
  // Get/set data from store ///////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////////////////
  const timelineBuilderEvents = useUIStore((state) => state.timelineBuilderEvents);  
  const removeFromTimeline = useUIStore((state) => state.removeFromTimeline);

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className={classes.graphEditor}>
      {timelineBuilderEvents.map((item: TimelineEvent, index: number) => (
        <GraphEventCard
          key={item._id || `item-${index}`}
          item={item}
          onRemove={removeFromTimeline}
          bg={index % 2 === 0 ? '#2a2a2a' : '#323232'}
        />
      ))}
    </div>
  );
};

export default GraphEditor;