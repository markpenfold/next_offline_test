import { getMat3 } from './fastShader';
import { getMat4 } from './fs3';
import {getUrushi } from './urushi'
import {getUrushiB } from './urushiB'
import { useMemo, useRef } from 'react';
import { StorageBufferAttribute } from 'three/webgpu';
import * as THREE from 'three/webgpu';
import { TerrainOrchestrator } from './TerrainOrchestrator';

interface SceneProps {
  resolution?: number;
}

export function Scene({ resolution = 512 }: SceneProps) {
    const meshRef = useRef<THREE.Mesh>(null);
  
    ///////////////////////////////////////////////////////////
    // 1. BASE GEOMETRY — Created ONCE with pre-allocated vec4 attributes
    ///////////////////////////////////////////////////////////
    let geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);
  
    const vertexCount = geo.attributes.position.count;
  
    // 1. Upgrade position buffer to be writable by the Compute Shader
    const originalPositions = geo.attributes.position.array;
    geo.setAttribute('position', new StorageBufferAttribute(originalPositions, 3));
  
    // Set NORMAL to StorageBufferAttribute so compute shader can write smooth vectors!
    geo.setAttribute('normal', new StorageBufferAttribute(geo.attributes.normal.array, 3));

    // 2. Height attribute buffer
    geo.setAttribute('heightBuffer', new StorageBufferAttribute(new Float32Array(vertexCount), 1));
  
    // 3. Pre-allocate 3 vec4 attributes for 12 fixed slots (Storage buffers!)
    geo.setAttribute('bands0', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 0..3
    geo.setAttribute('bands1', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 4..7
    geo.setAttribute('bands2', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4)); // Slots 8..11
  
    
    geo.userData.minHeight = 0;
    geo.userData.maxHeight = 10;
    geo.userData.averageHeight = 5;
    geo.userData.numTimelines = 12;
  
    return geo;
  }, [resolution]);

  const material = useMemo(() => {
    return getUrushi(geometry, null);
  }, [geometry]);

  return (
<>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        position={[0, 0, 0]}
      />

      <TerrainOrchestrator 
        geometry={geometry} 
        resolution={resolution} 
      />
    </>
  );
}