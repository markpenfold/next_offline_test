'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three/webgpu';
import { getMat3 } from './threedee.js';
import { useUIStore } from '@/stores/useUIStore';
import { useThree } from '@react-three/fiber';
import { useDATAStore } from '@/stores/useDataStore';
import { StorageBufferAttribute } from 'three/webgpu';

const MAX_SLOTS = 12; // Matching bands0, bands1, bands2 (3 x vec4 = 12 slots)

export function TerrainShaderTest() {
  const meshRef = useRef<THREE.Mesh>(null);
  const workerRef = useRef<Worker | null>(null);
  const resolution = 512;

  const slots = useDATAStore((state) => state.slots);
  const hoverUV = useUIStore((state) => state.hoverUV);
  const invalidate = useThree((state) => state.invalidate);
  const windowStartYear = useDATAStore((s) => s.windowStartYear);

  const emptyRaycast = useCallback(() => {}, []);

  ///////////////////////////////////////////////////////////
  // 1. BASE GEOMETRY — Created ONCE with pre-allocated vec4 attributes
  ///////////////////////////////////////////////////////////
  const geometry = useMemo(() => {
  const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
  geo.rotateX(-Math.PI / 2);

  const vertexCount = geo.attributes.position.count;

  // 1. Upgrade position buffer to be writable by the Compute Shader
  const originalPositions = geo.attributes.position.array;
  geo.setAttribute('position', new StorageBufferAttribute(originalPositions, 3));

  // 2. Height attribute buffer
  geo.setAttribute('heightBuffer', new StorageBufferAttribute(new Float32Array(vertexCount), 1));

  // 3. Pre-allocate 3 vec4 attributes for 12 fixed slots (Storage buffers!)
  geo.setAttribute('bands0', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 0..3
  geo.setAttribute('bands1', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 4..7
  geo.setAttribute('bands2', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 8..11

  geo.userData.minHeight = 0;
  geo.userData.maxHeight = 10;
  geo.userData.averageHeight = 5;
  geo.userData.numTimelines = 0;

  return geo;
}, [resolution]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  ///////////////////////////////////////////////////////////
  // 2. MATERIAL INITIALIZATION — Compiled ONCE (Zero Recompiles)
  ///////////////////////////////////////////////////////////
  const material = useMemo(() => {
    if (!geometry) return null;

    // getMat3 compiles the static 12-slot loop and slotColorUniforms array
    const mat = getMat3(geometry, null);
    mat.needsUpdate = true;
    return mat;
  }, [geometry]);

  // clean up
  useEffect(() => {
    return () => {
      if (!material) return;
      const ud = material.userData;
      if (ud?.heightTexture) ud.heightTexture.dispose();
      if (ud?.strataTexture) ud.strataTexture.dispose();
      if (ud?.timelineTextures) ud.timelineTextures.forEach((t: THREE.Texture) => t?.dispose());
      material.dispose();
    };
  }, [material]);

  ///////////////////////////////////////////////////////////
  // 3. WORKER INITIALIZATION & EVENT LISTENER
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    // Instantiate background calculation worker
    workerRef.current = new Worker(new URL('./terrain.worker.ts', import.meta.url));

    workerRef.current.onmessage = (event: MessageEvent) => {
      const { heights, bands0, bands1, bands2, metadata } = event.data;

      // 1. Update position Y positions
      const posAttr = geometry.attributes.position;
      const posArray = posAttr.array as Float32Array;
      for (let i = 0; i < heights.length; i++) {
        posArray[i * 3 + 1] = heights[i];
      }
      posAttr.needsUpdate = true;

      // 2. RECOMPUTE NORMALS TO FIX SHADING
      geometry.computeVertexNormals();
      if (geometry.attributes.normal) {
        geometry.attributes.normal.needsUpdate = true;
      }

      // 3. Update heightBuffer
      const heightAttr = geometry.getAttribute('heightBuffer') as THREE.BufferAttribute;
      (heightAttr.array as Float32Array).set(heights);
      heightAttr.needsUpdate = true;

      // 4. Update vec4 bands0, bands1, bands2
      const b0Attr = geometry.getAttribute('bands0') as THREE.BufferAttribute;
      const b1Attr = geometry.getAttribute('bands1') as THREE.BufferAttribute;
      const b2Attr = geometry.getAttribute('bands2') as THREE.BufferAttribute;

      (b0Attr.array as Float32Array).set(bands0);
      (b1Attr.array as Float32Array).set(bands2 ? bands0 : bands0); // set transformed array
      (b0Attr.array as Float32Array).set(bands0);
      (b1Attr.array as Float32Array).set(bands1);
      (b2Attr.array as Float32Array).set(bands2);

      b0Attr.needsUpdate = true;
      b1Attr.needsUpdate = true;
      b2Attr.needsUpdate = true;

      // 5. Assign updated metadata to geometry userData
      Object.assign(geometry.userData, metadata);

      invalidate();
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, [geometry, invalidate]);

  ///////////////////////////////////////////////////////////
  // 4. IN-PLACE ATTRIBUTE & UNIFORM UPDATES VIA WORKER
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    if (!slots || slots.length === 0 || !workerRef.current) return;

    // 1. Determine grid cell count (e.g. 1024 for a 32x32 grid)
    const baseCount = slots[0]?.buffer?.length || 1024;
    const numSlots = Math.min(slots.length, MAX_SLOTS);
    const numCols = numSlots + 1; // +1 to account for column 0 (grid index/header offset in worker)

    // 2. Flatten slot buffers into a contiguous Float32Array
    // Layout per grid cell `r`: [0: cellId, 1: slot0_val, 2: slot1_val, ..., numSlots: slotN_val]
    const flatSlots = new Float32Array(baseCount * numCols);

    for (let r = 0; r < baseCount; r++) {
      const rowOffset = r * numCols;
      flatSlots[rowOffset] = r; // Cell ID in column 0

      for (let s = 0; s < numSlots; s++) {
        const slot = slots[s];
        // Sample buffer value if slot exists and is active, otherwise default to 0
        const val = slot && slot.isActive && slot.buffer ? (slot.buffer[r] ?? 0) : 0;
        flatSlots[rowOffset + (s + 1)] = val;
      }
    }

    // 3. Zero-copy transfer ArrayBuffer to the worker
    workerRef.current.postMessage(
      {
        flatSlots: flatSlots.buffer,
        baseCount,
        numCols,
        resolution,
        maxSlots: MAX_SLOTS,
        windowStartYear,
      },
      { transfer: [flatSlots.buffer] } // Zero-copy transfer options object
    );
  }, [slots, windowStartYear, resolution]);

  ///////////////////////////////////////////////////////////
  // 5. HOVER UNIFORM SYNC
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