'use client'

import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three/webgpu'; // 👈 Official WebGPU import source
import { TerrainShaderTest } from './TerrainShaderTest';
import { OrbitControls } from '@react-three/drei';

function CameraLogger() {
  const { camera } = useThree();

  useFrame(() => {
    console.log('Camera position:', camera.position.toArray());
  });

  return null;
}

export default function MyCanvas() {
  const [key, setKey] = useState(0);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    let rafId = null;

    // Handle visibility change (wake from sleep)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Page visible again - checking WebGL context');

        if (rendererRef.current) {
          try {
            const ext = rendererRef.current.backend?.device;
            if (!ext) {
              console.log('Renderer invalid, remounting...');
              setKey((prev) => prev + 1);
            }
          } catch (error) {
            console.log('Renderer check failed, remounting...', error);
            setKey((prev) => prev + 1);
          }
        }
      }
    };

    // Handle context loss on the canvas element
    const handleContextLost = (event) => {
      console.warn('WebGL context lost - preparing remount');
      event.preventDefault();
      rafId = requestAnimationFrame(() => {
        setKey((prev) => prev + 1);
      });
    };

    const handleContextRestored = () => {
      console.log('WebGL context restored - remounting Canvas');
      setKey((prev) => prev + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const canvas = canvasRef.current?.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      }
      console.log('Cleaning up Canvas resources');
    };
  }, []);

  return (
    <div ref={canvasRef} style={{ height: '100%', width: '100%' }}>
      <Canvas
        key={key}
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
            rendererRef.current = renderer;
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
          
        <TerrainShaderTest />
        <OrbitControls />
      </Canvas>
    </div>
  );
}