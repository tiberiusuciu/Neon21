import { useMemo, type CSSProperties } from "react";
import { useGameSocket } from "../lib/SocketProvider";

const PARTICLE_COUNT = 18;

/** Edge particles while Golden Hour is live. Banner lives in page chrome (table/lobby). */
export function GoldenHourFx() {
  const { goldenHour } = useGameSocket();
  const active = goldenHour?.active === true;

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        side: i % 2 === 0 ? "left" : "right",
        top: `${6 + ((i * 17) % 88)}%`,
        delay: `${(i * 0.37) % 4.2}s`,
        dur: `${5.5 + (i % 5) * 0.7}s`,
        size: `${2 + (i % 3)}px`,
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="golden-hour-fx" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className={`golden-hour-particle golden-hour-particle-${p.side}`}
          style={
            {
              top: p.top,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.dur,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
