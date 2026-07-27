'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three/webgpu';
import { getMat3 } from './threedee.js';
import { useUIStore } from '@/stores/useUIStore';
import { useThree } from '@react-three/fiber';
import { getSmoothArray } from './helpers.js';
import { useDATAStore } from '@/stores/useDataStore';

const MAX_TIMELINES = 16; 

export function TerrainShaderTest() {
    const meshRef    = useRef(null);
    const resolution = 512;
    
    const [numTimelines, setNumTimelines] = useState(0);
    const tDataViewWindow = useDATAStore((state) => state.terrainDataViewWindow);
    const isReady         = useDATAStore((state) => state.isTerrainReady);
    const hoverUV         = useUIStore((state) => state.hoverUV);
    const invalidate      = useThree((state) => state.invalidate);

    const emptyRaycast    = useCallback(() => {}, []);

    ///////////////////////////////////////////////////////////
    // 1. BASE GEOMETRY (PRE-ALLOCATED)
    ///////////////////////////////////////////////////////////
    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
        geo.rotateX(-Math.PI / 2);

        //Pre-allocate all attributes so the material can compile ONCE
        const vertexCount = geo.attributes.position.count;
        
        geo.setAttribute('heightBuffer', new THREE.Float32BufferAttribute(new Float32Array(vertexCount), 1));
        
        for (let t = 0; t < MAX_TIMELINES; t++) {
            geo.setAttribute(`band${t}`, new THREE.Float32BufferAttribute(new Float32Array(vertexCount), 1));
        }

        geo.userData = {
            numTimelines: 0,
            maxHeight: 0,
            minHeight: 0,
            averageHeight: 0,
            maxTimelines: MAX_TIMELINES,
            categories: []
        };

        return geo;
    }, [resolution]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    ///////////////////////////////////////////////////////////
    // 2. MATERIAL (COMPILED EXACTLY ONCE)
    ///////////////////////////////////////////////////////////
    const material = useMemo(() => {
        if (!isReady) return null;
        
        // Notice we removed tDataViewWindow from dependencies!
        // This compiles the TSL shader once and never tears it down.
        const mat = getMat3(geometry, null);
        mat.needsUpdate = true;
        return mat;
    }, [isReady, geometry]);

    ///////////////////////////////////////////////////////////
    // COMPUTE FUNCTIONS (Keep your math logic the same)
    ///////////////////////////////////////////////////////////
    function computeGridMeta(data) {
        if (!data || data.length === 0) return { baseCount: 0, gridSize: 0, numTimelines: 0, categories: [] };
        const baseCount = data.length;
        const gridSize = Math.floor(Math.sqrt(baseCount));
        const categories = data.find((step) => step && step[1]?.length > 0)?.[1] || data[0][1] || [];
        let nTimelines = categories.length;
        if (nTimelines > MAX_TIMELINES) nTimelines = MAX_TIMELINES;
        return { baseCount, gridSize, numTimelines: nTimelines, categories };
    }

    function computeSmoothedData(data, gridMeta) {
        const { baseCount, gridSize, numTimelines } = gridMeta;
        const rawLayers = Array.from({ length: numTimelines }, () => new Float32Array(baseCount));
        const hMatrix = [];
        for (let row = 0; row < gridSize; row++) {
            const rowVectors = [];
            for (let col = 0; col < gridSize; col++) {
                const idx = row * gridSize + col;
                const eventRow = data[idx];
                let total = 0;
                for (let t = 0; t < numTimelines; t++) {
                    const val = (eventRow && eventRow[2]) ? (eventRow[2][t] ?? 0) : 0;
                    rawLayers[t][idx] = val;
                    total += val;
                }
                rowVectors.push(new THREE.Vector2(col, total > 0 ? Math.log(total + 1) * 15 : 0));
            }
            hMatrix.push(rowVectors);
        }
        const smoothHeights = getSmoothArray(hMatrix, resolution);
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

    function computeBandBuffers(smoothedLayers, nTimelines) {
        const vertexCount = geometry.attributes.position.count;
        const cumBufs = Array.from({ length: MAX_TIMELINES }, () => new Float32Array(vertexCount));
        for (let v = 0; v < vertexCount; v++) {
            let cum = 0;
            for (let t = 0; t < nTimelines; t++) {
                cum += smoothedLayers[t]?.[v] ?? 0;
                cumBufs[t][v] = cum > 0 ? Math.log(cum + 1) * 15 : 0;
            }
        }
        return cumBufs;
    }

    ///////////////////////////////////////////////////////////
    // IN-PLACE GEOMETRY UPDATE
    ///////////////////////////////////////////////////////////
    function writeGeometryInPlace(smoothHeights, bandBufs, nTimelines, categories) {
        const posAttr = geometry.attributes.position;
        const heightAttr = geometry.attributes.heightBuffer;
        const vertexCount = posAttr.count;

        let maxHeight = -Infinity, minHeight = Infinity;
        let runningTotal = 0, nonZeroCount = 0;

        for (let i = 0; i < vertexCount; i++) {
            const h = smoothHeights[i] < 0.55 ? 0 : smoothHeights[i];
            
            // Overwrite existing arrays, do not create new ones
            heightAttr.array[i] = h;
            posAttr.array[i * 3 + 1] = h; 
            
            if (h > maxHeight) maxHeight = h;
            if (h > 0) {
                if (h < minHeight) minHeight = h;
                runningTotal += h;
                nonZeroCount++;
            }
        }

        // Flag primary attributes for GPU upload
        posAttr.needsUpdate = true;
        heightAttr.needsUpdate = true;
        geometry.computeVertexNormals(); // (Note: This is CPU intensive)

        for (let t = 0; t < MAX_TIMELINES; t++) {
            const attr = geometry.attributes[`band${t}`];
            const buf = bandBufs[t];
            
            if (buf) {
                attr.array.set(buf);
            } else {
                attr.array.fill(0); // Zero-out empty bands without destroying buffer
            }
            attr.needsUpdate = true; // Flag for GPU upload
        }

        geometry.userData.numTimelines = nTimelines;
        geometry.userData.maxHeight = maxHeight === -Infinity ? 0 : maxHeight;
        geometry.userData.minHeight = minHeight === Infinity ? 0 : minHeight;
        geometry.userData.averageHeight = nonZeroCount > 0 ? runningTotal / nonZeroCount : 0;
        geometry.userData.categories = categories;
    }

    ///////////////////////////////////////////////////////////
    // WATCHERS
    ///////////////////////////////////////////////////////////
    useEffect(() => {
        if (!isReady || !tDataViewWindow || tDataViewWindow.length === 0) return;

        const gridMeta = computeGridMeta(tDataViewWindow);
        const { smoothHeights, smoothedLayers, numTimelines: nTimelines } = computeSmoothedData(tDataViewWindow, gridMeta);
        const bandBufs = computeBandBuffers(smoothedLayers, nTimelines);
        
        writeGeometryInPlace(smoothHeights, bandBufs, nTimelines, gridMeta.categories);
        
        setNumTimelines(nTimelines);
        
        // If the material relies on userData metrics (like maxHeight) being updated,
        // you might need to force the material uniforms to recognize the new userData here.
        
        invalidate(); // Force frame render
    }, [tDataViewWindow, isReady, geometry, invalidate]);

    // Material Cleanup
    useEffect(() => {
        return () => {
            if (!material) return;
            const ud = material.userData;
            if (ud?.heightTexture) ud.heightTexture.dispose();
            if (ud?.strataTexture) ud.strataTexture.dispose();
            if (ud?.timelineTextures) ud.timelineTextures.forEach(t => t?.dispose());
            material.dispose();
        };
    }, [material]);

    // Hover Uniform updates
    useEffect(() => {
        if (!material?.userData?.hoverUVUniform) return;
        const u = material.userData.hoverUVUniform;
        hoverUV ? u.value.set(hoverUV.x, hoverUV.y) : u.value.set(-1.0, -1.0);
        invalidate(); // Ensure canvas repaints on hover
    }, [hoverUV, material, invalidate]);


    ///////////////////////////////////////////////////////////
    // RENDER
    ///////////////////////////////////////////////////////////
    
    // Always return the mesh so it stays mounted.
    // If the material is still booting, it just won't render anything visually.
    return (
        <mesh
            ref={meshRef}
            geometry={geometry}
            material={material || new THREE.MeshBasicMaterial({ color: 0x000000, visible: false })}
            position={[0, 0, 0]}
            raycast={emptyRaycast}
        />
    );
}