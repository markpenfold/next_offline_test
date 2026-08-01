// components/terrain/TerrainOrchestrator.tsx
import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useThree } from '@react-three/fiber';
import { useDATAStore } from '@/stores/useDataStore';
import { createTerrainCompute } from './terrainComputeB';
import { cpuTerrainFallback } from './cpuTerrainFallback';

interface OrchestratorProps {
  geometry: THREE.BufferGeometry;
  resolution: number;
}

export const TerrainOrchestrator: React.FC<OrchestratorProps> = ({ 
  geometry, 
  resolution 
}) => {
  const { gl, invalidate } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;

  // 1. Read Zustand Store (Slots AND fallback flag)
  const slots = useDATAStore((state) => state.slots);
  const useWebGL = useDATAStore((state) => state.useWebGL);

  const MASTER_BUFFER = useMemo(() => new Float32Array(12288), []);

  // 2. Compute Node initialization (Skip if in WebGL mode)
  const { computeNode, rawStorageAttr } = useMemo(() => {
    if (!geometry?.attributes?.position || useWebGL) {
      return { computeNode: null, rawStorageAttr: null };
    }
    return createTerrainCompute(geometry, resolution, MASTER_BUFFER);
  }, [geometry, resolution, MASTER_BUFFER, useWebGL]);

  // 3. Main Computation Execution Loop
  useEffect(() => {
    if (!geometry) return;

    // Fill Master Buffer
    MASTER_BUFFER.fill(0);
    let activeCount = 0;

    slots.forEach((slot, index) => {
      const offset = index * 1024;
      if (slot.isActive && slot.buffer instanceof Float32Array) {
        MASTER_BUFFER.set(slot.buffer, offset);
        activeCount++;
      }
    });

    // Dynamically update active timelines for shaders/materials
    geometry.userData.activeTimelines = activeCount;

    // Branch execution based on Zustand state
    if (!useWebGL && renderer && computeNode && rawStorageAttr) {
      // 🚀 Native WebGPU Hardware Path
      rawStorageAttr.array.set(MASTER_BUFFER);
      rawStorageAttr.needsUpdate = true;

      renderer.computeAsync(computeNode).then(() => {
        invalidate();
      });
    } else if (useWebGL) {
      // 🛡️ WebGL CPU Fallback Path
      cpuTerrainFallback(geometry, resolution, MASTER_BUFFER);
      invalidate();
    }
  }, [slots, renderer, computeNode, rawStorageAttr, MASTER_BUFFER, geometry, resolution, useWebGL, invalidate]);

  return null;
};