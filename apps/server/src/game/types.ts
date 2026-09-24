import type {
  HandValue,
  LobbyTable,
  PublicCard,
  Rank,
  Suit,
  TablePhase,
  TableStateSnapshot,
} from "@neon21/shared";

export type { HandValue, LobbyTable, PublicCard, Rank, Suit, TablePhase, TableStateSnapshot };

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface HandState {
  cards: Card[];
  betCents: number;
  stood: boolean;
  doubled: boolean;
  fromSplit: boolean;
  resultCents: number | null;
}

export interface SeatState {
  userId: string;
  name: string;
  pendingBetCents: number;
  lastBetCents: number;
  hands: HandState[];
  insuranceCents: number;
  insuranceResolved: boolean;
  missedRounds: number;
  connected: boolean;
  bjTowardSpin: number;
  spinVouchers: number;
}

export interface Spectator {
  userId: string;
  name: string;
}

export interface DealerState {
  cards: Card[];
  holeRevealed: boolean;
}

export type ActiveSpin = {
  userId: string;
  seatIndex: number;
  name: string;
  voucherId: string;
  phase: "offer" | "result";
  remainingBettingMs: number;
  /** Epoch ms when offer auto-spins (phase === "offer"). */
  offerEndsAt?: number;
  tileIndex?: number;
  label?: string;
  kind?: "percent" | "flat";
  pctBps?: number;
  payoutCents?: number;
  potBeforeCents?: number;
};

export type RoomCallbacks = {
  broadcastState: (snapshot: TableStateSnapshot) => void;
  onLobbyChanged: () => void;
  onWalletUpdate: (userId: string, balanceCents: number) => void;
  onSeatedChanged: (tableId: string) => void;
  onNotice: (userId: string, message: string) => void;
  /** 5% of player losses this round (wins never reduce the vault). */
  onJackpotDelta: (deltaCents: number) => void;
  onJackpotClaim: (claim: import("@neon21/shared").JackpotClaimEntry) => void;
  onJackpotWin: (win: import("@neon21/shared").JackpotWinBroadcast) => void;
};

/** Synthetic seats spawned by staging table debug — no real wallet. */
export function isDebugSeatUser(userId: string): boolean {
  return userId.startsWith("debug:");
}

export const BETTING_MS = 40_000;
/** Short window once every seated player has a bet down. */
export const ALL_BET_CLAMP_MS = 5_000;
export const DEAL_CARD_MS = 500;
export const DEALER_BUST_PAUSE_MS = 1_200;
/** After settle UI shows a win: wait for react + cash flight before crediting wallets. */
export const SETTLE_WIN_PAYOUT_MS = 1_750;
export const INSURANCE_MS = 10_000;
export const TURN_MS = 25_000;
export const ACTION_PAUSE_MS = 2_500;
export const SETTLE_MS = 3_000;
export const EMPTY_DELETE_MS = 10_000;
export const SHOE_DECKS = 6;
export const RESHUFFLE_RATIO = 0.25;
/** Auto `spin:go` if spinner doesn't click. */
export const SPIN_OFFER_MS = 22_000;
/** Client urgency window before auto-spin. */
export const SPIN_OFFER_URGENT_MS = 5_000;
/** Max wait for client `spin:done` after wheel starts (animation ~5.8s). */
export const SPIN_DONE_TIMEOUT_MS = 8_500;
/** Brief hold showing the payout on the seat before clearing spin. */
export const SPIN_REVEAL_HOLD_MS = 1_400;
export const SPIN_RESUME_MIN_MS = 5_000;
