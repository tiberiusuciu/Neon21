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
  fromSplitAces: boolean;
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
}

export interface Spectator {
  userId: string;
  name: string;
}

export interface DealerState {
  cards: Card[];
  holeRevealed: boolean;
}

export type RoomCallbacks = {
  broadcastState: (snapshot: TableStateSnapshot) => void;
  onLobbyChanged: () => void;
  onWalletUpdate: (userId: string, balanceCents: number) => void;
  onSeatedChanged: (tableId: string) => void;
  onNotice: (userId: string, message: string) => void;
};

export const BETTING_MS = 20_000;
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
/** Max hands per seat after re-splits (1 original + up to 3 splits). */
export const MAX_SPLIT_HANDS = 4;
