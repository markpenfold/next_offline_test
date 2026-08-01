// components/terrain/terrainComputeB.ts
import * as THREE from 'three';
import {
  Fn, compute, storage, float, vec3, vec4,
  instanceIndex, log, max, min, uniform
} from 'three/tsl';
import { StorageBufferAttribute } from 'three/webgpu';

export interface TerrainComputeResult {
  computeNode: any;
  rawStorageAttr: StorageBufferAttribute;
}

// 1. Helper: 1D Catmull-Rom Interpolation
const catmullRom = Fn(([p0, p1, p2, p3, t]: any[]) => {
  const t2 = t.mul(t);
  const t3 = t2.mul(t);

  const w0 = t3.negate().add(t2.mul(2.0)).sub(t);
  const w1 = t3.mul(3.0).sub(t2.mul(5.0)).add(2.0);
  const w2 = t3.mul(-3.0).add(t2.mul(4.0)).add(t);
  const w3 = t3.sub(t2);

  return w0.mul(p0).add(w1.mul(p1)).add(w2.mul(p2)).add(w3.mul(p3)).mul(0.5);
});

export function createTerrainCompute(
  geometry: THREE.BufferGeometry,
  resolution: number,
  masterBufferArray: Float32Array
): TerrainComputeResult {
  const vertexCount = resolution * resolution;
  const RAW_GRID = 32;

  const rawStorageAttr = new StorageBufferAttribute(masterBufferArray, 1);
  const rawDataNode = storage(rawStorageAttr, 'float', RAW_GRID * RAW_GRID * 12);

  const resUniform = uniform(resolution);
  const ratioUniform = uniform((RAW_GRID - 1) / (resolution - 1));

  const posNode = storage(geometry.attributes.position as StorageBufferAttribute, 'vec3', vertexCount);
  const normalNode = storage(geometry.attributes.normal as StorageBufferAttribute, 'vec3', vertexCount);
  const heightNode = storage(geometry.attributes.heightBuffer as StorageBufferAttribute, 'float', vertexCount);
  const bands0Node = storage(geometry.attributes.bands0 as StorageBufferAttribute, 'vec4', vertexCount);
  const bands1Node = storage(geometry.attributes.bands1 as StorageBufferAttribute, 'vec4', vertexCount);
  const bands2Node = storage(geometry.attributes.bands2 as StorageBufferAttribute, 'vec4', vertexCount);

  const getRawValue = Fn(([x, y, slotIndex]: any[]) => {
    const clampX = max(0.0, min(float(RAW_GRID - 1), x));
    const clampY = max(0.0, min(float(RAW_GRID - 1), y));
    const gridIndex = clampY.mul(RAW_GRID).add(clampX);
    const slotOffset = slotIndex.mul(RAW_GRID * RAW_GRID);
    return rawDataNode.element(slotOffset.add(gridIndex));
  });

  // Helper: Evaluates a single slot's bicubic value at specific cell coordinates
  const sampleLayerBicubic = Fn(([cellX, cellY, tx, ty, slotFloat]: any[]) => {
    const row0 = max(0.0, catmullRom(getRawValue(cellX.sub(1), cellY.sub(1), slotFloat), getRawValue(cellX, cellY.sub(1), slotFloat), getRawValue(cellX.add(1), cellY.sub(1), slotFloat), getRawValue(cellX.add(2), cellY.sub(1), slotFloat), tx));
    const row1 = max(0.0, catmullRom(getRawValue(cellX.sub(1), cellY, slotFloat), getRawValue(cellX, cellY, slotFloat), getRawValue(cellX.add(1), cellY, slotFloat), getRawValue(cellX.add(2), cellY, slotFloat), tx));
    const row2 = max(0.0, catmullRom(getRawValue(cellX.sub(1), cellY.add(1), slotFloat), getRawValue(cellX, cellY.add(1), slotFloat), getRawValue(cellX.add(1), cellY.add(1), slotFloat), getRawValue(cellX.add(2), cellY.add(1), slotFloat), tx));
    const row3 = max(0.0, catmullRom(getRawValue(cellX.sub(1), cellY.add(2), slotFloat), getRawValue(cellX, cellY.add(2), slotFloat), getRawValue(cellX.add(1), cellY.add(2), slotFloat), getRawValue(cellX.add(2), cellY.add(2), slotFloat), tx));

    return max(0.0, catmullRom(row0, row1, row2, row3, ty));
  });



  const sampleHeightAt = Fn(([rx, ry]: any[]) => {
    const cellX = rx.floor();
    const cellY = ry.floor();
    const tx = rx.fract();
    const ty = ry.fract();

    let totalRaw: any = float(0.0);

    for (let slot = 0; slot < 12; slot++) {
      totalRaw = totalRaw.add(sampleLayerBicubic(cellX, cellY, tx, ty, float(slot)));
    }

    return totalRaw.greaterThan(0.0)
      .select(log(totalRaw.add(1.0)).mul(15.0), float(0.0));
  });

  const smoothCompute = Fn(() => {
    const idxFloat = float(instanceIndex);
    const targetX = idxFloat.mod(resUniform);
    const targetY = idxFloat.div(resUniform).floor();
    const rawX = targetX.mul(ratioUniform);
    const rawY = targetY.mul(ratioUniform);
    const cellX = rawX.floor();
    const cellY = rawY.floor();
    const tx = rawX.fract();
    const ty = rawY.fract();

    const rawVals: any[] = [];
    let totalRaw: any = float(0.0);

    // 💡 PASS 1: Calculate raw heights
    for (let slot = 0; slot < 12; slot++) {
      const smoothedValue = sampleLayerBicubic(cellX, cellY, tx, ty, float(slot));
      
      rawVals.push(smoothedValue);
      totalRaw = totalRaw.add(smoothedValue);
    }

    // 💡 The MASTER_HEIGHT (log scaled)
    const masterHeight = totalRaw.greaterThan(0.0)
      .select(log(totalRaw.add(1.0)).mul(15.0), float(0.0));

    // Prevent divide-by-zero
    const safeTotal = totalRaw.greaterThan(0.0).select(totalRaw, float(1.0));

    // PASS 2: Calculate Absolute Boundaries via Fractions
    let cumulativeRaw: any = float(0.0);
    const boundaries: any[] = [];

    for (let slot = 0; slot < 12; slot++) {
      cumulativeRaw = cumulativeRaw.add(rawVals[slot]);
      
      const fraction = cumulativeRaw.div(safeTotal);
      const boundary = fraction.mul(masterHeight);
      boundaries.push(boundary);
    }

    // Normal calculation
    const hL = sampleHeightAt(rawX.sub(ratioUniform), rawY);
    const hR = sampleHeightAt(rawX.add(ratioUniform), rawY);
    const hD = sampleHeightAt(rawX, rawY.sub(ratioUniform));
    const hU = sampleHeightAt(rawX, rawY.add(ratioUniform));
    const gridSpacing = float(400.0 / (resolution - 1));
    const smoothNormal = vec3(hL.sub(hR), gridSpacing.mul(2.0), hD.sub(hU)).normalize();

    // -------------------------------------------------------------
    // WRITE TO VRAM
    // -------------------------------------------------------------
    posNode.element(instanceIndex).y.assign(masterHeight);
    normalNode.element(instanceIndex).assign(smoothNormal);
    heightNode.element(instanceIndex).assign(masterHeight);
    
    bands0Node.element(instanceIndex).assign(vec4(boundaries[0], boundaries[1], boundaries[2], boundaries[3]));
    bands1Node.element(instanceIndex).assign(vec4(boundaries[4], boundaries[5], boundaries[6], boundaries[7]));
    bands2Node.element(instanceIndex).assign(vec4(boundaries[8], boundaries[9], boundaries[10], boundaries[11]));
  });

  return {
    computeNode: compute(smoothCompute(), vertexCount),
    rawStorageAttr: rawStorageAttr,
  };
}