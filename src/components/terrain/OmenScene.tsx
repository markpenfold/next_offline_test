import { getUrushiC } from './shaders/urushiC';
import { useMemo, useRef } from 'react';
import { StorageBufferAttribute } from 'three/webgpu';
import * as THREE from 'three/webgpu';
import { useThree } from '@react-three/fiber';
import { TerrainOrchestrator } from './tO';
import { TerrainGrid } from './TerrainGrid';
import { useDATAStore } from '@/stores/useDataStore';
import { Vector3 } from 'three';

interface SceneProps {
  resolution?: number;
}

export function Scene({ resolution = 512 }: SceneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const setHoverCoord = useDATAStore((state) => state.setHoverCoord);

  ///////////////////////////////////////////////////////////
  // 1. BASE GEOMETRY
  ///////////////////////////////////////////////////////////
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(400, 400, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);

    const vertexCount = geo.attributes.position.count;

    const originalPositions = geo.attributes.position.array;
    geo.setAttribute('position', new StorageBufferAttribute(originalPositions, 3));
    geo.setAttribute('normal', new StorageBufferAttribute(geo.attributes.normal.array, 3));
    geo.setAttribute('heightBuffer', new StorageBufferAttribute(new Float32Array(vertexCount), 1));
    geo.setAttribute('bands0', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4));
    geo.setAttribute('bands1', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4));
    geo.setAttribute('bands2', new StorageBufferAttribute(new Float32Array(vertexCount * 4), 4));

    geo.userData.minHeight = 0;
    geo.userData.maxHeight = 10;
    geo.userData.averageHeight = 5;
    geo.userData.numTimelines = 12;

    return geo;
  }, [resolution]);

  const material = useMemo(() => {
    return getUrushiC(geometry, null);
  }, [geometry]);

  return (
    <>
      {/* 1. High-Res Visual Mesh — Raycasting disabled for 0ms overhead */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        position={[0, 0, 0]}
        raycast={() => null}
      />

      {/* 2. Ultra-fast 2-Triangle Raycast Proxy Plane */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e) => {
          e.stopPropagation();

          // Direct GPU uniform update + wake up demand render loop
          if (material?.userData?.hoverUVUniform?.value && e.uv) {
            material.userData.hoverUVUniform.value.set(e.uv.x, e.uv.y);
            invalidate(); // 👈 Keeps R3F awake when cursor moves
          }

          // Update store for DOM HUD
          setHoverCoord(new Vector3(e.point.x, e.point.y, e.point.z));
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoverCoord(null);

          if (material?.userData?.hoverUVUniform?.value) {
            material.userData.hoverUVUniform.value.set(-1.0, -1.0);
            invalidate();
          }
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <TerrainGrid />
      <TerrainOrchestrator 
        geometry={geometry} 
        resolution={resolution} 
      />
    </>
  );
}