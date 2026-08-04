import {
  attribute, varying, Fn, uv,
  float, vec3, color, clamp, step, mix, vec2,
  positionLocal, uniform, distance
} from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';

// 💡 Import active slot color uniforms synced by TerrainOrchestrator
import { colorUniforms } from '../terrainColorUniforms';

export const getUrushiE = (g, hoverUV) => {
  const mat = new MeshPhysicalNodeMaterial({
    wireframe: false,
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

  // --- COLOR & BAND COMPUTATION ---
  mat.colorNode = Fn(() => {
    const baseColor = vec3(0.0, 0.0, 0.0);
    const sampleY = positionLocal.y.sub(sampleOffset);

    // 💡 Start layer colors from colorUniforms[0]
    let bandColorOut = colorUniforms[0];
    let accumulatedHeight = float(0.0);

    for (let i = 0; i < numTimelines; i++) {
      const EPSILON = positionLocal.y.div(maxH);
      const bandThickness = getBandAttribute(i);
      
      // Stack the thickness of the bands
      accumulatedHeight = accumulatedHeight.add(bandThickness);

      const mask = step(accumulatedHeight.add(EPSILON), sampleY);
      
      // 💡 Pull next layer color dynamically from colorUniforms
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

    const heightMask = step(0.25, positionLocal.y);
    const terrainBase = mix(baseColor, lacquerWithSSS, heightMask);

    // --- SIMPLE CRISP COLOR DOT ---
    const hoverDist = distance(vUV, hoverUVUniform);
    const dotRadius = float(0.015);
    // Mask = 1.0 inside radius, 0.0 outside (active only when hoverUVUniform.x >= 0)
    const dotMask = step(hoverDist, dotRadius).mul(step(0.0, hoverUVUniform.x));
    const dotColor = vec3(1.0, 0.2, 0.1); // Bright vibrant coral-red

    return mix(terrainBase, dotColor, dotMask);
  })();

  // --- MATERIAL PROPERTIES ---
  mat.roughnessNode = Fn(() => float(0.33))();
  mat.metalnessNode = Fn(() => float(0.04))();
  mat.clearcoatNode = Fn(() => float(1.0))();
  mat.clearcoatRoughnessNode = Fn(() => float(0.06))();
  mat.transmissionNode = Fn(() => float(0.56))();
  mat.thicknessNode = Fn(() => float(0.35))();
  mat.attenuationColorNode = Fn(() => color('#5a0b02'))();
  mat.attenuationDistanceNode = Fn(() => float(0.6))();

  return mat;
};