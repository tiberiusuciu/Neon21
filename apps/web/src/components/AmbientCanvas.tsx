import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "../lib/theme";
import { AceOfSpadesCard, WIRE } from "./WireAceCard";

const DOT_COUNT = 120;
const Y_MIN = -5;
const Y_MAX = 5;
const RISE_SPEED = 0.18;

const DOT = {
  dark: {
    color: "#ffffff",
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    size: 0.028,
  },
  light: {
    color: "#00e676",
    opacity: 0.55,
    blending: THREE.NormalBlending,
    size: 0.034,
  },
} as const;

function RisingDots({ mode }: { mode: "light" | "dark" }) {
  const dot = DOT[mode];
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
        color={dot.color}
        size={dot.size}
        sizeAttenuation
        depthWrite={false}
        opacity={dot.opacity}
        blending={dot.blending}
      />
    </Points>
  );
}

function AuthScene({ mode }: { mode: "light" | "dark" }) {
  return (
    <>
      <AceOfSpadesCard wire={WIRE[mode]} />
      <RisingDots mode={mode} />
    </>
  );
}

export function AmbientCanvas() {
  const { resolved } = useTheme();
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
    <div className="ambient" aria-hidden data-mode={resolved}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <AuthScene key={resolved} mode={resolved} />
      </Canvas>
    </div>
  );
}
