'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three/webgpu';
import { getMat3 } from './threedee.js';
import { useUIStore } from '@/stores/useUIStore';
import { useThree } from '@react-three/fiber';
import { getSmoothArray } from './helpers.js';
import { SliceResult } from '../data/dataHelpers.js';
import { useDATAStore } from '@/stores/useDataStore';

const MAX_SLOTS = 12; // Matching bands0, bands1, bands2 (3 x vec4 = 12 slots)

export function TerrainShaderTest() {
  const meshRef = useRef<THREE.Mesh>(null);
  const resolution = 512;

  const slots = useDATAStore((state) => state.slots);
  const hoverUV = useUIStore((state) => state.hoverUV);
  const invalidate = useThree((state) => state.invalidate);
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
    if (!geometry) return null;
    // getMat3 compiles the static 12-slot loop and slotColorUniforms array
    const mat = getMat3(geometry, null);
    mat.needsUpdate = true;
    return mat;
  },  [geometry]);

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

 const computedWindow: SliceResult[] = [];

  ///////////////////////////////////////////////////////////
  // 4. IN-PLACE ATTRIBUTE & UNIFORM UPDATES
  // Fires when computedWindow changes and builds 
  // smooth surfaces
  ///////////////////////////////////////////////////////////
  useEffect(() => {
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