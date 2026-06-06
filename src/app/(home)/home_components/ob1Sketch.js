
const CANVAS_SIZE = 750;
export default function ob1Sketch(p, displaySize = 750,  onComplete) {
  // ---- State ----

  let brush;
  let settings = {
    brushSize: 110,
    spring: 0.4,
    friction: 0.45,
    splitNum: 18,
    diff: 6,
    numBristles: 64,
    skipRate: 0.25,
    velocityMultipier: 2.0,
  };


  function generateSettings(velocityMultipier=2.0, numBristles=64, brushSize=90){
  let settings = {
  brushSize: brushSize,
  spring: 0.4,
  friction: 0.45,
  splitNum: 28,
  diff: 6,
  numBristles: numBristles,
  velocityMultipier: velocityMultipier,
  skipRate:0.25
  };
  return settings;
}



  let paths = [];
  let pathSqueeze = [];
  let currentPathIndex = 0;
  let pathIndex = 0;
  let numGestures = p.random(1,6);;

  // ---- p5 lifecycle ----

  p.setup = () => {

    p.pixelDensity(1);
    p.createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    p.canvas.style.width = "100%";
    p.canvas.style.height = "auto";
    p.canvas.style.maxWidth = `${CANVAS_SIZE}px`;
    p.background(245);
    // Ensure it behaves like a block for centering
    p.canvas.style.display = "block";
    p.canvas.style.margin = "0 auto";
    // --- RESPONSIVE FIX END ---

    let settingsX = generateSettings();
    settingsX.bristles = generateBristleConfigRANDOM(settingsX.numBristles);
    brush = new OmenBrush(settingsX);
    drawPerfectO(CANVAS_SIZE/2,CANVAS_SIZE/2, 300);
    numGestures = p.random(1,6);
    generateSymbols(numGestures);
  };



  p.draw = () => {
    if (currentPathIndex >= paths.length) {
      p.noLoop();
      onComplete?.(); 
      return;
    }

    if (!brush.active && currentPathIndex < paths.length) {
      let pt = paths[currentPathIndex][0];
      brush.begin(pt.x, pt.y);
      pathIndex = 0;
    }

    if (brush.active && pathIndex < paths[currentPathIndex].length) {
      for (let i = 0; i < 3; i++) {
        let pt = paths[currentPathIndex][pathIndex];
        brush.step(pt.x, pt.y);
        pathIndex++;
        if (pathIndex >= paths[currentPathIndex].length) break;
      }
    } else if (brush.active) {
      brush.end();
      currentPathIndex++;
      pathIndex = 0;
    }
  };

  p.keyPressed = () => {
    p.background(245);
    drawPerfectO(CANVAS_SIZE/2,CANVAS_SIZE/2, 300);
    let count = p.random(1, 6);
    generateSymbols(count);
    currentPathIndex = 0;
    pathIndex = 0;
    p.loop();
  };

  // ---- Circle ----

  function drawPerfectO(cx, cy, radius) {
    p.noFill();
    p.stroke(30, 30, 30);
    //p.stroke(Math.random()*100, Math.random()*100, Math.random()*100);
    p.strokeWeight(42);
    p.strokeCap(p.ROUND);
    p.circle(cx, cy, radius * 2);
  }

  // ---- Bristle configs ----

  function generateBristleConfigRANDOM(numBristles) {
    let bristles = [];
    for (let b = 0; b < numBristles; b++) {
      bristles.push({
        offset: p.random(-1, 1),
        alongPathOffset: p.random(-15, 15),
        sizeMultiplier: p.random(0.3, 1.0)
      });
    }
    return bristles;
  }

  function generateBristleConfigCLUMP(numBristles) {
    let bristles = [];
    let numClumps = p.int(p.random(2, 5));
    let clumps = [];
    for (let c = 0; c < numClumps; c++) {
      clumps.push({
        x: p.random(-0.8, 0.8),
        y: p.random(-12, 12),
        spread: p.random(0.05, 0.3)
      });
    }

    for (let b = 0; b < numBristles; b++) {
      let clump = p.random(clumps);
      bristles.push({
        offset: clump.x + p.randomGaussian() * clump.spread,
        alongPathOffset: clump.y + p.randomGaussian() * clump.spread * 15,
        sizeMultiplier: p.random(0.2, 1.0)
      });
    }
    return bristles;
  }

  function generateBristleConfig(numBristles) {
    let bristles = [];
    for (let b = 0; b < numBristles; b++) {
      let offset;
      if (numBristles === 1) {
        offset = 0;
      } else {
        offset = p.map(b, 0, numBristles - 1, -1, 1);
      }
      let sizeMultiplier = 1.0;
      if (p.abs(offset) > 0.5) {
        sizeMultiplier = p.random(0.3, 1.0);
      }
      let alongPathOffset;
      if (p.abs(offset) < 0.25) {
        alongPathOffset = p.random(-13, 50);
      } else {
        alongPathOffset = p.random(-1, 12);
      }
      bristles.push({ offset, sizeMultiplier, alongPathOffset });
    }
    return bristles;
  }


  // ---- Brush ----

  class OmenBrush {
    constructor(s) {
      this.s = s;
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.velocity = 0;
      this.r = 0;
      this.active = false;
      this.speed = 0;
      // Store bristle configuration
    this.bristles = s.bristles || generateBristleConfigRANDOM(3);
    this.brushSize = s.brushSize;
    this.spacingMultiplier = this.brushSize / 20;
    }

    begin(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.velocity = 0;
      this.active = true;
      this.speed = 10;
    }

    end() {
      this.vx = 0;
      this.vy = 0;
      this.active = false;
    }

    getSpeed() {
      return this.speed;
    }

    step(targetX, targetY) {
      if (!this.active) return;
      const s = this.s;

      let RAMP_STEPS = 50;
      let t = pathIndex / RAMP_STEPS;
      let pr = p.constrain(t, 0, 1);

      let RAMP_OUT_STEPS = 20; //20
      let remaining = paths[currentPathIndex].length - pathIndex;
      let prOut = p.constrain(remaining / RAMP_OUT_STEPS, 0, 1);
      pr = p.min(pr, prOut);

      this.vx += (targetX - this.x) * s.spring;
      this.vy += (targetY - this.y) * s.spring;
      this.vx *= s.friction;
      this.vy *= s.friction;

      this.speed = p.sqrt(this.vx * this.vx + this.vy * this.vy);
      this.velocity += this.speed - this.velocity;
      this.velocity *= 2.0;

      if (this.speed < 1.8) return;

      let oldR = this.r;
      this.r = (s.brushSize - this.velocity) * pr;

      for (let i = 0; i < s.splitNum; i++) {
        let prevX = this.x;
        let prevY = this.y;

        this.x += this.vx / s.splitNum;
        this.y += this.vy / s.splitNum;

        oldR += (this.r - oldR) / s.splitNum;
        oldR = p.max(oldR, 0.1);

        let angle = p.atan2(this.y - prevY, this.x - prevX);
        let nx = p.cos(angle + p.HALF_PI);
        let ny = p.sin(angle + p.HALF_PI);
        let dx = p.cos(angle);
        let dy = p.sin(angle);

        p.noStroke();
        p.fill(30);

        for (let bristle of this.bristles) {
          let skipRate = 0.25;
          let speedFactor = p.constrain(this.speed / 100, 0, 1);

          let bristleSqueeze =  1;
          if (pathSqueeze[currentPathIndex]){
            (bristleSqueeze = p.sqrt(speedFactor));
          }

          let skipChance = s.skipRate + speedFactor * 0.25;
          if (p.random() < skipChance) continue;

          let bristleX = this.x + nx * s.diff * bristle.offset * this.spacingMultiplier * bristleSqueeze;
          let bristleY = this.y + ny * s.diff * bristle.offset * this.spacingMultiplier * bristleSqueeze;

          bristleX += dx * bristle.alongPathOffset * bristleSqueeze;
          bristleY += dy * bristle.alongPathOffset * bristleSqueeze;

          let bristleSize = oldR * bristle.sizeMultiplier * bristleSqueeze;
          drawBristle(bristleX, bristleY, angle, bristleSize, this.speed);
        }
      }
    }
  }

  function drawBristle(x, y, angle, size, speed) {

    
    p.push();
    p.translate(x, y);
    p.rotate(angle);
    let w = size;
    let col = 30;

    let speedNormalized = p.constrain(speed / 30, 0, 1);
    let opacityDrop = p.pow(speedNormalized, 0.5);
    let alpha = p.map(opacityDrop, 0, 1, 255, 180);
    let eased = p.pow(speedNormalized, 0.3);
    let h = p.map(eased, 0, 1, size, size * 0.65);


    p.fill(col, col, col, alpha);
    p.ellipse(0, 0, w, h);
    p.pop();
  }

  // ---- Symbol generation ----

  function generateSymbols(count) {
    paths = [];
    pathSqueeze = [];
    currentPathIndex = 0;

    for (let n = 0; n < count; n++) {
      let cx = p.width / 2;
      let cy = p.height / 2;
      let R = 380;

      let pts = [];
      let angle = p.random(p.TWO_PI);
      let pointCount = p.int(p.random(2, 8));

      for (let i = 0; i < pointCount; i++) {
        angle += p.random(0.1, 9);
        let r = R * p.random(0.1, 0.9);
        pts.push(p.createVector(
          cx + p.cos(angle) * r,
          cy + p.sin(angle) * r
        ));
      }

      paths.push(smoothPath(pts, 12));
      pathSqueeze.push(Math.random() < 0.35); // each symbol gets its own coin flip

    }
  }

  // ---- Path smoothing ----

  function smoothPathCat(pts, resolution) {
    let result = [];
    for (let i = 0; i < pts.length - 1; i++) {
      let p0 = pts[p.max(i - 1, 0)];
      let p1 = pts[i];
      let p2 = pts[i + 1];
      let p3 = pts[p.min(i + 2, pts.length - 1)];
      for (let j = 0; j < resolution; j++) {
        let t = j / resolution;
        let x = p.splinePoint(p0.x, p1.x, p2.x, p3.x, t);
        let y = p.splinePoint(p0.y, p1.y, p2.y, p3.y, t);
        result.push(p.createVector(x, y));
      }
    }
    return result;
  }

  function smoothPathBez(pts, resolution) {
    let result = [];
    for (let i = 0; i < pts.length - 1; i++) {
      let p1 = pts[i];
      let p2 = pts[i + 1];
      let mx = (p1.x + p2.x) / 2;
      let my = (p1.y + p2.y) / 2;
      let d = p.dist(p1.x, p1.y, p2.x, p2.y);
      let cx1 = mx + p.random(-d * 0.6, d * 0.6);
      let cy1 = my + p.random(-d * 0.6, d * 0.6);
      let cx2 = mx + p.random(-d * 0.6, d * 0.6);
      let cy2 = my + p.random(-d * 0.6, d * 0.6);
      for (let j = 0; j < resolution; j++) {
        let t = j / resolution;
        let x = p.bezierPoint(p1.x, cx1, cx2, p2.x, t);
        let y = p.bezierPoint(p1.y, cy1, cy2, p2.y, t);
        result.push(p.createVector(x, y));
      }
    }
    return result;
  }

  function smoothPathNoise(pts, resolution) {
    let result = [];
    for (let i = 0; i < pts.length - 1; i++) {
      let p1 = pts[i];
      let p2 = pts[i + 1];
      let noiseOffset = p.random(1000);
      for (let j = 0; j < resolution; j++) {
        let t = j / resolution;
        let x = p.lerp(p1.x, p2.x, t);
        let y = p.lerp(p1.y, p2.y, t);
        let d = p.dist(p1.x, p1.y, p2.x, p2.y);
        let wobble = (p.noise(noiseOffset + t * 3) - 0.5) * d * 0.5;
        let angle = p.atan2(p2.y - p1.y, p2.x - p1.x) + p.HALF_PI;
        x += p.cos(angle) * wobble;
        y += p.sin(angle) * wobble;
        result.push(p.createVector(x, y));
      }
    }
    return result;
  }

  function smoothPath(pts, resolution) {
    let method = p.random(['bezier', 'noise', 'catmull']);
    if (method == 'bezier') {
      return smoothPathBez(pts, resolution);
    } else if (method == 'noise') {
      return smoothPathNoise(pts, resolution);
    } else {
      return smoothPathCat(pts, resolution);
    }
  }
}
