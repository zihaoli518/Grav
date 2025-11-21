import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Body, PhysicsEngine } from './physics';

export default function GravitySim({
  G,
  numBodies,
  radiusFactor,
  collisionFactor,
}) {
  const groupRef = useRef(null);
  const physicsRef = useRef(null);
  const bodiesRef = useRef([]);
  const meshesRef = useRef([]);
  const lastConfigRef = useRef(null);

  // Initialize on mount and when config changes
  useEffect(() => {
    const currentConfig = `${G}-${numBodies}-${radiusFactor}-${collisionFactor}`;
    
    // Skip if we just initialized with this config
    if (lastConfigRef.current === currentConfig) return;
    lastConfigRef.current = currentConfig;

    console.log('Initializing with config:', { G, numBodies, radiusFactor, collisionFactor });

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
      const mass = Math.random() * 3 + 1;
      const radius = Math.pow(mass, 1 / 3) * radiusFactor;
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 800,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 800
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 1
      );
      
      // --- ADD ANGULAR MOMENTUM ---
      const r = pos.clone();
      r.y = 0;  // force rotation in disk plane
      
      // perpendicular direction in XZ plane
      const tangent = new THREE.Vector3(-r.z, 0, r.x).normalize();
      
      // orbital speed scales with radius
      const spinSpeed = 0.05 * r.length(); // tweak 0.002 → try 0.001–0.01
      
      vel.addScaledVector(tangent, spinSpeed);
      
      // small turbulence so it isn't perfect
      vel.x += (Math.random() - 0.5) * 0.2;
      vel.z += (Math.random() - 0.5) * 0.2;
      vel.y += (Math.random() - 0.5) * 0.05;

      const body = new Body(pos, vel, mass, radius);
      body.color = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
      physics.addBody(body);
      bodies.push(body);

      // Create mesh immediately with unit radius for scaling
      const geometry = new THREE.SphereGeometry(1, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: body.color,
        roughness: 0.7,
        emissive: body.color,
        emissiveIntensity: 0.05*mass,
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
  }, [G, numBodies, radiusFactor, collisionFactor]);

  useFrame(() => {
    if (!physicsRef.current || bodiesRef.current.length === 0) return;

    const dt = 0.016;

    const glowFactor = 0.003;

    physicsRef.current.G = G;
    physicsRef.current.collisionFactor = collisionFactor;
    physicsRef.current.update(dt);

    // Update mesh positions and visibility
    for (let i = 0; i < meshesRef.current.length; i++) {
      const mesh = meshesRef.current[i];
      const body = bodiesRef.current[i];

      // console.log('bodiesr emaining:', meshesRef.current.length)

      if (!body.alive) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        mesh.position.copy(body.pos);
        // Update scale based on new radius
        const initialRadius = Math.pow(body.mass, 1 / 3) * radiusFactor;
        mesh.scale.setScalar(body.radius * radiusFactor);     
        mesh.material.emissiveIntensity = Math.pow(body.mass, 1.3) * glowFactor;
      }

      // if (body.mass > 100) {
      //   console.log('Large body - mass:', body.mass, 'radius:', body.radius, 'scale:', body.radius * body.scaleMultiplier);
      // }
    }
  });

  return <group ref={groupRef} />;
}