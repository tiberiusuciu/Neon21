import type { CSSProperties } from "react";

/** Dollar thresholds → cents: $50, $100, $250, $500, $1000 */
export const BET_AURA_THRESHOLDS_CENTS = [
  5_000, 10_000, 25_000, 50_000, 100_000,
] as const;

export type BetAuraTier = 0 | 1 | 2 | 3 | 4 | 5;

const EMIT_COUNTS = [0, 12, 16, 20, 26, 32] as const;

export function betAuraTier(cents: number): BetAuraTier {
  if (cents >= 100_000) return 5;
  if (cents >= 50_000) return 4;
  if (cents >= 25_000) return 3;
  if (cents >= 10_000) return 2;
  if (cents >= 5_000) return 1;
  return 0;
}

export function seatStakeCents(seat: {
  pendingBetCents: number;
  hands: { betCents: number }[];
}): number {
  if (seat.pendingBetCents > 0) return seat.pendingBetCents;
  return seat.hands.reduce((sum, h) => sum + h.betCents, 0);
}

/** Point + outward normal on a unit square border, t ∈ [0, 1). */
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

type Props = {
  tier: BetAuraTier;
};

export function SeatBetAura({ tier }: Props) {
  if (tier < 1) return null;

  const count = EMIT_COUNTS[tier];
  const particles = Array.from({ length: count }, (_, i) => {
    const { x, y, dx, dy } = borderEmit((i + 0.37) / count);
    const side = (i % 3) - 1;
    const jx = dx === 0 ? side * 0.35 : 0;
    const jy = dy === 0 ? side * 0.35 : 0;
    return {
      i,
      x: `${x * 100}%`,
      y: `${y * 100}%`,
      dx: dx + jx,
      dy: dy + jy,
      dur: 1.35 + (i % 5) * 0.22,
      delay: -((i * 0.17) % 2.4),
      travel: 14 + (i % 4) * 5 + tier * 2,
      size: 2 + (i % 3),
      alt: i % 2 === 1,
    };
  });

  return (
    <div className={`seat-bet-aura seat-bet-aura-t${tier}`} aria-hidden>
      <span className="seat-bet-aura-ring seat-bet-aura-ring-outer" />
      <span className="seat-bet-aura-ring seat-bet-aura-ring-mid" />
      <span className="seat-bet-aura-ring seat-bet-aura-ring-inner" />
      <span className="seat-bet-aura-core" />
      <span className="seat-bet-aura-floaters">
        {particles.map((p) => (
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
                "--travel": `${p.travel}px`,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </div>
  );
}
