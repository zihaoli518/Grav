import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GPUPhysicsEngine } from "./gpuPhysics";

export default function GravitySim(props) {
  const {
    G,
    numBodies,
    radiusFactor,
    collisionFactor,
    simSpeed = 1,
    initialPattern = "disc",
    spawnDistanceFactor = 30,
  } = props;

  const { gl } = useThree();

  const groupRef = useRef(null);
  const physicsRef = useRef(null);
  const instancedRef = useRef(null);
  const materialRef = useRef(null);
  const lastConfigRef = useRef(null);

  function makePlaceholderPosTex() {
    // Use HalfFloatType for better WebGL2 compatibility
    const data = new Float32Array([0, 0, 0, 1]);
    const tex = new THREE.DataTexture(
      data,
      1,
      1,
      THREE.RGBAFormat,
      THREE.HalfFloatType
    );
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  function addDiskRotation(pos, vel, spinK, turbulence) {
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
        mass: 200,
        radius: Math.abs(Math.cbrt(200)) * radiusFactor,
        pos: new THREE.Vector3(0, 0, 0),
        vel: new THREE.Vector3(0, 0, 0),
      };
    }

    const mass = Math.random() * 5000 + 1;
    const radius = Math.abs(Math.cbrt(mass)) * radiusFactor;

    const angle = Math.random() * Math.PI * 2;
    const a = spawnDistanceFactor;
    const rr = a * Math.sqrt(Math.random());
    const pos = new THREE.Vector3(
      Math.cos(angle) * rr,
      (Math.random() - 0.5) * 0.2,
      Math.sin(angle) * rr
    );

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.2
    );
    addDiskRotation(pos, vel, 0.12, 0.15);

    return { mass, radius, pos, vel };
  }

  useEffect(() => {
    const currentConfig = `${G}-${numBodies}-${radiusFactor}-${collisionFactor}-${initialPattern}-${spawnDistanceFactor}`;
    if (lastConfigRef.current === currentConfig) return;
    lastConfigRef.current = currentConfig;

    console.log("[GravitySim] init", {
      G,
      numBodies,
      radiusFactor,
      collisionFactor,
      spawnDistanceFactor,
      isWebGL2: gl.capabilities?.isWebGL2,
      floatTex: gl.capabilities?.floatFragmentTextures,
      halfFloatTex: gl.capabilities?.halfFloatFragmentTextures,
      maxVertexTextures: gl.capabilities?.maxVertexTextures,
    });

    // clear group
    if (groupRef.current) {
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }
    }

    // DEBUG: always-visible sphere at origin
    {
      const dbgGeo = new THREE.SphereGeometry(3, 16, 16);
      const dbgMat = new THREE.MeshBasicMaterial({ color: "orange" });
      const dbg = new THREE.Mesh(dbgGeo, dbgMat);
      dbg.position.set(0, 0, 0);
      groupRef.current.add(dbg);
      console.log("[GravitySim] added debug hotpink sphere at origin");
    }

    // bodies
    const bodies = [];
    for (let i = 0; i < numBodies; i++) {
      const { mass, radius, pos, vel } = generateBodyStateForIndex(i);
      const color = new THREE.Color().setHSL(Math.random(), 0.7, 0.6);
      bodies.push({ mass, radius, pos, vel, color });
    }

    // physics
    const physics = new GPUPhysicsEngine(
      gl,
      numBodies,
      G,
      radiusFactor,
      collisionFactor
    );
    const ok = physics.init(bodies);
    console.log("[GravitySim] physics.init ok?", ok);
    if (!ok) return;

    physicsRef.current = physics;

    const placeholderTex = makePlaceholderPosTex();
    const posTex = physics.getPositionTexture();
    console.log("[GravitySim] posTex from compute:", posTex);

    const initialTex = posTex || placeholderTex;
    // enforce nearest (sampling exact texel)
    initialTex.minFilter = THREE.NearestFilter;
    initialTex.magFilter = THREE.NearestFilter;
    initialTex.generateMipmaps = false;
    initialTex.needsUpdate = true;

    // instanced mesh
    const geometry = new THREE.SphereGeometry(1, 8, 8);

const material = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: false,
  roughness: 0.7,
  metalness: 0.2,
  emissive: 0x000000,
  emissiveIntensity: 0.2, // we'll add emissive manually in shader
});


    // const material = new THREE.MeshBasicMaterial({
    //   vertexColors: true,
    //   color: 0xffffff,
    // });

    material.userData.initialPosTex = initialTex;

material.onBeforeCompile = (shader) => {
  shader.uniforms.uPosTex = { value: material.userData.initialPosTex };
  shader.uniforms.uTexSize = { value: physics.getTexSize() };
  shader.uniforms.uUseTex = { value: 1.0 };
  shader.uniforms.uGlowStrength = { value: 1.0 }; // tweak live if you want

  const isGLSL3 =
    shader.vertexShader.includes("#version 300 es") ||
    shader.vertexShader.includes("in vec3 position");

  const ATTR = isGLSL3 ? "in" : "attribute";
  const VARYING_OUT = isGLSL3 ? "out" : "varying";
  const VARYING_IN = isGLSL3 ? "in" : "varying";

  // ---- VERTEX: declare attributes + varying in a safe include block
  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `#include <common>
${ATTR} float aIndex;
${ATTR} float aScale;
${ATTR} float aGlow;
${VARYING_OUT} float vGlow;
uniform sampler2D uPosTex;
uniform float uTexSize;
uniform float uUseTex;
`
  );

  // ---- VERTEX: patch begin_vertex
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    `
#include <begin_vertex>
vGlow = aGlow;
transformed *= aScale;

if (uUseTex > 0.5) {
  float x = mod(aIndex, uTexSize);
  float y = floor(aIndex / uTexSize);
  vec2 puv = (vec2(x, y) + 0.5) / vec2(uTexSize, uTexSize);
  vec3 p = texture2D(uPosTex, puv).xyz;
  transformed += p;
}
`
  );

  // ---- FRAGMENT: declare varying + glow strength
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
${VARYING_IN} float vGlow;
uniform float uGlowStrength;
`
  );

  // ---- FRAGMENT: add emissive contribution tinted by instance color
  // In StandardMaterial, "diffuseColor.rgb" contains the base color after vertex colors.
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `
#include <emissivemap_fragment>
#ifdef USE_COLOR
  totalEmissiveRadiance += vColor.rgb * (vGlow * uGlowStrength);
#else
  totalEmissiveRadiance += vec3(1.0) * (vGlow * uGlowStrength);
#endif
`  
);

  material.userData.shader = shader;
};



    material.needsUpdate = true;
    materialRef.current = material;

    const mesh = new THREE.InstancedMesh(geometry, material, numBodies);
    mesh.frustumCulled = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(numBodies * 3),
      3
    );
    mesh.geometry.setAttribute("instanceColor", mesh.instanceColor);
    instancedRef.current = mesh;

    // attributes
    const aIndex = new Float32Array(numBodies);
    const aScale = new Float32Array(numBodies);

    const aGlow = new Float32Array(numBodies);

    const dummy = new THREE.Object3D();

    for (let i = 0; i < numBodies; i++) {
      aIndex[i] = i;
      aScale[i] = bodies[i].radius * 0.15;
      aGlow[i] = Math.min(3.0, 0.00015 * Math.abs(bodies[i].mass)); // tweak

      // DEBUG fallback: spread instances along X so we WILL see them even if shader fails
      // (if shader works, they’ll still get overridden by texture offset)
dummy.position.set(0, 0, 0);
dummy.rotation.set(0, 0, 0);
dummy.scale.set(1, 1, 1);
dummy.updateMatrix();
mesh.setMatrixAt(i, dummy.matrix);


      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, bodies[i].color);
    }

mesh.instanceColor.needsUpdate = true;

    geometry.setAttribute(
      "aIndex",
      new THREE.InstancedBufferAttribute(aIndex, 1)
    );
    geometry.setAttribute(
      "aScale",
      new THREE.InstancedBufferAttribute(aScale, 1)
    );

    geometry.setAttribute(
      "aGlow",
      new THREE.InstancedBufferAttribute(aGlow, 1)
    );

    mesh.instanceMatrix.needsUpdate = true;

    groupRef.current.add(mesh);

    console.log("[GravitySim] added instanced mesh", {
      count: numBodies,
      hasInstanceColor: !!mesh.instanceColor,
      geomAttrs: Object.keys(geometry.attributes),
    });
  }, [
    G,
    numBodies,
    radiusFactor,
    collisionFactor,
    initialPattern,
    spawnDistanceFactor,
    gl,
  ]);

  useFrame((state) => {
    if (!physicsRef.current || !materialRef.current) return;

    if (
      instancedRef.current &&
      Math.floor(state.clock.elapsedTime) !==
        Math.floor(state.clock.elapsedTime - state.clock.getDelta())
    ) {
      console.log(
        "[GravitySim] drawRange",
        instancedRef.current.count,
        "visible",
        instancedRef.current.visible
      );
    }

    // const dt = simSpeed / 200 + 0.005;

    const dtRaw = simSpeed / 200 + 0.005;
    const dt = Math.min(dtRaw, 0.01);
    const subSteps = 2;

    physicsRef.current.setG(G);
    physicsRef.current.setCollisionFactor(collisionFactor);

    for (let k = 0; k < subSteps; k++) {
      physicsRef.current.update(dt / subSteps);
    }

    physicsRef.current.setG(G);
    physicsRef.current.setCollisionFactor(collisionFactor);

    const posTex = physicsRef.current.getPositionTexture();
    const mat = materialRef.current;

    if (!posTex) {
      // log once in a while
      if (Math.floor(state.clock.elapsedTime) % 2 === 0) {
        console.warn("[GravitySim] posTex is null");
      }
      return;
    }

    posTex.minFilter = THREE.NearestFilter;
    posTex.magFilter = THREE.NearestFilter;
    posTex.generateMipmaps = false;

    if (mat.userData.shader) {
      mat.userData.shader.uniforms.uPosTex.value = posTex;
      mat.userData.shader.uniforms.uUseTex.value = 1.0;
      // DEBUG: confirm uniform updates
      if (Math.floor(state.clock.elapsedTime) % 2 === 0) {
        console.log("[GravitySim] updating uPosTex", posTex);
      }
    } else {
      // if this happens, onBeforeCompile never ran
      if (Math.floor(state.clock.elapsedTime) % 2 === 0) {
        console.warn(
          "[GravitySim] shader not ready yet (onBeforeCompile not run)"
        );
      }
    }
  });

  return <group ref={groupRef} />;
}
