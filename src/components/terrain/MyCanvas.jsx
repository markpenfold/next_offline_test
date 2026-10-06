'use client';

import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { OrbitControls } from '@react-three/drei';
import { TerrainOrchestrator } from './tO';
import { Scene } from './OmenScene';
import { useUIStore } from '@/stores/useUIStore';

export function MyCanvas() {
  const gpuStatus = useUIStore((state) => state.gpuStatus);
  const initWebGPUSupport = useUIStore((state) => state.initWebGPUSupport);

  useEffect(() => {
    initWebGPUSupport();
  }, [initWebGPUSupport]);

  // Don't mount the 3D Canvas if WebGPU is not supported
  if (!gpuStatus?.supported) {
    return <div className="w-full h-full bg-slate-900" />;
  }

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
        const renderer = new THREE.WebGPURenderer({
          ...props,
          antialias: true,
          samples: 4,
          forceWebGL: false, // Strict WebGPU mode (no WebGL2 fallback crash)
        });
        await renderer.init();
        return renderer;
      }}
      onCreated={({ gl }) => {
        const device = gl.backend?.device;
        if (device) {
          device.lost.then((info) => {
            if (info.reason !== 'destroyed') {
              console.warn(`WebGPU device lost (${info.reason}). Re-checking...`);
              initWebGPUSupport();
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