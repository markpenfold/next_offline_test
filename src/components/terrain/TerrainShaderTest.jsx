'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three/webgpu';
import { getMat3 } from './threedee.js';
import { useUIStore } from '@/stores/useUIStore';
import { useThree } from '@react-three/fiber';
import { getSmoothArray } from './helpers.js';
import { useDATAStore } from '@/stores/useDataStore';

const MAX_TIMELINES = 16; // Matches band0 .. band15 in TSL material

export function TerrainShaderTest() {
    const meshRef    = useRef(null);
    const resolution = 512;
    
    const [numTimelines, setNumTimelines] = useState(0);

    // 1. Listen to the 1,024-year view window instead of full terrainData
    const tDataViewWindow = useDATAStore((state) => state.terrainDataViewWindow);
    const isReady         = useDATAStore((state) => state.isTerrainReady);
    const hoverUV         = useUIStore((state) => state.hoverUV);
    const invalidate      = useThree((state) => state.invalidate);

    const emptyRaycast    = useCallback(() => {}, []);

    console.log("🔍 Terrain Component State:", { 
      isReady, 
      windowCount: tDataViewWindow?.length 
    });

    ///////////////////////////////////////////////////////////
    // BASE GEOMETRY
    ///////////////////////////////////////////////////////////
    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
        geo.rotateX(-Math.PI / 2);
        return geo;
    }, [resolution]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    ///////////////////////////////////////////////////////////
    // COMPUTE FUNCTIONS
    ///////////////////////////////////////////////////////////

    // 1. Derive grid shape and category list from TSM view window data
    function computeGridMeta(data) {
        if (!data || data.length === 0) {
            return { baseCount: 0, gridSize: 0, numTimelines: 0, categories: [] };
        }
        const baseCount  = data.length;
        // For a 1024 item window, Math.sqrt(1024) gives a perfect 32x32 matrix grid
        const gridSize   = Math.floor(Math.sqrt(baseCount));
        
        // Find categories from the first non-empty step or default to empty array
        const categories = data.find((step) => step && step[1]?.length > 0)?.[1] || data[0][1] || [];
        let nTimelines   = categories.length;
        if (nTimelines > MAX_TIMELINES) nTimelines = MAX_TIMELINES;

        return { baseCount, gridSize, numTimelines: nTimelines, categories };
    }

    // 2. Spline-smooth heights and per-layer values
    function computeSmoothedData(data, gridMeta) {
        const { baseCount, gridSize, numTimelines } = gridMeta;
        const rawLayers = Array.from({ length: numTimelines }, () => new Float32Array(baseCount));
        const hMatrix   = [];

        for (let row = 0; row < gridSize; row++) {
            const rowVectors = [];
            for (let col = 0; col < gridSize; col++) {
                const idx      = row * gridSize + col;
                const eventRow = data[idx];
                let total      = 0;

                for (let t = 0; t < numTimelines; t++) {
                    const val         = (eventRow && eventRow[2]) ? (eventRow[2][t] ?? 0) : 0;
                    rawLayers[t][idx] = val;
                    total            += val;
                }
                rowVectors.push(new THREE.Vector2(col, total > 0 ? Math.log(total + 1) * 15 : 0));
            }
            hMatrix.push(rowVectors);
        }

        const smoothHeights  = getSmoothArray(hMatrix, resolution);
        const smoothedLayers = [];

        for (let t = 0; t < numTimelines; t++) {
            const layerMatrix = [];
            for (let row = 0; row < gridSize; row++) {
                const rowVectors = [];
                for (let col = 0; col < gridSize; col++) {
                    rowVectors.push(new THREE.Vector2(col, rawLayers[t][row * gridSize + col]));
                }
                layerMatrix.push(rowVectors);
            }
            const smoothed = getSmoothArray(layerMatrix, resolution);
            for (let i = 0; i < smoothed.length; i++) if (smoothed[i] < 0) smoothed[i] = 0;
            smoothedLayers.push(smoothed);
        }

        return { smoothHeights, smoothedLayers, numTimelines };
    }

    // 3. Build cumulative band buffers from smoothed layers
    function computeBandBuffers(smoothedLayers, nTimelines) {
        const vertexCount = smoothedLayers[0]?.length || geometry.attributes.position.count;
        const cumBufs = Array.from({ length: MAX_TIMELINES }, () => new Float32Array(vertexCount));

        for (let v = 0; v < vertexCount; v++) {
            let cum = 0;
            for (let t = 0; t < nTimelines; t++) {
                cum          += smoothedLayers[t]?.[v] ?? 0;
                cumBufs[t][v] = cum > 0 ? Math.log(cum + 1) * 15 : 0;
            }
        }
        return cumBufs;
    }

    // 4. Write all computed data into GPU geometry buffers
    function writeGeometry(smoothHeights, bandBufs, nTimelines, categories) {
        const posAttr     = geometry.attributes.position;
        const vertexCount = posAttr.count;
        const heights     = new Float32Array(vertexCount);

        let maxHeight = -Infinity, minHeight = Infinity;
        let runningTotal = 0, nonZeroCount = 0;

        for (let i = 0; i < vertexCount; i++) {
            const h = smoothHeights[i] < 0.55 ? 0 : smoothHeights[i];
            heights[i]               = h;
            posAttr.array[i * 3 + 1] = h;
            if (h > maxHeight) maxHeight = h;
            if (h > 0) {
                if (h < minHeight) minHeight = h;
                runningTotal += h;
                nonZeroCount++;
            }
        }

        posAttr.needsUpdate = true;
        geometry.computeVertexNormals();

        for (let t = 0; t < MAX_TIMELINES; t++) {
            const buf = bandBufs[t] || new Float32Array(vertexCount);
            geometry.setAttribute(`band${t}`, new THREE.Float32BufferAttribute(buf, 1));
        }
        geometry.setAttribute('heightBuffer', new THREE.Float32BufferAttribute(heights, 1));

        geometry.userData.numTimelines  = nTimelines;
        geometry.userData.maxHeight     = maxHeight === -Infinity ? 0 : maxHeight;
        geometry.userData.minHeight     = minHeight === Infinity ? 0 : minHeight;
        geometry.userData.averageHeight = nonZeroCount > 0 ? runningTotal / nonZeroCount : 0;
        geometry.userData.maxTimelines  = MAX_TIMELINES;
        geometry.userData.categories    = categories;
    }

    // 5. Build the TSL material from current geometry state
    function buildMaterial() {
        const mat       = getMat3(geometry, null);
        mat.needsUpdate = true;
        return mat;
    }

    ///////////////////////////////////////////////////////////
    // WATCHERS
    ///////////////////////////////////////////////////////////

    // 1. DATA WINDOW WATCHER: Recompute spline buffers whenever 1,024 window slides or changes
    useEffect(() => {
        if (!isReady || !tDataViewWindow || tDataViewWindow.length === 0) return;

        console.log("🏔️ TerrainShaderTest processing 1,024-year view window...");

        const gridMeta                     = computeGridMeta(tDataViewWindow);
        const { smoothHeights, smoothedLayers,
                numTimelines: nTimelines } = computeSmoothedData(tDataViewWindow, gridMeta);
        const bandBufs                     = computeBandBuffers(smoothedLayers, nTimelines);
        
        writeGeometry(smoothHeights, bandBufs, nTimelines, gridMeta.categories);
        setNumTimelines(nTimelines);
        invalidate(); // Force WebGPU/R3F frame render
    }, [tDataViewWindow, isReady, invalidate]);

    // 2. Material construction cache
    const material = useMemo(() => {
        if (!isReady || numTimelines === 0) return null;
        return buildMaterial();
    }, [isReady, numTimelines, tDataViewWindow]);

    // 3. Material Cleanup
    useEffect(() => {
        return () => {
            if (!material) return;
            const ud = material.userData;
            if (ud?.heightTexture)    ud.heightTexture.dispose();
            if (ud?.strataTexture)    ud.strataTexture.dispose();
            if (ud?.timelineTextures) ud.timelineTextures.forEach(t => t?.dispose());
            material.dispose();
        };
    }, [material]);

    // 4. Hover Uniform updates
    useEffect(() => {
        if (!material?.userData?.hoverUVUniform) return;
        const u = material.userData.hoverUVUniform;
        hoverUV ? u.value.set(hoverUV.x, hoverUV.y) : u.value.set(-1.0, -1.0);
    }, [hoverUV, material]);

    // 5. Frame trigger on material ready
    useEffect(() => {
        if (material && meshRef.current) invalidate();
    }, [material, invalidate]);

    ///////////////////////////////////////////////////////////
    // RENDER
    ///////////////////////////////////////////////////////////
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