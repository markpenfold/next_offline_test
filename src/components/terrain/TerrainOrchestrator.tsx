import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useThree } from '@react-three/fiber';
import { useDATAStore } from '@/stores/useDataStore';
import { createTerrainCompute } from './terrainCompute';

interface OrchestratorProps {
  geometry: THREE.BufferGeometry;
  resolution: number;
}

export const TerrainOrchestrator: React.FC<OrchestratorProps> = ({ 
  geometry, 
  resolution 
}) => {
  // 1. Grab renderer and invalidate function from R3F context
  const { gl, invalidate } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;

  const slots = useDATAStore((state) => state.slots);
  const MASTER_BUFFER = useMemo(() => new Float32Array(12288), []);



  const { computeNode, rawStorageAttr } = useMemo(() => {
    // If geometry isn't passed or ready, 
    // don't attempt to build compute nodes
    if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    return { computeNode: null, rawStorageAttr: null };
  }

    return createTerrainCompute(geometry, resolution, MASTER_BUFFER);
  }, [geometry, resolution, MASTER_BUFFER]);

  useEffect(() => {
    if (!renderer || !computeNode || !rawStorageAttr) return;

    MASTER_BUFFER.fill(0);

    slots.forEach((slot, index) => {
      const offset = index * 1024;
      if (slot.isActive && slot.buffer instanceof Float32Array) {
        MASTER_BUFFER.set(slot.buffer, offset);
      }
    });

    rawStorageAttr.array.set(MASTER_BUFFER);
    rawStorageAttr.needsUpdate = true;

    // Compute on GPU and then notify R3F to render frame (for frameloop="demand")
    renderer.computeAsync(computeNode).then(() => {
      invalidate(); // <--- Forces R3F to draw the new frame on canvas!
    });

  }, [slots, renderer, computeNode, rawStorageAttr, MASTER_BUFFER, invalidate]);

  return null;
};