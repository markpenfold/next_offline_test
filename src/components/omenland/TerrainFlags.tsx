import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useUIStore } from '@/stores/useUIStore';
import { useDATAStore } from '@/stores/useDataStore';

function getSimplePeakCeiling(gridIndex: number, slots: any[]): number {
  const row = Math.floor(gridIndex / 32);
  const col = gridIndex % 32;

  let maxNeighborSum = 0;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;

      if (r >= 0 && r < 32 && c >= 0 && c < 32) {
        const idx = r * 32 + c;
        let sum = 0;
        for (const slot of slots) {
          if (slot.buffer && slot.buffer[idx]) {
            sum += slot.buffer[idx];
          }
        }
        if (sum > maxNeighborSum) {
          maxNeighborSum = sum;
        }
      }
    }
  }

  if (maxNeighborSum <= 0) return 0;

  return Math.log(maxNeighborSum + 1.0) * 15.0 * 1.25;
}

// Sub-component for individual flag rendering and smooth continuous rotation
function RotatingFlag({ position }: { position: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const invalidate = useThree((state) => state.invalidate);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    // 1. Gentle continuous rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.35;
    }

    if (groupRef .current) {
      groupRef.current.position.y = 3.0 + Math.sin(time * 5.0) * 0.8;
    }

    // 2. Sine wave oscillator between 0 and 1 (speed factor = 3.0)
    const pulse = (Math.sin(time * 3.0) + 1.0) / 2.0;

    // 3. Pulse emissive intensity on material (glows from dark crimson to golden-red)
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = 0.2 + pulse * 0.8;
    }

    // 4. Pulse light intensity casting onto surrounding terrain
    if (lightRef.current) {
      lightRef.current.intensity = 15.0 + pulse * 35.0;
    }

    invalidate(); // Ensures continuous execution under demand loop
  });

  return (
    <group position={position}>
      {/* Dynamic Golden Light Casting on Nearby Peaks */}
      <pointLight
        ref={lightRef}
        color="#9e8899"
        distance={25}
        decay={2}
        position={[0, 1.5, 0]}
      />

      {/* Rotating Inverted Pyramid Mesh */}
      <group ref={groupRef}>
        <mesh 
        position={[0, 3.0, 0]} 
        rotation={[Math.PI, 0, 0]}
        castShadow
        >
          <torusGeometry args={[5, 1, 8]} />
          <meshStandardMaterial
            ref={materialRef}
            color="#38d95e"
            emissive="#55b1ee"
            emissiveIntensity={0.5}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>
      </group>
    </group>
  );
}

export function TerrainFlags() {
  const showFlags = useUIStore((state) => state.showFlags);
  const timelineBuilderEvents = useUIStore((state) => state.timelineBuilderEvents);

  const windowStartYear = useDATAStore((state) => state.windowStartYear);
  const stepsize = useDATAStore((state) => state.stepsize);
  const slots = useDATAStore((state) => state.slots);

  const activeFlags = useMemo(() => {
    if (!showFlags || windowStartYear === null || !stepsize || !slots.length) return [];

    const totalYearsInView = 32 * 32 * stepsize;
    const windowEndYear = windowStartYear + totalYearsInView;

    const yearGroups = new Map<number, number>();
    for (const evt of timelineBuilderEvents) {
      if (evt.year >= windowStartYear && evt.year <= windowEndYear) {
        const count = yearGroups.get(evt.year) || 0;
        yearGroups.set(evt.year, count + 1);
      }
    }

    const flags: Array<{ year: number; position: [number, number, number] }> = [];

    yearGroups.forEach((_, year) => {
      const gridIndex = Math.max(0, Math.min(1023, Math.round((year - windowStartYear) / stepsize)));

      const row = Math.floor(gridIndex / 32);
      const col = gridIndex % 32;

      const x = ((col + 0.5) / 32) * 400 - 200;
      const z = ((row + 0.5) / 32) * 400 - 200;

      const peakCeiling = getSimplePeakCeiling(gridIndex, slots);
      const y = peakCeiling * 0.80;

      flags.push({ year, position: [x, y, z] });
    });

    return flags;
  }, [timelineBuilderEvents, windowStartYear, stepsize, slots, showFlags]);

  if (!showFlags || activeFlags.length === 0) return null;

  return (
    <group>
      {activeFlags.map((flag) => (
        <RotatingFlag key={flag.year} position={flag.position} />
      ))}
    </group>
  );
}