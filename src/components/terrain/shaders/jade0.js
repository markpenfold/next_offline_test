import {
  attribute, varying, Fn, uv,
  float, vec3, vec4, color, clamp, step, mix, vec2,
  positionLocal, uniform, distance, max, pow
} from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { activeCountUniform, getActiveBandColor } from '../terrainColorUniforms';
import { Vector2 } from 'three';

export const getJade0 = (g, hoverUV) => {
  const mat = new MeshPhysicalNodeMaterial({
    wireframe: false,
  });

  const numTimelines = g.userData.numTimelines || 0;
  const minH = uniform(g.userData.minHeight || 0.0);
  const maxH = uniform(g.userData.maxHeight || 1.0);

  const vUV = varying(vec2());
  const heightRange = maxH.sub(minH).add(float(0.001));

  // Hover uniform
  const hoverUVUniform = uniform(
    new Vector2(hoverUV?.x ?? -1.0, hoverUV?.y ?? -1.0)
  );
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

  mat.colorNode = Fn(() => {
    // 1. JADE PALETTE GRADIENTS
    const deepShadowJade = color('#032015');  // Deep thick base
    const milkyBodyJade  = color('#166B46');  // Mid-body mineral green
    const glowingMintJade = color('#6DF2B5');  // Translucent peak glow

    let finalBandColor = getActiveBandColor(0);
    let prevBoundary = float(0.0);

    const normalizedY = clamp(positionLocal.y.sub(minH).div(heightRange), float(0.0), float(1.0));
    const EXPONENT = float(3.0); 
    const altitudePenalty = pow(normalizedY, EXPONENT).mul(float(20.5));

    for (let i = 0; i < 12; i++) {
      const boundary = getBandAttribute(i);
      const isActive = float(i).lessThan(activeCountUniform);

      const rawThickness = boundary.sub(prevBoundary);
      const baseline = getBandBaseline(i);
      const effectiveThickness = max(float(0.0), rawThickness.sub(baseline));

      const threshold = float(0.001).add(altitudePenalty).add(effectiveThickness.div(5));
      const canPaint = step(threshold, effectiveThickness);

      const mask = canPaint.mul(isActive);
      finalBandColor = mix(finalBandColor, getActiveBandColor(i), mask);

      prevBoundary = boundary;
    }

    // 2. ANALYTICAL SUBSURFACE SCATTERING (INTERNAL LIGHT GLOW)
    // Thinner peaks (higher normalizedY) let internal light scatter through
    const sssFactor = pow(normalizedY, float(1.4));
    const jadeVolumeColor = mix(deepShadowJade, milkyBodyJade, normalizedY);
    
    // Add luminous mint backlighting on peaks and slopes
    const translucentJade = mix(jadeVolumeColor, glowingMintJade, sssFactor.mul(0.75));

    // Blend timeline band accents subtly into the jade surface
    const heightMask = step(0.15, positionLocal.y);
    const terrainBase = mix(deepShadowJade, mix(translucentJade, finalBandColor, float(0.35)), heightMask);

    // --- HOVER DOT ---
    const hoverDist = distance(vUV, hoverUVUniform);
    const dotRadius = float(0.015);
    const dotMask = step(hoverDist, dotRadius).mul(step(0.0, hoverUVUniform.x));
    const dotColor = vec3(1.0, 0.2, 0.1);

    return mix(terrainBase, dotColor, dotMask);
  })();

  // 3. POLISHED JADE SURFACE SHEEN
  mat.roughnessNode = Fn(() => float(0.12))();            // Smooth mineral wax polish
  mat.metalnessNode = Fn(() => float(0.0))();             // Pure dielectric mineral
  mat.clearcoatNode = Fn(() => float(1.0))();             // Glazed surface layer
  mat.clearcoatRoughnessNode = Fn(() => float(0.02))();

  return mat;
};