import {useState} from 'react';
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import './App.css';

import GravitySim from "./components-2/GravitySim";
import UserInput from "./components-2/UserInput";

import {Box} from '@mui/material';


export default function App() {
  const [G, setG] = useState(8);
  const [numBodies, setNumBodies] = useState(900);
  const [radiusFactor, setRadiusFactor] = useState(0.88);
  const [collisionFactor, setCollisionFactor] = useState(1);
  const [spawnDistanceFactor, setSpawnDistanceFactor] = useState(200);

  return (
    <Box sx={{height: '100%', width: '100%'}}>


    <UserInput
      G={G}
      setG={setG}
      numBodies={numBodies}
      setNumBodies={setNumBodies}
      radiusFactor={radiusFactor}
      setRadiusFactor={setRadiusFactor}
      collisionFactor={collisionFactor}
      setCollisionFactor={setCollisionFactor}
    />

    <Canvas
      camera={{
        position: [0, 0, 80],
        fov: 35,
        near: 0.1,
        far: 20000,   // or even 10000
      }}      
      gl={{ disableVertexArrayObjects: true }}
    >
      {/* Soft ambient */}
      <ambientLight intensity={0.35} />

      {/* Main light */}
      <directionalLight
        intensity={1.8}
        position={[30, 50, 30]}
      />

      {/* Fill light */}
      <directionalLight
        intensity={0.8}
        position={[-30, -20, 10]}
      />

      {/* Geometry first */}
      <GravitySim
        G={G}
        numBodies={numBodies}
        radiusFactor={radiusFactor}
        collisionFactor={collisionFactor}
        spawnDistanceFactor={spawnDistanceFactor}
      />

      {/* Controls last */}
      <OrbitControls />
    </Canvas>
    </Box>
  );
}
