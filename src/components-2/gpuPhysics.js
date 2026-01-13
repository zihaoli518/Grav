import * as THREE from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";

export class GPUPhysicsEngine {
  constructor(renderer, numBodies, G, radiusFactor, collisionFactor) {
    this.renderer = renderer;
    this.numBodies = numBodies;
    this.G = G;
    this.radiusFactor = radiusFactor;
    this.collisionFactor = collisionFactor;

    this.gpuCompute = null;
    this.posVar = null;
    this.velVar = null;

    this.texSize = Math.ceil(Math.sqrt(this.numBodies)); // square tex
    this.width = this.texSize;
    this.height = this.texSize;

    this._frame = 0;
    this._mergeEveryNFrames = 30; // ~0.5s at 60fps; tune
    this._mergeDistanceFactor = 5; // 1.0 = touching; >1 = sticky
    this._cpuPos = new Float32Array(this.width * this.height * 4);
    this._cpuVel = new Float32Array(this.width * this.height * 4);

    this._rtReadPos = null;
    this._rtReadVel = null;

    // optional: keep init radii on CPU for merge threshold
    this._cpuRadius = new Float32Array(this.numBodies);
  }

  init(bodiesData) {
    this.bodies = bodiesData;

    // cache radii for merging
    for (let i = 0; i < this.numBodies; i++) {
      this._cpuRadius[i] = bodiesData[i].radius;
    }

    this.gpuCompute = new GPUComputationRenderer(
      this.width,
      this.height,
      this.renderer
    );

    // Position texture: (x,y,z,mass)
    const posTexture = this.gpuCompute.createTexture();
    // Velocity texture: (vx,vy,vz,aliveFlag)
    const velTexture = this.gpuCompute.createTexture();

    const p = posTexture.image.data;
    const v = velTexture.image.data;

    // fill ALL texels (including unused) so shader reads are safe
    for (let t = 0; t < this.width * this.height; t++) {
      const idx = t * 4;
p[idx] = 1e9;
p[idx + 1] = 1e9;
p[idx + 2] = 1e9;
p[idx + 3] = 0;
v[idx] = 0;
v[idx + 1] = 0;
v[idx + 2] = 0;
v[idx + 3] = 0;

    }

    // write bodies into first numBodies texels
    for (let i = 0; i < this.numBodies; i++) {
      const body = this.bodies[i];
      const idx = i * 4;
      p[idx] = body.pos.x;
      p[idx + 1] = body.pos.y;
      p[idx + 2] = body.pos.z;
      p[idx + 3] = body.mass;

      v[idx] = body.vel.x;
      v[idx + 1] = body.vel.y;
      v[idx + 2] = body.vel.z;
      v[idx + 3] = 1.0; // alive
    }

    const common = `
uniform float G;
uniform float dt;
uniform float texSize;

uniform float radiusFactor;
uniform float collisionFactor;

float radiusFromMass(float m) {
  return pow(abs(m), 1.0/3.0) * radiusFactor;
}


vec2 uvFromIndex(float idx) {
  float x = mod(idx, texSize);
  float y = floor(idx / texSize);
  return (vec2(x, y) + 0.5) / vec2(texSize, texSize);
}

vec4 samplePos(float i) { return texture2D(texturePosition, uvFromIndex(i)); }
vec4 sampleVel(float i) { return texture2D(textureVelocity, uvFromIndex(i)); }
`;

    const velShader = `
${common}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float mass = posData.w;

  vec4 velData = texture2D(textureVelocity, uv);
  vec3 vel = velData.xyz;
  float alive = velData.w;

  if (alive < 0.5 || mass <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec3 acc = vec3(0.0);
  float soft = 0.5;

  for (int j = 0; j < ${this.numBodies}; j++) {
    vec4 other = samplePos(float(j));
    float om = other.w;
    if (om <= 0.0) continue;

    vec3 d = other.xyz - pos;
    float dist2 = dot(d, d);

    // radii-based “contact”
    float ra = radiusFromMass(mass);
    float rb = radiusFromMass(om);
    float rColl = (ra + rb) * collisionFactor;

    // softening tied to radius so force doesn’t explode inside bodies
    float soft = max(0.25, rColl * rColl); // tune: 0.25 prevents tiny bodies from being too “hard”
    float r2 = dist2 + soft;

    if (r2 < 1e-6) continue;

    float invR = inversesqrt(r2);
    float invR3 = invR * invR * invR;

    // gravity
    acc += (G * om) * d * invR3;

    // simple repulsion if overlapping (prevents “inside orbit” + reduces fling)
    float dist = sqrt(max(dist2, 1e-9));
    if (dist < rColl) {
      vec3 n = d / dist;
      float penetration = (rColl - dist);
      // springy push out; tune 50.0
      acc += n * (penetration * 50.0);
    }
  }

  vel += acc * dt;
  vel *= 0.9999;

  gl_FragColor = vec4(vel, 1.0);
}
`;

    const posShader = `
${common}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float mass = posData.w;

  vec4 velData = texture2D(textureVelocity, uv);
  vec3 vel = velData.xyz;
  float alive = velData.w;

  if (alive < 0.5 || mass <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  pos += vel * dt;
  gl_FragColor = vec4(pos, mass);
}
`;

    this.velVar = this.gpuCompute.addVariable(
      "textureVelocity",
      velShader,
      velTexture
    );
    this.posVar = this.gpuCompute.addVariable(
      "texturePosition",
      posShader,
      posTexture
    );

    this.velVar.material.uniforms.G = { value: this.G };
    this.velVar.material.uniforms.dt = { value: 0.016 };
    this.velVar.material.uniforms.texSize = { value: this.texSize };

    this.velVar.material.uniforms.radiusFactor = { value: this.radiusFactor };
    this.velVar.material.uniforms.collisionFactor = {
      value: this.collisionFactor,
    };

    this.posVar.material.uniforms.radiusFactor = { value: this.radiusFactor };
    this.posVar.material.uniforms.collisionFactor = {
      value: this.collisionFactor,
    };


    this.posVar.material.uniforms.G = { value: this.G };
    this.posVar.material.uniforms.dt = { value: 0.016 };
    this.posVar.material.uniforms.texSize = { value: this.texSize };

    this.gpuCompute.setVariableDependencies(this.velVar, [
      this.posVar,
      this.velVar,
    ]);
    this.gpuCompute.setVariableDependencies(this.posVar, [
      this.posVar,
      this.velVar,
    ]);

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error("GPU Compute init error:", error);
      return false;
    }

    // readback render targets (RGBA float). GPUComputationRenderer uses float RTs internally.
    this._rtReadPos = this.gpuCompute.getCurrentRenderTarget(this.posVar);
    this._rtReadVel = this.gpuCompute.getCurrentRenderTarget(this.velVar);

    return true;
  }

  update(dt) {
    if (!this.gpuCompute) return false;

    this.velVar.material.uniforms.dt.value = dt;
    this.velVar.material.uniforms.G.value = this.G;

    this.posVar.material.uniforms.dt.value = dt;
    this.posVar.material.uniforms.G.value = this.G;

    this.velVar.material.uniforms.radiusFactor.value = this.radiusFactor;
    this.velVar.material.uniforms.collisionFactor.value = this.collisionFactor;
    this.posVar.material.uniforms.radiusFactor.value = this.radiusFactor;
    this.posVar.material.uniforms.collisionFactor.value = this.collisionFactor;


    this.gpuCompute.compute();

    this._frame++;
    return true;
  }

  // call this after update() (or every frame from the outside)
  maybeMerge() {
    if (!this.gpuCompute) return;
    if (this._frame % this._mergeEveryNFrames !== 0) return;

    // --- read back pos/vel
    const rtPos = this.gpuCompute.getCurrentRenderTarget(this.posVar);
    const rtVel = this.gpuCompute.getCurrentRenderTarget(this.velVar);

    // readRenderTargetPixels reads into a TypedArray (float) when supported
    this.renderer.readRenderTargetPixels(
      rtPos,
      0,
      0,
      this.width,
      this.height,
      this._cpuPos
    );
    this.renderer.readRenderTargetPixels(
      rtVel,
      0,
      0,
      this.width,
      this.height,
      this._cpuVel
    );

    // --- CPU merge on first numBodies only (ignore padded texels)
    this._cpuMergePass();

    // --- write back to BOTH current and alternate ping-pong targets so it persists
    // (GPUComputationRenderer ping-pongs, so we push to both)
    this._pushCPUStateToGPU();
  }

  _cpuMergePass() {
    const cellSize = 2.5; // tune: bigger = fewer cells, more checks; smaller = fewer neighbor checks
    const invCell = 1.0 / cellSize;

    const map = new Map();

    const keyOf = (cx, cy, cz) => cx + "|" + cy + "|" + cz;

    const pos = this._cpuPos;
    const vel = this._cpuVel;

    // build hash
    for (let i = 0; i < this.numBodies; i++) {
      const idx = i * 4;
      const m = pos[idx + 3];
      const alive = vel[idx + 3];
      if (alive < 0.5 || m <= 0.0) continue;

      const x = pos[idx],
        y = pos[idx + 1],
        z = pos[idx + 2];
      const cx = Math.floor(x * invCell);
      const cy = Math.floor(y * invCell);
      const cz = Math.floor(z * invCell);
      const k = keyOf(cx, cy, cz);

      let arr = map.get(k);
      if (!arr) {
        arr = [];
        map.set(k, arr);
      }
      arr.push(i);
    }

    // neighbor offsets
    const neigh = [-1, 0, 1];

    // merge rule: heavier absorbs lighter when distance < (rA + rB) * factor
    for (let i = 0; i < this.numBodies; i++) {
      const ia = i * 4;
      const ma = pos[ia + 3];
      const aliveA = vel[ia + 3];
      if (aliveA < 0.5 || ma <= 0.0) continue;

      const ax = pos[ia],
        ay = pos[ia + 1],
        az = pos[ia + 2];

      const cx = Math.floor(ax * invCell);
      const cy = Math.floor(ay * invCell);
      const cz = Math.floor(az * invCell);

      for (let dx = 0; dx < 3; dx++)
        for (let dy = 0; dy < 3; dy++)
          for (let dz = 0; dz < 3; dz++) {
            const k =
              cx + neigh[dx] + "|" + (cy + neigh[dy]) + "|" + (cz + neigh[dz]);
            const candidates = map.get(k);
            if (!candidates) continue;

            for (let c = 0; c < candidates.length; c++) {
              const j = candidates[c];
              if (j <= i) continue;

              const ib = j * 4;
              const mb = pos[ib + 3];
              const aliveB = vel[ib + 3];
              if (aliveB < 0.5 || mb <= 0.0) continue;

              const bx = pos[ib],
                by = pos[ib + 1],
                bz = pos[ib + 2];

              const dxp = bx - ax,
                dyp = by - ay,
                dzp = bz - az;
              const dist2 = dxp * dxp + dyp * dyp + dzp * dzp;

              // radius from mass (same rule as you used)
              const ra = Math.abs(Math.cbrt(ma)) * this.radiusFactor;
              const rb = Math.abs(Math.cbrt(mb)) * this.radiusFactor;
              const rMerge = (ra + rb) * this._mergeDistanceFactor;

              if (dist2 > rMerge * rMerge) continue;

              // choose winner
              const aWins = ma >= mb;
              const win = aWins ? i : j;
              const lose = aWins ? j : i;

              const iw = win * 4;
              const il = lose * 4;

              const mw = pos[iw + 3];
              const ml = pos[il + 3];
              const total = mw + ml;
              if (total <= 0.0) continue;

              // momentum conserve
              const vwx = vel[iw],
                vwy = vel[iw + 1],
                vwz = vel[iw + 2];
              const vlx = vel[il],
                vly = vel[il + 1],
                vlz = vel[il + 2];

              const newVx = (vwx * mw + vlx * ml) / total;
              const newVy = (vwy * mw + vly * ml) / total;
              const newVz = (vwz * mw + vlz * ml) / total;

              // position: center of mass
              const wx = pos[iw],
                wy = pos[iw + 1],
                wz = pos[iw + 2];
              const lx = pos[il],
                ly = pos[il + 1],
                lz = pos[il + 2];

              const newX = (wx * mw + lx * ml) / total;
              const newY = (wy * mw + ly * ml) / total;
              const newZ = (wz * mw + lz * ml) / total;

              pos[iw] = newX;
              pos[iw + 1] = newY;
              pos[iw + 2] = newZ;
              pos[iw + 3] = total;
              vel[iw] = newVx;
              vel[iw + 1] = newVy;
              vel[iw + 2] = newVz;
              vel[iw + 3] = 1.0;

              // kill loser
              // kill loser (do NOT put at origin)
              pos[il]     = 1e9;
              pos[il + 1] = 1e9;
              pos[il + 2] = 1e9;
              pos[il + 3] = 0.0;  // mass=0 => inactive

              vel[il]     = 0.0;
              vel[il + 1] = 0.0;
              vel[il + 2] = 0.0;
              vel[il + 3] = 0.0;  // alive=0

            }
          }
    }
  }

  _pushCPUStateToGPU() {
    const w = this.width,
      h = this.height;

    // build DataTextures from CPU buffers
    const posTex = new THREE.DataTexture(
      this._cpuPos,
      w,
      h,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    posTex.needsUpdate = true;
    posTex.minFilter = THREE.NearestFilter;
    posTex.magFilter = THREE.NearestFilter;

    const velTex = new THREE.DataTexture(
      this._cpuVel,
      w,
      h,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    velTex.needsUpdate = true;
    velTex.minFilter = THREE.NearestFilter;
    velTex.magFilter = THREE.NearestFilter;

    // push into BOTH ping-pong targets
    const rtPos0 = this.gpuCompute.getCurrentRenderTarget(this.posVar);
    const rtVel0 = this.gpuCompute.getCurrentRenderTarget(this.velVar);

    const rtPos1 = this.gpuCompute.getAlternateRenderTarget(this.posVar);
    const rtVel1 = this.gpuCompute.getAlternateRenderTarget(this.velVar);

    this.gpuCompute.renderTexture(posTex, rtPos0);
    this.gpuCompute.renderTexture(posTex, rtPos1);
    this.gpuCompute.renderTexture(velTex, rtVel0);
    this.gpuCompute.renderTexture(velTex, rtVel1);
  }

  getPositionTexture() {
    if (!this.gpuCompute || !this.posVar) return null;
    return this.gpuCompute.getCurrentRenderTarget(this.posVar).texture;
  }

  getTexSize() {
    return this.texSize;
  }

  setG(v) {
    this.G = v;
  }
  setCollisionFactor(v) {
    this.collisionFactor = v;
  }

  setMergeEveryNFrames(n) {
    this._mergeEveryNFrames = Math.max(1, n | 0);
  }
  setMergeDistanceFactor(v) {
    this._mergeDistanceFactor = v;
  }
}
