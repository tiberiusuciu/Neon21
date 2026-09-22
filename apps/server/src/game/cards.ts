import { handValueLabel, type HandValue, type Rank, type Suit } from "@neon21/shared";
import type { Card } from "./types.js";
import { RESHUFFLE_RATIO, SHOE_DECKS } from "./types.js";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const RANKS: Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export function createShoe(decks = SHOE_DECKS): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ suit, rank });
      }
    }
  }
  return shuffle(shoe);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function needsReshuffle(remaining: number, total: number): boolean {
  return remaining / total <= RESHUFFLE_RATIO;
}

export function rankPipeValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return 10;
  return Number(rank);
}

export function evaluateHand(cards: Card[]): HandValue {
  let hard = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") aces += 1;
    else hard += rankPipeValue(c.rank);
  }
  hard += aces;
  let soft: number | null = null;
  if (aces > 0 && hard + 10 <= 21) {
    soft = hard + 10;
  }
  const bust = hard > 21;
  const value = { soft, hard, bust, label: "" };
  value.label = handValueLabel(value);
  return value;
}

export function bestTotal(cards: Card[]): number {
  const v = evaluateHand(cards);
  if (v.bust) return v.hard;
  return v.soft ?? v.hard;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && bestTotal(cards) === 21;
}

export function isSoft17OrMore(cards: Card[]): boolean {
  return bestTotal(cards) >= 17;
}

export function canSplit(cards: Card[]): boolean {
  return cards.length === 2 && cards[0].rank === cards[1].rank;
}

export class Shoe {
  private cards: Card[] = [];
  private totalSize = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.cards = createShoe();
    this.totalSize = this.cards.length;
  }

  draw(): Card {
    if (this.cards.length === 0 || needsReshuffle(this.cards.length, this.totalSize)) {
      this.reset();
    }
    const card = this.cards.pop();
    if (!card) {
      this.reset();
      return this.cards.pop()!;
    }
    return card;
  }
}
