/** House-ahead milestones (cents). Negative take does not use these. */
export const JACKPOT_TIERS_CENTS = [
  100_000, // $1k
  500_000, // $5k
  1_000_000, // $10k
  2_500_000, // $25k
  5_000_000, // $50k
  10_000_000, // $100k
  25_000_000, // $250k
  50_000_000, // $500k
  100_000_000, // $1M
] as const;

export type JackpotTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Glow / particle color per reached tier (index 0 unused). */
export const JACKPOT_TIER_GLOW = [
  "#c9a227",
  "#e8c547", // 1 soft gold
  "#f0a830", // 2 amber
  "#ff9f40", // 3 orange-gold
  "#ff6b4a", // 4 copper-rose
  "#7cffb2", // 5 neon mint
  "#5ee1ff", // 6 ice cyan
  "#ffd56a", // 7 bright gold
  "#ffe9a8", // 8 platinum
  "#fff8e7", // 9 white-hot
] as const;

export function jackpotTierReached(takeCents: number): JackpotTier {
  if (takeCents < JACKPOT_TIERS_CENTS[0]) return 0;
  let tier: JackpotTier = 0;
  for (let i = 0; i < JACKPOT_TIERS_CENTS.length; i++) {
    if (takeCents >= JACKPOT_TIERS_CENTS[i]) tier = (i + 1) as JackpotTier;
  }
  return tier;
}

export function jackpotGlowColor(tier: JackpotTier): string {
  return JACKPOT_TIER_GLOW[tier] ?? JACKPOT_TIER_GLOW[0];
}

/** Ambient particle count — ramps hard on upper tiers. */
export function jackpotParticleCount(tier: JackpotTier): number {
  if (tier <= 0) return 0;
  // 6, 12, 22, 40, 70, 100, 130, 160, 200 (cap)
  const n = Math.round(3.4 * 1.95 ** tier);
  return Math.min(200, n);
}

/** Highest tier crossed going from `from` → `to` (0 if none). */
export function jackpotTierCrossed(from: number, to: number): JackpotTier {
  if (to <= from) return 0;
  let highest: JackpotTier = 0;
  for (let i = 0; i < JACKPOT_TIERS_CENTS.length; i++) {
    const t = JACKPOT_TIERS_CENTS[i];
    if (from < t && to >= t) highest = (i + 1) as JackpotTier;
  }
  return highest;
}

/** 0–1 fill for the vault; equal band per tier up to $1M. Negative → empty. */
export function jackpotFillRatio(takeCents: number): number {
  if (takeCents <= 0) return 0;
  const tiers = JACKPOT_TIERS_CENTS;
  const last = tiers[tiers.length - 1]!;
  if (takeCents >= last) return 1;
  const band = 1 / tiers.length;
  let prev = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    if (takeCents < t) {
      return i * band + band * ((takeCents - prev) / (t - prev));
    }
    prev = t;
  }
  return 1;
}
