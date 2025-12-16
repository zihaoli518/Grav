import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

export class GPUPhysicsEngine {
  constructor(renderer, numBodies, G = 5, radiusFactor = 0.88, collisionFactor = 1) {
    this.renderer = renderer;
    this.numBodies = numBodies;
    this.G = G;
    this.radiusFactor = radiusFactor;
    this.collisionFactor = collisionFactor;
    this.bodies = [];
    this.posDataRef = null;
    this.gpuCompute = null;
    this.posVar = null;
  }

  /**
   * Initialize GPU compute renderer and setup bodies
   * @param {Array} bodiesData - Array of body objects with {pos, vel, mass, radius, color}
   */
  init(bodiesData) {
    this.bodies = bodiesData;

    // Create GPU Computation Renderer
    this.gpuCompute = new GPUComputationRenderer(this.numBodies, 1, this.renderer);

    // Create position texture (stores x, y, z, mass)
    const posTexture = this.gpuCompute.createTexture();
    const posArray = posTexture.image.data;

    // Fill texture with initial body data
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      const idx = i * 4;

      posArray[idx] = body.pos.x;
      posArray[idx + 1] = body.pos.y;
      posArray[idx + 2] = body.pos.z;
      posArray[idx + 3] = body.mass;
    }

    posTexture.needsUpdate = true;
    this.posDataRef = posArray;

    // Create the compute shader
    const computeShader = `
uniform float G;
uniform float dt;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  vec4 posData = texture2D(texturePosition, uv);
  vec3 pos = posData.xyz;
  float mass = posData.w;
  
  vec3 acc = vec3(0.0);
  
  // Calculate gravity from all bodies
  for (int j = 0; j < ${this.numBodies}; j++) {
    float sampleX = (float(j) + 0.5) / ${this.numBodies.toFixed(1)};
    vec2 sampleUV = vec2(sampleX, 0.5);
    
    vec4 otherPos = texture2D(texturePosition, sampleUV);
    vec3 otherPos3 = otherPos.xyz;
    float otherMass = otherPos.w;
    
    vec3 delta = otherPos3 - pos;
    float distSq = dot(delta, delta);
    
    if (distSq < 0.01) continue;
    
    float dist = sqrt(distSq);
    float force = (G * mass * otherMass) / distSq;
    acc += (force / mass / dist) * delta;
  }
  
  // Verlet integration: pos += acc * dt^2
  vec3 newPos = pos + acc * dt * dt;
  
  gl_FragColor = vec4(newPos, mass);
}
    `;

    // Add the compute variable
    this.posVar = this.gpuCompute.addVariable('texturePosition', computeShader, posTexture);
    this.posVar.material.uniforms.G = { value: this.G };
    this.posVar.material.uniforms.dt = { value: 0.016 };

    // Set dependencies
    this.gpuCompute.setVariableDependencies(this.posVar, [this.posVar]);

    // Initialize GPU compute
    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error('GPU Compute initialization error:', error);
      return false;
    }

    console.log('GPU Physics Engine initialized with', this.numBodies, 'bodies');
    return true;
  }

  /**
   * Update physics simulation
   * @param {number} dt - Delta time
   */
  update(dt) {
    if (!this.gpuCompute || !this.posVar) return false;

    // Update uniforms
    this.posVar.material.uniforms.dt.value = dt;
    this.posVar.material.uniforms.G.value = this.G;

    // Run GPU computation
    this.gpuCompute.compute();

    return true;
  }

  /**
   * Get current position data from GPU
   * @returns {Float32Array} Position data array
   */
  getPositionData() {
    return this.posDataRef;
  }

  /**
   * Set gravitational constant
   */
  setG(value) {
    this.G = value;
  }

  /**
   * Set collision factor
   */
  setCollisionFactor(value) {
    this.collisionFactor = value;
  }
}