import {
  CHIP_DENOMINATIONS_CENTS,
  GOLDEN_HAND_MAX_BET_CENTS,
  JACKPOT_CELEBRATE_MS,
  MIN_BET_CENTS,
  SEAT_CAPACITY,
  pickWheelTile,
  pickWheelTileAt,
  payoutForTile,
  type LobbyTable,
  type PublicCard,
  type PublicHand,
  type PublicSeat,
  type TablePhase,
  type TableStateSnapshot,
} from "@neon21/shared";
import {
  Shoe,
  bestTotal,
  canSplit,
  evaluateHand,
  isBlackjack,
  isSoft17OrMore,
  parseDebugCardList,
} from "./cards.js";
import {
  ACTION_PAUSE_MS,
  STAND_PAUSE_MS,
  ALL_BET_CLAMP_MS,
  BETTING_MS,
  DEAL_CARD_MS,
  DEALER_BUST_PAUSE_MS,
  SETTLE_WIN_PAYOUT_MS,
  INSURANCE_MS,
  SETTLE_MS,
  SPIN_OFFER_MS,
  SPIN_DONE_TIMEOUT_MS,
  SPIN_REVEAL_HOLD_MS,
  SPIN_RESUME_MIN_MS,
  TURN_MS,
  isDebugSeatUser,
  type ActiveSpin,
  type DealerState,
  type HandState,
  type RoomCallbacks,
  type SeatState,
  type Spectator,
} from "./types.js";
import { InsufficientFundsError, debitCents, getBalanceCents, creditCents } from "./wallet.js";
import { recordHandOutcomes, recordHandOutcomesSafe, type HandOutcomeInput } from "./stats.js";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import {
  getGoldenHandsInventory,
  grantGoldenHands,
  recordGoldenHourHandsPlayed,
  reserveGoldenHand,
  returnGoldenHand,
} from "../lib/golden-hands.js";
import {
  goldenHandLossPayout,
  goldenHandWinPayout,
  goldenLossPayout,
  goldenWinPayout,
  getGoldenHourWindowStartedAt,
  isGoldenHourActive,
} from "../lib/golden-hour.js";
import {
  applySuitedPairProfit,
  detectSuitedPairSuit,
  tripleCardBonusCents,
} from "../lib/golden-hour-bonuses.js";
import { recordGoldenHourResults } from "../lib/golden-hour-rebate.js";
import {
  getAvailablePotCents,
  getSpinSeatProgress,
  JACKPOT_LOSS_TAKE_BPS,
  JACKPOT_LOSS_TAKE_BPS_GOLDEN,
  jackpotTakeFromLosses,
  maybeGrantSpinVouchers,
} from "../lib/jackpot.js";

function emptyHand(betCents: number, goldenHand = false): HandState {
  return {
    cards: [],
    betCents,
    stood: false,
    doubled: false,
    fromSplit: false,
    resultCents: null,
    suitedPairSuit: null,
    tripleBonusPaid: false,
    goldenHand,
  };
}

export class TableRoom {
  readonly id: string;
  readonly name: string;
  private seats: (SeatState | null)[] = Array.from({ length: SEAT_CAPACITY }, () => null);
  private spectators = new Map<string, Spectator>();
  private dealer: DealerState = { cards: [], holeRevealed: false };
  private phase: TablePhase = "betting";
  private phaseEndsAt: number | null = null;
  private activeSeatIndex: number | null = null;
  private activeHandIndex: number | null = null;
  private shoe = new Shoe();
  private destroyed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private allBetClamped = false;
  private turnResolve: ((pauseMs?: number) => void) | null = null;
  private insuranceWait: (() => void) | null = null;
  /** False once the insurance window closes (timer / all decided). */
  private insuranceOpen = false;
  /** In-flight insurance:take debits — settle waits until these finish. */
  private insurancePending = 0;
  private cb: RoomCallbacks;
  /** Staging: bots stand immediately instead of waiting out the turn timer. */
  private debugBotsHold = true;
  /** Staging: force next jackpot spin tile (null = random). */
  private debugSpinBias: number | null = null;
  /** Staging: freeze phase timers until resumed. */
  private debugTimerPaused = false;
  private scheduledFn: (() => void) | null = null;
  private pausedRemainingMs: number | null = null;
  private spin: ActiveSpin | null = null;
  /** Epoch ms; table-wide 100% FX for late joiners. */
  private jackpotCelebrateUntil: number | null = null;
  private spinDoneWait: {
    userId: string;
    resolve: () => void;
  } | null = null;

  constructor(id: string, name: string, cb: RoomCallbacks) {
    this.id = id;
    this.name = name;
    this.cb = cb;
    this.startBetting();
  }

  destroy() {
    this.destroyed = true;
    this.generation += 1;
    this.clearTimer();
  }

  seatedCount(): number {
    return this.seats.filter(Boolean).length;
  }

  isFull(): boolean {
    return this.seatedCount() >= SEAT_CAPACITY;
  }

  toLobby(): LobbyTable {
    const playerCount = this.seatedCount();
    return {
      id: this.id,
      name: this.name,
      seatCapacity: SEAT_CAPACITY,
      playerCount,
      spectatorCount: this.spectators.size,
      status: playerCount >= SEAT_CAPACITY ? "busy" : "open",
    };
  }

  getSnapshot(): TableStateSnapshot {
    if (
      this.jackpotCelebrateUntil != null &&
      Date.now() >= this.jackpotCelebrateUntil
    ) {
      this.jackpotCelebrateUntil = null;
    }
    const snap: TableStateSnapshot = {
      tableId: this.id,
      name: this.name,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      seats: this.seats.map((seat, index) => this.publicSeat(index, seat)),
      dealer: this.publicDealer(),
      activeSeatIndex: this.activeSeatIndex,
      activeHandIndex: this.activeHandIndex,
      spectatorCount: this.spectators.size,
      minBetCents: MIN_BET_CENTS,
      chipDenominations: [...CHIP_DENOMINATIONS_CENTS],
      spin: this.spin
        ? {
            seatIndex: this.spin.seatIndex,
            userId: this.spin.userId,
            name: this.spin.name,
            phase: this.spin.phase,
            offerEndsAt: this.spin.offerEndsAt,
            tileIndex: this.spin.tileIndex,
            label: this.spin.label,
            kind: this.spin.kind,
            pctBps: this.spin.pctBps,
            payoutCents: this.spin.payoutCents,
            potBeforeCents: this.spin.potBeforeCents,
          }
        : null,
      jackpotCelebrateUntil: this.jackpotCelebrateUntil,
    };
    if (env.tableDebugEnabled) {
      snap.debugStack = this.shoe.injectPreview(24).map(
        (c) => `${c.rank}${c.suit}`
      );
      snap.debugBotsHold = this.debugBotsHold;
      snap.debugSpinBias = this.debugSpinBias;
      snap.debugTimerPaused = this.debugTimerPaused;
    }
    return snap;
  }

  private publicSeat(index: number, seat: SeatState | null): PublicSeat {
    if (!seat) {
      return {
        index,
        userId: null,
        name: null,
        pendingBetCents: 0,
        lastBetCents: 0,
        hands: [],
        insuranceCents: 0,
        insuranceResolved: false,
        connected: false,
      };
    }
    return {
      index,
      userId: seat.userId,
      name: seat.name,
      pendingBetCents: seat.pendingBetCents,
      lastBetCents: seat.lastBetCents,
      hands: seat.hands.map((h) => this.publicHand(h)),
      insuranceCents: seat.insuranceCents,
      insuranceResolved: seat.insuranceResolved,
      connected: seat.connected,
      bjTowardSpin: seat.bjTowardSpin,
      spinVouchers: seat.spinVouchers,
      charlieFxUntil: seat.charlieFxUntil,
      goldenHandActive:
        seat.goldenHandArmed || seat.hands.some((h) => h.goldenHand),
      goldenHands: seat.goldenHands,
    };
  }

  private publicHand(h: HandState): PublicHand {
    return {
      cards: h.cards.map((c) => ({ suit: c.suit, rank: c.rank })),
      value: evaluateHand(h.cards),
      betCents: h.betCents,
      isBlackjack: !h.fromSplit && isBlackjack(h.cards),
      stood: h.stood,
      doubled: h.doubled,
      resultCents: h.resultCents,
      suitedPairSuit: h.suitedPairSuit,
    };
  }

  private publicDealer(): { cards: PublicCard[]; value: ReturnType<typeof evaluateHand> | null } {
    const cards: PublicCard[] = this.dealer.cards.map((c, i) => {
      if (i === 1 && !this.dealer.holeRevealed) {
        return { hidden: true as const };
      }
      return { suit: c.suit, rank: c.rank };
    });
    const visible =
      this.dealer.holeRevealed || this.dealer.cards.length === 0
        ? this.dealer.cards
        : this.dealer.cards.slice(0, 1);
    const value =
      visible.length === 0
        ? null
        : evaluateHand(visible);
    return { cards, value };
  }

  private broadcast() {
    if (this.destroyed) return;
    this.cb.broadcastState(this.getSnapshot());
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduledFn = null;
    this.pausedRemainingMs = null;
    this.phaseEndsAt = null;
  }

  private schedule(ms: number, fn: () => void) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduledFn = fn;
    if (env.tableDebugEnabled && this.debugTimerPaused) {
      this.pausedRemainingMs = Math.max(0, ms);
      this.phaseEndsAt = null;
      return;
    }
    this.pausedRemainingMs = null;
    const gen = this.generation;
    this.phaseEndsAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scheduledFn = null;
      this.pausedRemainingMs = null;
      if (this.destroyed || this.generation !== gen) return;
      fn();
    }, ms);
  }

  private pausePhaseTimer() {
    if (this.timer && this.phaseEndsAt != null) {
      this.pausedRemainingMs = Math.max(0, this.phaseEndsAt - Date.now());
      clearTimeout(this.timer);
      this.timer = null;
      this.phaseEndsAt = null;
    }
  }

  private resumePhaseTimer() {
    if (!this.scheduledFn) return;
    const ms = Math.max(0, this.pausedRemainingMs ?? 0);
    const fn = this.scheduledFn;
    this.pausedRemainingMs = null;
    if (ms <= 0) {
      this.scheduledFn = null;
      this.phaseEndsAt = null;
      fn();
      return;
    }
    const gen = this.generation;
    this.phaseEndsAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scheduledFn = null;
      this.pausedRemainingMs = null;
      if (this.destroyed || this.generation !== gen) return;
      fn();
    }, ms);
  }

  private delay(ms: number): Promise<void> {
    const gen = this.generation;
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.destroyed || this.generation !== gen) resolve();
        else resolve();
      }, ms);
    });
  }

  private alive(gen: number): boolean {
    return !this.destroyed && this.generation === gen;
  }

  findSeatIndex(userId: string): number {
    return this.seats.findIndex((s) => s?.userId === userId);
  }

  isPresent(userId: string): boolean {
    return this.findSeatIndex(userId) >= 0 || this.spectators.has(userId);
  }

  presentUserIds(): string[] {
    const ids: string[] = [];
    for (const seat of this.seats) {
      if (seat) ids.push(seat.userId);
    }
    for (const id of this.spectators.keys()) ids.push(id);
    return ids;
  }

  displayName(userId: string): string | null {
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx >= 0) return this.seats[seatIdx]!.name;
    return this.spectators.get(userId)?.name ?? null;
  }

  /** Fresh table presence (not a reconnect). */
  join(userId: string, name: string): boolean {
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx >= 0) {
      this.seats[seatIdx]!.connected = true;
      this.seats[seatIdx]!.name = name;
      this.broadcast();
      void this.kickIfBroke(userId);
      return false;
    }
    const already = this.spectators.has(userId);
    this.spectators.set(userId, { userId, name });
    this.broadcast();
    this.cb.onLobbyChanged();
    return !already;
  }

  /** Returns display name if they were present and left. */
  leave(userId: string): string | null {
    const name = this.displayName(userId);
    const seatIdx = this.findSeatIndex(userId);
    const wasSpec = this.spectators.has(userId);
    if (seatIdx < 0 && !wasSpec) return null;
    if (seatIdx >= 0) {
      this.clearSeat(seatIdx);
    }
    this.spectators.delete(userId);
    this.broadcast();
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();
    return name;
  }

  setConnected(userId: string, connected: boolean) {
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx >= 0) {
      this.seats[seatIdx]!.connected = connected;
      this.broadcast();
    }
  }

  async takeSeat(userId: string, seatIndex: number): Promise<string | null> {
    if (seatIndex < 0 || seatIndex >= SEAT_CAPACITY) return "Invalid seat";
    if (this.seats[seatIndex]) return "Seat taken";
    const existing = this.findSeatIndex(userId);
    if (existing >= 0) return "Already seated";

    const bal = await getBalanceCents(userId);
    if (bal == null || bal <= 0) {
      return "Need chips to sit — claim from the lobby";
    }

    const spec = this.spectators.get(userId);
    const name = spec?.name ?? "Player";
    this.spectators.delete(userId);
    this.seats[seatIndex] = {
      userId,
      name,
      pendingBetCents: 0,
      lastBetCents: 0,
      hands: [],
      insuranceCents: 0,
      insuranceResolved: false,
      missedRounds: 0,
      connected: true,
      bjTowardSpin: 0,
      spinVouchers: 0,
      charlieFxUntil: null,
      goldenHandArmed: false,
      goldenHands: 0,
    };
    await this.refreshSeatSpinProgress(userId);
    await this.refreshSeatGoldenHands(userId);
    this.broadcast();
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();

    if (this.phase === "betting") {
      this.onBettingActivity();
    }
    return null;
  }

  leaveSeat(userId: string): string | null {
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    const returnArmed = seat.goldenHandArmed && !isDebugSeatUser(userId);

    if (this.spin?.userId === userId) {
      if (this.spin.phase === "result") return "Cannot leave during spin";
      this.clearTimer();
      const remaining = this.spin.remainingBettingMs;
      this.spin = null;
      this.seats[seatIdx] = null;
      this.spectators.set(userId, { userId, name: seat.name });
      if (returnArmed) {
        void returnGoldenHand(userId).catch(() => undefined);
      }
      this.resumeBettingAfterSpin(remaining);
      this.cb.onSeatedChanged(this.id);
      this.cb.onLobbyChanged();
      return null;
    }

    this.seats[seatIdx] = null;
    this.spectators.set(userId, { userId, name: seat.name });
    if (returnArmed) {
      void returnGoldenHand(userId).catch(() => undefined);
    }
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();
    if (this.phase === "betting" && !this.spin) {
      this.onBettingActivity();
    } else {
      this.broadcast();
    }
    return null;
  }

  /** Kick if broke and not mid-hand (betting with no cards dealt yet). */
  async kickIfBroke(userId: string): Promise<boolean> {
    if (isDebugSeatUser(userId)) return false;
    if (this.phase !== "betting") return false;
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return false;
    const seat = this.seats[seatIdx]!;
    if (seat.hands.some((h) => h.cards.length > 0)) return false;
    if (seat.pendingBetCents > 0) return false;

    const bal = await getBalanceCents(userId);
    if ((bal ?? 0) > 0) return false;

    this.spectators.set(userId, { userId, name: seat.name });
    this.seats[seatIdx] = null;
    this.cb.onNotice(
      userId,
      "Out of chips — you're spectating. Claim more to sit again."
    );
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();
    if (this.phase === "betting" && !this.spin) {
      this.onBettingActivity();
    } else {
      this.broadcast();
    }
    return true;
  }

  private clearSeat(seatIdx: number) {
    this.seats[seatIdx] = null;
  }

  private betChain: Promise<unknown> = Promise.resolve();

  private enqueueBet<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.betChain.then(fn, fn);
    this.betChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async addBet(userId: string, cents: number): Promise<string | null> {
    return this.enqueueBet(() => this.addBetUnlocked(userId, cents));
  }

  private async addBetUnlocked(
    userId: string,
    cents: number
  ): Promise<string | null> {
    if (this.phase !== "betting") return "Not betting";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    const bal = await getBalanceCents(userId);
    if (bal == null) return "User not found";

    const available = bal - seat.pendingBetCents;
    if (available <= 0) return "Insufficient funds";

    const isDenom = (CHIP_DENOMINATIONS_CENTS as readonly number[]).includes(
      cents
    );
    const isAllInExact = cents === available;
    if (!isDenom && !isAllInExact) return "Invalid chip";

    // Chip fits → add chip. Oversized / exact remaining → all-in.
    const add = cents <= available ? cents : available;

    if (seat.pendingBetCents === 0 && add < MIN_BET_CENTS) {
      return `Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(0)}`;
    }

    if (
      seat.goldenHandArmed &&
      seat.pendingBetCents + add > GOLDEN_HAND_MAX_BET_CENTS
    ) {
      return `Golden Hand max bet is $${(GOLDEN_HAND_MAX_BET_CENTS / 100).toFixed(0)}`;
    }

    seat.pendingBetCents += add;
    this.broadcast();
    this.onBettingActivity();
    return null;
  }

  clearBet(userId: string): string | null {
    if (this.phase !== "betting") return "Not betting";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    this.seats[seatIdx]!.pendingBetCents = 0;
    this.broadcast();
    this.onBettingActivity();
    return null;
  }

  async removeBet(userId: string, cents: number): Promise<string | null> {
    return this.enqueueBet(async () => this.removeBetUnlocked(userId, cents));
  }

  private removeBetUnlocked(
    userId: string,
    cents: number
  ): string | null {
    if (this.phase !== "betting") return "Not betting";
    if (!(CHIP_DENOMINATIONS_CENTS as readonly number[]).includes(cents)) {
      return "Invalid chip";
    }
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    if (seat.pendingBetCents <= 0) return "No bet to remove";
    seat.pendingBetCents = Math.max(0, seat.pendingBetCents - cents);
    this.broadcast();
    this.onBettingActivity();
    return null;
  }

  async reuseBet(userId: string): Promise<string | null> {
    return this.enqueueBet(() => this.reuseBetUnlocked(userId));
  }

  private async reuseBetUnlocked(userId: string): Promise<string | null> {
    if (this.phase !== "betting") return "Not betting";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    if (seat.lastBetCents < MIN_BET_CENTS) return "No previous bet";
    const bal = await getBalanceCents(userId);
    if (bal == null) return "User not found";
    if (seat.lastBetCents > bal) {
      return "Not enough balance to reuse last bet";
    }
    seat.pendingBetCents = seat.lastBetCents;
    this.broadcast();
    this.onBettingActivity();
    return null;
  }

  /** Bet/seat change: long timer until everyone has bet, then short clamp. */
  private onBettingActivity() {
    if (this.phase !== "betting") return;
    if (this.spin) {
      this.broadcast();
      return;
    }
    if (this.seatedCount() === 0) {
      this.allBetClamped = false;
      this.clearTimer();
      this.broadcast();
      return;
    }
    if (this.allSeatedHaveBets()) {
      this.allBetClamped = true;
      this.schedule(ALL_BET_CLAMP_MS, () => void this.lockBetsAndDeal());
    } else if (this.allBetClamped || this.timer == null) {
      // Cleared clamp, first seat after idle, or no clock running yet.
      this.allBetClamped = false;
      this.schedule(BETTING_MS, () => void this.lockBetsAndDeal());
    }
    // Still waiting on a seat with the long timer already running: leave it.
    this.broadcast();
  }

  private allSeatedHaveBets(): boolean {
    const seated = this.seats.filter((s): s is SeatState => s != null);
    if (seated.length === 0) return false;
    return seated.every((s) => s.pendingBetCents >= MIN_BET_CENTS);
  }

  private startBetting() {
    void this.beginBettingRound();
  }

  /** Move broke players to spectating before a new betting round. */
  private async ejectBrokePlayers(): Promise<void> {
    let kicked = false;
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i];
      if (!seat) continue;
      if (isDebugSeatUser(seat.userId)) continue;
      const bal = await getBalanceCents(seat.userId);
      if ((bal ?? 0) > 0) continue;
      this.spectators.set(seat.userId, {
        userId: seat.userId,
        name: seat.name,
      });
      this.seats[i] = null;
      kicked = true;
      this.cb.onNotice(
        seat.userId,
        "Out of chips — you're spectating. Claim more to sit again."
      );
    }
    if (!kicked) return;
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();
    this.broadcast();
  }

  private async beginBettingRound() {
    await this.ejectBrokePlayers();
    if (this.destroyed) return;

    this.generation += 1;
    this.clearTimer();
    this.phase = "betting";
    this.allBetClamped = false;
    this.activeSeatIndex = null;
    this.activeHandIndex = null;
    this.dealer = { cards: [], holeRevealed: false };
    for (const seat of this.seats) {
      if (!seat) continue;
      seat.pendingBetCents = 0;
      seat.hands = [];
      seat.insuranceCents = 0;
      seat.insuranceResolved = false;
    }
    if (this.seatedCount() > 0) {
      this.schedule(BETTING_MS, () => void this.lockBetsAndDeal());
    }
    this.broadcast();
  }

  private async lockBetsAndDeal() {
    if (this.spin) return;
    const gen = this.generation;
    const toKick: number[] = [];

    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i];
      if (!seat) continue;
      if (seat.pendingBetCents >= MIN_BET_CENTS) {
        if (isDebugSeatUser(seat.userId)) {
          seat.lastBetCents = seat.pendingBetCents;
          seat.hands = [
            emptyHand(seat.pendingBetCents, seat.goldenHandArmed),
          ];
          seat.goldenHandArmed = false;
          seat.missedRounds = 0;
          seat.pendingBetCents = 0;
          continue;
        }
        try {
          const bal = await debitCents(seat.userId, seat.pendingBetCents);
          if (!this.alive(gen)) return;
          this.cb.onWalletUpdate(seat.userId, bal);
          seat.lastBetCents = seat.pendingBetCents;
          seat.hands = [
            emptyHand(seat.pendingBetCents, seat.goldenHandArmed),
          ];
          seat.goldenHandArmed = false;
          seat.missedRounds = 0;
          seat.pendingBetCents = 0;
        } catch (err) {
          if (!this.alive(gen)) return;
          seat.pendingBetCents = 0;
          seat.hands = [];
          seat.missedRounds += 1;
          if (seat.missedRounds >= 2) toKick.push(i);
          if (!(err instanceof InsufficientFundsError)) {
            console.error(err);
          }
        }
      } else {
        seat.pendingBetCents = 0;
        seat.hands = [];
        seat.missedRounds += 1;
        if (seat.missedRounds >= 2) toKick.push(i);
      }
    }

    for (const i of toKick) {
      const seat = this.seats[i];
      if (!seat) continue;
      this.spectators.set(seat.userId, { userId: seat.userId, name: seat.name });
      this.seats[i] = null;
    }
    if (toKick.length > 0) {
      this.cb.onSeatedChanged(this.id);
      this.cb.onLobbyChanged();
    }

    const active = this.seats.filter((s) => s && s.hands.length > 0);
    if (active.length === 0) {
      this.startBetting();
      return;
    }

    await this.runDealing(gen);
  }

  private async runDealing(gen: number) {
    this.phase = "dealing";
    this.phaseEndsAt = null;
    this.clearTimer();
    this.broadcast();

    const order: number[] = [];
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i]?.hands.length) order.push(i);
    }

    for (let round = 0; round < 2; round++) {
      for (const i of order) {
        await this.delay(DEAL_CARD_MS);
        if (!this.alive(gen)) return;
        this.seats[i]!.hands[0].cards.push(this.shoe.draw());
        this.broadcast();
      }
      await this.delay(DEAL_CARD_MS);
      if (!this.alive(gen)) return;
      this.dealer.cards.push(this.shoe.draw());
      this.broadcast();
    }

    if (isGoldenHourActive()) {
      for (const i of order) {
        const hand = this.seats[i]?.hands[0];
        if (!hand) continue;
        hand.suitedPairSuit = detectSuitedPairSuit(hand.cards);
      }
      this.broadcast();
    }

    const up = this.dealer.cards[0];
    if (up?.rank === "A") {
      await this.runInsurance(gen);
    } else {
      await this.afterInsuranceOrSkip(gen);
    }
  }

  private async runInsurance(gen: number) {
    this.phase = "insurance";
    this.insuranceWait = null;
    this.insuranceOpen = true;
    this.insurancePending = 0;
    for (const seat of this.seats) {
      if (!seat?.hands.length) continue;
      seat.insuranceResolved = false;
      seat.insuranceCents = 0;
    }

    await new Promise<void>((resolve) => {
      this.insuranceWait = resolve;
      this.schedule(INSURANCE_MS, () => resolve());
      this.broadcast();
    });
    this.insuranceWait = null;
    this.insuranceOpen = false;
    if (!this.alive(gen)) return;

    // Drain takes that were mid-debit when the window closed.
    for (let i = 0; i < 100 && this.insurancePending > 0; i++) {
      await this.delay(25);
      if (!this.alive(gen)) return;
    }

    for (const seat of this.seats) {
      if (!seat?.hands.length) continue;
      if (!seat.insuranceResolved) {
        seat.insuranceResolved = true;
      }
    }
    this.broadcast();
    await this.afterInsuranceOrSkip(gen);
  }

  private maybeFinishInsuranceEarly() {
    if (this.phase !== "insurance" || !this.insuranceOpen) return;
    if (this.insurancePending > 0) return;
    const active = this.seats.filter((s) => s && s.hands.length > 0) as SeatState[];
    if (active.length === 0) return;
    if (!active.every((s) => s.insuranceResolved)) return;
    const done = this.insuranceWait;
    if (done) {
      this.insuranceWait = null;
      this.clearTimer();
      this.phaseEndsAt = null;
      done();
    }
  }

  async takeInsurance(userId: string): Promise<string | null> {
    if (this.phase !== "insurance" || !this.insuranceOpen) {
      return "Not insurance phase";
    }
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    if (!seat.hands.length) return "Not in round";
    if (seat.insuranceResolved || seat.insuranceCents > 0) return "Already decided";
    const mainBet = seat.hands[0]!.betCents;
    const cost = Math.floor(mainBet / 2);
    if (cost < 1) return "Invalid";

    this.insurancePending += 1;
    try {
      const bal = await debitCents(userId, cost);
      // Window closed while debiting — only keep the stake if we still own this take.
      if (this.phase !== "insurance") {
        const refunded = await creditCents(userId, cost);
        this.cb.onWalletUpdate(userId, refunded);
        return "Insurance closed";
      }
      this.cb.onWalletUpdate(userId, bal);
      seat.insuranceCents = cost;
      seat.insuranceResolved = true;
      this.broadcast();
      this.maybeFinishInsuranceEarly();
      return null;
    } catch (err) {
      if (err instanceof InsufficientFundsError) return "Insufficient funds";
      throw err;
    } finally {
      this.insurancePending = Math.max(0, this.insurancePending - 1);
      this.maybeFinishInsuranceEarly();
    }
  }

  declineInsurance(userId: string): string | null {
    if (this.phase !== "insurance") return "Not insurance phase";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    if (!seat.hands.length) return "Not in round";
    if (seat.insuranceResolved) return "Already decided";
    seat.insuranceResolved = true;
    this.broadcast();
    this.maybeFinishInsuranceEarly();
    return null;
  }

  /**
   * Dealer blackjack: insurance pays 2:1 → credit stake + profit (×1.5 profit in Golden Hour).
   * Main bet is already locked; with insurance the round nets to even on the main wager.
   */
  private async payInsuranceWins(gen: number): Promise<void> {
    if (this.dealer.cards[0]?.rank !== "A") return;
    if (!isBlackjack(this.dealer.cards)) return;

    for (const seat of this.seats) {
      if (!seat || seat.insuranceCents <= 0) continue;
      if (isDebugSeatUser(seat.userId)) continue;
      const { creditCents: payout } = goldenWinPayout(
        seat.insuranceCents,
        seat.insuranceCents * 2
      );
      const bal = await creditCents(seat.userId, payout);
      if (!this.alive(gen)) return;
      this.cb.onWalletUpdate(seat.userId, bal);
    }
  }

  /** Insurance lost (no dealer BJ): refund half during Golden Hour. */
  private async settleInsuranceLosses(gen: number): Promise<void> {
    for (const seat of this.seats) {
      if (!seat || seat.insuranceCents <= 0) continue;
      if (isDebugSeatUser(seat.userId)) continue;
      const { refundCents } = goldenLossPayout(seat.insuranceCents);
      if (refundCents <= 0) continue;
      const bal = await creditCents(seat.userId, refundCents);
      if (!this.alive(gen)) return;
      this.cb.onWalletUpdate(seat.userId, bal);
    }
  }

  private async afterInsuranceOrSkip(gen: number) {
    const dealerBj = isBlackjack(this.dealer.cards);

    if (dealerBj) {
      await this.payInsuranceWins(gen);
    } else {
      await this.settleInsuranceLosses(gen);
    }
    if (!this.alive(gen)) return;

    if (dealerBj) {
      this.dealer.holeRevealed = true;
      for (const seat of this.seats) {
        if (!seat?.hands.length) continue;
        for (const hand of seat.hands) {
          if (!hand.fromSplit && isBlackjack(hand.cards)) {
            const bal = await creditCents(seat.userId, hand.betCents);
            if (!this.alive(gen)) return;
            this.cb.onWalletUpdate(seat.userId, bal);
            hand.resultCents = 0;
          } else {
            const loss = this.lossPayout(hand);
            hand.resultCents = loss.resultCents;
            if (loss.refundCents > 0 && !isDebugSeatUser(seat.userId)) {
              const bal = await creditCents(seat.userId, loss.refundCents);
              if (!this.alive(gen)) return;
              this.cb.onWalletUpdate(seat.userId, bal);
            }
          }
          hand.stood = true;
        }
      }
      this.broadcast();
      await this.runSettle(gen);
      return;
    }

    for (const seat of this.seats) {
      if (!seat?.hands.length) continue;
      for (const hand of seat.hands) {
        if (!hand.fromSplit && isBlackjack(hand.cards)) {
          hand.stood = true;
        }
      }
    }

    await this.runPlayerTurns(gen);
  }

  private async runPlayerTurns(gen: number) {
    this.phase = "playerTurns";
    this.broadcast();

    for (let si = 0; si < this.seats.length; si++) {
      const seat = this.seats[si];
      if (!seat?.hands.length) continue;

      for (let hi = 0; hi < seat.hands.length; hi++) {
        if (!this.alive(gen)) return;
        const hand = seat.hands[hi];
        if (hand.resultCents != null) continue;
        if (hand.stood || evaluateHand(hand.cards).bust) continue;
        if (!hand.fromSplit && isBlackjack(hand.cards)) continue;

        if (hand.cards.length === 1 && hand.fromSplit) {
          await this.delay(DEAL_CARD_MS);
          if (!this.alive(gen)) return;
          hand.cards.push(this.shoe.draw());
          this.broadcast();
        }

        if (bestTotal(hand.cards) === 21) {
          hand.stood = true;
          this.broadcast();
          await this.delay(ACTION_PAUSE_MS);
          continue;
        }

        if (isDebugSeatUser(seat.userId) && this.debugBotsHold) {
          hand.stood = true;
          this.activeSeatIndex = si;
          this.activeHandIndex = hi;
          this.broadcast();
          await this.delay(STAND_PAUSE_MS);
          if (!this.alive(gen)) return;
          continue;
        }

        this.activeSeatIndex = si;
        this.activeHandIndex = hi;
        this.broadcast();

        await this.waitForHandAction(gen, si, hi);
        if (!this.alive(gen)) return;
      }
    }

    this.activeSeatIndex = null;
    this.activeHandIndex = null;
    await this.runDealer(gen);
  }

  private waitForHandAction(gen: number, seatIndex: number, handIndex: number): Promise<void> {
    return new Promise((resolve) => {
      const beginPauseThenDone = (pauseMs = ACTION_PAUSE_MS) => {
        this.turnResolve = null;
        this.schedule(pauseMs, () => {
          if (!this.alive(gen)) {
            resolve();
            return;
          }
          this.phaseEndsAt = null;
          this.broadcast();
          resolve();
        });
        this.broadcast();
      };

      this.turnResolve = beginPauseThenDone;

      this.schedule(TURN_MS, () => {
        if (!this.alive(gen)) {
          resolve();
          return;
        }
        const seat = this.seats[seatIndex];
        const hand = seat?.hands[handIndex];
        if (hand && !hand.stood && !evaluateHand(hand.cards).bust) {
          hand.stood = true;
        }
        beginPauseThenDone(STAND_PAUSE_MS);
      });
      this.broadcast();
    });
  }

  private completeTurnAction(pauseMs = ACTION_PAUSE_MS) {
    const resolve = this.turnResolve;
    if (resolve) {
      this.turnResolve = null;
      resolve(pauseMs);
    } else {
      this.broadcast();
    }
  }

  private activeHand(): { seat: SeatState; hand: HandState; seatIndex: number; handIndex: number } | null {
    if (this.phase !== "playerTurns") return null;
    if (this.activeSeatIndex == null || this.activeHandIndex == null) return null;
    const seat = this.seats[this.activeSeatIndex];
    if (!seat) return null;
    const hand = seat.hands[this.activeHandIndex];
    if (!hand) return null;
    return {
      seat,
      hand,
      seatIndex: this.activeSeatIndex,
      handIndex: this.activeHandIndex,
    };
  }

  async hit(userId: string): Promise<string | null> {
    const ctx = this.activeHand();
    if (!ctx || ctx.seat.userId !== userId) return "Not your turn";
    if (ctx.hand.stood) return "Cannot hit";
    if (ctx.hand.resultCents != null) return "Hand already settled";
    ctx.hand.suitedPairSuit = null;
    ctx.hand.cards.push(this.shoe.draw());
    await this.maybePayTripleBonus(ctx.seat, ctx.hand);
    const v = evaluateHand(ctx.hand.cards);
    if (!v.bust && (await this.maybeSettleCharlie(ctx.seat, ctx.hand))) {
      this.completeTurnAction();
      return null;
    }
    if (v.bust || bestTotal(ctx.hand.cards) === 21) {
      ctx.hand.stood = true;
    }
    if (ctx.hand.stood || v.bust) {
      this.completeTurnAction();
    } else {
      this.schedule(TURN_MS, () => {
        ctx.hand.stood = true;
        this.completeTurnAction();
      });
      this.broadcast();
    }
    return null;
  }

  stand(userId: string): string | null {
    const ctx = this.activeHand();
    if (!ctx || ctx.seat.userId !== userId) return "Not your turn";
    ctx.hand.stood = true;
    this.completeTurnAction(STAND_PAUSE_MS);
    return null;
  }

  async double(userId: string): Promise<string | null> {
    const ctx = this.activeHand();
    if (!ctx || ctx.seat.userId !== userId) return "Not your turn";
    if (ctx.hand.stood) return "Cannot double";
    if (ctx.hand.cards.length !== 2) return "Cannot double";
    try {
      const bal = await debitCents(userId, ctx.hand.betCents);
      this.cb.onWalletUpdate(userId, bal);
      ctx.hand.betCents *= 2;
      ctx.hand.doubled = true;
      ctx.hand.suitedPairSuit = null;
      ctx.hand.cards.push(this.shoe.draw());
      ctx.hand.stood = true;
      await this.maybePayTripleBonus(ctx.seat, ctx.hand);
      this.completeTurnAction();
      return null;
    } catch (err) {
      if (err instanceof InsufficientFundsError) return "Insufficient funds";
      throw err;
    }
  }

  async split(userId: string): Promise<string | null> {
    const ctx = this.activeHand();
    if (!ctx || ctx.seat.userId !== userId) return "Not your turn";
    if (ctx.hand.stood) return "Cannot split";
    if (!canSplit(ctx.hand.cards)) return "Cannot split";
    try {
      const bal = await debitCents(userId, ctx.hand.betCents);
      this.cb.onWalletUpdate(userId, bal);
      const card1 = ctx.hand.cards[0];
      const card2 = ctx.hand.cards[1];
      const bet = ctx.hand.betCents;
      const left: HandState = {
        cards: [card1],
        betCents: bet,
        stood: false,
        doubled: false,
        fromSplit: true,
        resultCents: null,
        suitedPairSuit: null,
        tripleBonusPaid: false,
        goldenHand: ctx.hand.goldenHand,
      };
      const right: HandState = {
        cards: [card2],
        betCents: bet,
        stood: false,
        doubled: false,
        fromSplit: true,
        resultCents: null,
        suitedPairSuit: null,
        tripleBonusPaid: false,
        goldenHand: ctx.hand.goldenHand,
      };
      ctx.seat.hands.splice(ctx.handIndex, 1, left, right);
      this.activeHandIndex = ctx.handIndex;

      left.cards.push(this.shoe.draw());
      this.schedule(TURN_MS, () => {
        left.stood = true;
        this.completeTurnAction();
      });
      this.broadcast();
      return null;
    } catch (err) {
      if (err instanceof InsufficientFundsError) return "Insufficient funds";
      throw err;
    }
  }

  private async runDealer(gen: number) {
    this.phase = "dealer";
    this.phaseEndsAt = null;
    this.clearTimer();
    this.dealer.holeRevealed = true;
    this.broadcast();
    await this.delay(DEAL_CARD_MS);
    if (!this.alive(gen)) return;

    const needsDealer = this.seats.some((s) =>
      s?.hands.some(
        (h) => h.resultCents == null && !evaluateHand(h.cards).bust
      )
    );

    if (needsDealer) {
      while (!evaluateHand(this.dealer.cards).bust && !isSoft17OrMore(this.dealer.cards)) {
        await this.delay(DEAL_CARD_MS);
        if (!this.alive(gen)) return;
        this.dealer.cards.push(this.shoe.draw());
        this.broadcast();
      }
    }

    if (evaluateHand(this.dealer.cards).bust) {
      this.broadcast();
      await this.delay(DEALER_BUST_PAUSE_MS);
      if (!this.alive(gen)) return;
    }

    await this.runSettle(gen);
  }

  private winPayout(hand: HandState, baseProfit: number) {
    let profit = baseProfit;
    if (isGoldenHourActive()) {
      profit = applySuitedPairProfit(profit, hand.suitedPairSuit);
    }
    if (hand.goldenHand) {
      return goldenHandWinPayout(hand.betCents, profit);
    }
    return goldenWinPayout(hand.betCents, profit);
  }

  private lossPayout(hand: HandState) {
    if (hand.goldenHand) return goldenHandLossPayout(hand.betCents);
    return goldenLossPayout(hand.betCents);
  }

  private async maybePayTripleBonus(
    seat: SeatState,
    hand: HandState
  ): Promise<void> {
    if (!isGoldenHourActive() || hand.tripleBonusPaid) return;
    if (isDebugSeatUser(seat.userId)) return;
    const bonus = tripleCardBonusCents(hand.cards, hand.fromSplit);
    if (bonus <= 0) return;
    hand.tripleBonusPaid = true;
    const bal = await creditCents(seat.userId, bonus);
    this.cb.onWalletUpdate(seat.userId, bal);
    this.cb.onNotice(
      seat.userId,
      `Triple card bonus — $${(bonus / 100).toFixed(0)}`
    );
    const ghWindow = getGoldenHourWindowStartedAt();
    if (ghWindow) {
      void recordGoldenHourResults(seat.userId, ghWindow, [bonus]);
    }
    this.broadcast();
  }

  /** GH 5-card Charlie: instant 1:1 win + spin voucher. Returns true if settled. */
  private async maybeSettleCharlie(
    seat: SeatState,
    hand: HandState
  ): Promise<boolean> {
    if (!isGoldenHourActive()) return false;
    if (hand.resultCents != null) return false;
    if (hand.cards.length !== 5) return false;
    if (evaluateHand(hand.cards).bust) return false;

    const { resultCents, creditCents: win } = this.winPayout(
      hand,
      hand.betCents
    );
    hand.resultCents = resultCents;
    hand.stood = true;
    hand.suitedPairSuit = null;

    if (!isDebugSeatUser(seat.userId)) {
      const bal = await creditCents(seat.userId, win);
      this.cb.onWalletUpdate(seat.userId, bal);
      await prisma.spinVoucher.create({
        data: { userId: seat.userId, status: "open" },
      });
      await this.refreshSeatSpinProgress(seat.userId);
      this.cb.onNotice(seat.userId, "5-Card Charlie — spin voucher earned");
    }

    seat.charlieFxUntil = Date.now() + 2_400;
    this.broadcast();
    return true;
  }

  private async recordRoundStats(): Promise<void> {
    const byUser = new Map<string, HandOutcomeInput[]>();
    let deltaCents = 0;
    const takeBps = isGoldenHourActive()
      ? JACKPOT_LOSS_TAKE_BPS_GOLDEN
      : JACKPOT_LOSS_TAKE_BPS;
    const dealerBj = isBlackjack(this.dealer.cards);
    for (const seat of this.seats) {
      if (!seat?.hands.length) continue;
      const batch: HandOutcomeInput[] = [];
      for (const hand of seat.hands) {
        if (hand.resultCents == null) continue;
        const take =
          !isDebugSeatUser(seat.userId) && hand.resultCents < 0
            ? jackpotTakeFromLosses(-hand.resultCents, takeBps)
            : 0;
        batch.push({
          resultCents: hand.resultCents,
          betCents: hand.betCents,
          isBlackjack: !hand.fromSplit && isBlackjack(hand.cards),
          doubled: hand.doubled,
          bust: evaluateHand(hand.cards).bust,
          jackpotTakeCents: take,
        });
        deltaCents += take;
      }
      if (seat.insuranceCents > 0) {
        const insResult = dealerBj
          ? goldenWinPayout(seat.insuranceCents, seat.insuranceCents * 2)
              .resultCents
          : goldenLossPayout(seat.insuranceCents).resultCents;
        const take =
          !isDebugSeatUser(seat.userId) && insResult < 0
            ? jackpotTakeFromLosses(-insResult, takeBps)
            : 0;
        batch.push({
          resultCents: insResult,
          betCents: seat.insuranceCents,
          isBlackjack: false,
          doubled: false,
          bust: false,
          isInsurance: true,
          jackpotTakeCents: take,
        });
        deltaCents += take;
      }
      if (batch.length === 0) continue;
      if (isDebugSeatUser(seat.userId)) continue;
      const existing = byUser.get(seat.userId);
      if (existing) existing.push(...batch);
      else byUser.set(seat.userId, batch);
    }

    const bjJobs: Promise<void>[] = [];
    const rebateJobs: Promise<void>[] = [];
    const ghWindow = isGoldenHourActive()
      ? getGoldenHourWindowStartedAt()
      : null;
    for (const [userId, hands] of byUser) {
      const newBlackjacks = hands.filter((h) => h.isBlackjack).length;
      if (newBlackjacks > 0) {
        bjJobs.push(
          recordHandOutcomes(userId, hands)
            .then(() => this.afterBlackjackSettle(userId, newBlackjacks))
            .catch((err) =>
              console.error("[stats] recordHandOutcomes failed", userId, err)
            )
        );
      } else {
        recordHandOutcomesSafe(userId, hands);
      }
      if (ghWindow) {
        rebateJobs.push(
          recordGoldenHourResults(
            userId,
            ghWindow,
            hands.map((h) => h.resultCents)
          ).then(() => undefined)
            .catch((err) => {
              console.error("[golden-hour] rebate track failed", userId, err);
            })
        );
        const played = hands.filter((h) => !h.isInsurance).length;
        if (played > 0) {
          void recordGoldenHourHandsPlayed(userId, played)
            .then(async ({ granted, goldenHands }) => {
              const seat = this.seats.find((s) => s?.userId === userId);
              if (seat) {
                seat.goldenHands = goldenHands;
                this.broadcast();
              }
              if (granted > 0) {
                this.cb.onNotice(
                  userId,
                  `Earned ${granted} Golden Hand${granted > 1 ? "s" : ""}`
                );
              }
            })
            .catch((err) =>
              console.error("[golden-hands] grant failed", userId, err)
            );
        }
      }
    }

    if (rebateJobs.length > 0) {
      await Promise.all(rebateJobs);
    }

    if (deltaCents > 0) {
      this.cb.onJackpotDelta(deltaCents);
    }

    if (bjJobs.length > 0) {
      await Promise.all(bjJobs);
    }
  }

  private async afterBlackjackSettle(userId: string, newBlackjacks: number) {
    try {
      await maybeGrantSpinVouchers(userId, newBlackjacks);
      await this.refreshSeatSpinProgress(userId);
    } catch (err) {
      console.error("[jackpot] voucher grant failed", userId, err);
    }
  }

  private async refreshSeatSpinProgress(userId: string) {
    if (isDebugSeatUser(userId)) return;
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return;
    const prog = await getSpinSeatProgress(userId);
    const seat = this.seats[seatIdx];
    if (!seat || seat.userId !== userId) return;
    seat.bjTowardSpin = prog.bjTowardSpin;
    seat.spinVouchers = prog.spinVouchers;
  }

  private async refreshSeatGoldenHands(userId: string) {
    if (isDebugSeatUser(userId)) return;
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return;
    const seat = this.seats[seatIdx];
    if (!seat || seat.userId !== userId) return;
    seat.goldenHands = await getGoldenHandsInventory(userId);
  }

  async toggleGoldenHand(userId: string): Promise<string | null> {
    if (this.phase !== "betting") return "Only during betting";
    if (this.spin) return "Not now";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    if (isDebugSeatUser(userId)) return "Not available";

    if (seat.goldenHandArmed) {
      seat.goldenHandArmed = false;
      seat.goldenHands = await returnGoldenHand(userId);
      this.broadcast();
      return null;
    }

    if (seat.pendingBetCents > GOLDEN_HAND_MAX_BET_CENTS) {
      return `Golden Hand max bet is $${(GOLDEN_HAND_MAX_BET_CENTS / 100).toFixed(0)}`;
    }

    const ok = await reserveGoldenHand(userId);
    if (!ok) return "No Golden Hands left";
    seat.goldenHandArmed = true;
    seat.goldenHands = await getGoldenHandsInventory(userId);
    this.broadcast();
    return null;
  }

  async notifyGoldenHandsGranted(userId: string): Promise<void> {
    await this.refreshSeatGoldenHands(userId);
    if (this.findSeatIndex(userId) >= 0) this.broadcast();
  }

  /** Refresh seat voucher lights after an external grant (admin / HTTP). */
  async notifyVoucherGranted(userId: string): Promise<void> {
    await this.refreshSeatSpinProgress(userId);
    if (this.findSeatIndex(userId) >= 0) this.broadcast();
  }

  /** Player starts a jackpot spin during betting (pauses the table). */
  async claimSpin(userId: string): Promise<string | null> {
    if (this.phase !== "betting") return "Only during betting";
    if (this.spin) return "A spin is already in progress";
    if (isDebugSeatUser(userId)) return "Not available";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    if (seat.pendingBetCents > 0) return "Clear your bet before spinning";

    const voucher = await prisma.spinVoucher.findFirst({
      where: { userId, status: "open" },
      orderBy: { createdAt: "asc" },
    });
    if (!voucher) return "No spin voucher";

    const available = await getAvailablePotCents();
    if (available <= 0) return "Jackpot pot is empty";

    const remaining = this.phaseEndsAt
      ? Math.max(0, this.phaseEndsAt - Date.now())
      : BETTING_MS;
    this.clearTimer();
    this.phaseEndsAt = null;
    const offerEndsAt = Date.now() + SPIN_OFFER_MS;
    this.spin = {
      userId,
      seatIndex: seatIdx,
      name: seat.name,
      voucherId: voucher.id,
      phase: "offer",
      remainingBettingMs: remaining,
      offerEndsAt,
      potBeforeCents: available,
    };
    this.broadcast();
    const gen = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.destroyed || this.generation !== gen) return;
      void this.goSpin(userId);
    }, SPIN_OFFER_MS);
    return null;
  }

  /** Cancel offer — keep voucher and resume betting. */
  cancelSpin(userId: string): string | null {
    if (!this.spin || this.spin.userId !== userId) return "Not your spin";
    if (this.spin.phase !== "offer") return "Too late to cancel";
    this.clearTimer();
    const remaining = this.spin.remainingBettingMs;
    this.spin = null;
    if (this.phase === "betting" && !this.destroyed) {
      const ms = Math.max(SPIN_RESUME_MIN_MS, remaining);
      this.schedule(ms, () => void this.lockBetsAndDeal());
    }
    this.broadcast();
    return null;
  }

  /** Spinner clicks to spin the wheel. */
  async goSpin(userId: string): Promise<string | null> {
    if (!this.spin || this.spin.userId !== userId) return "Not your spin";
    if (this.spin.phase !== "offer") return "Already spinning";
    this.clearTimer();

    const potBefore = await getAvailablePotCents();
    if (potBefore <= 0) {
      this.spin = null;
      this.resumeBettingAfterSpin(SPIN_RESUME_MIN_MS);
      return "Jackpot pot is empty";
    }

    const { tileIndex, tile } =
      this.debugSpinBias != null
        ? pickWheelTileAt(this.debugSpinBias)
        : pickWheelTile();
    const payoutCents = payoutForTile(tile, potBefore);
    const kind = tile.kind;
    const pctBps = tile.kind === "percent" ? tile.pctBps : 0;
    const label = tile.label;
    const voucherId = this.spin.voucherId;
    const seatIdx = this.spin.seatIndex;
    const name = this.spin.name;
    const gen = this.generation;

    try {
      await prisma.$transaction(async (tx) => {
        const v = await tx.spinVoucher.findUnique({ where: { id: voucherId } });
        if (!v || v.status !== "open" || v.userId !== userId) {
          throw new Error("Voucher gone");
        }
        await tx.spinVoucher.update({
          where: { id: voucherId },
          data: { status: "used", usedAt: new Date() },
        });
        await tx.jackpotClaim.create({
          data: {
            userId,
            userName: name,
            tableId: this.id,
            tableName: this.name,
            voucherId,
            tileIndex,
            kind,
            pctBps,
            payoutCents,
            potBeforeCents: potBefore,
          },
        });
      });
    } catch (err) {
      console.error("[jackpot] spin commit failed", err);
      this.spin = null;
      this.resumeBettingAfterSpin(SPIN_RESUME_MIN_MS);
      return "Spin failed";
    }

    if (!this.alive(gen)) return null;

    // Broadcast tile only — withhold payout/label until the wheel animation finishes.
    this.spin = {
      ...this.spin,
      phase: "result",
      tileIndex,
      offerEndsAt: undefined,
    };
    this.broadcast();

    const claimEntry = {
      id: voucherId,
      userId,
      userName: name,
      tableId: this.id,
      tableName: this.name,
      tileIndex,
      kind: kind as "percent" | "flat",
      pctBps,
      payoutCents,
      potBeforeCents: potBefore,
      label,
      createdAt: new Date().toISOString(),
    };
    const claimRow = await prisma.jackpotClaim.findUnique({
      where: { voucherId },
    });
    if (claimRow) {
      claimEntry.id = claimRow.id;
      claimEntry.createdAt = claimRow.createdAt.toISOString();
    }

    const remaining = this.spin.remainingBettingMs;
    await this.waitForSpinAnimationDone(userId);
    if (!this.alive(gen) || !this.spin || this.spin.userId !== userId) {
      return null;
    }

    this.spin = {
      ...this.spin,
      label,
      kind,
      pctBps,
      payoutCents,
      potBeforeCents: potBefore,
    };
    if (tileIndex === 0 || pctBps === 10_000) {
      this.jackpotCelebrateUntil = Date.now() + JACKPOT_CELEBRATE_MS;
    }
    this.broadcast();

    if (payoutCents > 0) {
      const bal = await creditCents(userId, payoutCents);
      this.cb.onWalletUpdate(userId, bal);
    }
    this.cb.onJackpotClaim(claimEntry);
    this.cb.onJackpotWin({
      userId,
      name,
      tableId: this.id,
      tableName: this.name,
      kind: kind as "percent" | "flat",
      pctBps,
      payoutCents,
      label,
    });

    await this.refreshSeatSpinProgress(userId);
    await this.delay(SPIN_REVEAL_HOLD_MS);
    if (!this.alive(gen)) return null;
    this.spin = null;
    this.resumeBettingAfterSpin(remaining);
    return null;
  }

  /** Client signals the seat wheel animation finished. */
  notifySpinDone(userId: string): void {
    if (!this.spinDoneWait || this.spinDoneWait.userId !== userId) return;
    const { resolve } = this.spinDoneWait;
    this.spinDoneWait = null;
    resolve();
  }

  private waitForSpinAnimationDone(userId: string): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this.spinDoneWait?.userId === userId) this.spinDoneWait = null;
        resolve();
      };
      this.spinDoneWait = { userId, resolve: finish };
      setTimeout(finish, SPIN_DONE_TIMEOUT_MS);
    });
  }

  private resumeBettingAfterSpin(remainingBettingMs: number) {
    if (this.phase !== "betting" || this.destroyed) return;
    if (this.seatedCount() === 0) {
      this.allBetClamped = false;
      this.clearTimer();
      this.broadcast();
      return;
    }
    const ms = Math.max(SPIN_RESUME_MIN_MS, remainingBettingMs);
    this.schedule(ms, () => void this.lockBetsAndDeal());
    this.broadcast();
  }

  private async runSettle(gen: number) {
    this.phase = "settle";
    this.phaseEndsAt = null;
    this.clearTimer();

    const dealerVal = evaluateHand(this.dealer.cards);
    const dealerBj = isBlackjack(this.dealer.cards);
    const dealerTotal = dealerVal.bust ? -1 : bestTotal(this.dealer.cards);

    const deferredPayouts: { userId: string; cents: number }[] = [];

    for (const seat of this.seats) {
      if (!seat?.hands.length) continue;
      for (const hand of seat.hands) {
        if (hand.resultCents != null) continue;

        const playerBj = !hand.fromSplit && isBlackjack(hand.cards);
        const playerVal = evaluateHand(hand.cards);

        if (playerBj && !dealerBj) {
          const baseProfit = Math.floor(hand.betCents * 2.5) - hand.betCents;
          const { resultCents, creditCents: win } = this.winPayout(
            hand,
            baseProfit
          );
          hand.resultCents = resultCents;
          if (!isDebugSeatUser(seat.userId)) {
            deferredPayouts.push({ userId: seat.userId, cents: win });
          }
          continue;
        }

        if (playerVal.bust) {
          const loss = this.lossPayout(hand);
          hand.resultCents = loss.resultCents;
          if (loss.refundCents > 0 && !isDebugSeatUser(seat.userId)) {
            const bal = await creditCents(seat.userId, loss.refundCents);
            if (!this.alive(gen)) return;
            this.cb.onWalletUpdate(seat.userId, bal);
          }
          continue;
        }

        if (dealerVal.bust) {
          const { resultCents, creditCents: win } = this.winPayout(
            hand,
            hand.betCents
          );
          hand.resultCents = resultCents;
          if (!isDebugSeatUser(seat.userId)) {
            deferredPayouts.push({ userId: seat.userId, cents: win });
          }
          continue;
        }

        const playerTotal = bestTotal(hand.cards);
        if (playerTotal > dealerTotal) {
          const { resultCents, creditCents: win } = this.winPayout(
            hand,
            hand.betCents
          );
          hand.resultCents = resultCents;
          if (!isDebugSeatUser(seat.userId)) {
            deferredPayouts.push({ userId: seat.userId, cents: win });
          }
        } else if (playerTotal < dealerTotal) {
          const loss = this.lossPayout(hand);
          hand.resultCents = loss.resultCents;
          if (loss.refundCents > 0 && !isDebugSeatUser(seat.userId)) {
            const bal = await creditCents(seat.userId, loss.refundCents);
            if (!this.alive(gen)) return;
            this.cb.onWalletUpdate(seat.userId, bal);
          }
        } else {
          hand.resultCents = 0;
          if (!isDebugSeatUser(seat.userId)) {
            const bal = await creditCents(seat.userId, hand.betCents);
            if (!this.alive(gen)) return;
            this.cb.onWalletUpdate(seat.userId, bal);
          }
        }
      }
    }

    this.broadcast();

    if (deferredPayouts.length > 0) {
      await this.delay(SETTLE_WIN_PAYOUT_MS);
      if (!this.alive(gen)) return;

      const byUser = new Map<string, number>();
      for (const p of deferredPayouts) {
        byUser.set(p.userId, (byUser.get(p.userId) ?? 0) + p.cents);
      }
      for (const [userId, cents] of byUser) {
        const bal = await creditCents(userId, cents);
        if (!this.alive(gen)) return;
        this.cb.onWalletUpdate(userId, bal);
      }
    }

    // After wallet settles so HandOutcome.balanceAfterCents is post-payout.
    // Await BJ voucher grants so pip celebrate lands during settle, not next bet.
    await this.recordRoundStats();
    if (!this.alive(gen)) return;
    this.broadcast();

    await this.ejectBrokePlayers();
    if (!this.alive(gen)) return;

    this.schedule(SETTLE_MS, () => {
      if (!this.alive(gen)) return;
      this.startBetting();
    });
  }

  // —— Staging debug (ALLOW_TABLE_DEBUG) ——

  debugSetBet(userId: string, cents: number): string | null {
    if (this.phase !== "betting") return "Not betting";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    if (cents < 0) return "Invalid bet";
    if (cents > 0 && cents < MIN_BET_CENTS) {
      return `Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(0)}`;
    }
    const seat = this.seats[seatIdx]!;
    seat.pendingBetCents = cents;
    if (cents > 0) this.onBettingActivity();
    else this.broadcast();
    return null;
  }

  debugSpawnBot(opts: {
    seatIndex: number;
    name?: string;
    betCents: number;
  }): string | null {
    if (this.phase !== "betting") return "Not betting";
    const { seatIndex, betCents } = opts;
    if (seatIndex < 0 || seatIndex >= SEAT_CAPACITY) return "Invalid seat";
    if (this.seats[seatIndex]) return "Seat taken";
    if (betCents < MIN_BET_CENTS) {
      return `Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(0)}`;
    }
    const name = (opts.name?.trim() || `Bot ${seatIndex + 1}`).slice(0, 24);
    this.seats[seatIndex] = {
      userId: `debug:bot-${seatIndex}-${Date.now()}`,
      name,
      pendingBetCents: betCents,
      lastBetCents: betCents,
      hands: [],
      insuranceCents: 0,
      insuranceResolved: false,
      missedRounds: 0,
      connected: true,
      bjTowardSpin: 0,
      spinVouchers: 0,
      charlieFxUntil: null,
      goldenHandArmed: false,
      goldenHands: 0,
    };
    this.onBettingActivity();
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();
    return null;
  }

  debugClearBots(): number {
    let n = 0;
    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i];
      if (!seat || !isDebugSeatUser(seat.userId)) continue;
      this.seats[i] = null;
      n += 1;
    }
    if (n > 0) {
      if (this.phase === "betting" && !this.spin) {
        this.onBettingActivity();
      } else {
        this.broadcast();
      }
      this.cb.onSeatedChanged(this.id);
      this.cb.onLobbyChanged();
    }
    return n;
  }

  debugStackCards(tokens: string[]): string | null {
    const parsed = parseDebugCardList(tokens);
    if (parsed.error) return parsed.error;
    this.shoe.stackNext(parsed.cards);
    this.broadcast();
    return null;
  }

  debugClearStack(): void {
    this.shoe.clearInject();
    this.broadcast();
  }

  debugStackRemaining(): number {
    return this.shoe.injectRemaining();
  }

  debugSetBotsHold(hold: boolean): void {
    this.debugBotsHold = hold;
    this.broadcast();
  }

  debugSetTimerPaused(paused: boolean): void {
    if (paused === this.debugTimerPaused) {
      this.broadcast();
      return;
    }
    this.debugTimerPaused = paused;
    if (paused) this.pausePhaseTimer();
    else this.resumePhaseTimer();
    this.broadcast();
  }

  debugSetSpinBias(tileIndex: number | null): string | null {
    if (tileIndex == null) {
      this.debugSpinBias = null;
      this.broadcast();
      return null;
    }
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 99) {
      return "Bias must be 0–99 or null";
    }
    this.debugSpinBias = tileIndex;
    this.broadcast();
    return null;
  }

  async debugGrantVoucher(
    userId: string,
    count = 1
  ): Promise<string | null> {
    if (isDebugSeatUser(userId)) return "Not for bots";
    const n = Math.min(10, Math.max(1, Math.floor(count)));
    await prisma.spinVoucher.createMany({
      data: Array.from({ length: n }, () => ({
        userId,
        status: "open",
      })),
    });
    await this.refreshSeatSpinProgress(userId);
    this.broadcast();
    return null;
  }

  async debugGrantGoldenHands(
    userId: string,
    count = 1
  ): Promise<string | null> {
    if (isDebugSeatUser(userId)) return "Not for bots";
    const n = Math.min(100, Math.max(1, Math.floor(count)));
    const total = await grantGoldenHands(userId, n);
    await this.refreshSeatGoldenHands(userId);
    this.broadcast();
    this.cb.onNotice(userId, `Debug: ${n} Golden Hand(s) · inventory ${total}`);
    return null;
  }

  debugDealNow(): string | null {
    if (this.phase !== "betting") return "Not betting";
    this.clearTimer();
    this.phaseEndsAt = null;
    void this.lockBetsAndDeal();
    return null;
  }
}
