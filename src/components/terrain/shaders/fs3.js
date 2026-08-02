// threedee.js
import {
  attribute, varying, Fn, uv,
  float, vec3, color, clamp, step, mix, vec2,
  positionWorld, uniform, positionLocal, distance
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';

const bandUniforms = COLLECTION_COLORS_T6.map(hex => uniform(color(hex)));

function bandColor(i) {
  return bandUniforms[i % bandUniforms.length];
}

export const getMat4 = (g, hoverUV) => {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.4,
    metalness: 0.3,
    wireframe: false,
  });

  const numTimelines = g.userData.numTimelines || 0;
  const minH = uniform(g.userData.minHeight || 0.0);
  const maxH = uniform(g.userData.maxHeight || 1.0);
  const avH = g.userData.averageHeight || 1.0;

  const vUV = varying(vec2());

  // Height sampling offset
  const heightRange = maxH.sub(minH).add(float(0.001));
  const normalizedY = clamp(
    positionLocal.y.sub(minH).div(heightRange),
    float(0.0),
    float(1.0)
  );
  const sampleOffset = normalizedY.mul(avH).mul(float(0.111));



  // Hover uniform
  const hoverUVUniform = uniform(vec2(
    hoverUV?.x ?? -1.0,
    hoverUV?.y ?? -1.0
  ));
  mat.userData.hoverUVUniform = hoverUVUniform;




  // 1. Declare the packed attributes
  const bands0 = attribute('bands0', 'vec4');
  const bands1 = attribute('bands1', 'vec4');
  const bands2 = attribute('bands2', 'vec4');


 // 2. Helper to extract the right component from the right attribute
  const getBandAttribute = (i) => {
    if (i < 4) return bands0[['x', 'y', 'z', 'w'][i]];
    if (i < 8) return bands1[['x', 'y', 'z', 'w'][i - 4]];
    return bands2[['x', 'y', 'z', 'w'][i - 8]];
  };
  mat.positionNode = Fn(() => {
    vUV.assign(uv());
    return positionLocal;
  })();

// Inside your getMat3 or getUrushi function
  mat.colorNode = Fn(() => {
    const baseColor = vec3(0.0, 0.0, 0.0);
    
    // I am assuming you want it 1:1 mapped to the mesh now, 
    // so no sampleOffset subtraction.
    const sampleY = positionLocal.y; 

    let colorOut = bandColor(0);
    let prevBoundary = float(0.0); 

    for (let i = 0; i < numTimelines; i++) {
      const currentBoundary = getBandAttribute(i);
      
      // We are in this layer if we are above the previous ceiling AND below the current ceiling
      const isAboveBottom = step(prevBoundary, sampleY);
      const isBelowTop = step(sampleY, currentBoundary);
      
      // Multiply them to create an exact slice mask
      const inLayer = isAboveBottom.mul(isBelowTop);
      
      colorOut = mix(colorOut, bandColor(i), inLayer);
      
      // Update floor for next loop
      prevBoundary = currentBoundary;
    }

    // Height-based shading intensity
    const heightVariation = mix(
      vec3(0.3, 0.3, 0.3),
      vec3(1.2, 1.2, 1.2),
      clamp(positionLocal.y.mul(0.06), float(0.0), float(1.0))
    );
    const colorWithHeight = colorOut.mul(heightVariation);

    // Hover dot highlight
    const hoverDistance = distance(vUV, hoverUVUniform);
    const dotRadius = float(0.014);
    const dotIntensity = step(hoverDistance, dotRadius);
    const redDot = vec3(1.0, 0.0, 0.0);

    const finalColorWithDot = mix(
      colorWithHeight,
      redDot,
      dotIntensity.mul(step(0.0, hoverUVUniform.x))
    );

    const heightMask = step(0.25, positionLocal.y);
    return mix(baseColor, finalColorWithDot, heightMask);
  })();

  return mat;
};

