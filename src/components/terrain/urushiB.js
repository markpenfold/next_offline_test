import {
  attribute, varying, Fn, uv,
  float, vec3, color, clamp, step, mix, vec2, max,
  positionLocal, uniform
} from 'three/tsl';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';

const bandUniforms = COLLECTION_COLORS_T6.map(hex => uniform(color(hex)));
function bandColor(i) { return bandUniforms[i % bandUniforms.length]; }

export const getUrushiB = (g, hoverUV) => {
  const mat = new MeshPhysicalNodeMaterial({ wireframe: false });

  const numTimelines = g.userData.numTimelines || 12;

  // 1. Ground level anchor
  const minH = uniform(0.0);
  
  // 2. Percentage of local Y height to offset
  const offsetPercent = uniform(0.38); 

  mat.userData.minHUniform = minH;
  mat.userData.offsetPercentUniform = offsetPercent;

  const vUV = varying(vec2());

  // Attribute access
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

  const peakHeightAttr = attribute('heightBuffer', 'float');

mat.colorNode = Fn(() => {
  const baseColor = vec3(0.08, 0.08, 0.1); // Neutral dark ground

  // 1. Calculate active count, sum, and average at this vertex/fragment
  let activeCount = float(0.0);
  let activeSum = float(0.0);

  for (let i = 0; i < numTimelines; i++) {
    const val = getBandAttribute(i);
    const isPresent = step(float(0.001), val);
    activeCount = activeCount.add(isPresent);
    activeSum = activeSum.add(val.mul(isPresent));
  }

  // Local average height of active bands
  const avgHeight = activeSum.div(max(float(1.0), activeCount));
  const peakY = max(float(0.001), peakHeightAttr);

  // 2. Define the starting baseline floor for bands (e.g., local average height)
  // Anything below local Y_base stays ground color; bands paint between Y_base and Peak
  const yBase = avgHeight; 
  const yRange = max(float(0.001), peakY.sub(yBase));

  // 3. Remap local elevation relative to the local baseline floor
  const normY = clamp(
    positionLocal.y.sub(yBase).div(yRange),
    float(0.0),
    float(1.0)
  );

  // Dynamic share per active band
  const bandShare = float(1.0).div(max(float(1.0), activeCount));

  // 4. Stack bands within the remapped normY range
  let bandColorOut = baseColor;
  let currentStackBottom = float(0.0);

  for (let i = 0; i < numTimelines; i++) {
    const val = getBandAttribute(i);
    const isPresent = step(float(0.001), val);

    const currentStackTop = currentStackBottom.add(bandShare.mul(isPresent));

    const inBand = step(currentStackBottom, normY)
      .mul(step(normY, currentStackTop))
      .mul(isPresent);

    bandColorOut = mix(bandColorOut, bandColor(i), inBand);
    currentStackBottom = currentStackTop;
  }

  // Only show bands if positionLocal.y is above the baseline threshold
  const heightMask = step(yBase, positionLocal.y);
  return mix(baseColor, bandColorOut, heightMask);
})();

  return mat;
};