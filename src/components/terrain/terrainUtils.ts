// components/other/terrain/terrainUtils.ts

import { Vector3 } from 'three';
import { EventYear } from '@/lib/utils/terrain_types';
import * as THREE from 'three';

export function setupTerrainGeometry(geometry: THREE.BufferGeometry, numVertices: number) {
  // Each attribute holds 4 slot components (x, y, z, w) per vertex
  const createVec4Attribute = () =>
    new THREE.BufferAttribute(new Float32Array(numVertices * 4).fill(0), 4);

  geometry.setAttribute('bands0', createVec4Attribute()); // Slots 0, 1, 2, 3
  geometry.setAttribute('bands1', createVec4Attribute()); // Slots 4, 5, 6, 7
  geometry.setAttribute('bands2', createVec4Attribute()); // Slots 8, 9, 10, 11
}



/**
 * Updates a single slot's float data inside the target THREE.BufferAttribute
 * without re-uploading the other 2 vec4 attributes.
 */
export function syncSlotToGeometry(
  geometry: THREE.BufferGeometry,
  slotIndex: number,
  slotBuffer: Float32Array
) {
  if (slotIndex < 0 || slotIndex >= 12) return;

  // 1. Calculate which physical attribute and vec4 component to target
  const attrIndex = Math.floor(slotIndex / 4); // 0 -> bands0, 1 -> bands1, 2 -> bands2
  const compIndex = slotIndex % 4;             // 0 -> x, 1 -> y, 2 -> z, 3 -> w
  const attrName = `bands${attrIndex}`;

  const attribute = geometry.getAttribute(attrName) as THREE.BufferAttribute;
  if (!attribute) return;

  const array = attribute.array as Float32Array;
  const numVertices = slotBuffer.length;

  // 2. Overwrite ONLY the component (x, y, z, or w) belonging to this slot
  for (let i = 0; i < numVertices; i++) {
    array[i * 4 + compIndex] = slotBuffer[i];
  }

  // 3. Mark ONLY this attribute for GPU update!
  attribute.needsUpdate = true;
}

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
