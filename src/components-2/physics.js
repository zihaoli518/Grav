import * as THREE from 'three'

export class Body {
  constructor(pos, vel, mass, radius) {
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.acc = { x: 0, y: 0, z: 0 };
    this.mass = mass;
    this.density = Math.random();
    this.radius = radius;
    this.scaleMultiplier = 200000000;
    this.alive = true;
  }

  applyForce(fx, fy, fz) {
    this.acc.x += fx / this.mass;
    this.acc.y += fy / this.mass;
    this.acc.z += fz / this.mass;
  }

  update(dt) {
    this.vel.x += this.acc.x * dt;
    this.vel.y += this.acc.y * dt;
    this.vel.z += this.acc.z * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    this.acc.x = 0;
    this.acc.y = 0;
    this.acc.z = 0;
  }
}

export class PhysicsEngine {
  constructor(gravitationalConstant = 5, radiusFactorConstant = 0.88, collisionConstant = 1, ) {
    this.bodies = [];
    this.G = gravitationalConstant;
    this.radiusFactor = radiusFactorConstant;
    this.collisionFactor = collisionConstant;
    this.gridSize = 10;
    this.grid = new Map();
  }

  addBody(body) {
    this.bodies.push(body);
  }

  getGridKey(pos) {
    const x = Math.floor(pos.x / this.gridSize);
    const y = Math.floor(pos.y / this.gridSize);
    const z = Math.floor(pos.z / this.gridSize);
    return `${x},${y},${z}`;
  }

  buildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      if (!body.alive) continue;
      const key = this.getGridKey(body.pos);
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key).push(i);
    }
  }

  getNearbyBodies(body) {
    const key = this.getGridKey(body.pos);
    const [x, y, z] = key.split(',').map(Number);
    const nearby = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborKey = `${x + dx},${y + dy},${z + dz}`;
          if (this.grid.has(neighborKey)) {
            nearby.push(...this.grid.get(neighborKey));
          }
        }
      }
    }
    return nearby;
  }

  update(dt) {
    // Apply gravitational forces
    for (let i = 0; i < this.bodies.length; i++) {
      if (!this.bodies[i].alive) continue;
      for (let j = i + 1; j < this.bodies.length; j++) {
        if (!this.bodies[j].alive) continue;
        this.applyGravitation(this.bodies[i], this.bodies[j]);
      }
    }

    // Update positions
    for (let i = 0; i < this.bodies.length; i++) {
      if (!this.bodies[i].alive) continue;
      this.bodies[i].update(dt);
    }

    // Build spatial grid
    this.buildGrid();

    // Check collisions using grid
    const collisions = new Set();
    for (let i = 0; i < this.bodies.length; i++) {
      if (!this.bodies[i].alive) continue;
      const nearby = this.getNearbyBodies(this.bodies[i]);

      for (const j of nearby) {
        if (i >= j || !this.bodies[j].alive) continue;
        if (this.checkCollision(this.bodies[i], this.bodies[j])) {
          const key = i < j ? `${i},${j}` : `${j},${i}`;
          collisions.add(key);
        }
      }
    }

    // Resolve collisions
    for (const collision of collisions) {
      const [i, j] = collision.split(',').map(Number);
      if (this.bodies[i].alive && this.bodies[j].alive) {
        this.resolveCollision(this.bodies[i], this.bodies[j]);
      }
    }
  }

  applyGravitation(b1, b2) {
    const dx = b2.pos.x - b1.pos.x;
    const dy = b2.pos.y - b1.pos.y;
    const dz = b2.pos.z - b1.pos.z;

    const distSq = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(distSq);

    if (dist < 0.1) return;

    const force = (this.G * b1.mass * b2.mass) / distSq;
    const fx = (force * dx) / dist;
    const fy = (force * dy) / dist;
    const fz = (force * dz) / dist;

    b1.applyForce(fx, fy, fz);
    b2.applyForce(-fx, -fy, -fz);
  }

  checkCollision(b1, b2) {
    const dx = b2.pos.x - b1.pos.x;
    const dy = b2.pos.y - b1.pos.y;
    const dz = b2.pos.z - b1.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < (b1.radius + b2.radius) * this.collisionFactor;
  }

  resolveCollision(b1, b2) {
    // Save old masses for momentum calculation
    const m1 = b1.mass;
    const m2 = b2.mass;
    const totalMass = m1 + m2;

    // Combine bodies: larger absorbs smaller
    if (m1 >= m2) {
      // b1 absorbs b2
      b1.mass = totalMass;
      b1.radius = Math.pow(b1.mass, 1 / 3) * this.radiusFactor;
      b1.vel.x = (b1.vel.x * m1 + b2.vel.x * m2) / totalMass;
      b1.vel.y = (b1.vel.y * m1 + b2.vel.y * m2) / totalMass;
      b1.vel.z = (b1.vel.z * m1 + b2.vel.z * m2) / totalMass;
      b2.alive = false;
    } else {
      // b2 absorbs b1
      b2.mass = totalMass;
      b2.radius = Math.pow(b2.mass, 1 / 3) * this.radiusFactor;
      b2.vel.x = (b2.vel.x * m2 + b1.vel.x * m1) / totalMass;
      b2.vel.y = (b2.vel.y * m2 + b1.vel.y * m1) / totalMass;
      b2.vel.z = (b2.vel.z * m2 + b1.vel.z * m1) / totalMass;
      b1.alive = false;
    }
  }
}