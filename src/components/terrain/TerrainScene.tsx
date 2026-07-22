// components/other/terrain/TerrainScene.tsx

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { Mesh } from 'three';
import { TerrainShaderTest } from './TerrainShaderTest';
import { TerrainGrid } from './TerrainGrid';
import { OrbitControls } from '@react-three/drei';
import { useUIStore } from '@/stores/useUIStore';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { throttle } from '@/lib/tl_utils/throttle';

function disposeMesh(mesh: Mesh | null) {
  if (!mesh) return;
  
  mesh.geometry?.dispose();
  
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach(m => m.dispose());
  } else {
    material.dispose();
  }
}

interface TerrainSceneProps {
  onHover?: (info?: any) => void;
}

export function TerrainScene({ onHover = () => {} }: TerrainSceneProps) {

  /////////////////////////////////////////////////////////////
  // Store subscriptions //////////////////////////////////////
  /////////////////////////////////////////////////////////////

  const setHoverInfo = useUIStore((state) => state.setHoverInfo);
  //const setClickedUV = useUIStore((state) => state.setClickedUV);
  const clickedUV = useUIStore((state) => state.clickedUV);
  const setHoverUV = useUIStore((state) => state.setHoverUV);
  const setHoverVertexData = useUIStore(state => state.setHoverVertexData);
  const hoverVertexData = useUIStore(state => state.hoverVertexData);
  const hoverYear = useUIStore(state => state.hoverYear);

  

  // Refs
  const pRef = useRef<Mesh>(null);
  const coneRef = useRef<Mesh>(null);
  const { invalidate } = useThree();
  /////////////////////////////////////////////////////////////////////////////////
  // State for the Clicked Here circle we will drwaw with the shader //////////////
  /////////////////////////////////////////////////////////////////////////////////


  /////////////////////////////////////////////////////////////
  // Simplified hover handler - just pass position info ///////
  /////////////////////////////////////////////////////////////
  const handleHoverInternal = useCallback((e: ThreeEvent<PointerEvent>) => {
  if (!hasValidData) return;

  const hit = e.intersections[0];
  if (!hit) {
    setHoverInfo(null);
    setHoverUV(null);
    setHoverVertexData(null);
    return;
  }

  const uv = hit.uv;
  if (!uv) {
    setHoverVertexData(null);
    return;
  }

  setHoverInfo({ position: hit.point, year: null });
  setHoverUV({ x: uv.x, y: uv.y });
  setHoverVertexData({ uv: { x: uv.x, y: uv.y } });

  invalidate();

}, [hasValidData, setHoverInfo, setHoverUV, setHoverVertexData, invalidate]);



  // Throttle hover to max 60fps (16ms) to reduce INP
  const handleHover = useMemo(
    () => throttle(handleHoverInternal, 50),
    [handleHoverInternal]
  );

  ///////////////////////////////////////////////////////////////
  // Double-click handler - draws circle and updates store //////
  ///////////////////////////////////////////////////////////////
  const handleDoubleClick = useCallback(() => {
    if (!hasValidData || hoverYear === null) return;
      setLatestClickedEvents(hoverYear);
      console.log("latest year clicked:", hoverYear);
    }, [hasValidData, hoverYear, setLatestClickedEvents]);



  /////////////////////////////////////////////////////////////
  // Cleanup //////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////
  useEffect(() => {
    return () => {
      disposeMesh(pRef.current);
      disposeMesh(coneRef.current);
    };
  }, []);


  
  /////////////////////////////////////////////////////////////
  // RETURN COMPONENT HTML ////////////////////////////////////
  /////////////////////////////////////////////////////////////

  return (
  <>
  
    <OrbitControls
      makeDefault
      enableDamping={true}
      dampingFactor={0.05}
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 2}
    />


    <ambientLight intensity={0.8} />
    <directionalLight
      position={[5, 3, 0]}
      castShadow
      shadow-mapSize={[512,512]}
    />

    {/* Grid with corner posts and year labels */}
    <TerrainGrid />

    {hasValidData ? (
  <group onDoubleClick={handleDoubleClick} onPointerOut={() => setHoverInfo(null)}>
    
    {/* Cheap flat hit surface for raycasting — 4 vertices vs 262,144 */}
    <mesh
      onPointerMove={handleHover}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.1, 0]} 
    >
      <planeGeometry args={[400, 400, 1, 1]} />
      <meshBasicMaterial visible={false} side={2} />  {/* side=2 = DoubleSide */}
    </mesh>

    <TerrainShaderTest />
  </group>
) : (

      <group>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[50, 1, 50]} />
          <meshStandardMaterial color="#333333" />
        </mesh>
        <mesh position={[0, 5, 0]}>
          <sphereGeometry args={[2, 16, 16]} />
          <meshStandardMaterial
            color="#ff6600"
            emissive="#ff6600"
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>
    )}
  </>
)
};