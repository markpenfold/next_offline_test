
import { Vector2, Vector3 } from 'three';


export function uvToYear(intersectionPoint: Vector2 | Vector3, terrainData: any): any[] | undefined {
  if (!terrainData || !Array.isArray(terrainData) || terrainData.length === 0) {
    return undefined;
  }

  const gridSize = Math.sqrt(terrainData.length);
  const col = Math.floor(intersectionPoint.x * gridSize);
  const row = Math.floor(intersectionPoint.y * gridSize);

  // Get 1D index
  const index = Math.min(row * gridSize + col, terrainData.length - 1);

  // terrainData[index] = [year, ...composition]
  const dataPoint = terrainData[index];

  return dataPoint;
}