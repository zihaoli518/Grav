import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GPUPhysicsEngine } from './gpuPhysics';

export default function GravitySim(props) {
  const {
    G,
    numBodies,
    radiusFactor,
    collisionFactor,
    simSpeed = 1,
    initialPattern = 'disc',
  } = props;

  const { gl } = useThree();
  const groupRef = useRef(null);
  const physicsRef = useRef(null);
  const bodiesRef = useRef([]);
  const meshesRef = useRef([]);
  const lastConfigRef = useRef(null);

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function sampleInSphere(radius) {
    const u = Math.random();
    const r = radius * Math.cbrt(u);
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = 2 * Math.PI * Math.random();
    return new THREE.Vector3(
      r * Math.sin(theta) * Math.cos(phi),
      r * Math.cos(theta),
      r * Math.sin(theta) * Math.sin(phi)
    );
  }

  function addDiskRotation(pos, vel, spinK = 0.05, turbulence = 0.2) {
    const r = pos.clone();
    r.y = 0;
    const tangent = new THREE.Vector3(-r.z, 0, r.x);
    if (tangent.lengthSq() > 1e-8) tangent.normalize();
    const spinSpeed = spinK * r.length();
    vel.addScaledVector(tangent, spinSpeed);
    vel.x += (Math.random() - 0.5) * turbulence;
    vel.z += (Math.random() - 0.5) * turbulence;
    vel.y += (Math.random() - 0.5) * (turbulence * 0.25);
  }

  function generateBodyStateForIndex(i) {
    if (i === 0) {
      return {
        mass: -1,
        radius: Math.pow(-1, 1 / 3) * radiusFactor,
        pos: new THREE.Vector3(0, 0, 0),
        vel: new THREE.Vector3(0, 0, 0),
      };
    }

    const mass = Math.random() * 50 + 1;
    const radius = Math.pow(mass, 1 / 3) * radiusFactor;
    let pos, vel;

    const angle = Math.random() * Math.PI * 2;
    const a = 300;
    const u = Math.random();
    const radiusN = (a * u) / (1 - u);
    pos = new THREE.Vector3(Math.cos(angle) * radiusN, 1, Math.sin(angle) * radiusN);
    vel = new THREE.Vector3((Math.random() - 0.5) * 1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 1);
    addDiskRotation(pos, vel);

    return { mass, radius, pos, vel };
  }

  // Initialize on mount and when config changes
  useEffect(() => {
    const currentConfig = `${G}-${numBodies}-${radiusFactor}-${collisionFactor}-${initialPattern}`;

    if (lastConfigRef.current === currentConfig) return;
    lastConfigRef.current = currentConfig;

    console.log('Initializing GPU physics with:', { G, numBodies, radiusFactor, collisionFactor });

    // Clear old meshes
    if (groupRef.current) {
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }
    }
    meshesRef.current = [];

    // Create body data
    const bodies = [];
    for (let i = 0; i < numBodies; i++) {
      const { mass, radius, pos, vel } = generateBodyStateForIndex(i);
      const body = {
        pos: pos.clone(),
        vel: vel.clone(),
        mass,
        radius,
        alive: true,
      };
      body.color = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
      bodies.push(body);
    }

    // Create GPU physics engine
    const physics = new GPUPhysicsEngine(gl, numBodies, G, radiusFactor, collisionFactor);
    physics.init(bodies);
    physicsRef.current = physics;
    bodiesRef.current = bodies;

    // Create meshes
    for (let i = 0; i < numBodies; i++) {
      const body = bodies[i];
      const geometry = new THREE.SphereGeometry(1, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: body.color,
        roughness: 0.7,
        emissive: body.color,
        emissiveIntensity: 0.05 * Math.abs(body.mass),
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(body.pos);
      mesh.scale.setScalar(body.radius * 2000000);
      mesh.userData.bodyIndex = i;
      groupRef.current.add(mesh);
      meshesRef.current.push(mesh);
    }

    console.log('Simulation initialized with', numBodies, 'bodies');
  }, [G, numBodies, radiusFactor, collisionFactor, initialPattern, gl]);

  useFrame(() => {
    if (!physicsRef.current || bodiesRef.current.length === 0) return;

    const dt = (simSpeed / 200) + 0.03;

    // Update physics engine parameters
    physicsRef.current.setG(G);
    physicsRef.current.setCollisionFactor(collisionFactor);

    // Run GPU computation
    physicsRef.current.update(dt);

    // Get position data from GPU
    const posData = physicsRef.current.getPositionData();

    // Update mesh positions
    for (let i = 0; i < meshesRef.current.length; i++) {
      const mesh = meshesRef.current[i];
      const body = bodiesRef.current[i];
      const idx = i * 4;

      const x = posData[idx];
      const y = posData[idx + 1];
      const z = posData[idx + 2];

      mesh.position.set(x, y, z);
      mesh.scale.setScalar(body.radius * 2000000);

      // Debug: log first body position
      if (i === 0) {
        console.log('Body 0 pos:', x, y, z);
      }
    }
  });

  return <group ref={groupRef} />;
}