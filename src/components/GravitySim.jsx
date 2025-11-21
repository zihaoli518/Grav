import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useMemo } from "react";
import * as physics from "./Physics";

export default function GravitySim() {
  const NUM_BODIES = 1500;

  const MASS_SCALE = 5;

  // initialize bodies into array once 
  const bodies = useMemo(() => {
    const arr = [];
    for (let i = 0; i < NUM_BODIES; i++) {
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 200
      );
      const vel = new THREE.Vector3();
      const mass = Math.random() * MASS_SCALE;
      arr.push({ pos, vel, mass });
    }
    return arr;
  }, []);

  const meshRef = useRef();
  const dummy = new THREE.Object3D();

  useFrame(() => {
    physics.stepPhysics(bodies);

    bodies.forEach((b, i) => {
      const radius = physics.massToRadius(b.mass);
    
      dummy.position.copy(b.pos);
      dummy.scale.set(radius, radius, radius); // 👈 scale by mass
      dummy.updateMatrix();
    
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, NUM_BODIES]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial color="white" />
    </instancedMesh>
  );
}


