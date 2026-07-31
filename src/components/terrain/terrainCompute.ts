import * as THREE from 'three';
import {
  Fn,
  compute,
  storage,
  float,
  vec3,
  vec4,
  instanceIndex,
  log,
  max,
  min,
  uniform
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

  // 1. Inputs
  const rawStorageAttr = new StorageBufferAttribute(masterBufferArray, 1);
  const rawDataNode = storage(rawStorageAttr, 'float', RAW_GRID * RAW_GRID * 12);

  const resUniform = uniform(resolution);
  const ratioUniform = uniform((RAW_GRID - 1) / (resolution - 1));

  // 2. Outputs (Storage Pointers to VRAM)
  const posNode = storage(geometry.attributes.position as StorageBufferAttribute, 'vec3', vertexCount);
  const normalNode = storage(geometry.attributes.normal as StorageBufferAttribute, 'vec3', vertexCount);
  const heightNode = storage(geometry.attributes.heightBuffer as StorageBufferAttribute, 'float', vertexCount);
  const bands0Node = storage(geometry.attributes.bands0 as StorageBufferAttribute, 'vec4', vertexCount);
  const bands1Node = storage(geometry.attributes.bands1 as StorageBufferAttribute, 'vec4', vertexCount);
  const bands2Node = storage(geometry.attributes.bands2 as StorageBufferAttribute, 'vec4', vertexCount);

  // Helper: Clamped 1D array indexing into 3D storage layout [slot][y][x]
  const getRawValue = Fn(([x, y, slotIndex]: any[]) => {
    const clampX = max(0.0, min(float(RAW_GRID - 1), x));
    const clampY = max(0.0, min(float(RAW_GRID - 1), y));

    const gridIndex = clampY.mul(RAW_GRID).add(clampX);
    const slotOffset = slotIndex.mul(RAW_GRID * RAW_GRID);

    return rawDataNode.element(slotOffset.add(gridIndex));
  });

  // Helper: Evaluates bicubic accumulated height at any continuous coordinate (rx, ry)
  const sampleHeightAt = Fn(([rx, ry]: any[]) => {
    const cellX = rx.floor();
    const cellY = ry.floor();
    const tx = rx.fract();
    const ty = ry.fract();

    let cumulativeSum: any = float(0.0);

    for (let slot = 0; slot < 12; slot++) {
      const slotFloat = float(slot);

      const row0 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY.sub(1), slotFloat),
        getRawValue(cellX,        cellY.sub(1), slotFloat),
        getRawValue(cellX.add(1), cellY.sub(1), slotFloat),
        getRawValue(cellX.add(2), cellY.sub(1), slotFloat),
        tx
      ));

      const row1 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY, slotFloat),
        getRawValue(cellX,        cellY, slotFloat),
        getRawValue(cellX.add(1), cellY, slotFloat),
        getRawValue(cellX.add(2), cellY, slotFloat),
        tx
      ));

      const row2 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY.add(1), slotFloat),
        getRawValue(cellX,        cellY.add(1), slotFloat),
        getRawValue(cellX.add(1), cellY.add(1), slotFloat),
        getRawValue(cellX.add(2), cellY.add(1), slotFloat),
        tx
      ));

      const row3 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY.add(2), slotFloat),
        getRawValue(cellX,        cellY.add(2), slotFloat),
        getRawValue(cellX.add(1), cellY.add(2), slotFloat),
        getRawValue(cellX.add(2), cellY.add(2), slotFloat),
        tx
      ));

      // Evaluate vertical column with clean, non-negative row inputs
      const smoothedValue = max(0.0, catmullRom(row0, row1, row2, row3, ty));  
      cumulativeSum = cumulativeSum.add(smoothedValue);
      
    }

    return cumulativeSum.greaterThan(0.0)
      .select(log(cumulativeSum.add(1.0)).mul(15.0), float(0.0));
  });

  // 3. The Main GPU Compute Kernel
  const smoothCompute = Fn(() => {
    const idxFloat = float(instanceIndex);

    // Target mesh coordinates (0 to resolution - 1)
    const targetX = idxFloat.mod(resUniform);
    const targetY = idxFloat.div(resUniform).floor();

    // Map high-res coordinate down to 32x32 raw data coordinate
    const rawX = targetX.mul(ratioUniform);
    const rawY = targetY.mul(ratioUniform);

    const cellX = rawX.floor();
    const cellY = rawY.floor();
    const tx = rawX.fract();
    const ty = rawY.fract();

    let cumulativeSum: any = float(0.0);
    const bandLogs: any[] = [];

    // Loop through all 12 timeline slots for the main vertex
    for (let slot = 0; slot < 12; slot++) {
      const slotFloat = float(slot);

      const row0 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY.sub(1), slotFloat),
        getRawValue(cellX,        cellY.sub(1), slotFloat),
        getRawValue(cellX.add(1), cellY.sub(1), slotFloat),
        getRawValue(cellX.add(2), cellY.sub(1), slotFloat),
        tx
      ));

      const row1 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY, slotFloat),
        getRawValue(cellX,        cellY, slotFloat),
        getRawValue(cellX.add(1), cellY, slotFloat),
        getRawValue(cellX.add(2), cellY, slotFloat),
        tx
      ));

      const row2 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY.add(1), slotFloat),
        getRawValue(cellX,        cellY.add(1), slotFloat),
        getRawValue(cellX.add(1), cellY.add(1), slotFloat),
        getRawValue(cellX.add(2), cellY.add(1), slotFloat),
        tx
      ));

      const row3 = max(0.0, catmullRom(
        getRawValue(cellX.sub(1), cellY.add(2), slotFloat),
        getRawValue(cellX,        cellY.add(2), slotFloat),
        getRawValue(cellX.add(1), cellY.add(2), slotFloat),
        getRawValue(cellX.add(2), cellY.add(2), slotFloat),
        tx
      ));

      // Evaluate vertical column with clean, non-negative row inputs
      const smoothedValue = max(0.0, catmullRom(row0, row1, row2, row3, ty));
      cumulativeSum = cumulativeSum.add(smoothedValue);

      const logHeight = cumulativeSum.greaterThan(0.0)
        .select(log(cumulativeSum.add(1.0)).mul(15.0), float(0.0));

      bandLogs.push(logHeight);
    }

    // -------------------------------------------------------------
    // SMOOTH NORMAL CALCULATION (Central Differences)
    // -------------------------------------------------------------
    const hL = sampleHeightAt(rawX.sub(ratioUniform), rawY);
    const hR = sampleHeightAt(rawX.add(ratioUniform), rawY);
    const hD = sampleHeightAt(rawX, rawY.sub(ratioUniform));
    const hU = sampleHeightAt(rawX, rawY.add(ratioUniform));

    const gridSpacing = float(400.0 / (resolution - 1));
    const smoothNormal = vec3(
      hL.sub(hR),
      gridSpacing.mul(2.0),
      hD.sub(hU)
    ).normalize();

    // -------------------------------------------------------------
    // WRITE RESULTS DIRECTLY TO GPU VRAM
    // -------------------------------------------------------------
    const currentVertex = posNode.element(instanceIndex);

    // Physically deform vertex height
    currentVertex.y.assign(bandLogs[11]);

    // Write smooth normal vector
    normalNode.element(instanceIndex).assign(smoothNormal);

    // Write scalar height
    heightNode.element(instanceIndex).assign(bandLogs[11]);

    // Write packed timeline vec4s
    bands0Node.element(instanceIndex).assign(vec4(bandLogs[0], bandLogs[1], bandLogs[2], bandLogs[3]));
    bands1Node.element(instanceIndex).assign(vec4(bandLogs[4], bandLogs[5], bandLogs[6], bandLogs[7]));
    bands2Node.element(instanceIndex).assign(vec4(bandLogs[8], bandLogs[9], bandLogs[10], bandLogs[11]));
  });

  return {
    computeNode: compute(smoothCompute(), vertexCount),
    rawStorageAttr: rawStorageAttr,
  };
}