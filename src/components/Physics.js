import * as THREE from "three";

const G = 1.0;
const dt = 0.01;
const SOFTENING = 0.1;
const COLLISION_DISTANCE = 2.0;

const MASS_SIZE_BASE = 0.5;          // minimum size
const MASS_SCALE = 0.2;         // how much size grows with mass

function stepPhysics(bodies) {
  const N = bodies.length;
  const acc = new Array(N).fill(null).map(() => new THREE.Vector3());

  // Gravity
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const bi = bodies[i];
      const bj = bodies[j];

      const dir = new THREE.Vector3().subVectors(bj.pos, bi.pos);
      const distSq = dir.lengthSq() + SOFTENING;
      const dist = Math.sqrt(distSq);
      const invDist3 = 1 / (distSq * dist);

      const f = dir.multiplyScalar(G * bi.mass * bj.mass * invDist3);
      acc[i].addScaledVector(f, 1 / bi.mass);
      acc[j].addScaledVector(f, -1 / bj.mass);
    }
  }

  // Integrate
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].vel.addScaledVector(acc[i], dt);
    bodies[i].pos.addScaledVector(bodies[i].vel, dt);
  }

  // Collision merge (safe version)
  for (let i = bodies.length - 1; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      const bi = bodies[i];
      const bj = bodies[j];
      if (bi.pos.distanceTo(bj.pos) < COLLISION_DISTANCE) {
        // Merge j into i
        const total = bi.mass + bj.mass;

        // Momentum conservation
        bi.vel.multiplyScalar(bi.mass)
          .addScaledVector(bj.vel, bj.mass)
          .divideScalar(total);

        bi.mass = total;

        // bodies.splice(j, 1);
        break;
      }
    }
  }
}

function massToRadius(mass) {
  return MASS_SIZE_BASE + MASS_SCALE * Math.cbrt(mass); // cube root so volume ~ mass
}


export {
  stepPhysics,
  massToRadius
}