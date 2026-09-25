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

/** Ace = 1 only (A-2-3…); Q-K-A is not a straight. */
export function straightRank(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  return Number(rank);
}

const STRAIGHT_MULT: Record<number, number> = {
  3: 1,
  4: 2.5,
  5: 5,
};

export type StraightDetect = {
  length: number;
  /** Indices into `cards`, ordered low→high rank. */
  cardIndices: number[];
};

/** Longest consecutive unique-rank run (order in hand does not matter). */
export function detectLongestStraight(cards: Card[]): StraightDetect | null {
  const byRank = new Map<number, number>();
  for (let i = 0; i < cards.length; i++) {
    const r = straightRank(cards[i]!.rank);
    if (!Number.isFinite(r) || byRank.has(r)) continue;
    byRank.set(r, i);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  if (ranks.length < 3) return null;

  let bestStart = 0;
  let bestLen = 1;
  let runStart = 0;
  let runLen = 1;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i - 1]! + 1) {
      runLen += 1;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
    } else {
      runStart = i;
      runLen = 1;
    }
  }
  if (bestLen < 3) return null;
  const capped = Math.min(bestLen, 5);
  const seq = ranks.slice(bestStart, bestStart + capped);
  return {
    length: capped,
    cardIndices: seq.map((r) => byRank.get(r)!),
  };
}

export function straightBonusCents(betCents: number, length: number): number {
  const m = STRAIGHT_MULT[length];
  if (!m || betCents <= 0) return 0;
  return Math.floor(betCents * m);
}

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
