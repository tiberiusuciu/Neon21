import type { CSSProperties } from "react";

/** $25, $50, $100, $250, $500, $1k, $5k */
export const BET_AURA_THRESHOLDS_CENTS = [
  2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 500_000,
] as const;

export type BetAuraTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const PARTICLE_COUNT = 48;
const BURST_COUNT = 14;

export function betAuraTier(cents: number): BetAuraTier {
  if (cents >= 500_000) return 7;
  if (cents >= 100_000) return 6;
  if (cents >= 50_000) return 5;
  if (cents >= 25_000) return 4;
  if (cents >= 10_000) return 3;
  if (cents >= 5_000) return 2;
  if (cents >= 2_500) return 1;
  return 0;
}

export function seatStakeCents(seat: {
  pendingBetCents: number;
  hands: { betCents: number }[];
}): number {
  if (seat.pendingBetCents > 0) return seat.pendingBetCents;
  return seat.hands.reduce((sum, h) => sum + h.betCents, 0);
}

function borderEmit(t: number): {
  x: number;
  y: number;
  dx: number;
  dy: number;
} {
  const p = ((t % 1) + 1) % 1;
  const edge = p * 4;
  if (edge < 1) return { x: edge, y: 0, dx: 0, dy: -1 };
  if (edge < 2) return { x: 1, y: edge - 1, dx: 1, dy: 0 };
  if (edge < 3) return { x: 1 - (edge - 2), y: 1, dx: 0, dy: 1 };
  return { x: 0, y: 1 - (edge - 3), dx: -1, dy: 0 };
}

const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const { x, y, dx, dy } = borderEmit((i + 0.37) / PARTICLE_COUNT);
  const side = (i % 3) - 1;
  const jx = dx === 0 ? side * 0.35 : 0;
  const jy = dy === 0 ? side * 0.35 : 0;
  return {
    i,
    x: `${x * 100}%`,
    y: `${y * 100}%`,
    dx: dx + jx,
    dy: dy + jy,
    dur: 1.15 + (i % 7) * 0.18,
    delay: -((i * 0.13) % 2.8),
    travelBase: 8 + (i % 4) * 3,
    size: 2 + (i % 3),
    alt: i % 2 === 1,
  };
});

type Props = {
  tier: BetAuraTier;
  /** One-shot spark + burst while parent holds this true (~1s). */
  celebrate?: boolean;
  doubled?: boolean;
  split?: boolean;
};

export function SeatBetAura({
  tier,
  celebrate = false,
  doubled = false,
  split = false,
}: Props) {
  if (tier < 1) return null;

  const mods = [
    celebrate ? "is-celebrating" : "",
    doubled ? "is-doubled" : "",
    split ? "is-split" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`seat-bet-aura seat-bet-aura-t${tier}${mods ? ` ${mods}` : ""}`}
      data-tier={tier}
      aria-hidden
    >
      <span className="seat-bet-aura-bloom" />
      <span className="seat-bet-aura-ring seat-bet-aura-ring-outer" />
      <span className="seat-bet-aura-ring seat-bet-aura-ring-mid" />
      <span className="seat-bet-aura-ring seat-bet-aura-ring-inner" />
      <span className="seat-bet-aura-core" />

      {doubled && <span className="seat-bet-aura-double" />}
      {split && (
        <>
          <span className="seat-bet-aura-fork seat-bet-aura-fork-l" />
          <span className="seat-bet-aura-fork seat-bet-aura-fork-r" />
        </>
      )}

      <span className="seat-bet-aura-floaters">
        {PARTICLES.map((p) => (
          <span
            key={p.i}
            className={`seat-bet-aura-f${p.alt ? " is-alt" : ""}`}
            style={
              {
                left: p.x,
                top: p.y,
                width: p.size,
                height: p.size,
                "--dur": `${p.dur}s`,
                "--delay": `${p.delay}s`,
                "--dx": p.dx,
                "--dy": p.dy,
                "--travel": `${p.travelBase + tier + (doubled ? 6 : 0)}px`,
              } as CSSProperties
            }
          />
        ))}
      </span>

      {celebrate && (
        <>
          <span className="seat-bet-aura-spark" />
          <span className="seat-bet-aura-burst">
            {Array.from({ length: BURST_COUNT }, (_, i) => {
              const ang = (Math.PI * 2 * i) / BURST_COUNT;
              return (
                <span
                  key={i}
                  className="seat-bet-aura-burst-p"
                  style={
                    {
                      "--bx": Math.cos(ang),
                      "--by": Math.sin(ang),
                      "--bd": `${0.04 * i}s`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </span>
        </>
      )}
    </div>
  );
}
