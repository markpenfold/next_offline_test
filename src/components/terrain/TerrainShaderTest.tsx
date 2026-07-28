'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three/webgpu';
import { getMat3 } from './threedee.js';
import { useUIStore } from '@/stores/useUIStore';
import { useThree } from '@react-three/fiber';
import { getSmoothArray } from './helpers.js';
import { useDATAStore } from '@/stores/useDataStore';
import { get1024WindowSlice } from '@/components/data/analytics';

const MAX_SLOTS = 12; // Matching bands0, bands1, bands2 (3 x vec4 = 12 slots)

export function TerrainShaderTest() {
  const meshRef = useRef<THREE.Mesh>(null);
  const resolution = 512;

  const isReady = useDATAStore((state) => state.isTerrainReady);
  const slots = useDATAStore((state) => state.slots);
  const hoverUV = useUIStore((state) => state.hoverUV);
  const invalidate = useThree((state) => state.invalidate);
  const terrainData = useDATAStore((s) => s.terrainData);
  const windowStartYear = useDATAStore((s) => s.windowStartYear);

  const emptyRaycast = useCallback(() => {}, []);
  // Preserves prefixes (e.g. 'p_battles' vs 's_battles') while ensuring case/whitespace safety
  const normalizeCat = (cat: string) => (cat ? cat.trim().toLowerCase() : '');

  // Map active categories directly to slot
  const activeCategories = useMemo(() => {
    const activeCategories = [];
    
    for (const slot of slots) {
      if (slot.isActive) {
        activeCategories.push(slot.category);
      }
    }
    console.log("activeCategories in TST:", activeCategories)
    return activeCategories;
  }, [slots]);

  ///////////////////////////////////////////////////////////
  // 1. BASE GEOMETRY — Created ONCE with pre-allocated vec4 attributes
  ///////////////////////////////////////////////////////////
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);

    const vertexCount = geo.attributes.position.count;

    // Height attribute buffer
    geo.setAttribute('heightBuffer', new THREE.Float32BufferAttribute(new Float32Array(vertexCount), 1));

    // Pre-allocate 3 vec4 attributes for 12 fixed slots (4 slots per vec4)
    geo.setAttribute('bands0', new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 0..3
    geo.setAttribute('bands1', new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 4..7
    geo.setAttribute('bands2', new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 8..11

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
    if (!isReady || !geometry) return null;

    // getMat3 compiles the static 12-slot loop and slotColorUniforms array
    const mat = getMat3(geometry, null);
    mat.needsUpdate = true;
    return mat;
  }, [isReady, geometry]);

  // clean up //////
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
  // 3. COMPUTED DATA WINDOW SLICE
  ///////////////////////////////////////////////////////////
  const computedWindow = useMemo(() => {
  if (!terrainData || terrainData.length === 0 || windowStartYear === null) {
    return [];
  }

  const catsToFetch = activeCategories.filter(Boolean) as string[];
  if (catsToFetch.length === 0) return [];

  return get1024WindowSlice(terrainData, windowStartYear, catsToFetch);
}, [terrainData, windowStartYear, activeCategories]);



  ///////////////////////////////////////////////////////////
  // 4. IN-PLACE ATTRIBUTE & UNIFORM UPDATES
  // Fires when computedWindow changes and builds 
  // smooth surfaces
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    if (!geometry || !material) return;

    // Retain previous frame during async loads (prevents blank flashing)
    if (!computedWindow || computedWindow.length === 0) return;

    console.log("COMPUTED WINDOW!", computedWindow);
    console.log("ACTIVE CATS!", activeCategories);
    console.log("SLOOOOOOOTS", slots);

    const vertexCount = geometry.attributes.position.count; // 262,144
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const heightAttr = geometry.attributes.heightBuffer as THREE.BufferAttribute;
    // Four bands are held in each of these attributes using vec4
    const b0 = geometry.attributes.bands0 as THREE.BufferAttribute;
    const b1 = geometry.attributes.bands1 as THREE.BufferAttribute;
    const b2 = geometry.attributes.bands2 as THREE.BufferAttribute;

    const baseCount = computedWindow.length; // 1,024
    const gridSize = Math.floor(Math.sqrt(baseCount)); // 32

    // rawLayers is an array of MAX_SLOTS holding F32 Arrays with all zeros
    const rawLayers = Array.from({ length: MAX_SLOTS }, () => new Float32Array(baseCount)); //1024 zeros x MAX_SLOTS

    // A. Extract raw per-slot layer data with EXACT prefixed category matching
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const idx = row * gridSize + col;
        const eventRow = computedWindow[idx];

        if (!eventRow) continue;

        const availableCategories = eventRow[1]; // masterCategories list (e.g., ['p_battles', 'p_conspiracy_ufo'])
        const countsArray = eventRow[2];         // counts list

        slots.forEach((slot, slotIdx) => {
          if (slot.isActive && slot.category) {
            const targetCat = normalizeCat(slot.category); // Keeps prefix intact

            // Exact match preserving prefix ('p_conspiracy_ufo' === 'p_conspiracy_ufo')
            const catIdxInMaster = availableCategories.findIndex(
              (c) => normalizeCat(c) === targetCat
            );

            if (catIdxInMaster !== -1 && countsArray) {
              rawLayers[slotIdx][idx] = countsArray[catIdxInMaster] ?? 0;
            } else {
              rawLayers[slotIdx][idx] = 0;
            }
          } else {
            rawLayers[slotIdx][idx] = 0;
          }
        });
      }
    }

    // B. Smooth & Upsample layers from 32x32 -> 512x512 via getSmoothArray
    const smoothedLayers: Float32Array[] = [];
    for (let s = 0; s < MAX_SLOTS; s++) {
      if (!slots[s]?.isActive) {
        smoothedLayers.push(new Float32Array(vertexCount).fill(0));
        continue;
      }

      const layerMatrix: THREE.Vector2[][] = [];
      for (let row = 0; row < gridSize; row++) {
        const rowVectors: THREE.Vector2[] = [];
        for (let col = 0; col < gridSize; col++) {
          rowVectors.push(new THREE.Vector2(col, rawLayers[s][row * gridSize + col]));
        }
        layerMatrix.push(rowVectors);
      }

      // getSmoothArray interpolates 32x32 up to resolution (512x512 = 262,144)
      const rawSmoothed = getSmoothArray(layerMatrix, resolution);
      const smoothed = new Float32Array(rawSmoothed.length);

      for (let i = 0; i < rawSmoothed.length; i++) {
        smoothed[i] = rawSmoothed[i] < 0 ? 0 : rawSmoothed[i];
      }
      smoothedLayers.push(smoothed);
    }

    // C. Write cumulative band thresholds into bands0, bands1, bands2
    const b0Arr = b0.array as Float32Array;
    const b1Arr = b1.array as Float32Array;
    const b2Arr = b2.array as Float32Array;
    const posArr = posAttr.array as Float32Array;
    const heightArr = heightAttr.array as Float32Array;

    for (let v = 0; v < vertexCount; v++) {
      let cum = 0;
      for (let s = 0; s < MAX_SLOTS; s++) {
        cum += smoothedLayers[s][v] ?? 0;
        const val = cum > 0 ? Math.log(cum + 1) * 15 : 0;

        const vecId = Math.floor(s / 4);
        const compId = s % 4;

        if (vecId === 0) b0Arr[v * 4 + compId] = val;
        else if (vecId === 1) b1Arr[v * 4 + compId] = val;
        else b2Arr[v * 4 + compId] = val;
      }

      const totalH = cum > 0 ? Math.log(cum + 1) * 15 : 0;
      heightArr[v] = totalH;
      posArr[v * 3 + 1] = totalH;
    }

    // D. Flag attributes dirty for WebGPU upload
    posAttr.needsUpdate = true;
    heightAttr.needsUpdate = true;
    b0.needsUpdate = true;
    b1.needsUpdate = true;
    b2.needsUpdate = true;

    geometry.computeVertexNormals();

    // E. Dynamic Slot Color Sync
    if (material.userData.slotColorUniforms) {
      slots.forEach((slot, sIdx) => {
        const colorUniform = material.userData.slotColorUniforms[sIdx];
        if (colorUniform) {
          const targetColor = slot.isActive && slot.color ? slot.color : '#000000';
          colorUniform.value.setStyle(targetColor);
        }
      });
    }

    invalidate();
  }, [computedWindow, slots, geometry, material, resolution, invalidate]);

  ///////////////////////////////////////////////////////////
  // 5. HOVER UNIFORM SYNC
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    if (!material?.userData?.hoverUVUniform) return;
    const u = material.userData.hoverUVUniform;
    hoverUV ? u.value.set(hoverUV.x, hoverUV.y) : u.value.set(-1.0, -1.0);
    invalidate();
  }, [hoverUV, material, invalidate]);

  if (!isReady || !material) return null;

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