import { useEffect, useState } from "react";

/** Matches `.card` width + `.card-row` gap in global.css. */
const CARD_W = 2.35;
const CARD_H = 3.25;
const GAP = 0.2;
const SEG_MS = 180;
const LINGER_MS = 1_500;
const FADE_MS = 400;

type Props = {
  cardIndices: number[];
  until: number;
};

export function StraightNeonTrace({ cardIndices, until }: Props) {
  const n = cardIndices.length;
  const [drawn, setDrawn] = useState(0);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (n < 2) return;
    setDrawn(0);
    setFade(false);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDrawn(n - 1);
      const fadeAt = Math.max(0, until - Date.now() - FADE_MS);
      const t = window.setTimeout(() => setFade(true), fadeAt);
      return () => window.clearTimeout(t);
    }
    const timers: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      timers.push(
        window.setTimeout(() => setDrawn(i + 1), (i + 1) * SEG_MS)
      );
    }
    const lingerStart = (n - 1) * SEG_MS + LINGER_MS;
    timers.push(window.setTimeout(() => setFade(true), lingerStart));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [cardIndices.join(","), until, n]);

  if (n < 2) return null;

  const points = cardIndices.map((ci) => {
    const x = ci * (CARD_W + GAP) + CARD_W / 2;
    const y = CARD_H / 2;
    return { x, y };
  });
  const width = Math.max(...cardIndices) * (CARD_W + GAP) + CARD_W;
  const height = CARD_H;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const progress = drawn / Math.max(n - 1, 1);

  return (
    <svg
      className={`seat-straight-neon${fade ? " is-fade" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      width={`${width}rem`}
      height={`${height}rem`}
      aria-hidden
    >
      <path
        className="seat-straight-neon-glow"
        d={d}
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 1 - progress,
        }}
      />
      <path
        className="seat-straight-neon-core"
        d={d}
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 1 - progress,
        }}
      />
      {points.map((p, i) =>
        i <= drawn ? (
          <circle
            key={i}
            className="seat-straight-neon-node"
            cx={p.x}
            cy={p.y}
            r={0.18}
          />
        ) : null
      )}
    </svg>
  );
}
