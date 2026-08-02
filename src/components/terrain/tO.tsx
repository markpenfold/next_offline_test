import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useThree } from '@react-three/fiber';
import { useDATAStore } from '@/stores/useDataStore';
import { createTerrainCompute } from './terrainComputeC';
import { cpuTerrainFallback } from './cpuTerrainFallback';
import { activeCountUniform, colorUniforms } from './terrainColorUniforms';

interface OrchestratorProps {
  geometry: THREE.BufferGeometry;
  resolution: number;
  // Callback or ref setter to pass active colors up/to material if needed
  onActiveColorsChange?: (colors: THREE.Color[], activeCount: number) => void;
}

export const TerrainOrchestrator: React.FC<OrchestratorProps> = ({ 
  geometry, 
  resolution,
  onActiveColorsChange
}) => {
  const { gl, invalidate } = useThree();
  const renderer = gl as unknown as THREE.WebGPURenderer;

  const slots = useDATAStore((state) => state.slots);
  const useWebGL = useDATAStore((state) => state.useWebGL);

  const MASTER_BUFFER = useMemo(() => new Float32Array(12288), []);

  const { computeNode, rawStorageAttr } = useMemo(() => {
    if (!geometry?.attributes?.position || useWebGL) {
      return { computeNode: null, rawStorageAttr: null };
    }
    return createTerrainCompute(geometry, resolution, MASTER_BUFFER);
  }, [geometry, resolution, MASTER_BUFFER, useWebGL]);

  useEffect(() => {
    if (!geometry) return;

    // 1. Filter ONLY active slots (Stream Compaction)
    const activeSlots = slots.filter((slot) => slot.isActive && slot.buffer instanceof Float32Array);
    const activeCount = activeSlots.length;

    // 2. Clear master buffer fully to prevent stale data in higher slots
    MASTER_BUFFER.fill(0);

    // 3. Tightly pack active buffers from index 0 to activeCount - 1
    const activeColors: THREE.Color[] = [];

    activeSlots.forEach((slot, packedIndex) => {
      const offset = packedIndex * 1024;
      MASTER_BUFFER.set(slot.buffer, offset);
      
      // Store synced color in matching order
      if (slot.color) {
        activeColors.push(new THREE.Color(slot.color));
      }
    });

    // 4. Expose active metadata on geometry userData for materials
    geometry.userData.activeCount = activeCount;
    geometry.userData.activeColors = activeColors;

    // 💡 3. SYNC DIRECTLY TO TSL SHADER UNIFORMS
    activeCountUniform.value = activeCount;

    for (let i = 0; i < 12; i++) {
      if (i < activeCount) {
        colorUniforms[i].value.copy(activeColors[i]);
      } else {
        colorUniforms[i].value.setRGB(0, 0, 0); // Reset inactive slots
      }
    }

    if (onActiveColorsChange) {
      onActiveColorsChange(activeColors, activeCount);
    }

    // 5. Dispatch GPU Compute
    if (!useWebGL && renderer && computeNode && rawStorageAttr) {
      rawStorageAttr.array.set(MASTER_BUFFER);
      rawStorageAttr.needsUpdate = true;

      renderer.computeAsync(computeNode).then(() => {
        invalidate();
      });
    } else if (useWebGL) {
      cpuTerrainFallback(geometry, resolution, MASTER_BUFFER);
      invalidate();
    }
  }, [slots, renderer, computeNode, rawStorageAttr, MASTER_BUFFER, geometry, resolution, useWebGL, invalidate, onActiveColorsChange]);

  return null;
};