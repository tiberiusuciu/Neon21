import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useTheme } from "../lib/theme";
import { AceOfSpadesCard, WIRE_MARK } from "./WireAceCard";

function MarkScene({
  mode,
  animate,
}: {
  mode: "light" | "dark";
  animate: boolean;
}) {
  return (
    <AceOfSpadesCard
      wire={WIRE_MARK[mode]}
      spin={0}
      wobbleX={animate ? 0.14 : 0}
      wobbleSpeed={0.42}
      position={[0, 0, 0]}
      rotation={[0.22, 0.4, 0.03]}
      scale={0.82}
    />
  );
}

export function BrandMark() {
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

  return (
    <span className="brand-mark" aria-hidden>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7.4], fov: 32 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <MarkScene key={resolved} mode={resolved} animate={!reduced} />
      </Canvas>
    </span>
  );
}
