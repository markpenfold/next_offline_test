import {
  attribute, varying, Fn, uv,
  float, vec3, vec4, color, clamp, step, mix, vec2,
  positionLocal, uniform, distance, max, pow
} from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { activeCountUniform, getActiveBandColor } from '../terrainColorUniforms';
import { Vector2 } from 'three';

export const getUrushiD = (g, hoverUV) => {
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

  // Hover uniform (OFF-SCREEN by default)
  const hoverUVUniform = uniform(
    new Vector2(hoverUV?.x ?? -1.0, hoverUV?.y ?? -1.0)
  );
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

  // Per-Band Baseline Subtraction Uniforms
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
    const baseColor = vec3(0.0, 0.0, 0.0);

    // 1. Calculate normalized local height at this point on the surface
    const normalizedY = clamp(
      positionLocal.y.sub(minH).div(heightRange),
      float(0.0),
      float(1.0)
    );

    // Start with base black ground
    let finalColor = vec3(0.0, 0.0, 0.0);
    let prevBoundary = float(0.0);

    for (let i = 0; i < 12; i++) {
      const boundary = getBandAttribute(i); // Cumulative upper height threshold for band i
      const isActive = float(i).lessThan(activeCountUniform);

      const baseline = getBandBaseline(i);
      
      // Effective lower and upper bounds for this specific layer
      const lowerBound = prevBoundary;
      const upperBound = max(lowerBound, boundary.sub(baseline));

      // 💡 GEOLOGICAL STRATA MASK:
      // Is current normalized Y strictly between lowerBound and upperBound?
      const inLower = step(lowerBound, normalizedY);
      const inUpper = step(normalizedY, upperBound);
      
      // Strict band interval mask (1.0 ONLY inside this layer's slice, 0.0 elsewhere)
      const isInsideBand = inLower.mul(inUpper).mul(isActive);

      // Only apply this band's color if we are inside its vertical slice
      finalColor = mix(finalColor, getActiveBandColor(i), isInsideBand);

      // Advance lower boundary for next layer in the stack
      prevBoundary = upperBound;
    }

    // 2. Shading & SSS (applied only to active bands)
    const heightVariation = mix(
      vec3(0.35, 0.35, 0.35),
      vec3(1.1, 1.1, 1.1),
      clamp(positionLocal.y.mul(0.06), float(0.0), float(1.0))
    );
    const lacquerBandsWithHeight = finalColor.mul(heightVariation);

    const sssWarmth = color('#7a1a0c'); 
    const sssIntensity = clamp(positionLocal.y.mul(0.05), float(0.0), float(1.0));
    const lacquerWithSSS = mix(lacquerBandsWithHeight, sssWarmth, sssIntensity.mul(0.12));

    // 3. HARD STOP ON ZERO ELEVATION / FLOOR
    const heightMask = step(0.25, positionLocal.y);
    const terrainBase = mix(baseColor, lacquerWithSSS, heightMask);

    // --- HOVER DOT ---
    const hoverDist = distance(vUV, hoverUVUniform);
    const dotRadius = float(0.015);
    const dotMask = step(hoverDist, dotRadius).mul(step(0.0, hoverUVUniform.x));
    const dotColor = vec3(1.0, 0.2, 0.1);

    return mix(terrainBase, dotColor, dotMask);
  })();

  // Material properties
  mat.roughnessNode = Fn(() => float(0.33))();
  mat.metalnessNode = Fn(() => float(0.04))();
  mat.clearcoatNode = Fn(() => float(1.0))();
  mat.clearcoatRoughnessNode = Fn(() => float(0.06))();

  return mat;
};