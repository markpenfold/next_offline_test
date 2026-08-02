import {
  attribute, varying, Fn, uv,
  float, vec3, color, clamp, step, mix, vec2,
  positionLocal, uniform, distance, fract, cos, dot, smoothstep, 
  If,    
  Break, 
} from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { activeCountUniform, getActiveBandColor } from '../terrainColorUniforms';



// Procedural noise for antique gold leaf texture
const goldNoise = Fn(([p]) => {
  const K1 = vec2(23.14069263277926, 2.665144142690225);
  return fract(cos(dot(p, K1)).mul(12345.6789));
});

export const getUrushiChan = (g, hoverUV) => {
  const mat = new MeshPhysicalNodeMaterial({
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

  const coreMask = step(hoverDist, dotRadius).mul(step(0.0, hoverUVUniform.x));
  const glowMask = smoothstep(dotRadius.mul(2.5), dotRadius, hoverDist).mul(step(0.0, hoverUVUniform.x));

  // --- PROCEDURAL ANTIQUE GOLD TEXTURE ---
  const flakeNoise = goldNoise(vUV.mul(800.0));
  const baseAntiqueGold = color('#D4AF37');
  const warmGoldHighlight = color('#F3E5AB');
  const antiqueGoldColor = mix(baseAntiqueGold, warmGoldHighlight, flakeNoise.mul(0.4));


mat.colorNode = Fn(() => {
    const baseColor = vec3(0.0, 0.0, 0.0);
    // Ensure sampleOffset is defined in scope, or default to 0.0
    
    const sampleY = positionLocal.y;

    // Start with the first active timeline color
    let bandColorOut = getActiveBandColor(0);

    
    // Tiny threshold to prevent step(0,0) from evaluating to 1.0
    const EPSILON = float(0.001); 

    // Static 12-step unrolled loop
    for (let i = 0; i < 12; i++) {
      const bandThickness = getBandAttribute(i);
      const prevBand = i > 0 ? getBandAttribute(i - 1) : float(0.0);
     const sampleOffset = sampleY.sub(prevBand.div(bandThickness));
     const additional = float(15.0).mul(bandThickness.sub(prevBand))
      
      // 1. Evaluate whether sampleY is above this stacked boundary
      const stepMask = step(bandThickness.add(EPSILON), sampleOffset);

      //  Guard: Only transition to the next color if slot (i + 1) is ACTIVE
      const isNextActive = float(i + 1).lessThan(activeCountUniform);
      const mask = stepMask.mul(isNextActive);

      // Pick next color safely within the 12-slot array
      const nextColor = i + 1 < 12 ? getActiveBandColor(i + 1) : getActiveBandColor(11);
      
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

    // Mix in Antique Gold glow aura + core dot
    const withGoldGlow = mix(lacquerWithSSS, antiqueGoldColor.mul(1.2), glowMask.mul(0.35));
    const finalColorWithGold = mix(withGoldGlow, antiqueGoldColor, coreMask);

    const heightMask = step(0.25, positionLocal.y);
    return mix(baseColor, finalColorWithGold, heightMask);
  })();

  // --- ROUGHNESS ADJUSTMENTS ---
  mat.roughnessNode = Fn(() => {
    // 💡 Bumped from 0.08 to 0.13 for a hand-rubbed organic satin finish
    const lacquerRoughness = float(0.33); 
    const goldRoughness = mix(float(0.22), float(0.48), flakeNoise);
    return mix(lacquerRoughness, goldRoughness, coreMask);
  })();

  mat.metalnessNode = Fn(() => {
    const lacquerMetalness = float(0.04);
    const goldMetalness = float(0.95);
    return mix(lacquerMetalness, goldMetalness, coreMask);
  })();

  // --- SUBSURFACE SCATTERING & CLEARCOAT PROPERTIES ---
  // Deep wet polished clearcoat layer
  mat.clearcoatNode = Fn(() => float(1.0))();
  mat.clearcoatRoughnessNode = Fn(() => float(0.06))(); // Slightly softened from 0.03

  // 💡 Subsurface Scattering (Light penetrating the translucent sap layer)
  mat.transmissionNode = Fn(() => {
    // Allows light to penetrate the surface slightly, returning opacity at the gold dot
    return mix(float(0.56), float(0.0), coreMask);
  })();

  mat.thicknessNode = Fn(() => {
    // Volume depth for internal scattering
    return float(0.35);
  })();

  mat.attenuationColorNode = Fn(() => {
    // Deep crimson/amber resin tint as light scatters internally
    return color('#5a0b02');
  })();

  mat.attenuationDistanceNode = Fn(() => float(0.6))();

  return mat;
};