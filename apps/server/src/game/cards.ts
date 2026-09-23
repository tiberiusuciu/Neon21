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

/** Parse tokens like AS, 10H, TH, KD (rank then suit). */
export function parseDebugCardToken(token: string): Card | null {
  const t = token.trim().toUpperCase().replace(/\s/g, "");
  if (!t) return null;
  let rankStr: string;
  let suitStr: string;
  if (t.startsWith("10")) {
    rankStr = "10";
    suitStr = t.slice(2);
  } else if (t[0] === "T" && t.length >= 2) {
    rankStr = "10";
    suitStr = t.slice(1);
  } else {
    rankStr = t[0]!;
    suitStr = t.slice(1);
  }
  if (!(RANKS as string[]).includes(rankStr)) return null;
  if (!(SUITS as string[]).includes(suitStr)) return null;
  return { rank: rankStr as Rank, suit: suitStr as Suit };
}

export function parseDebugCardList(raw: string[]): { cards: Card[]; error?: string } {
  const cards: Card[] = [];
  for (const token of raw) {
    const card = parseDebugCardToken(token);
    if (!card) return { cards: [], error: `Invalid card "${token}" (use AS, 10H, KD…)` };
    cards.push(card);
  }
  return { cards };
}

export class Shoe {
  private cards: Card[] = [];
  private totalSize = 0;
  /** Scripted draws (FIFO) — used by staging table debug. */
  private inject: Card[] = [];

  constructor() {
    this.reshuffle();
  }

  /** New shuffled shoe; keeps any pending inject queue. */
  private reshuffle() {
    this.cards = createShoe();
    this.totalSize = this.cards.length;
  }

  reset() {
    this.reshuffle();
    this.inject = [];
  }

  /** Replace the scripted draw queue (next `draw()` calls consume these first). */
  stackNext(cards: Card[]) {
    this.inject = [...cards];
  }

  clearInject() {
    this.inject = [];
  }

  injectRemaining(): number {
    return this.inject.length;
  }

  /** Peek upcoming scripted cards (debug UI). */
  injectPreview(limit = 12): Card[] {
    return this.inject.slice(0, limit);
  }

  draw(): Card {
    if (this.inject.length > 0) {
      return this.inject.shift()!;
    }
    if (this.cards.length === 0 || needsReshuffle(this.cards.length, this.totalSize)) {
      this.reshuffle();
    }
    const card = this.cards.pop();
    if (!card) {
      this.reshuffle();
      return this.cards.pop()!;
    }
    return card;
  }
}
