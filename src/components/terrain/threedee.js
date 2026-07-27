import {
  attribute, varying, Fn,uv,
  float, vec3, color, clamp, max, step, mix, vec2,
  positionWorld, uniform, positionLocal, div, distance,
} from 'three/tsl';
import { COLLECTION_COLORS_T6 } from '@/lib/utils/col_constants'

//COLLECTION_COLORS_VELAZQUEZ_16
//COLLECTION_COLORS_MICHELANGELO_16
//COLLECTION_COLORS_BAROCCI_16
//COLLECTION_COLORS_PONTORMO_FRESCO
//COLLECTION_COLORS_P1
//COLLECTION_COLORS_T6 *
//COLLECTION_COLORS_T6_GREYSCALE
import { MeshStandardNodeMaterial, DoubleSide } from 'three/webgpu';




const bandUniforms = COLLECTION_COLORS_T6.map(hex => uniform(color(hex)));

function bandColor(i) {
  const idx = i % bandUniforms.length;
  return bandUniforms[idx];
}


export const getMat3 = (g, hoverUV) => {
 
  const redMat = new MeshStandardNodeMaterial({
    roughness: 0.4,
    metalness: 0.5,
    transparent: false,
  });

  const numTimelines = g.userData.numTimelines || 0;
  console.log("NUM TIMELINEZ: ", numTimelines)
  const vUV     = varying(vec2());   // NEW
  // This needs to be scaled by the maxHeight.
  //const sampleOffset = uniform(0.01).mul(g.userData.maxHeight); // tune: world units below surface to sample
  // but also by average height.
  // min needs to be the min non-zero!
  const minH = uniform(g.userData.minHeight);
  const maxH = uniform(g.userData.maxHeight);
  const avH = g.userData.averageHeight;
  const scaleFactor = uniform(maxH/avH);
  
  //const sampleOffset = uniform(0.0001).mul(scaleFactor).div(positionLocal.y);
  // Normalise this vertex's height within the full range (0..1)
  // Then scale offset so tall peaks sample deeper into their bands
  const heightRange   = maxH.sub(minH).add(float(0.001)); // avoid div/0
  const normalizedY   = clamp(
      positionLocal.y.sub(minH).div(heightRange),
      float(0.0),
      float(1.0)
    );

  // sampleOffset grows with height — tune the multiplier (try 0.3–0.8)
  const sampleOffset = normalizedY.mul(avH).mul(float(0.111));


    // hover UV uniform, default off‑screen
    const hoverUVUniform = uniform(vec2(
      hoverUV?.x ?? -1.0,
      hoverUV?.y ?? -1.0,
    ));
    redMat.userData.hoverUVUniform = hoverUVUniform;

  // Band boundary attributes — cumulative log-scaled world Y per layer
  const b0  = attribute('band0');
  const b1  = attribute('band1');
  const b2  = attribute('band2');
  const b3  = attribute('band3');
  const b4  = attribute('band4');
  const b5  = attribute('band5');
  const b6  = attribute('band6');
  const b7  = attribute('band7');
  const b8  = attribute('band8');
  const b9  = attribute('band9');
  const b10 = attribute('band10');
  const b11 = attribute('band11');
  const b12 = attribute('band12');
  const b13 = attribute('band13');
  const b14 = attribute('band14');
  const b15 = attribute('band15');

  function getBand(i) {
    switch (i) {
      case 0:  return b0;
      case 1:  return b1;
      case 2:  return b2;
      case 3:  return b3;
      case 4:  return b4;
      case 5:  return b5;
      case 6:  return b6;
      case 7:  return b7;
      case 8:  return b8;
      case 9:  return b9;
      case 10: return b10;
      case 11: return b11;
      case 12: return b12;
      case 13: return b13;
      case 14: return b14;
      case 15: return b15;
      default: return float(0.0);
    }
  }


  redMat.positionNode = Fn(() => {
      const pos = positionLocal.xyz.toVar();
      vUV.assign(uv());              // pass mesh UVs to fragment
  
      return pos;
    })();

  redMat.colorNode = Fn(() => {
    //return vec3(1.0, 0, 0);
    const baseColor = vec3(0.0, 0.0, 0.0);

    // Shift sample point below the actual surface
    const sampleY = positionLocal.y.sub(sampleOffset);

    //const sampleY = positionWorld.y.sub(sampleOffset);

    let colorOut = bandColor(0);
    for (let i = 0; i < numTimelines; i++) {
      const mask = step(getBand(i), sampleY);
      // Only mix toward bandColor(i+1) if i+1 is still within active layers
      const nextColor = i + 1 < numTimelines ? bandColor(i + 1) : bandColor(i);
      colorOut = mix(colorOut, nextColor, mask);
    }

    const heightVariation = mix(
      vec3(0.3, 0.3, 0.3),
      vec3(1.2, 1.2, 1.2),
      clamp(positionLocal.y.mul(0.06), float(0.0), float(1.0)),
    );
    const colorWithHeight = colorOut.mul(heightVariation);

    // Height mask
    const heightMask = step(0.5, positionWorld.y);


        // hover dot in UV space
        const hoverDistance = distance(vUV, hoverUVUniform);
        const dotRadius     = float(0.014);
        const dotIntensity  = step(hoverDistance, dotRadius);
    
        const redDot = vec3(1.0, 0.0, 0.0); // actual red
        const finalColorWithDot = mix(
          colorWithHeight,
          redDot,
          dotIntensity.mul(step(0.0, hoverUVUniform.x)),
        );
    
    

    return mix(baseColor, finalColorWithDot, heightMask);

  })();

  return redMat;
};
