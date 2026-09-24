import { useEffect, useMemo, useState, type CSSProperties } from "react";

const COLORS = [
  "#ffe9a8",
  "#f0c674",
  "#ff6b9d",
  "#c89bff",
  "#7cffb2",
  "#5ee1ff",
  "#ff8a5c",
  "#fffef8",
  "#a86cff",
  "#7cffd4",
] as const;

type Props = {
  /** Epoch ms; FX runs while Date.now() < until. */
  until: number | null;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
}

/** Full-table 100% jackpot celebration — confetti, glow, multicolor rain. */
export function JackpotWinFx({ until }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const active = until != null && now < until && !prefersReducedMotion();

  useEffect(() => {
    if (until == null || Date.now() >= until) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [until]);

  const rain = useMemo(
    () =>
      Array.from({ length: 72 }, (_, i) => ({
        id: `r${i}`,
        left: `${(i * 13.7) % 100}%`,
        delay: `${(i * 0.09) % 3.2}s`,
        dur: `${2.4 + (i % 6) * 0.35}s`,
        size: `${2 + (i % 4)}px`,
        color: COLORS[i % COLORS.length]!,
        drift: `${((i % 5) - 2) * 18}px`,
      })),
    []
  );

  const confetti = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: `c${i}`,
        left: `${(i * 17.3 + 3) % 100}%`,
        delay: `${(i * 0.07) % 2.8}s`,
        dur: `${3.2 + (i % 5) * 0.4}s`,
        w: `${4 + (i % 3) * 2}px`,
        h: `${6 + (i % 4) * 2}px`,
        color: COLORS[(i * 3) % COLORS.length]!,
        rot: `${(i * 47) % 360}deg`,
        spin: i % 2 === 0 ? 1 : -1,
      })),
    []
  );

  const orbs = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: `o${i}`,
        left: `${8 + (i * 9.5) % 84}%`,
        top: `${10 + (i * 13) % 70}%`,
        delay: `${(i * 0.4) % 2.5}s`,
        dur: `${3.5 + (i % 4) * 0.6}s`,
        color: COLORS[(i * 2) % COLORS.length]!,
        size: `${48 + (i % 4) * 28}px`,
      })),
    []
  );

  if (!active) return null;

  const remaining = until != null ? Math.max(0, until - now) : 0;

  return (
    <div
      className="jackpot-win-fx"
      aria-hidden
      style={{ ["--jp-remain" as string]: `${remaining}ms` }}
    >
      <div className="jackpot-win-glow" />
      <div className="jackpot-win-flash" />
      {orbs.map((o) => (
        <span
          key={o.id}
          className="jackpot-win-orb"
          style={
            {
              left: o.left,
              top: o.top,
              width: o.size,
              height: o.size,
              ["--c"]: o.color,
              animationDelay: o.delay,
              animationDuration: o.dur,
            } as CSSProperties
          }
        />
      ))}
      {rain.map((p) => (
        <span
          key={p.id}
          className="jackpot-win-rain"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.size,
              ["--c"]: p.color,
              ["--drift"]: p.drift,
              animationDelay: p.delay,
              animationDuration: p.dur,
            } as CSSProperties
          }
        />
      ))}
      {confetti.map((c) => (
        <span
          key={c.id}
          className="jackpot-win-confetti"
          style={
            {
              left: c.left,
              width: c.w,
              height: c.h,
              background: c.color,
              ["--spin"]: String(c.spin),
              ["--rot0"]: c.rot,
              animationDelay: c.delay,
              animationDuration: c.dur,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
