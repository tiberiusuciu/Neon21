import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export const WIRE = {
  dark: {
    color: "#7cffb2",
    card: 0.24,
    spadeFront: 0.28,
    spadeBack: 0.16,
    letter: 0.26,
    pip: 0.22,
  },
  light: {
    color: "#00c853",
    card: 0.92,
    spadeFront: 0.95,
    spadeBack: 0.55,
    letter: 0.9,
    pip: 0.85,
  },
} as const;

/** Stronger lines for the tiny navbar mark. */
export const WIRE_MARK = {
  dark: {
    color: "#7cffb2",
    card: 0.95,
    spadeFront: 1,
    spadeBack: 0.55,
    letter: 0.95,
    pip: 0.9,
  },
  light: {
    color: "#00c853",
    card: 1,
    spadeFront: 1,
    spadeBack: 0.65,
    letter: 1,
    pip: 0.95,
  },
} as const;

export type WirePalette = {
  color: string;
  card: number;
  spadeFront: number;
  spadeBack: number;
  letter: number;
  pip: number;
};

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

type AceProps = {
  wire: WirePalette;
  spin?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
};

export function AceOfSpadesCard({
  wire,
  spin = 0.12,
  position = [0, 0.1, -2.2],
  rotation = [0.32, 0.45, 0.06],
  scale = 1.05,
}: AceProps) {
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
    if (!group.current || spin === 0) return;
    group.current.rotation.y += delta * spin;
  });

  return (
    <group ref={group} rotation={rotation} position={position} scale={scale}>
      <lineSegments geometry={cardEdges}>
        <lineBasicMaterial color={wire.color} transparent opacity={wire.card} />
      </lineSegments>
      <lineLoop geometry={spadeFront}>
        <lineBasicMaterial
          color={wire.color}
          transparent
          opacity={wire.spadeFront}
        />
      </lineLoop>
      <lineLoop geometry={spadeBack}>
        <lineBasicMaterial
          color={wire.color}
          transparent
          opacity={wire.spadeBack}
        />
      </lineLoop>
      <lineSegments geometry={aTop}>
        <lineBasicMaterial
          color={wire.color}
          transparent
          opacity={wire.letter}
        />
      </lineSegments>
      <lineSegments geometry={aBot}>
        <lineBasicMaterial
          color={wire.color}
          transparent
          opacity={wire.letter}
        />
      </lineSegments>
      <lineLoop geometry={pipTop}>
        <lineBasicMaterial color={wire.color} transparent opacity={wire.pip} />
      </lineLoop>
      <lineLoop geometry={pipBot}>
        <lineBasicMaterial color={wire.color} transparent opacity={wire.pip} />
      </lineLoop>
    </group>
  );
}
