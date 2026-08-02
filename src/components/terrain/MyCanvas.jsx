'use client';

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { OrbitControls } from '@react-three/drei';
import { TerrainOrchestrator } from './old/TerrainOrchestrator';
import {Scene} from './OmenScene'

export default function MyCanvas() {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Canvas
        style={{
          background: 'linear-gradient(to bottom, #111a2e 0%, #34211a 100%)',
          width: '100%',
          height: '100%',
        }}
        camera={{ position: [3, 110, 100] }}
        frameloop="demand"
        gl={async (props) => {
          try {
            const renderer = new THREE.WebGPURenderer({
              ...props,
              antialias: true,
              samples: 4,
            });
            await renderer.init();
            return renderer;
          } catch (error) {
            console.error('Failed to initialize WebGPU renderer:', error);
            throw error;
          }
        }}
        onCreated={({ gl, size, camera }) => {
          gl.setSize(size.width, size.height);
          camera.aspect = size.width / size.height;
          camera.updateProjectionMatrix();
        }}
      >
          <ambientLight intensity={1.5} />
          <directionalLight position={[10, 50, 10]} intensity={2.0} />
          <TerrainOrchestrator />
          <Scene resolution={512}/>
          <OrbitControls />
      </Canvas>
    </div>
  );
}