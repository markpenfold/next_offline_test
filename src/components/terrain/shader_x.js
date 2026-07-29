import {
  attribute,
  varying,
  Fn,
  uv,
  float,
  vec3,
  vec4,
  color,
  clamp,
  step,
  mix,
  vec2,
  uniform,
  positionLocal,
  positionWorld,
  distance,
  normalize,
  cross,
  dFdx,
  dFdy,
} from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants';

export const getMat4 = (g, hoverUV) => {
  const redMat = new MeshStandardNodeMaterial({
    roughness: 0.4,
    metalness: 0.5,
    transparent: false,
  });

  const slotColorUniforms = COLLECTION_COLORS_T6.map((hex) => uniform(color(hex)));
  redMat.userData.slotColorUniforms = slotColorUniforms;
  const hoverUVUniform = uniform(vec2(hoverUV?.x ?? -1.0, hoverUV?.y ?? -1.0));
  redMat.userData.hoverUVUniform = hoverUVUniform;

  const vUV = varying(vec2());
  // NEW: Create a varying to pass the displaced position to the fragment shader
  const vPos = varying(vec3()); 

  const minH = uniform(g.userData.minHeight || 0);
  const maxH = uniform(g.userData.maxHeight || 10);
  const avH = g.userData.averageHeight || 5;

  const b0_3 = attribute('bands0', 'vec4');
  const b4_7 = attribute('bands1', 'vec4');
  const b8_11 = attribute('bands2', 'vec4');

  const toLogHeight = (rawVal) => rawVal.add(1.0).log().mul(15.0).max(0.0);

  // -------------------------------------------------------------
  // VERTEX SHADER
  // -------------------------------------------------------------
  const displacedPos = Fn(() => {
    const pos = positionLocal.xyz.toVar();
    vUV.assign(uv());

    const rawTotal = b0_3.dot(vec4(1.0))
      .add(b4_7.dot(vec4(1.0)))
      .add(b8_11.dot(vec4(1.0)));

    pos.y = toLogHeight(rawTotal);
    
    // Assign to varying so Fragment Shader can see the displaced position
    vPos.assign(pos); 
    
    return pos;
  })();

  redMat.positionNode = displacedPos;
  
  // Use the varying in the Normal Calculation
  redMat.normalNode = normalize(cross(dFdy(vPos), dFdx(vPos)));

  // -------------------------------------------------------------
  // FRAGMENT SHADER
  // -------------------------------------------------------------
  redMat.colorNode = Fn(() => {
    const baseColor = vec3(0.0, 0.0, 0.0);
    // Use the varying vPos instead of positionLocal
    const pos = vPos; 

    const heightRange = maxH.sub(minH).add(float(0.001));
    const normalizedY = clamp(
      pos.y.sub(minH).div(heightRange),
      float(0.0),
      float(1.0)
    );
    const sampleOffset = normalizedY.mul(avH).mul(float(0.111));
    const sampleY = pos.y.sub(sampleOffset);

    const layers = [
      b0_3.x, b0_3.y, b0_3.z, b0_3.w,
      b4_7.x, b4_7.y, b4_7.z, b4_7.w,
      b8_11.x, b8_11.y, b8_11.z, b8_11.w,
    ];

    const cumRaw = float(0.0).toVar();
    let colorOut = slotColorUniforms[0].toVar();

    for (let i = 0; i < 11; i++) {
      cumRaw.addAssign(layers[i]);
      const cumHeight = toLogHeight(cumRaw);
      const mask = step(cumHeight, sampleY);
      colorOut.assign(mix(colorOut, slotColorUniforms[i + 1], mask));
    }

    const heightVariation = mix(
      vec3(0.3, 0.3, 0.3),
      vec3(1.2, 1.2, 1.2),
      clamp(pos.y.mul(0.06), float(0.0), float(1.0))
    );
    const colorWithHeight = colorOut.mul(heightVariation);

    const heightMask = step(0.5, positionWorld.y);
    const hoverDistance = distance(vUV, hoverUVUniform);
    const dotIntensity = step(hoverDistance, float(0.014));
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