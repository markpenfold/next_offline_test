import { CollectionInfo } from '../store/types';

/**
 * Convert composition object to ordered array for shader
 */
export function compositionToTimelineArray(
  composition: Record<string, number>,
  selectedCollections: CollectionInfo[]
): number[] {
  return selectedCollections.map(collection => {
    return composition[collection.key] || 0;
  });
}

export function formatYear(year: number): string {
  if (year < -1000000000) {
    return `${(Math.abs(year) / 1000000000).toFixed(2)}B BC`;
  } else if (year < -1000000) {
    return `${(Math.abs(year) / 1000000).toFixed(1)}M BC`;
  } else if (year < 0) {
    return `${Math.abs(year).toLocaleString()} BC`;
  }
  return `${year.toLocaleString()} AD`;
}