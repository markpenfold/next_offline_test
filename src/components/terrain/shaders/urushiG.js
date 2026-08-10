import {
  attribute, varying, Fn, uv,
  float, vec3, color, clamp, step, mix, vec2,
  positionLocal, uniform, distance
} from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { DoubleSide } from 'three';

// 💡 Import active slot color uniforms synced by TerrainOrchestrator
import { colorUniforms } from '../terrainColorUniforms';

export const getUrushiG = (g, hoverUV) => {
  const mat = new MeshPhysicalNodeMaterial({
    wireframe: false,
    side: DoubleSide, // Render double-sided
  });

  const numTimelines = g.userData.numTimelines || 12;
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
  const sampleOffset = normalizedY.mul(avH).mul(float(0.151));

  // Hover uniform
  const hoverUVUniform = uniform(vec2(
    hoverUV?.x ?? -1.0,
    hoverUV?.y ?? -1.0
  ));
  mat.userData.hoverUVUniform = hoverUVUniform;

  // Packed attributes
  const bands0 = attribute('bands0', 'vec4');
  const bands1 = attribute('bands1', 'vec4');
  const bands2 = attribute('bands2', 'vec4');

  const getBandAttribute = (i) => {
    if (i < 4) return bands0[['x', 'y', 'z', 'w'][i]];
    if (i < 8) return bands1[['x', 'y', 'z', 'w'][i - 4]];
    return bands2[['x', 'y', 'z', 'w'][i - 8]];
  };

  mat.positionNode = Fn(() => {
    vUV.assign(uv());
    return positionLocal;
  })();

  // --- HOVER MASK & DISTANCE ---
  const hoverDist = distance(vUV, hoverUVUniform);
  const dotRadius = float(0.016);

  // Core dot mask only (no halo/glow)
  const coreMask = step(hoverDist, dotRadius).mul(step(0.0, hoverUVUniform.x));

  // --- ORANGE-RED DOT COLOR ---
  const dotColor = color('#FF4500');

  // --- HEIGHT MASK FOR BASE PLANE ---
  // heightMask = 1.0 for terrain above zero level, 0.0 for level zero base plane
  const heightMask = step(0.25, positionLocal.y);

  // --- COLOR & BAND COMPUTATION ---
  mat.colorNode = Fn(() => {
    const baseColor = vec3(0.031, 0.031, 0.031);

    // Start layer colors from colorUniforms[0]
    let bandColorOut = colorUniforms[0];

    for (let i = 0; i < numTimelines; i++) {
      const bandThickness = getBandAttribute(i);
      
      const sampleY = positionLocal.y.sub(5);
      const mask = step(bandThickness, sampleY);
      
      const nextColor = i + 1 < numTimelines ? colorUniforms[i + 1] : colorUniforms[i];
      bandColorOut = mix(bandColorOut, nextColor, mask);
    }

    // Height-based shading intensity
    const heightVariation = mix(
      vec3(0.35, 0.35, 0.35),
      vec3(1.1, 1.1, 1.1),
      clamp(positionLocal.y.mul(0.06), float(0.0), float(1.0))
    );
    const lacquerBandsWithHeight = bandColorOut.mul(heightVariation);

    // Subtle Subsurface Warmth 
    const sssWarmth = color('#7a1a0c'); 
    const sssIntensity = clamp(positionLocal.y.mul(0.05), float(0.0), float(1.0));
    const lacquerWithSSS = mix(lacquerBandsWithHeight, sssWarmth, sssIntensity.mul(0.12));

    // Solid orange-red dot blend
    const finalColorWithDot = mix(lacquerWithSSS, dotColor, coreMask);

    return mix(baseColor, finalColorWithDot, heightMask);
  })();

  // --- MATERIAL SURFACE PROPERTIES ---

  // Roughness: 1.0 (completely matte) at zero level, glossy/dot roughness above
  mat.roughnessNode = Fn(() => {
    const lacquerRoughness = float(0.33); 
    const dotRoughness = float(0.2);
    const terrainRoughness = mix(lacquerRoughness, dotRoughness, coreMask);

    return mix(float(1.0), terrainRoughness, heightMask);
  })();

  // Metalness: 0.0 (non-metallic) at zero level
  mat.metalnessNode = Fn(() => {
    const lacquerMetalness = float(0.04);
    const dotMetalness = float(0.0);
    const terrainMetalness = mix(lacquerMetalness, dotMetalness, coreMask);

    return mix(float(0.0), terrainMetalness, heightMask);
  })();

  // Clearcoat: Disabled at zero level to eliminate reflections
  mat.clearcoatNode = Fn(() => {
    return mix(float(0.0), float(1.0), heightMask);
  })();

  mat.clearcoatRoughnessNode = Fn(() => {
    return mix(float(1.0), float(0.06), heightMask);
  })();

  // Transmission: Translucent terrain above, solid non-translucent at zero level
  mat.transmissionNode = Fn(() => {
    const terrainTransmission = mix(float(0.56), float(0.0), coreMask);
    return mix(float(0.0), terrainTransmission, heightMask);
  })();

  mat.thicknessNode = Fn(() => {
    return float(0.35);
  })();

  mat.attenuationColorNode = Fn(() => {
    return color('#5a0b02');
  })();

  mat.attenuationDistanceNode = Fn(() => float(0.6))();

  return mat;
};