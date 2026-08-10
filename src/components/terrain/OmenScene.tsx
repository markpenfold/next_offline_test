import { getUrushiF } from './shaders/urushiF';
import { getUrushiG } from './shaders/urushiG';
import { useMemo, useRef } from 'react';
import { StorageBufferAttribute, MeshBasicNodeMaterial } from 'three/webgpu';
import * as THREE from 'three/webgpu';
import { useThree } from '@react-three/fiber';
import { TerrainOrchestrator } from './tO';
import { TerrainGrid } from './TerrainGrid';
import { Vector3 } from 'three';
import { useUIStore } from '@/stores/useUIStore';
import { queryEventsByYearRange, queryEventsByYear } from "@/components/data/duckDATA";
import { useDATAStore } from '@/stores/useDataStore';

interface SceneProps {
  resolution?: number;
}

export async function handleTerrainDoubleClick(targetYear: number) {
  console.log("HIT THE DOUBLE TAP: ", targetYear);

  // Query DuckDB currentDataView for events in that exact year
  const events = await queryEventsByYear(targetYear);

  // Update transient UI store state (triggers re-render in EventsList)
  useUIStore.getState().setLatestClickedEvents(events);

  // Automatically activate the Events tab in MainDataPanel
  useUIStore.getState().setActivePanelTab("events");
}



export function Scene({ resolution = 512 }: SceneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const tempVec = useRef(new Vector3());
  const invalidate = useThree((state) => state.invalidate);
  const setHoverCoord = useUIStore((state) => state.setHoverCoord);
  const setActivePanelTab = useUIStore((state) => state.setActivePanelTab);
  const setLatestClickedEvents = useUIStore((state) => state.setLatestClickedEvents);

  ///////////////////////////////////////////////////////////
  // 1. BASE GEOMETRY (Allocated once with Storage Buffers)
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
    return getUrushiG(geometry, null);
  }, [geometry]);

  return (
    <>
      {/* 1. High-Res Visual Mesh — Excluded from CPU raycasting */}
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

          // 1. Direct GPU uniform update for TSL shader ring
          if (material?.userData?.hoverUVUniform?.value && e.uv) {
            material.userData.hoverUVUniform.value.set(e.uv.x, e.uv.y);
            invalidate();
          }

          // 2. Set hover coord in Zustand (store converts to fresh object reference)
          setHoverCoord(e.point);
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoverCoord(null);

          if (material?.userData?.hoverUVUniform?.value) {
            material.userData.hoverUVUniform.value.set(-1.0, -1.0);
            invalidate();
          }
        }}
        onDoubleClick={async (e) => {
          e.stopPropagation();

          // Fetch current UI and DATA store state
          const hoverCoord = useUIStore.getState().hoverCoord;
          const windowStartYear = useDATAStore.getState().windowStartYear;
          const stepsize = useDATAStore.getState().stepsize;

          if (!hoverCoord || windowStartYear === null) return;

          // Map World Pos [-200, 200] -> UV [0, 1]
          const u = Math.max(0, Math.min(1, (hoverCoord.x + 200) / 400));
          const v = Math.max(0, Math.min(1, (hoverCoord.z + 200) / 400));

          // 32x32 Cell Coordinates
          const col = Math.min(31, Math.floor(u * 32));
          const row = Math.min(31, Math.floor(v * 32));

          // Buffer Lookup Index & Target Year Math
          const gridIndex = row * 32 + col;
          const yearOffset = gridIndex + Math.floor(row / 31);
          const targetYear = Math.round(windowStartYear + yearOffset * stepsize);

          await handleTerrainDoubleClick(targetYear);
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