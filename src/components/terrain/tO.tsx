import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { useThree } from '@react-three/fiber';
import { useDATAStore, ActiveSlotMeta } from '@/stores/useDataStore';
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
  const setMasterBufferData = useDATAStore((state) => state.setMasterBufferData);

  const MASTER_BUFFER = useMemo(() => new Float32Array(12288), []);

  const { computeNode, rawStorageAttr } = useMemo(() => {
    if (!geometry?.attributes?.position || useWebGL) {
      return { computeNode: null, rawStorageAttr: null };
    }
    return createTerrainCompute(geometry, resolution, MASTER_BUFFER);
  }, [geometry, resolution, MASTER_BUFFER, useWebGL]);

  useEffect(() => {
    if (!geometry) return;

    // 💡 1. ACTIVE COUNT IS JUST STACK LENGTH
    // Every item in slots IS active, and already in geological stack order (0 = base, N = top)
    const activeCount = slots.length;

    // 2. Clear master buffer fully to prevent stale data in higher slots
    MASTER_BUFFER.fill(0);

    // 3. Tightly pack active buffers from index 0 to activeCount - 1
    const activeColors: THREE.Color[] = [];
    const activeSlotsMetadata: ActiveSlotMeta[] = [];

    slots.forEach((slot, arrayIndex) => {
      console.log("arrayIndex: ", arrayIndex)
      const packedIndex = activeCount - 1 - arrayIndex;
      const offset = arrayIndex * 1024;
      if (slot.buffer) {
        MASTER_BUFFER.set(slot.buffer, offset);
      }
      
      const color = new THREE.Color(slot.color);
      activeColors.push(color);

      activeSlotsMetadata.push({
        id: slot.id,
        name: slot.category || slot.fileName || `Slot ${slot.id}`,
        color: slot.color,
      });
    });

    // 4. Sync directly to Zustand store for prop-less DOM HUD overlay
    setMasterBufferData(MASTER_BUFFER, activeSlotsMetadata);

    // 5. Expose active metadata on geometry userData for material/fallback access
    geometry.userData.masterBuffer = MASTER_BUFFER;
    geometry.userData.activeCount = activeCount;
    geometry.userData.activeColors = activeColors;
    geometry.userData.activeSlotsMetadata = activeSlotsMetadata;

    // 6. SYNC DIRECTLY TO TSL SHADER UNIFORMS
    activeCountUniform.value = activeCount;

    for (let i = 0; i < 12; i++) {
      if (i < activeCount) {
        colorUniforms[i].value.copy(activeColors[i]);
      } else {
        colorUniforms[i].value.setRGB(0, 0, 0); // Reset inactive uniform slots
      }
    }

    if (onActiveColorsChange) {
      onActiveColorsChange(activeColors, activeCount);
    }

    // 7. Dispatch GPU Compute
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
  }, [
    slots,
    renderer,
    computeNode,
    rawStorageAttr,
    MASTER_BUFFER,
    geometry,
    resolution,
    useWebGL,
    invalidate,
    onActiveColorsChange,
    setMasterBufferData,
  ]);

  return null;
};