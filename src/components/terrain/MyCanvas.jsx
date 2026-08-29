'use client';

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { OrbitControls } from '@react-three/drei';
import { TerrainOrchestrator } from './tO';
import { Scene } from './OmenScene';

export function MyCanvas() {
  return (
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
          // If the page boots while the GPU driver is still waking up, force reload to retry
          console.warn('WebGPU init failed on boot/wake. Reloading page...', error);
          window.location.reload();
          // Return a pending promise so R3F doesn't attempt to render during reload
          return new Promise(() => {});
        }
      }}
      onCreated={({ gl }) => {
        const device = gl.backend?.device;
        if (device) {
          device.lost.then((info) => {
            // 'destroyed' means React unmounted it naturally. Anything else means OS sleep/GPU reset.
            if (info.reason !== 'destroyed') {
              console.warn(`WebGPU device lost (${info.reason}). Reloading application...`);
              window.location.reload();
            }
          });
        }
      }}
    >
      <ambientLight intensity={1.5} />
      <directionalLight position={[10, 50, 10]} intensity={2.0} />
      <TerrainOrchestrator />
      <Scene resolution={512} />
      <OrbitControls />
    </Canvas>
  );
}