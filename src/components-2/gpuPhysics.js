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

    this._posTexSize = Math.ceil(Math.sqrt(numBodies));  
}

  init(bodiesData) {
    this.bodies = bodiesData;

    this.gpuCompute = new GPUComputationRenderer(
      this._posTexSize,
      this._posTexSize,
      this.renderer
    );

    // --- Position texture: (x,y,z,mass)
    const posTexture = this.gpuCompute.createTexture();
    const p = posTexture.image.data;

    // --- Velocity texture: (vx,vy,vz,alive/unused)
    const velTexture = this.gpuCompute.createTexture();
    const v = velTexture.image.data;

    for (let i = 0; i < this.numBodies; i++) {
      const body = this.bodies[i];

      const x = i % this._posTexSize;
      const y = Math.floor(i / this._posTexSize);
      const idx = (y * this._posTexSize + x) * 4;

      p[idx] = body.pos.x;
      p[idx + 1] = body.pos.y;
      p[idx + 2] = body.pos.z;
      p[idx + 3] = body.mass;

      v[idx] = body.vel.x;
      v[idx + 1] = body.vel.y;
      v[idx + 2] = body.vel.z;
      v[idx + 3] = 1.0;
    }


    // --- Compute shaders
const common = `
uniform float G;
uniform float dt;
uniform float texSize;

vec2 uvFromIndex(float idx) {
  float x = mod(idx, texSize);
  float y = floor(idx / texSize);
  return (vec2(x, y) + 0.5) / vec2(texSize, texSize);
}

vec4 samplePos(float i) {
  return texture2D(texturePosition, uvFromIndex(i));
}

vec4 sampleVel(float i) {
  return texture2D(textureVelocity, uvFromIndex(i));
}
`;


    // Velocity update: v += a*dt
    // (simple softening; add damping to keep it stable)
    const velShader = `
${common}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float mass = posData.w;

  vec3 vel = texture2D(textureVelocity, uv).xyz;

  vec3 acc = vec3(0.0);
  float soft = 0.5; // softening term (stability)

  for (int j = 0; j < ${this.numBodies}; j++) {
    float fj = float(j);

    vec4 other = samplePos(fj);
    vec3 op = other.xyz;
    float om = other.w;

    if (om <= 0.0) continue;
if (mass <= 0.0) { gl_FragColor = vec4(vel, 1.0); return; }


    vec3 d = op - pos;
    float r2 = dot(d, d) + soft;

    // skip self-ish
    if (r2 < 0.001) continue;

    float invR = inversesqrt(r2);
    float invR3 = invR * invR * invR;

    // a += G * om * d / r^3
    acc += (G * om) * d * invR3;
  }

  vel += acc * dt;

  // damping to keep things from exploding
  vel *= 0.999;

  gl_FragColor = vec4(vel, 1.0);
}
`;

    // Position update: x += v*dt (uses updated velocity via dependency ping-pong)
    const posShader = `
${common}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float mass = posData.w;

  vec3 vel = texture2D(textureVelocity, uv).xyz;

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

    // uniforms
    this.velVar.material.uniforms.G = { value: this.G };
    this.velVar.material.uniforms.dt = { value: 0.016 };
    this.velVar.material.uniforms.texSize = { value: this._posTexSize };

    this.posVar.material.uniforms.G = { value: this.G };
    this.posVar.material.uniforms.dt = { value: 0.016 };
    this.posVar.material.uniforms.texSize = { value: this._posTexSize };

    // dependencies (both depend on both)
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

    return true;
  }

  update(dt) {
    if (!this.gpuCompute) return false;

    this.velVar.material.uniforms.dt.value = dt;
    this.velVar.material.uniforms.G.value = this.G;

    this.posVar.material.uniforms.dt.value = dt;
    this.posVar.material.uniforms.G.value = this.G;

    this.gpuCompute.compute();
    return true;
  }

  // The key: return the GPU texture, not CPU data
  getPositionTexture() {
    if (!this.gpuCompute || !this.posVar) return null;
    return this.gpuCompute.getCurrentRenderTarget(this.posVar).texture;
  }

  getTexSize() {
    return this._posTexSize;
  }

  setG(v) {
    this.G = v;
  }

  setCollisionFactor(v) {
    this.collisionFactor = v;
  }
}
