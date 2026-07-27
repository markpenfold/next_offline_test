'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three/webgpu';
import { getMat3 } from './threedee.js';
import { useUIStore } from '@/stores/useUIStore';
import { useThree } from '@react-three/fiber';
import { getSmoothArray } from './helpers.js';
import { useDATAStore } from '@/stores/useDataStore';
import { get1024WindowSlice } from '@/components/data/analytics';

const MAX_TIMELINES = 16; 

export function TerrainShaderTest() {
    const meshRef    = useRef(null);
    const resolution = 512;

    const isReady               = useDATAStore((state) => state.isTerrainReady);
    const hoverUV               = useUIStore((state) => state.hoverUV);
    const invalidate            = useThree((state) => state.invalidate);
    const terrainData           = useDATAStore((s) => s.terrainData);
    const windowStartYear       = useDATAStore((s) => s.windowStartYear);
    const activeDataViewIndexes = useDATAStore((s) => s.activeDataViewIndexes);
    const emptyRaycast          = useCallback(() => {}, []);

    const { nTimelines, categories } = useMemo(() => {
        const count = activeDataViewIndexes.length;
        return {
            nTimelines: count > MAX_TIMELINES ? MAX_TIMELINES : count, 
            categories: activeDataViewIndexes.map(i => i.category)
        };
    }, [activeDataViewIndexes]);

    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
        geo.rotateX(-Math.PI / 2);
        return geo;
    }, [resolution]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    const computedWindow = useMemo(() => {
        if (!terrainData || terrainData.length === 0 || windowStartYear === null) {
            return [];
        }
        return get1024WindowSlice(terrainData, windowStartYear, categories);
    }, [terrainData, windowStartYear, categories]);

    ///////////////////////////////////////////////////////////
    // COMPUTE FUNCTIONS
    ///////////////////////////////////////////////////////////
    function computeGridMeta(data) {
        if (!data || data.length === 0) return { baseCount: 0, gridSize: 0 };
        return { baseCount: data.length, gridSize: Math.floor(Math.sqrt(data.length)) };
    }

    function computeSmoothedData(data, gridMeta) {
        const { baseCount, gridSize } = gridMeta;
        const rawLayers = Array.from({ length: nTimelines }, () => new Float32Array(baseCount));
        const hMatrix   = [];

        for (let row = 0; row < gridSize; row++) {
            const rowVectors = [];
            for (let col = 0; col < gridSize; col++) {
                const idx = row * gridSize + col;
                const eventRow = data[idx];
                let total = 0;

                for (let t = 0; t < nTimelines; t++) {
                    const val = (eventRow && eventRow[2]) ? (eventRow[2][t] ?? 0) : 0;
                    rawLayers[t][idx] = val;
                    total += val;
                }
                rowVectors.push(new THREE.Vector2(col, total > 0 ? Math.log(total + 1) * 15 : 0));
            }
            hMatrix.push(rowVectors);
        }

        const smoothHeights  = getSmoothArray(hMatrix, resolution);
        const smoothedLayers = [];

        for (let t = 0; t < nTimelines; t++) {
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

        return { smoothHeights, smoothedLayers };
    }

    function computeBandBuffers(smoothedLayers) {
        const vertexCount = smoothedLayers[0]?.length || geometry.attributes.position.count;
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

    function writeGeometryInPlace(smoothHeights, bandBufs, nT, cats) {
        const posAttr = geometry.attributes.position;
        const vertexCount = posAttr.count;

        if (!geometry.attributes.heightBuffer) {
            geometry.setAttribute('heightBuffer', new THREE.Float32BufferAttribute(new Float32Array(vertexCount), 1));
        }
        const heightAttr = geometry.attributes.heightBuffer;

        for (let t = 0; t < MAX_TIMELINES; t++) {
            if (!geometry.attributes[`band${t}`]) {
                geometry.setAttribute(`band${t}`, new THREE.Float32BufferAttribute(new Float32Array(vertexCount), 1));
            }
        }

        let maxHeight = -Infinity, minHeight = Infinity;
        let runningTotal = 0, nonZeroCount = 0;

        if (nT === 0 || !smoothHeights || smoothHeights.length === 0) {
            for (let i = 0; i < vertexCount; i++) posAttr.array[i * 3 + 1] = 0;
            heightAttr.array.fill(0);
            for (let t = 0; t < MAX_TIMELINES; t++) {
                const attr = geometry.attributes[`band${t}`];
                attr.array.fill(0);
                attr.needsUpdate = true;
            }
            posAttr.needsUpdate = true;
            heightAttr.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            return;
        }

        for (let i = 0; i < vertexCount; i++) {
            let h = 0;
            if (smoothHeights && i < smoothHeights.length) {
                const rawH = smoothHeights[i];
                if (rawH !== undefined && !isNaN(rawH) && rawH >= 0.55) h = rawH;
            }
            heightAttr.array[i] = h;
            posAttr.array[i * 3 + 1] = h; 
            
            if (h > maxHeight) maxHeight = h;
            if (h > 0) {
                if (h < minHeight) minHeight = h;
                runningTotal += h;
                nonZeroCount++;
            }
        }

        posAttr.needsUpdate = true;
        heightAttr.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // set the banding buffers
        for (let t = 0; t < MAX_TIMELINES; t++) {
            const attr = geometry.attributes[`band${t}`];
            const buf = bandBufs[t];
            if (buf && buf.length === vertexCount) {
                attr.array.set(buf);
            } else {
                attr.array.fill(0);
            }
            attr.needsUpdate = true;
        }

        geometry.userData.numTimelines  = nT;
        geometry.userData.maxHeight     = maxHeight === -Infinity ? 0 : maxHeight;
        geometry.userData.minHeight     = minHeight === Infinity ? 0 : minHeight;
        geometry.userData.averageHeight = nonZeroCount > 0 ? runningTotal / nonZeroCount : 0;
        geometry.userData.maxTimelines  = MAX_TIMELINES;
        geometry.userData.categories    = cats;
    }

    ///////////////////////////////////////////////////////////
    // THE SYNCHRONIZED PIPELINE (Fixes the desync)
    ///////////////////////////////////////////////////////////
    
    // Step 1: Only do the pure math computation here
    const bufferData = useMemo(() => {
        if (!computedWindow || computedWindow.length === 0) return null;
        
        const gridMeta = computeGridMeta(computedWindow);
        const { smoothHeights, smoothedLayers } = computeSmoothedData(computedWindow, gridMeta);
        const bandBufs = computeBandBuffers(smoothedLayers);
        
        return { smoothHeights, bandBufs };
    }, [computedWindow, nTimelines]);

    // Step 2: Write buffers to Geometry FIRST, then compile Material SECOND
    const material = useMemo(() => {
        if (!isReady) return null;

        // A. Inject the relative values (the bands) into the geometry attributes
        if (bufferData) {
            writeGeometryInPlace(bufferData.smoothHeights, bufferData.bandBufs, nTimelines, categories);
        } else {
            writeGeometryInPlace([], [], 0, []);
        }

        // B. Because we just updated the geometry above, getMat3 now has perfect 
        // access to the populated attributes (band0, band1) AND userData.maxHeight
        const mat = getMat3(geometry, null);
        mat.needsUpdate = true;
        return mat;
    }, [isReady, geometry, bufferData, nTimelines, categories]);

    ///////////////////////////////////////////////////////////
    // CLEANUP & TRIGGERS
    ///////////////////////////////////////////////////////////
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

    useEffect(() => {
        if (!material?.userData?.hoverUVUniform) return;
        const u = material.userData.hoverUVUniform;
        hoverUV ? u.value.set(hoverUV.x, hoverUV.y) : u.value.set(-1.0, -1.0);
    }, [hoverUV, material]);

    useEffect(() => {
        // Trigger a re-render frame if the material updates
        if (material && meshRef.current) invalidate();
    }, [material, invalidate]);

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