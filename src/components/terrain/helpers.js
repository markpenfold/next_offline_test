import * as THREE from 'three/webgpu';

export function aggregatedEventsToHeightArray(aggregatedEvents) {
  if (!aggregatedEvents || aggregatedEvents.length === 0) return [];
  // sum columns 1..end, column 0 is year
  return aggregatedEvents.map(row =>
    row.slice(1).reduce((sum, val) => sum + val, 0)
  );
}

export function logScaleHeights(heightArray, scale = 15) {
  const out = new Float32Array(heightArray.length);
  for (let i = 0; i < heightArray.length; i++) {
    const h = heightArray[i];
    out[i] = h > 0 ? Math.log(h + 1) * scale : 0;
  }
  return out;
}



export function getHeightArray(splines, curve_points){
    const heightArray = new Array(curve_points * curve_points);
    
    // Iterate through each spline (column)
    for(var col = 0; col < splines.length; col++){
        var points = splines[col].getPoints(curve_points - 1);
        
        // For each point in this column
        for(var row = 0; row < points.length; row++){
            // Write to row-major position: row * width + col
            const index = row * curve_points + col;
            if(points[row].y < 0){
                points[row].y = 0;
            }
            heightArray[index] = points[row].y;
        }
    }
    
    return heightArray;
}


export function handleCurves(curveArray, curve_points, dimension){
    var heightArray2 = new Array();
    for(let a=0; a<curveArray.length; a++){
        const points = curveArray[a].getPoints( curve_points );
        for(var i=0; i<points.length; i++){
            heightArray2.push(points[i].y);
        }
    }
    //console.log("points:", heightArray2.length);
    return heightArray2;
}


//generate array of splines from h_matrix of vec2s
export function get_x_splines(hMap){
    //console.log("MAPPY:", hMap.length);
    try{
        let splines = [];
        let len = hMap.length;
    
        for(let i=0; i<len; i++){
            splines.push(new THREE.SplineCurve(hMap[i]));
        }
        return splines;
    } catch (error) {
        console.error(error);
      }
}

//generate array of splines from h_matrix of vec2s
export function get_z_splines(hMap, curve_points=64){
    //console.log("Hmap: ", hMap);
    var xSplines = get_x_splines(hMap);
    var zSplines = [];
    const long_lines = [];
    var temp = [];
    var temp2 = [];
    var temp3 = [];
    try{
        for(var x=0; x<xSplines.length; x++){
            var points_n = xSplines[x].getPoints( curve_points-1 );
            long_lines.push(points_n);
        }

        for(var b=0;  b<long_lines[0].length; b++) {
            for(var a=0;  a<xSplines.length; a++){
               temp.push(new THREE.Vector2( a,long_lines[a][b].y ));
            }

            zSplines.push(new THREE.SplineCurve(temp));
            temp = [];
        }
        return zSplines;
        
    } catch (error) {
        console.log(error);
      }
}

// generates mesh from height maps
export function getSmoothArray(hmap, curve_points) {
    //console.log("hfuckingmap:", hmap);
    var splines2 = get_z_splines(hmap, curve_points);
    //console.log('splines 2:', splines2);
    var hArray = getHeightArray(splines2, curve_points);
    return hArray;
}


export function heightArrayToSmoothMatrix(heightArray) {
    //console.log('height array:', heightArray);
    const gridSize = Math.sqrt(heightArray.length);
    const matrix = [];
    
    for (let row = 0; row < gridSize; row++) {
        const rowVectors = [];
        for (let col = 0; col < gridSize; col++) {
            const index = row * gridSize + col;
            const height = heightArray[index] > 0 ? Math.log(heightArray[index] + 1) * 15 : 0;
            // Vector2(x_position, height_value)
            rowVectors.push(new THREE.Vector2(col, height));
        }
        matrix.push(rowVectors);
    }
    
    return matrix;
}



export function updatePlane13(geo, tsmData, curve_points = 64) {
  const MAX_TIMELINES = 16;
  const posAttr = geo.attributes.position;
  const vertexCount = posAttr.count;

  if (!tsmData || tsmData.length === 0) {
    geo.userData.numTimelines = 0;
    geo.userData.maxHeight = 0;
    geo.userData.minHeight = 0;
    const zeroBuf = new Float32Array(vertexCount);
    for (let t = 0; t < MAX_TIMELINES; t++) {
      geo.setAttribute(`band${t}`, new THREE.Float32BufferAttribute(zeroBuf, 1));
    }
    geo.setAttribute('heightBuffer', new THREE.Float32BufferAttribute(zeroBuf, 1));
    return geo;
  }

  // Extract categories from index 1 of the first year tuple
  const categories = tsmData[0][1] || [];
  let numTimelines = categories.length;
  if (numTimelines > MAX_TIMELINES) numTimelines = MAX_TIMELINES;

  const baseCount = tsmData.length;
  const gridSize  = Math.sqrt(baseCount);
  console.log("GRID SIZE MOTHERFUCKER:", gridSize)

  const rawLayers   = Array.from({ length: numTimelines }, () => new Float32Array(baseCount));
  const heightArray = new Float32Array(baseCount);
  const hMatrix     = [];

  for (let row = 0; row < gridSize; row++) {
    const rowVectors = [];
    for (let col = 0; col < gridSize; col++) {
      const idx      = row * gridSize + col;
      const eventRow = tsmData[idx];
      let total      = 0;
      for (let t = 0; t < numTimelines; t++) {
        // Access count at index 2, layer t
        const val         = (eventRow && eventRow[2]) ? (eventRow[2][t] ?? 0) : 0;
        rawLayers[t][idx] = val;
        total            += val;
      }
      heightArray[idx] = total;
      const height     = total > 0 ? Math.log(total + 1) * 15 : 0;
      rowVectors.push(new THREE.Vector2(col, height));
    }
    hMatrix.push(rowVectors);
  }

  const smoothHeights = getSmoothArray(hMatrix, curve_points);

  const positions = posAttr.array;
  const heights   = new Float32Array(vertexCount);
  let maxHeight   = -Infinity, minHeight = Infinity;
  let runningTotal = 0, nonZeroCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const h = smoothHeights[i] < 0.55 ? 0 : smoothHeights[i];
    heights[i] = h;
    if (h > maxHeight) maxHeight = h;
    if (h > 0) {
      if (h < minHeight) minHeight = h;
      runningTotal += h;
      nonZeroCount++;
    }
    positions[i * 3 + 1] = h;
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  const smoothedLayers = [];
  for (let t = 0; t < numTimelines; t++) {
    const layerMatrix = [];
    for (let row = 0; row < gridSize; row++) {
      const rowVectors = [];
      for (let col = 0; col < gridSize; col++) {
        const idx = row * gridSize + col;
        rowVectors.push(new THREE.Vector2(col, rawLayers[t][idx]));
      }
      layerMatrix.push(rowVectors);
    }
    const smoothed = getSmoothArray(layerMatrix, curve_points);
    for (let i = 0; i < smoothed.length; i++) if (smoothed[i] < 0) smoothed[i] = 0;
    smoothedLayers.push(smoothed);
  }

  const cumBufs = Array.from({ length: MAX_TIMELINES }, () => new Float32Array(vertexCount));
  for (let v = 0; v < vertexCount; v++) {
    let cum = 0;
    for (let t = 0; t < numTimelines; t++) {
      cum += smoothedLayers[t][v] ?? 0;
      cumBufs[t][v] = cum > 0 ? Math.log(cum + 1) * 15 : 0;
    }
  }

  for (let t = 0; t < MAX_TIMELINES; t++) {
    geo.setAttribute(`band${t}`, new THREE.Float32BufferAttribute(cumBufs[t], 1));
  }

  geo.setAttribute('heightBuffer', new THREE.Float32BufferAttribute(heights, 1));

  geo.userData.numTimelines  = numTimelines;
  geo.userData.maxHeight     = maxHeight === -Infinity ? 0 : maxHeight;
  geo.userData.minHeight     = minHeight === Infinity ? 0 : minHeight;
  geo.userData.averageHeight = nonZeroCount > 0 ? runningTotal / nonZeroCount : 0;
  geo.userData.maxTimelines  = MAX_TIMELINES;
  geo.userData.categories    = categories;

  return geo;
}






export function updatePlane13x(geo, aggregatedEvents, curve_points = 64) {
  const MAX_TIMELINES = 10;
  const posAttr = geo.attributes.position;
  const vertexCount = posAttr.count;



  let numTimelines = aggregatedEvents[0].length - 1;
  
  if (numTimelines > MAX_TIMELINES) {
    console.warn(`numTimelines (${numTimelines}) > MAX_TIMELINES (${MAX_TIMELINES}), truncating`);
    numTimelines = MAX_TIMELINES;
  }

  const baseCount = aggregatedEvents.length;
  const gridSize = Math.sqrt(baseCount);

  // ── SINGLE PASS: build height matrix AND all layer matrices simultaneously ──
  // Instead of re-running getSmoothArray per layer, we extract every layer's
  // raw values here alongside the height values, build all matrices at once,
  // then run one spline pass per layer (down from 1 + numTimelines passes to
  // 1 + numTimelines, but sharing the aggregatedEvents iteration cost).
  //
  // More importantly: the HEIGHT smoothing is now the only getSmoothArray call
  // that also needs log-scaling. Layer matrices are built inline without
  // repeated aggregatedEvents traversal.

  // Pre-allocate all raw layer arrays
  const rawLayers = Array.from({ length: numTimelines }, () => new Float32Array(baseCount));

  // Build height matrix and fill rawLayers in one loop
  const heightArray = new Float32Array(baseCount);
  const hMatrix = [];

  for (let row = 0; row < gridSize; row++) {
    const rowVectors = [];
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      const eventRow = aggregatedEvents[idx];
      let total = 0;
      for (let t = 0; t < numTimelines; t++) {
        const val = eventRow ? (eventRow[t + 1] ?? 0) : 0;
        rawLayers[t][idx] = val;
        total += val;
      }
      heightArray[idx] = total;
      const height = total > 0 ? Math.log(total + 1) * 15 : 0;
      rowVectors.push(new THREE.Vector2(col, height));
    }
    hMatrix.push(rowVectors);
  }

  // One spline smooth for heights
  const smoothHeights = getSmoothArray(hMatrix, curve_points);

  const positions = posAttr.array;
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
    positions[i * 3 + 1] = h;
  }
  const averageHeight = nonZeroCount > 0 ? runningTotal / nonZeroCount : 0;
  if (minHeight === Infinity) minHeight = 0;

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();

  // ── SMOOTH EACH LAYER: one getSmoothArray call per layer (unchanged count) ──
  // but aggregatedEvents is only traversed once above, not once per layer
  const smoothedLayers = [];

  for (let t = 0; t < numTimelines; t++) {
    const layerMatrix = [];
    for (let row = 0; row < gridSize; row++) {
      const rowVectors = [];
      for (let col = 0; col < gridSize; col++) {
        const idx = row * gridSize + col;
        rowVectors.push(new THREE.Vector2(col, rawLayers[t][idx]));
      }
      layerMatrix.push(rowVectors);
    }
    const smoothed = getSmoothArray(layerMatrix, curve_points);
    for (let i = 0; i < smoothed.length; i++) {
      if (smoothed[i] < 0) smoothed[i] = 0;
    }
    smoothedLayers.push(smoothed);
  }


  // ── CUMULATIVE BAND BOUNDARIES: O(numTimelines × vertexCount) ──
  // Previously: nested k-loop → O(numTimelines² × vertexCount)
  // Now: single pass with running accumulator per vertex
  const cumBufs = Array.from({ length: MAX_TIMELINES }, () => new Float32Array(vertexCount));
  for (let v = 0; v < vertexCount; v++) {
    let cum = 0;
    for (let t = 0; t < numTimelines; t++) {
      cum += smoothedLayers[t][v] ?? 0;
      cumBufs[t][v] = cum > 0 ? Math.log(cum + 1) * 15 : 0;
    }
    // remaining slots above numTimelines stay 0 (Float32Array default)
  }
  for (let t = 0; t < MAX_TIMELINES; t++) {
    geo.setAttribute(`band${t}`, new THREE.Float32BufferAttribute(cumBufs[t], 1));
  }

  geo.setAttribute('heightBuffer', new THREE.Float32BufferAttribute(heights, 1));

  geo.userData.numTimelines = numTimelines;
  geo.userData.maxHeight = maxHeight;
  geo.userData.minHeight = minHeight;
  geo.userData.averageHeight = averageHeight;
  geo.userData.maxTimelines = MAX_TIMELINES;

  //console.log("GEEEEEEEEEEEEEEEEEO:", geo);
  return geo;
}






export function updatePlane14(geo, smoothedSlotArrays) {
  // smoothedSlotArrays = array of 12 Float32Arrays (length = vertexCount)
  const vertexCount = geo.attributes.position.count;

  // Allocate 3 vec4 attribute buffers (vertexCount * 4)
  const b0_3 = new Float32Array(vertexCount * 4);
  const b4_7 = new Float32Array(vertexCount * 4);
  const b8_11 = new Float32Array(vertexCount * 4);

  const buffers = [b0_3, b4_7, b8_11];

  for (let slotIdx = 0; slotIdx < 12; slotIdx++) {
    const slotData = smoothedSlotArrays[slotIdx];
    if (!slotData) continue;

    const attrIdx = Math.floor(slotIdx / 4);
    const compIdx = slotIdx % 4;
    const targetBuf = buffers[attrIdx];

    for (let v = 0; v < vertexCount; v++) {
      targetBuf[v * 4 + compIdx] = slotData[v] || 0;
    }
  }

  // Upload the 3 vec4 attributes to WebGPU
  geo.setAttribute('bands0', new THREE.Float32BufferAttribute(b0_3, 4));
  geo.setAttribute('bands1', new THREE.Float32BufferAttribute(b4_7, 4));
  geo.setAttribute('bands2', new THREE.Float32BufferAttribute(b8_11, 4));

  return geo;
}



















export function formatYear(year) {
  if (year < -1000000000) {
    return `${(Math.abs(year) / 1000000000).toFixed(2)}B BC`;
  } else if (year < -1000000) {
    return `${(Math.abs(year) / 1000000).toFixed(1)}M BC`;
  } else if (year < 0) {
    return `${Math.abs(year)} BC`;
  }
  return `${year} AD`;
}































