import { useMemo } from 'react';
import { GridHelper, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, Line } from 'three';
import { Html } from '@react-three/drei';

import { useDATAStore } from '@/stores/useDataStore';


export function formatYear(year:number) {
  if (year < -1000000000) {
    return `${(Math.abs(year) / 1000000000).toFixed(2)}B BC`;
  } else if (year < -1000000) {
    return `${(Math.abs(year) / 1000000).toFixed(1)}M BC`;
  } else if (year < 0) {
    return `${Math.abs(year)} BC`;
  }
  return `${year} AD`;
}



interface TerrainGridProps {
  size?: number;
  divisions?: number;
}

export function TerrainGrid({ size = 400, divisions = 32 }: TerrainGridProps) {
  // 1. Move hooks to the top level
  const startYear = useDATAStore((s) => s.windowStartYear);
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

  // 2. Now useMemo only manages the data/geometry creation
  const cornerLabels = useMemo(() => {
    if (startYear === undefined || startYear === null) {
      return null;
    }

    const endYear = startYear + 1024;
    const leanOffset = 15;

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
      const topX = corner.x + corner.leanX;
      const topY = 120;
      const topZ = corner.z + corner.leanZ;
      const baseY = -10;

      const lineGeom = new BufferGeometry();
      const positions = new Float32Array([
        corner.x, baseY, corner.z,
        topX, topY, topZ
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
  }, [startYear, halfSize]); // Now these dependencies are valid

  return (
    <group>
      {/* Base grid */}
      <primitive
        object={gridHelper}
        position={[0, -10.1, 0]}
        rotation={[0, Math.PI * 0.5, 0]}
      />

      {/* Corner posts with year labels */}
      {cornerLabels?.map(({ line, key, label, labelPos }) => (
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
