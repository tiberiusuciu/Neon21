import type { Rank, Suit } from "@neon21/shared";
import type { Card } from "../game/types.js";

/** Suited-pair profit multipliers during Golden Hour (win only). */
export const SUITED_PAIR_MULT: Record<Suit, number> = {
  S: 3,
  H: 2.5,
  C: 2,
  D: 1.5,
};

const TRIPLE_RANKS = new Set<Rank>(["2", "3", "4", "5", "6", "7"]);

export function detectSuitedPairSuit(cards: Card[]): Suit | null {
  if (cards.length !== 2) return null;
  const [a, b] = cards;
  if (a.rank === b.rank && a.suit === b.suit) return a.suit;
  return null;
}

export function suitedPairProfitMultiplier(suit: Suit): number {
  return SUITED_PAIR_MULT[suit] ?? 1;
}

export function applySuitedPairProfit(
  profitCents: number,
  suitedPairSuit: Suit | null | undefined
): number {
  if (!suitedPairSuit) return profitCents;
  const m = suitedPairProfitMultiplier(suitedPairSuit);
  return Math.floor(profitCents * m);
}

/** Instant side bonus: $1000 × rank for 2–7 trips (cents). */
export function tripleCardBonusCents(cards: Card[], fromSplit: boolean): number {
  if (fromSplit || cards.length !== 3) return 0;
  const r = cards[0].rank;
  if (!TRIPLE_RANKS.has(r)) return 0;
  if (cards[1].rank !== r || cards[2].rank !== r) return 0;
  const n = Number(r);
  if (!Number.isFinite(n)) return 0;
  return n * 1000 * 100;
}

export function suitedPairLabel(suit: Suit): string {
  const names: Record<Suit, string> = {
    S: "Spades 3×",
    H: "Hearts 2.5×",
    C: "Clubs 2×",
    D: "Diamonds 1.5×",
  };
  return names[suit];
}
