// helpers.js — Fast, Worker-Safe & Zero-GC

/**
 * Standard 1D Catmull-Rom Spline Interpolation
 * Matches THREE.SplineCurve behavior without Vector2 allocations
 */
function catmullRom1D(p0, p1, p2, p3, t) {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 +
         (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 +
         v0 * t + p1;
}

/**
 * Samples a 1D array of values using Catmull-Rom splines
 */
function sampleSpline1D(input, numSamples, out) {
  const n = input.length;
  if (n === 0) return out;
  if (n === 1) {
    out.fill(input[0]);
    return out;
  }

  const step = (n - 1) / (numSamples - 1);

  for (let i = 0; i < numSamples; i++) {
    const u = i * step;
    let idx = Math.floor(u);
    const t = u - idx;

    if (idx >= n - 1) idx = n - 2;

    const p0 = input[Math.max(0, idx - 1)];
    const p1 = input[idx];
    const p2 = input[Math.min(n - 1, idx + 1)];
    const p3 = input[Math.min(n - 1, idx + 2)];

    out[i] = catmullRom1D(p0, p1, p2, p3, t);
  }
  return out;
}

/**
 * Optimized 2D Grid Spline Smoothing (Replaces THREE.SplineCurve pipeline)
 * Smooths along X (rows), then along Z (columns) into a (targetSize x targetSize) grid.
 * 
 * @param {Float32Array|number[]} rawGrid - 1D array representing (gridSize x gridSize)
 * @param {number} gridSize - Dimension of raw grid (e.g., 16 or 32)
 * @param {number} targetSize - Target resolution (e.g., 512)
 * @param {Float32Array} [outBuffer] - Pre-allocated buffer to prevent GC allocations
 */
export function getSmoothArrayFast(rawGrid, gridSize, targetSize, outBuffer) {
  const out = outBuffer || new Float32Array(targetSize * targetSize);

  // Buffer for row-smoothed intermediate results: (gridSize rows) x (targetSize cols)
  const rowSmoothed = new Float32Array(gridSize * targetSize);

  // Temporary buffers for sampling
  const tempIn = new Float32Array(gridSize);
  const tempOut = new Float32Array(targetSize);

  // 1. Smooth along X (rows)
  for (let r = 0; r < gridSize; r++) {
    const rowOffset = r * gridSize;
    for (let c = 0; c < gridSize; c++) {
      tempIn[c] = rawGrid[rowOffset + c];
    }

    sampleSpline1D(tempIn, targetSize, tempOut);

    const outRowOffset = r * targetSize;
    for (let c = 0; c < targetSize; c++) {
      rowSmoothed[outRowOffset + c] = tempOut[c];
    }
  }

  // 2. Smooth along Z (columns) across the intermediate rowSmoothed grid
  const colIn = new Float32Array(gridSize);
  const colOut = new Float32Array(targetSize);

  for (let c = 0; c < targetSize; c++) {
    for (let r = 0; r < gridSize; r++) {
      colIn[r] = rowSmoothed[r * targetSize + c];
    }

    sampleSpline1D(colIn, targetSize, colOut);

    for (let r = 0; r < targetSize; r++) {
      let val = colOut[r];
      if (val < 0) val = 0; // Clamping negative spline overshoots
      out[r * targetSize + c] = val;
    }
  }

  return out;
}

/**
 * Single-pass Data Processing Function (Worker Compatible)
 */
export function processTerrainData(aggregatedEvents, targetSize = 512, maxTimelines = 16) {
  if (!aggregatedEvents || aggregatedEvents.length === 0) return null;

  let numTimelines = aggregatedEvents[0].length - 1;
  if (numTimelines > maxTimelines) numTimelines = maxTimelines;

  const baseCount = aggregatedEvents.length;
  const gridSize = Math.sqrt(baseCount);
  const vertexCount = targetSize * targetSize;

  // 1. Extract raw heights and layer values into flat typed arrays
  const rawHeights = new Float32Array(baseCount);
  const rawLayers = Array.from({ length: numTimelines }, () => new Float32Array(baseCount));

  for (let idx = 0; idx < baseCount; idx++) {
    const eventRow = aggregatedEvents[idx];
    let total = 0;
    for (let t = 0; t < numTimelines; t++) {
      const val = eventRow ? (eventRow[t + 1] ?? 0) : 0;
      rawLayers[t][idx] = val;
      total += val;
    }
    rawHeights[idx] = total > 0 ? Math.log(total + 1) * 15 : 0;
  }

  // 2. Smooth total heights
  const smoothHeights = getSmoothArrayFast(rawHeights, gridSize, targetSize);

  // 3. Process Heights & Metadata
  const heights = new Float32Array(vertexCount);
  let maxHeight = -Infinity;
  let minHeight = Infinity;
  let runningTotal = 0;
  let nonZeroCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const h = smoothHeights[i] < 0.55 ? 0 : smoothHeights[i];
    heights[i] = h;
    if (h > maxHeight) maxHeight = h;
    if (h > 0) {
      if (h < minHeight) minHeight = h;
      runningTotal += h;
      nonZeroCount++;
    }
  }

  const averageHeight = nonZeroCount > 0 ? runningTotal / nonZeroCount : 0;
  if (minHeight === Infinity) minHeight = 0;

  // 4. Smooth individual layers & compute cumulative band buffers
  const smoothedLayers = [];
  for (let t = 0; t < numTimelines; t++) {
    smoothedLayers.push(getSmoothArrayFast(rawLayers[t], gridSize, targetSize));
  }

  const cumBufs = Array.from({ length: maxTimelines }, () => new Float32Array(vertexCount));
  for (let v = 0; v < vertexCount; v++) {
    let cum = 0;
    for (let t = 0; t < numTimelines; t++) {
      cum += smoothedLayers[t][v] ?? 0;
      cumBufs[t][v] = cum > 0 ? Math.log(cum + 1) * 15 : 0;
    }
  }

  return {
    heights,
    cumBufs,
    metadata: {
      numTimelines,
      maxHeight,
      minHeight,
      averageHeight,
      maxTimelines,
    },
  };
}