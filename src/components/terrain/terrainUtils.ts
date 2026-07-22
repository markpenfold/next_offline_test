// components/other/terrain/terrainUtils.ts

import { Vector3 } from 'three';
import { EventYear } from '@/app/store/types';

/**
 * Convert 3D world position to grid cell index (0-1023)
 */
export function worldPositionToGridIndex(
  point: Vector3,
  boardSize: number,
  dataSize: number
): number {
  const worldX = point.x + boardSize / 2;
  const worldZ = point.z + boardSize / 2;
  
  const cellSize = boardSize / dataSize;
  let dataX = Math.floor(worldX / cellSize);
  let dataZ = Math.floor(worldZ / cellSize);

  // Clamp to grid bounds
  dataX = Math.min(Math.max(dataX, 0), dataSize - 1);
  dataZ = Math.min(Math.max(dataZ, 0), dataSize - 1);

  // Row-major order
  return dataX + dataZ * dataSize;
}

/**
 * Calculate year for a given grid index
 */
export function gridIndexToYear(
  gridIndex: number,
  sliderYear: number,
  timeUnitSize: number
): number {
  return sliderYear + (gridIndex * timeUnitSize);
}

/**
 * Build collection breakdown for a year aggregate
 * Returns Map of collection key -> count
 */
export function buildCollectionBreakdown(
  events: any[]
): Map<string, number> {
  const collectionMap = new Map<string, number>();
  
  for (const event of events) {
    const collKey = event.collection;
    const existing = collectionMap.get(collKey);
    
    if (existing) {
      collectionMap.set(collKey, existing + 1);
    } else {
      collectionMap.set(collKey, 1);
    }
  }
  
  return collectionMap;
}


export function yearToPixels (
  year:number,
  containerWidth: number,
  tabWidth:number,
  aggregatedEvents: EventYear[],
) {
  if (!aggregatedEvents || aggregatedEvents.length === 0) return -tabWidth;

  let index = 0;
  if( year > aggregatedEvents[aggregatedEvents.length-1].year){
    //console.log("OVER DE LINE");
    index = aggregatedEvents.length -1;
  
  }else{
    index = aggregatedEvents.findIndex(e => e.year >= year);
  }
  const fraction = index / (aggregatedEvents.length - 1);
  const pixelPos = containerWidth * fraction;
  //console.log("PixPos:", pixelPos, ' from year:', year, ' and container width: ', containerWidth);
  return pixelPos - tabWidth;
};


export function pixelsToYears (
  pixelPosition:number,
  availableDateRange0: [number, number],
  containerWidth: number,
  tabWidth:number,
  aggregatedEvents: EventYear[],
) {

  // NO DATA? SET TO START OF DENSITY GRAPH ///
  if (!aggregatedEvents || aggregatedEvents.length === 0) {
    return availableDateRange0?.[0] ?? 0;
  }

  // Single event or no container width - return that event's year
  if (aggregatedEvents.length === 1 || !containerWidth || containerWidth <= 0) {
    return aggregatedEvents[0].year;
  }

  const startPos = pixelPosition + tabWidth;
  const fraction = startPos / containerWidth;
  const rawIndex = Math.floor(fraction * (aggregatedEvents.length - 1));
  const index = Math.max(0, Math.min(aggregatedEvents.length - 1, rawIndex));
  const year = aggregatedEvents[index]?.year ?? availableDateRange0[0];
 // console.log("from pixel: ", pixelPosition, " we get this year: ", year);
  return year;
};
