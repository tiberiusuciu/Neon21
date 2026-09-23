import {
  CHIP_DENOMINATIONS_CENTS,
  MIN_BET_CENTS,
  SEAT_CAPACITY,
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
} from "./cards.js";
import {
  ACTION_PAUSE_MS,
  ALL_BET_CLAMP_MS,
  BETTING_MS,
  DEAL_CARD_MS,
  DEALER_BUST_PAUSE_MS,
  SETTLE_WIN_PAYOUT_MS,
  INSURANCE_MS,
  MAX_SPLIT_HANDS,
  SETTLE_MS,
  TURN_MS,
  type DealerState,
  type HandState,
  type RoomCallbacks,
  type SeatState,
  type Spectator,
} from "./types.js";
import { InsufficientFundsError, debitCents, getBalanceCents, creditCents } from "./wallet.js";
import { recordHandOutcomesSafe, type HandOutcomeInput } from "./stats.js";

function emptyHand(betCents: number): HandState {
  return {
    cards: [],
    betCents,
    stood: false,
    doubled: false,
    fromSplit: false,
    fromSplitAces: false,
    resultCents: null,
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
  private turnResolve: (() => void) | null = null;
  private insuranceWait: (() => void) | null = null;
  private cb: RoomCallbacks;

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
      status: playerCount >= SEAT_CAPACITY ? "busy" : "open",
    };
  }

  getSnapshot(): TableStateSnapshot {
    return {
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
    };
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
      connected: seat.connected,
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
  }

  private schedule(ms: number, fn: () => void) {
    this.clearTimer();
    const gen = this.generation;
    const ends = Date.now() + ms;
    this.phaseEndsAt = ends;
    this.timer = setTimeout(() => {
      this.timer = null;
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

  join(userId: string, name: string) {
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx >= 0) {
      this.seats[seatIdx]!.connected = true;
      this.seats[seatIdx]!.name = name;
      this.broadcast();
      void this.kickIfBroke(userId);
      return;
    }
    this.spectators.set(userId, { userId, name });
    this.broadcast();
  }

  leave(userId: string) {
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx >= 0) {
      this.clearSeat(seatIdx);
    }
    this.spectators.delete(userId);
    this.broadcast();
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();
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
    };
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
    this.seats[seatIdx] = null;
    this.spectators.set(userId, { userId, name: seat.name });
    this.broadcast();
    this.cb.onSeatedChanged(this.id);
    this.cb.onLobbyChanged();
    return null;
  }

  /** Kick if broke and not mid-hand (betting with no cards dealt yet). */
  async kickIfBroke(userId: string): Promise<boolean> {
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
    this.broadcast();
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
    if (!(CHIP_DENOMINATIONS_CENTS as readonly number[]).includes(cents)) {
      return "Invalid chip";
    }
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    const bal = await getBalanceCents(userId);
    if (bal == null) return "User not found";

    const available = bal - seat.pendingBetCents;
    if (available <= 0) return "Insufficient funds";

    // Chip fits → add chip. Chip too big → all-in with remaining balance.
    const add = cents <= available ? cents : available;

    if (seat.pendingBetCents === 0 && add < MIN_BET_CENTS) {
      return `Minimum bet is $${(MIN_BET_CENTS / 100).toFixed(0)}`;
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

  /** Any bet change restarts the short “about to begin” window. */
  private onBettingActivity() {
    if (this.phase !== "betting") return;
    this.allBetClamped = true;
    this.schedule(ALL_BET_CLAMP_MS, () => void this.lockBetsAndDeal());
    this.broadcast();
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
    this.schedule(BETTING_MS, () => void this.lockBetsAndDeal());
    this.broadcast();
  }

  private async lockBetsAndDeal() {
    const gen = this.generation;
    const toKick: number[] = [];

    for (let i = 0; i < this.seats.length; i++) {
      const seat = this.seats[i];
      if (!seat) continue;
      if (seat.pendingBetCents >= MIN_BET_CENTS) {
        try {
          const bal = await debitCents(seat.userId, seat.pendingBetCents);
          if (!this.alive(gen)) return;
          this.cb.onWalletUpdate(seat.userId, bal);
          seat.lastBetCents = seat.pendingBetCents;
          seat.hands = [emptyHand(seat.pendingBetCents)];
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
    if (!this.alive(gen)) return;

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
    if (this.phase !== "insurance") return;
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
    if (this.phase !== "insurance") return "Not insurance phase";
    const seatIdx = this.findSeatIndex(userId);
    if (seatIdx < 0) return "Not seated";
    const seat = this.seats[seatIdx]!;
    if (!seat.hands.length) return "Not in round";
    if (seat.insuranceResolved || seat.insuranceCents > 0) return "Already decided";
    const mainBet = seat.hands[0].betCents;
    const cost = Math.floor(mainBet / 2);
    if (cost < 1) return "Invalid";
    try {
      const bal = await debitCents(userId, cost);
      this.cb.onWalletUpdate(userId, bal);
      seat.insuranceCents = cost;
      seat.insuranceResolved = true;
      this.broadcast();
      this.maybeFinishInsuranceEarly();
      return null;
    } catch (err) {
      if (err instanceof InsufficientFundsError) return "Insufficient funds";
      throw err;
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

  private async afterInsuranceOrSkip(gen: number) {
    const dealerBj = isBlackjack(this.dealer.cards);

    if (this.dealer.cards[0]?.rank === "A") {
      for (const seat of this.seats) {
        if (!seat || seat.insuranceCents <= 0) continue;
        if (dealerBj) {
          const payout = seat.insuranceCents * 3;
          const bal = await creditCents(seat.userId, payout);
          if (!this.alive(gen)) return;
          this.cb.onWalletUpdate(seat.userId, bal);
        }
      }
    }

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
            hand.resultCents = -hand.betCents;
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
        if (hand.stood || evaluateHand(hand.cards).bust) continue;
        if (!hand.fromSplit && isBlackjack(hand.cards)) continue;

        if (hand.cards.length === 1 && hand.fromSplit) {
          await this.delay(DEAL_CARD_MS);
          if (!this.alive(gen)) return;
          hand.cards.push(this.shoe.draw());
          this.broadcast();
        }

        if (hand.fromSplitAces || bestTotal(hand.cards) === 21) {
          hand.stood = true;
          this.broadcast();
          await this.delay(ACTION_PAUSE_MS);
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
      const beginPauseThenDone = () => {
        this.turnResolve = null;
        this.schedule(ACTION_PAUSE_MS, () => {
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
        beginPauseThenDone();
      });
      this.broadcast();
    });
  }

  private completeTurnAction() {
    const resolve = this.turnResolve;
    if (resolve) {
      this.turnResolve = null;
      resolve();
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

  hit(userId: string): string | null {
    const ctx = this.activeHand();
    if (!ctx || ctx.seat.userId !== userId) return "Not your turn";
    if (ctx.hand.stood || ctx.hand.fromSplitAces) return "Cannot hit";
    ctx.hand.cards.push(this.shoe.draw());
    const v = evaluateHand(ctx.hand.cards);
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
    this.completeTurnAction();
    return null;
  }

  async double(userId: string): Promise<string | null> {
    const ctx = this.activeHand();
    if (!ctx || ctx.seat.userId !== userId) return "Not your turn";
    if (ctx.hand.stood || ctx.hand.fromSplitAces) return "Cannot double";
    if (ctx.hand.cards.length !== 2) return "Cannot double";
    try {
      const bal = await debitCents(userId, ctx.hand.betCents);
      this.cb.onWalletUpdate(userId, bal);
      ctx.hand.betCents *= 2;
      ctx.hand.doubled = true;
      ctx.hand.cards.push(this.shoe.draw());
      ctx.hand.stood = true;
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
    if (ctx.hand.fromSplitAces) return "Cannot re-split aces";
    if (ctx.seat.hands.length >= MAX_SPLIT_HANDS) return "Max splits reached";
    if (!canSplit(ctx.hand.cards)) return "Cannot split";
    const isAces = ctx.hand.cards[0].rank === "A";
    if (isAces && ctx.hand.fromSplit) return "Cannot re-split aces";
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
        fromSplitAces: isAces,
        resultCents: null,
      };
      const right: HandState = {
        cards: [card2],
        betCents: bet,
        stood: false,
        doubled: false,
        fromSplit: true,
        fromSplitAces: isAces,
        resultCents: null,
      };
      ctx.seat.hands.splice(ctx.handIndex, 1, left, right);
      this.activeHandIndex = ctx.handIndex;

      if (isAces) {
        left.cards.push(this.shoe.draw());
        left.stood = true;
        this.completeTurnAction();
        return null;
      }

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
      s?.hands.some((h) => !evaluateHand(h.cards).bust)
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

  private recordRoundStats() {
    const byUser = new Map<string, HandOutcomeInput[]>();
    for (const seat of this.seats) {
      if (!seat?.hands.length) continue;
      const batch: HandOutcomeInput[] = [];
      for (const hand of seat.hands) {
        if (hand.resultCents == null) continue;
        batch.push({
          resultCents: hand.resultCents,
          betCents: hand.betCents,
          isBlackjack: !hand.fromSplit && isBlackjack(hand.cards),
          doubled: hand.doubled,
          bust: evaluateHand(hand.cards).bust,
        });
      }
      if (batch.length === 0) continue;
      const existing = byUser.get(seat.userId);
      if (existing) existing.push(...batch);
      else byUser.set(seat.userId, batch);
    }
    for (const [userId, hands] of byUser) {
      recordHandOutcomesSafe(userId, hands);
    }
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
          const win = Math.floor(hand.betCents * 2.5);
          hand.resultCents = win - hand.betCents;
          deferredPayouts.push({ userId: seat.userId, cents: win });
          continue;
        }

        if (playerVal.bust) {
          hand.resultCents = -hand.betCents;
          continue;
        }

        if (dealerVal.bust) {
          const win = hand.betCents * 2;
          hand.resultCents = hand.betCents;
          deferredPayouts.push({ userId: seat.userId, cents: win });
          continue;
        }

        const playerTotal = bestTotal(hand.cards);
        if (playerTotal > dealerTotal) {
          const win = hand.betCents * 2;
          hand.resultCents = hand.betCents;
          deferredPayouts.push({ userId: seat.userId, cents: win });
        } else if (playerTotal < dealerTotal) {
          hand.resultCents = -hand.betCents;
        } else {
          hand.resultCents = 0;
          const bal = await creditCents(seat.userId, hand.betCents);
          if (!this.alive(gen)) return;
          this.cb.onWalletUpdate(seat.userId, bal);
        }
      }
    }

    this.recordRoundStats();
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

    await this.ejectBrokePlayers();
    if (!this.alive(gen)) return;

    this.schedule(SETTLE_MS, () => {
      if (!this.alive(gen)) return;
      this.startBetting();
    });
  }
}
