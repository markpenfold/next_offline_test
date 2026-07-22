import { useMemo } from 'react';
import { GridHelper, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, Line } from 'three';
import { Html } from '@react-three/drei';
import { useEventStore } from '../../app/store/useEventStore';
import { formatYear } from './helpers';

interface TerrainGridProps {
  size?: number;
  divisions?: number;
}

export function TerrainGrid({ size = 400, divisions = 32 }: TerrainGridProps) {
  const terrainData = useEventStore((state) => state.terrainData);
  const halfSize = size / 2;

  // Create the base grid
  const gridHelper = useMemo(() => {
    const grid = new GridHelper(size, divisions, 0x999999, 0x666666);
    if (grid.material) {
      const material = grid.material as any;
      material.transparent = true;
      material.opacity = 0.3;
    }
    return grid;
  }, [size, divisions]);

  // Create corner labels using actual years from terrainData
  const cornerLabels = useMemo(() => {
    if (!terrainData || terrainData.length === 0) return [];

    // Get start and end years from terrain data
    // terrainData[index] = [year, ...composition]
    const startYear = terrainData[0][0];
    const endYear = terrainData[terrainData.length - 1][0];
    const leanOffset = 15; // How far the top leans outward

    // Four corners with their years:
    // front-left: end, front-right: end - 32 (later dates at front)
    // back-left: start + 32, back-right: start (earlier dates at back)
    const corners = [
  // front-left: was endYear - 32, now startYear
  { x: -halfSize, z: -halfSize, year: startYear,      leanX: -leanOffset, leanZ: -leanOffset },

  // front-right: was endYear, now startYear + 32
  { x:  halfSize, z: -halfSize, year: startYear + 31, leanX:  leanOffset, leanZ: -leanOffset },

  // back-left: was startYear, now endYear - 32
  { x: -halfSize, z:  halfSize, year: endYear - 31,   leanX: -leanOffset, leanZ:  leanOffset },

  // back-right: was startYear + 32, now endYear
  { x:  halfSize, z:  halfSize, year: endYear,        leanX:  leanOffset, leanZ:  leanOffset },
];

    return corners.map((corner, i) => {
      // Top position (leaned out)
      const topX = corner.x + corner.leanX;
      const topY = 50;
      const topZ = corner.z + corner.leanZ;

      // Base position (at grid corner)
      const baseY = -10;

      // Create line from base to top
      const lineGeom = new BufferGeometry();
      const positions = new Float32Array([
        corner.x, baseY, corner.z,  // base at grid corner
        topX, topY, topZ            // top leaned out
      ]);
      lineGeom.setAttribute('position', new Float32BufferAttribute(positions, 3));
      const lineMat = new LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 });
      const line = new Line(lineGeom, lineMat);

      return {
        line,
        key: i,
        label: formatYear(corner.year),
        labelPos: [topX, topY + 5, topZ] as [number, number, number]
      };
    });
  }, [terrainData, halfSize]);

  return (
    <group>
      {/* Base grid */}
      <primitive
        object={gridHelper}
        position={[0, -10.1, 0]}
        rotation={[0, Math.PI * 0.5, 0]}
      />

      {/* Corner posts with year labels */}
      {cornerLabels.map(({ line, key, label, labelPos }) => (
        <group key={key}>
          {/* Leaning post */}
          <primitive object={line} />
          {/* Year label at top */}
          <Html
            position={labelPos}
            center
            style={{
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '12px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              textShadow: '0 0 4px black',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {label}
          </Html>
        </group>
      ))}
    </group>
  );
}
