import {
  attribute, varying, Fn, uv,
  float, vec3, vec4, color, clamp, step, mix, vec2,
  positionLocal, uniform, distance, fract, cos, dot, smoothstep, 
  log, pow, max
} from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { activeCountUniform, getActiveBandColor } from '../terrainColorUniforms';

// Procedural noise for antique gold leaf texture
const goldNoise = Fn(([p]) => {
  const K1 = vec2(23.14069263277926, 2.665144142690225);
  return fract(cos(dot(p, K1)).mul(12345.6789));
});

export const getUrushiC = (g, hoverUV) => {
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

  // Packed attributes (Band boundaries)
  const bands0 = attribute('bands0', 'vec4');
  const bands1 = attribute('bands1', 'vec4');
  const bands2 = attribute('bands2', 'vec4');

  const getBandAttribute = (i) => {
    if (i < 4) return bands0[['x', 'y', 'z', 'w'][i]];
    if (i < 8) return bands1[['x', 'y', 'z', 'w'][i - 4]];
    return bands2[['x', 'y', 'z', 'w'][i - 8]];
  };

  // 💡 NEW: Per-Band Baseline Subtraction Uniforms (Noise Gate / Threshold)
  const bandBaselines0 = uniform(vec4(0.0, 0.0, 0.0, 0.0));
  const bandBaselines1 = uniform(vec4(0.0, 0.0, 0.0, 0.0));
  const bandBaselines2 = uniform(vec4(0.0, 0.0, 0.0, 0.0));

  mat.userData.bandBaselines0 = bandBaselines0;
  mat.userData.bandBaselines1 = bandBaselines1;
  mat.userData.bandBaselines2 = bandBaselines2;

  const getBandBaseline = (i) => {
    if (i < 4) return bandBaselines0[['x', 'y', 'z', 'w'][i]];
    if (i < 8) return bandBaselines1[['x', 'y', 'z', 'w'][i - 4]];
    return bandBaselines2[['x', 'y', 'z', 'w'][i - 8]];
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
    const sampleY = positionLocal.y;

    // Start with the base timeline
    let finalColor = getActiveBandColor(0);
    let prevBoundary = float(0.0);

    // Normalize positionLocal.y to a 0.0 -> 1.0 range
    const normalizedY = clamp(positionLocal.y.sub(minH).div(heightRange), float(0.0), float(1.0));

    // Altitude penalty ceiling exponent
    const EXPONENT = float(3.0); 
    const altitudePenalty = pow(normalizedY, EXPONENT).mul(float(20.5));

    for (let i = 0; i < 12; i++) {
      const boundary = getBandAttribute(i);
      const isActive = float(i).lessThan(activeCountUniform);

      // Raw thickness added by this timeline layer
      const rawThickness = boundary.sub(prevBoundary);

      // 💡 BASELINE SUBTRACTION (NOISE GATE):
      // Subtract the baseline threshold from raw thickness.
      // Anything <= baseline drops to absolute 0.0 (completely transparent / non-painting).
      const baseline = getBandBaseline(i);
      const effectiveThickness = max(float(0.0), rawThickness.sub(baseline));

      // Threshold evaluation using subtracted thickness
      const threshold = float(0.001).add(altitudePenalty).add(effectiveThickness.div(5));

      // Does this layer have enough subtracted thickness to survive the penalty and paint?
      const canPaint = step(threshold, effectiveThickness);

      // Gate: Overwrite color only if active AND effective thickness survived
      const mask = canPaint.mul(isActive);
      finalColor = mix(finalColor, getActiveBandColor(i), mask);

      // Advance boundary for next layer calculation
      prevBoundary = boundary;
    }

    // --- Lighting & Material Logic ---
    const heightVariation = mix(
      vec3(0.35, 0.35, 0.35),
      vec3(1.1, 1.1, 1.1),
      clamp(positionLocal.y.mul(0.06), float(0.0), float(1.0))
    );
    const lacquerBandsWithHeight = finalColor.mul(heightVariation);

    const sssWarmth = color('#7a1a0c'); 
    const sssIntensity = clamp(positionLocal.y.mul(0.05), float(0.0), float(1.0));
    const lacquerWithSSS = mix(lacquerBandsWithHeight, sssWarmth, sssIntensity.mul(0.12));

    const withGoldGlow = mix(lacquerWithSSS, antiqueGoldColor.mul(1.2), glowMask.mul(0.35));
    const finalColorWithGold = mix(withGoldGlow, antiqueGoldColor, coreMask);

    const heightMask = step(0.25, positionLocal.y);
    return mix(baseColor, finalColorWithGold, heightMask);
  })();

  // --- ROUGHNESS ADJUSTMENTS ---
  mat.roughnessNode = Fn(() => {
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
  mat.clearcoatNode = Fn(() => float(1.0))();
  mat.clearcoatRoughnessNode = Fn(() => float(0.06))();

  mat.transmissionNode = Fn(() => {
    return mix(float(0.56), float(0.0), coreMask);
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