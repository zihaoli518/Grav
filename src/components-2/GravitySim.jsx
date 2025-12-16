import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Body, PhysicsEngine } from './physics';

export default function GravitySim(props) {
  const {
    G,
    numBodies,
    radiusFactor,
    collisionFactor,
    simSpeed = 1,
    // initialPattern controls how non-center bodies are spawned.
    // Default keeps your current behaviour.
    initialPattern = 'disc', // 'disc' | 'box' | future patterns
  } = props;

  const groupRef = useRef(null);
  const physicsRef = useRef(null);
  const bodiesRef = useRef([]);
  const meshesRef = useRef([]);
  const lastConfigRef = useRef(null);

  function randn() {
    // quick gaussian-ish
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  
  function sampleInSphere(radius) {
    // uniform in volume
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
    const spinSpeed = spinK * r.length(); // (matches your style)
    vel.addScaledVector(tangent, spinSpeed);
  
    // turbulence (matches your style)
    vel.x += (Math.random() - 0.5) * turbulence;
    vel.z += (Math.random() - 0.5) * turbulence;
    vel.y += (Math.random() - 0.5) * (turbulence * 0.25);
  }
  
  function generateBodyStateForIndex(i) {
    if (i === 0) {
      const mass = -1;
      const radius = Math.pow(mass, 1 / 3) * radiusFactor;
      const pos = new THREE.Vector3(0, 0, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      return { mass, radius, pos, vel };
    }
  
    const mass = Math.random() * 50 + 1;
    const radius = Math.pow(mass, 1 / 3) * radiusFactor;
  
    let pos, vel;
  
    switch (initialPattern) {
      case 'box': {
        pos = new THREE.Vector3(
          (Math.random() - 0.5) * 800,
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 800
        );
        vel = new THREE.Vector3(
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 1
        );
        addDiskRotation(pos, vel);
        break;
      }
  
      case 'disc': {
        // your current “long tail” disk
        const angle = Math.random() * Math.PI * 2;
        const a = 300;
        const u = Math.random();
        const radiusN = (a * u) / (1 - u);
        pos = new THREE.Vector3(
          Math.cos(angle) * radiusN,
          1,
          Math.sin(angle) * radiusN
        );
        vel = new THREE.Vector3(
          (Math.random() - 0.5) * 1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 1
        );
        addDiskRotation(pos, vel);
        break;
      }
  
      case 'ring': {
        // tight ring: radius ~ R +/- thickness
        const R = 350;
        const thickness = 30;
        const angle = Math.random() * Math.PI * 2;
        const r = R + randn() * thickness;
        pos = new THREE.Vector3(Math.cos(angle) * r, 0.5 * randn(), Math.sin(angle) * r);
        vel = new THREE.Vector3(0, 0, 0);
        addDiskRotation(pos, vel, 0.06, 0.05);
        break;
      }
  
      case 'sphere': {
        // roughly spherical cloud (denser center by gaussian radius)
        const baseR = 450;
        const p = sampleInSphere(baseR);
        // bias toward center a bit more
        p.multiplyScalar(0.35 + 0.65 * Math.exp(-p.length() / 250));
        pos = p;
        vel = new THREE.Vector3(randn() * 0.3, randn() * 0.15, randn() * 0.3);
        // optional: slight overall spin
        addDiskRotation(pos, vel, 0.01, 0.05);
        break;
      }
  
      case 'two_clusters': {
        // two blobs that can merge
        const offset = 250;
        const cluster = Math.random() < 0.5 ? -1 : 1;
        pos = sampleInSphere(180).add(new THREE.Vector3(cluster * offset, 0, 0));
        vel = new THREE.Vector3(cluster * -0.4, 0, 0); // drift toward center
        vel.x += randn() * 0.15;
        vel.y += randn() * 0.05;
        vel.z += randn() * 0.15;
        addDiskRotation(pos, vel, 0.02, 0.05);
        break;
      }
  
      case 'spiral': {
        // logarithmic-ish spiral disk (good for “spiral galaxy” initial look)
        const t = Math.random() * 8 * Math.PI;
        const b = 0.18; // spiral tightness
        const r = 40 + 40 * Math.exp(b * t) * (0.7 + 0.6 * Math.random());
        const arm = Math.random() < 0.5 ? 0 : Math.PI; // 2 arms
        const angle = t + arm;
        pos = new THREE.Vector3(Math.cos(angle) * r, 0.3 * randn(), Math.sin(angle) * r);
        vel = new THREE.Vector3(0, 0, 0);
        addDiskRotation(pos, vel, 0.05, 0.08);
        break;
      }
  
      default: {
        // fallback to your disc
        const angle = Math.random() * Math.PI * 2;
        const a = 300;
        const u = Math.random();
        const radiusN = (a * u) / (1 - u);
        pos = new THREE.Vector3(Math.cos(angle) * radiusN, 1, Math.sin(angle) * radiusN);
        vel = new THREE.Vector3((Math.random() - 0.5) * 1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 1);
        addDiskRotation(pos, vel);
      }
    }
  
    return { mass, radius, pos, vel };
  }
  

  // Initialize on mount and when config changes
  useEffect(() => {
    const currentConfig = `${G}-${numBodies}-${radiusFactor}-${collisionFactor}-${initialPattern}`;

    // Skip if we just initialized with this config
    if (lastConfigRef.current === currentConfig) return;
    lastConfigRef.current = currentConfig;

    console.log('Initializing with config:', {
      G,
      numBodies,
      radiusFactor,
      collisionFactor,
      initialPattern,
    });

    // Clear old meshes
    if (groupRef.current) {
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }
    }
    meshesRef.current = [];

    // Create physics engine
    const physics = new PhysicsEngine(G, radiusFactor, collisionFactor);
    physics.collisionFactor = collisionFactor;
    physicsRef.current = physics;

    // Create bodies
    const bodies = [];
    for (let i = 0; i < numBodies; i++) {
      const { mass, radius, pos, vel } = generateBodyStateForIndex(i);

      const body = new Body(pos, vel, mass, radius);
      body.color = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
      physics.addBody(body);
      bodies.push(body);

      // Create mesh immediately with unit radius for scaling
      const geometry = new THREE.SphereGeometry(1, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: body.color,
        roughness: i === 0 ? 0.1 : 0.7,
        emissive: body.color,
        emissiveIntensity: i === 0 ? 0.1 * mass : 0.05 * mass, // same logic you had
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(pos);
      mesh.scale.setScalar(body.radius * body.scaleMultiplier);

      mesh.userData.body = body;
      if (groupRef.current) {
        groupRef.current.add(mesh);
      }
      meshesRef.current.push(mesh);
    }

    bodiesRef.current = bodies;
    console.log('Initialized with', bodies.length, 'bodies');
  }, [G, numBodies, radiusFactor, collisionFactor, initialPattern]);

  useFrame(() => {
    if (!physicsRef.current || bodiesRef.current.length === 0) return;

    // 1 - 100
    // 0.05 - 2
    const dt = (simSpeed / 200) + 0.03;

    const glowFactor = 0.0001;

    physicsRef.current.G = G;
    physicsRef.current.collisionFactor = collisionFactor;
    physicsRef.current.update(dt);

    // Update mesh positions and visibility
    for (let i = 0; i < meshesRef.current.length; i++) {
      const mesh = meshesRef.current[i];
      const body = bodiesRef.current[i];

      if (!body.alive) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        mesh.position.copy(body.pos);
        // Update scale based on new radius
        const initialRadius = Math.pow(body.mass, 1 / 3) * radiusFactor; // kept for parity
        mesh.scale.setScalar(body.radius * body.scaleMultiplier);
        mesh.material.emissiveIntensity = Math.pow(body.mass, 1.3) * glowFactor;
      }
    }
  });

  return <group ref={groupRef} />;
}
