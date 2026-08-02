// terrainUniforms.ts
import * as THREE from 'three';
import { uniform } from 'three/tsl';

// Dynamic timeline count uniform
export const activeCountUniform = uniform(0);

// Array of 12 static color uniforms
export const colorUniforms = Array.from({ length: 12 }, () => 
  uniform(new THREE.Color(0, 0, 0))
);

// Shader helper function
export const getActiveBandColor = (i: number) => colorUniforms[i];



