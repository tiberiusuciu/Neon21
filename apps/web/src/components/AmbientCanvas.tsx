import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

const DOT_COUNT = 120;
const Y_MIN = -5;
const Y_MAX = 5;
const RISE_SPEED = 0.18;

function SpinningShape() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.12;
  });

  return (
    <mesh ref={ref} rotation={[0.35, 0.2, 0.1]} position={[0, 0.2, -2]}>
      <icosahedronGeometry args={[2.4, 1]} />
      <meshBasicMaterial
        color="#7cffb2"
        wireframe
        transparent
        opacity={0.09}
      />
    </mesh>
  );
}

function RisingDots() {
  const positions = useMemo(() => {
    const arr = new Float32Array(DOT_COUNT * 3);
    for (let i = 0; i < DOT_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14;
      arr[i * 3 + 1] = Y_MIN + Math.random() * (Y_MAX - Y_MIN);
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return arr;
  }, []);

  const speeds = useMemo(() => {
    const arr = new Float32Array(DOT_COUNT);
    for (let i = 0; i < DOT_COUNT; i++) {
      arr[i] = RISE_SPEED * (0.55 + Math.random() * 0.9);
    }
    return arr;
  }, []);

  const pointsRef = useRef<THREE.Points>(null);

  useFrame((_, delta) => {
    const attr = pointsRef.current?.geometry.getAttribute("position");
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < DOT_COUNT; i++) {
      const yi = i * 3 + 1;
      arr[yi] += speeds[i] * delta;
      if (arr[yi] > Y_MAX) {
        arr[yi] = Y_MIN - Math.random() * 0.8;
        arr[i * 3] = (Math.random() - 0.5) * 14;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#ffffff"
        size={0.028}
        sizeAttenuation
        depthWrite={false}
        opacity={0.85}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

function AuthScene() {
  return (
    <>
      <SpinningShape />
      <RisingDots />
    </>
  );
}

export function AmbientCanvas() {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (reduced) return null;

  return (
    <div className="ambient" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <AuthScene />
      </Canvas>
    </div>
  );
}
