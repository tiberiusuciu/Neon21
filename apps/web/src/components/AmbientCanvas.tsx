import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

const DOT_COUNT = 120;
const Y_MIN = -5;
const Y_MAX = 5;
const RISE_SPEED = 0.18;

function makeSpadeShape(scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.95 * scale);
  s.bezierCurveTo(
    0.18 * scale,
    0.55 * scale,
    0.82 * scale,
    0.38 * scale,
    0.82 * scale,
    -0.02 * scale
  );
  s.bezierCurveTo(
    0.82 * scale,
    -0.32 * scale,
    0.38 * scale,
    -0.42 * scale,
    0.14 * scale,
    -0.32 * scale
  );
  s.lineTo(0.32 * scale, -0.92 * scale);
  s.lineTo(0, -0.68 * scale);
  s.lineTo(-0.32 * scale, -0.92 * scale);
  s.lineTo(-0.14 * scale, -0.32 * scale);
  s.bezierCurveTo(
    -0.38 * scale,
    -0.42 * scale,
    -0.82 * scale,
    -0.32 * scale,
    -0.82 * scale,
    -0.02 * scale
  );
  s.bezierCurveTo(
    -0.82 * scale,
    0.38 * scale,
    -0.18 * scale,
    0.55 * scale,
    0,
    0.95 * scale
  );
  return s;
}

function shapeToLineGeo(shape: THREE.Shape, z = 0, divisions = 72) {
  const pts = shape.getPoints(divisions).map((p) => new THREE.Vector3(p.x, p.y, z));
  if (pts.length > 0) pts.push(pts[0].clone());
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function letterALineGeo(scale: number, z: number) {
  const h = 0.28 * scale;
  const w = 0.18 * scale;
  const pts = [
    new THREE.Vector3(-w, -h, z),
    new THREE.Vector3(0, h, z),
    new THREE.Vector3(w, -h, z),
    new THREE.Vector3(w * 0.55, -h * 0.15, z),
    new THREE.Vector3(-w * 0.55, -h * 0.15, z),
  ];
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    pts[0].x, pts[0].y, pts[0].z,
    pts[1].x, pts[1].y, pts[1].z,
    pts[1].x, pts[1].y, pts[1].z,
    pts[2].x, pts[2].y, pts[2].z,
    pts[3].x, pts[3].y, pts[3].z,
    pts[4].x, pts[4].y, pts[4].z,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geo;
}

function AceOfSpadesCard() {
  const group = useRef<THREE.Group>(null);

  const { cardEdges, spadeFront, spadeBack, aTop, aBot, pipTop, pipBot } =
    useMemo(() => {
      const box = new THREE.BoxGeometry(2.15, 3.05, 0.07);
      const cardEdges = new THREE.EdgesGeometry(box);
      box.dispose();

      const spadeFront = shapeToLineGeo(makeSpadeShape(0.72), 0.04);
      const spadeBack = shapeToLineGeo(makeSpadeShape(0.72), -0.04);

      const aTop = letterALineGeo(1, 0.04);
      aTop.translate(-0.78, 1.15, 0);
      const aBot = letterALineGeo(1, 0.04);
      aBot.rotateZ(Math.PI);
      aBot.translate(0.78, -1.15, 0);

      const pipTop = shapeToLineGeo(makeSpadeShape(0.16), 0.04);
      pipTop.translate(-0.78, 0.78, 0);
      const pipBot = shapeToLineGeo(makeSpadeShape(0.16), 0.04);
      pipBot.rotateZ(Math.PI);
      pipBot.translate(0.78, -0.78, 0);

      return { cardEdges, spadeFront, spadeBack, aTop, aBot, pipTop, pipBot };
    }, []);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.12;
  });

  return (
    <group
      ref={group}
      rotation={[0.32, 0.45, 0.06]}
      position={[0, 0.1, -2.2]}
      scale={1.05}
    >
      <lineSegments geometry={cardEdges}>
        <lineBasicMaterial color="#7cffb2" transparent opacity={0.24} />
      </lineSegments>
      <lineLoop geometry={spadeFront}>
        <lineBasicMaterial color="#7cffb2" transparent opacity={0.28} />
      </lineLoop>
      <lineLoop geometry={spadeBack}>
        <lineBasicMaterial color="#7cffb2" transparent opacity={0.16} />
      </lineLoop>
      <lineSegments geometry={aTop}>
        <lineBasicMaterial color="#7cffb2" transparent opacity={0.26} />
      </lineSegments>
      <lineSegments geometry={aBot}>
        <lineBasicMaterial color="#7cffb2" transparent opacity={0.26} />
      </lineSegments>
      <lineLoop geometry={pipTop}>
        <lineBasicMaterial color="#7cffb2" transparent opacity={0.22} />
      </lineLoop>
      <lineLoop geometry={pipBot}>
        <lineBasicMaterial color="#7cffb2" transparent opacity={0.22} />
      </lineLoop>
    </group>
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
      <AceOfSpadesCard />
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
