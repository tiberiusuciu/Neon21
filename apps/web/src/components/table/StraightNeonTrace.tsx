import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const SEG_MS = 200;
const LINGER_MS = 1_500;
const FADE_MS = 400;

type Props = {
  cardIndices: number[];
  until: number;
};

type Pt = { x: number; y: number };

function measurePoints(
  row: HTMLElement,
  cardIndices: number[]
): { points: Pt[]; width: number; height: number } | null {
  const cards = row.querySelectorAll<HTMLElement>(":scope > .card");
  if (cards.length === 0) return null;
  const rowRect = row.getBoundingClientRect();
  if (rowRect.width <= 0 || rowRect.height <= 0) return null;
  const points: Pt[] = [];
  for (const ci of cardIndices) {
    const el = cards[ci];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    points.push({
      x: r.left - rowRect.left + r.width / 2,
      y: r.top - rowRect.top + r.height / 2,
    });
  }
  return { points, width: rowRect.width, height: rowRect.height };
}

export function StraightNeonTrace({ cardIndices, until }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState<{
    points: Pt[];
    width: number;
    height: number;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [fade, setFade] = useState(false);
  const indexKey = cardIndices.join(",");
  const n = cardIndices.length;
  const drawMs = Math.max(1, n - 1) * SEG_MS;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const row = svg?.parentElement;
    if (!row || n < 2) return;

    const sync = () => {
      const next = measurePoints(row, cardIndices);
      if (next) setLayout(next);
    };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(row);
    return () => ro.disconnect();
  }, [indexKey, n, cardIndices]);

  useEffect(() => {
    if (n < 2 || !layout) return;
    setProgress(0);
    setFade(false);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setProgress(1);
      const fadeAt = Math.max(0, until - Date.now() - FADE_MS);
      const t = window.setTimeout(() => setFade(true), fadeAt);
      return () => window.clearTimeout(t);
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / drawMs);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const fadeTimer = window.setTimeout(
      () => setFade(true),
      drawMs + LINGER_MS
    );

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fadeTimer);
    };
  }, [indexKey, n, until, drawMs, !!layout]);

  const pathD = useMemo(() => {
    if (!layout || layout.points.length < 2) return "";
    return layout.points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
  }, [layout]);

  const nodesReached = layout
    ? Math.min(
        layout.points.length,
        1 + Math.floor(progress * Math.max(n - 1, 1) + 1e-6)
      )
    : 0;

  return (
    <svg
      ref={svgRef}
      className={`seat-straight-neon${fade ? " is-fade" : ""}`}
      viewBox={
        layout ? `0 0 ${layout.width} ${layout.height}` : "0 0 1 1"
      }
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {pathD && (
        <>
          <path
            className="seat-straight-neon-glow"
            d={pathD}
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1 - progress,
            }}
          />
          <path
            className="seat-straight-neon-core"
            d={pathD}
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1 - progress,
            }}
          />
          {layout?.points.map((p, i) =>
            i < nodesReached ? (
              <circle
                key={i}
                className="seat-straight-neon-node"
                cx={p.x}
                cy={p.y}
                r={4.5}
              />
            ) : null
          )}
        </>
      )}
    </svg>
  );
}
