// threedee.js
import {
  attribute, varying, Fn, uv,
  float, vec3, color, clamp, step, mix, vec2,
  positionWorld, uniform, positionLocal, distance
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants'

const bandUniforms = COLLECTION_COLORS_T6.map(hex => uniform(color(hex)));

function bandColor(i) {
  return bandUniforms[i % bandUniforms.length];
}

export const getMat3 = (g, hoverUV) => {
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

  const sampleOffset = normalizedY.sub(minH).mul(float(0.7));
    //const sampleOffset = float(0.7);




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

mat.colorNode = Fn(() => {
    const baseColor = vec3(0.0, 0.0, 0.0);
    const sampleY = positionLocal.y.sub(sampleOffset);

    // Start with the absolute base color
    let colorOut = bandColor(0);
    let cumulativeHeight = float(0.0);
    
    // A tiny epsilon prevents floating-point step(0,0) glitches
    const EPSILON = float(0.001);

    for (let i = 0; i < numTimelines; i++) {
      const bandThickness = getBandAttribute(i);
      const bandStart = cumulativeHeight;
      
      // 1. Are we vertically higher than the start of this specific layer?
      const isAboveStart = step(bandStart.add(EPSILON), sampleY);
      
      // 2. CRITICAL: Does this layer actually have volume?
      // This prevents the empty buffer slots (thickness = 0) from overriding the top
      const hasThickness = step(EPSILON, bandThickness);
      
      // 3. Only apply this band's color if we are above it AND it exists
      const applyColor = isAboveStart.mul(hasThickness);
      
      // Mix the color in. If applyColor is 1.0, it overwrites the layer beneath it.
      colorOut = mix(colorOut, bandColor(i), applyColor);
      
      // Stack the height for the next loop iteration
      cumulativeHeight = cumulativeHeight.add(bandThickness);
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