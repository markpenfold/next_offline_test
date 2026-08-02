import {
  attribute,
  varying,
  Fn,
  uv,
  float,
  vec3,
  color,
  clamp,
  max,
  step,
  mix,
  vec2,
  uniform,
  positionLocal,
  positionWorld,
  distance,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants'

export const getMat3 = (g, hoverUV) => {
  const redMat = new MeshStandardNodeMaterial({
    roughness: 0.4,
    metalness: 0.5,
    transparent: false,
  });

  // 1. Pre-create 12 Slot Color Uniforms on material.userData
  // These can be updated dynamically via JS without shader recompilation!
  const slotColorUniforms = COLLECTION_COLORS_T6.map((hex) => uniform(color(hex)));
  redMat.userData.slotColorUniforms = slotColorUniforms;

  const vUV = varying(vec2());
  const minH = uniform(g.userData.minHeight || 0);
  const maxH = uniform(g.userData.maxHeight || 10);
  const avH = g.userData.averageHeight || 5;

  const heightRange = maxH.sub(minH).add(float(0.001));
  const normalizedY = clamp(
    positionLocal.y.sub(minH).div(heightRange),
    float(0.0),
    float(1.0)
  );

  const sampleOffset = normalizedY.mul(avH).mul(float(0.111));

  // Hover UV uniform
  const hoverUVUniform = uniform(
    vec2(hoverUV?.x ?? -1.0, hoverUV?.y ?? -1.0)
  );
  redMat.userData.hoverUVUniform = hoverUVUniform;

  // 2. Map the 3 physical vec4 attributes (4 slots each = 12 slots total)
  const b0_3 = attribute('bands0', 'vec4');  // Slots 0, 1, 2, 3
  const b4_7 = attribute('bands1', 'vec4');  // Slots 4, 5, 6, 7
  const b8_11 = attribute('bands2', 'vec4'); // Slots 8, 9, 10, 11

  function getBand(i) {
    switch (i) {
      case 0:  return b0_3.x;
      case 1:  return b0_3.y;
      case 2:  return b0_3.z;
      case 3:  return b0_3.w;
      case 4:  return b4_7.x;
      case 5:  return b4_7.y;
      case 6:  return b4_7.z;
      case 7:  return b4_7.w;
      case 8:  return b8_11.x;
      case 9:  return b8_11.y;
      case 10: return b8_11.z;
      case 11: return b8_11.w;
      default: return float(0.0);
    }
  }

  redMat.positionNode = Fn(() => {
    const pos = positionLocal.xyz.toVar();
    vUV.assign(uv());
    return pos;
  })();

  redMat.colorNode = Fn(() => {
    const baseColor = vec3(0.0, 0.0, 0.0);
    const sampleY = positionLocal.y.sub(sampleOffset);

    // 3. STATIC 12-STEP LOOP: Built ONCE at material initialization.
    // Inactive or empty slot bands blend seamlessly without extra passes.
    let colorOut = slotColorUniforms[0];
    for (let i = 0; i < 11; i++) {
      const mask = step(getBand(i), sampleY);
      const nextColor = slotColorUniforms[i + 1];
      colorOut = mix(colorOut, nextColor, mask);
    }

    const heightVariation = mix(
      vec3(0.3, 0.3, 0.3),
      vec3(1.2, 1.2, 1.2),
      clamp(positionLocal.y.mul(0.06), float(0.0), float(1.0))
    );
    const colorWithHeight = colorOut.mul(heightVariation);

    // Height mask
    const heightMask = step(0.5, positionWorld.y);

    // Hover dot
    const hoverDistance = distance(vUV, hoverUVUniform);
    const dotRadius = float(0.014);
    const dotIntensity = step(hoverDistance, dotRadius);

    const redDot = vec3(1.0, 0.0, 0.0);
    const finalColorWithDot = mix(
      colorWithHeight,
      redDot,
      dotIntensity.mul(step(0.0, hoverUVUniform.x))
    );

    return mix(baseColor, finalColorWithDot, heightMask);
  })();

  return redMat;
};