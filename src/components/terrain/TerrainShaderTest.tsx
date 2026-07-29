'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three/webgpu';
import { getMat4 } from './shader_x.js';
import { useUIStore } from '@/stores/useUIStore';
import { useThree } from '@react-three/fiber';
import { getSmoothArray } from './helpers.js';
import { useDATAStore } from '@/stores/useDataStore';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';

const MAX_SLOTS = 12; // 3 x vec4 = 12 fixed slots

/**
 * Writes smoothed float data into a single slot channel in CPU memory.
 * Does NOT flag `needsUpdate` directly so the caller can batch uploads efficiently.
 */
export function updateSingleSlotData(
  geometry: THREE.BufferGeometry,
  slotIndex: number,
  smoothedRawData: Float32Array | null
) {
  const attrIndex = Math.floor(slotIndex / 4); // 0 (bands0), 1 (bands1), or 2 (bands2)
  const compIndex = slotIndex % 4;             // 0 (x), 1 (y), 2 (z), or 3 (w)
  const attrName = `bands${attrIndex}`;

  const attr = geometry.getAttribute(attrName) as THREE.BufferAttribute;
  if (!attr) return;

  const array = attr.array as Float32Array;
  const vertexCount = geometry.attributes.position.count;

  // Stride: vertex * 4 + component
  for (let v = 0; v < vertexCount; v++) {
    array[v * 4 + compIndex] = smoothedRawData ? (smoothedRawData[v] || 0) : 0;
  }
}

/**
 * Helper to smooth a raw 1D slot buffer (e.g. 1024 floats) up to target vertex resolution
 * without applying log scaling (log scaling occurs dynamically on the GPU).
 */
function smoothRawSlotBuffer(rawBuffer: Float32Array | number[], targetPoints: number): Float32Array {
  if (!rawBuffer || rawBuffer.length === 0) {
    return new Float32Array(targetPoints * targetPoints);
  }

  const gridSize = Math.sqrt(rawBuffer.length); // e.g. Math.sqrt(1024) = 32
  const hMatrix: THREE.Vector2[][] = [];

  for (let row = 0; row < gridSize; row++) {
    const rowVectors: THREE.Vector2[] = [];
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      const val = rawBuffer[idx] ?? 0;
      rowVectors.push(new THREE.Vector2(col, val < 0 ? 0 : val));
    }
    hMatrix.push(rowVectors);
  }

  // Smooth via 2D spline curves -> returns array of length targetPoints * targetPoints
  const smoothed = getSmoothArray(hMatrix, targetPoints);
  const out = new Float32Array(smoothed.length);
  for (let i = 0; i < smoothed.length; i++) {
    out[i] = smoothed[i] < 0 ? 0 : smoothed[i];
  }
  return out;
}

export function TerrainShaderTest() {
  const meshRef = useRef<THREE.Mesh>(null);
  const resolution = 64; // Grid vertex resolution (64 x 64 = 4096 vertices)

  const slots = useDATAStore((state) => state.slots);
  const lastChangedSlot = useDATAStore((state) => state.lastChangedSlot);
  
  const hoverUV = useUIStore((state) => state.hoverUV);
  const invalidate = useThree((state) => state.invalidate);

  const emptyRaycast = useCallback(() => {}, []);

  ///////////////////////////////////////////////////////////
  // 1. BASE GEOMETRY — Created ONCE with pre-allocated vec4 attributes
  ///////////////////////////////////////////////////////////
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);

    const vertexCount = geo.attributes.position.count;

    // Pre-allocate 3 vec4 attributes for 12 fixed slots (4 slots per vec4)
    const b0 = new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4);
    const b1 = new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4);
    const b2 = new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4);

    b0.setUsage(THREE.DynamicDrawUsage);
    b1.setUsage(THREE.DynamicDrawUsage);
    b2.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('bands0', b0); // Slots 0..3
    geo.setAttribute('bands1', b1); // Slots 4..7
    geo.setAttribute('bands2', b2); // Slots 8..11

    geo.userData.minHeight = 0;
    geo.userData.maxHeight = 10;
    geo.userData.averageHeight = 5;

    return geo;
  }, [resolution]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  ///////////////////////////////////////////////////////////
  // 2. MATERIAL INITIALIZATION — Compiled ONCE (Zero Recompiles)
  ///////////////////////////////////////////////////////////
  const material = useMemo(() => {
    if (!geometry) return null;
    const mat = getMat4(geometry, hoverUV);
    mat.needsUpdate = true;
    return mat;
  }, [geometry]);

  useEffect(() => () => material?.dispose(), [material]);

  ///////////////////////////////////////////////////////////
  // 3. TARGETED EVENT-DRIVEN VRAM & UNIFORM UPDATES
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    if (!geometry || !material) return;

    // If no lastChangedSlot event has fired yet, do an initial full pass
    const targetIndices = lastChangedSlot
      ? lastChangedSlot.indices
      : 'ALL';

    // A. Resolve target slots list
    let slotsToUpdate: number[] = [];
    if (targetIndices === 'ALL') {
      slotsToUpdate = Array.from({ length: MAX_SLOTS }, (_, i) => i); // [0..11]
    } else if (Array.isArray(targetIndices)) {
      slotsToUpdate = targetIndices;
    } else {
      slotsToUpdate = [targetIndices];
    }

    const dirtyAttrs = new Set<string>();

    // B. Process target slots
    slotsToUpdate.forEach((slotIndex) => {
      if (slotIndex < 0 || slotIndex >= MAX_SLOTS) return;

      const slot = slots[slotIndex];

      // 1. Sync Buffer Data
      if (slot && slot.isActive && slot.buffer) {
        const smoothedRaw = smoothRawSlotBuffer(slot.buffer, resolution);
        updateSingleSlotData(geometry, slotIndex, smoothedRaw);
      } else {
        // missing/inactive slot -> zeros out channel in CPU array
        updateSingleSlotData(geometry, slotIndex, null);
      }

      // Mark affected attribute for VRAM re-upload
      const attrIndex = Math.floor(slotIndex / 4);
      dirtyAttrs.add(`bands${attrIndex}`);

      // 2. Sync Color Uniform
      const uColor = material.userData.slotColorUniforms?.[slotIndex];
      if (uColor) {
        const hex = slot && slot.isActive && slot.color 
          ? slot.color 
          : COLLECTION_COLORS_T6[slotIndex];
        uColor.value.set(hex);
      }
    });

    // C. Single Batched WebGPU VRAM Upload Pass
    dirtyAttrs.forEach((attrName) => {
      const attr = geometry.getAttribute(attrName);
      if (attr) attr.needsUpdate = true;
    });

    invalidate();
  }, [lastChangedSlot, slots, geometry, material, resolution, invalidate]);

  ///////////////////////////////////////////////////////////
  // 4. HOVER UNIFORM SYNC
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    if (!material?.userData?.hoverUVUniform) return;
    const u = material.userData.hoverUVUniform;
    hoverUV ? u.value.set(hoverUV.x, hoverUV.y) : u.value.set(-1.0, -1.0);
    invalidate();
  }, [hoverUV, material, invalidate]);

  if (!material) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, 0, 0]}
      raycast={emptyRaycast}
    />
  );
}