import type { GoldenHourPublic } from "@neon21/shared";
import { prisma } from "./prisma.js";
import { payGoldenHourRebates } from "./golden-hour-rebate.js";

const ROW_ID = "golden_hour";
export const GOLDEN_HOUR_DURATION_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Inclusive min gap between Golden Hour windows. */
export const GOLDEN_HOUR_COOLDOWN_MIN_MS = 4 * HOUR_MS;
/** Inclusive max gap between Golden Hour windows. */
export const GOLDEN_HOUR_COOLDOWN_MAX_MS = 12 * HOUR_MS;

type Row = {
  id: string;
  disabled: boolean;
  activeUntil: Date | null;
  nextStartsAt: Date | null;
  windowStartedAt: Date | null;
};

type Transition = "started" | "ended" | null;

type Broadcaster = (state: GoldenHourPublic, transition: Transition) => void;

let cache: Row | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let broadcaster: Broadcaster | null = null;
let ticking = false;

function randomCooldownMs(): number {
  const span =
    GOLDEN_HOUR_COOLDOWN_MAX_MS - GOLDEN_HOUR_COOLDOWN_MIN_MS + HOUR_MS;
  const steps = Math.max(1, Math.floor(span / HOUR_MS));
  return (
    GOLDEN_HOUR_COOLDOWN_MIN_MS + Math.floor(Math.random() * steps) * HOUR_MS
  );
}

function toPublic(row: Row, now = Date.now()): GoldenHourPublic {
  const active =
    !row.disabled &&
    row.activeUntil != null &&
    row.activeUntil.getTime() > now;
  return {
    disabled: row.disabled,
    active,
    activeUntil: active && row.activeUntil ? row.activeUntil.getTime() : null,
    nextStartsAt:
      !active && !row.disabled && row.nextStartsAt
        ? row.nextStartsAt.getTime()
        : null,
    windowStartedAt: row.windowStartedAt
      ? row.windowStartedAt.getTime()
      : null,
  };
}

function emit(transition: Transition = null) {
  if (!cache || !broadcaster) return;
  broadcaster(toPublic(cache), transition);
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleWake() {
  clearTimer();
  if (!cache || cache.disabled) return;
  const now = Date.now();
  let wakeAt: number | null = null;
  if (cache.activeUntil && cache.activeUntil.getTime() > now) {
    wakeAt = cache.activeUntil.getTime();
  } else if (cache.nextStartsAt) {
    wakeAt = cache.nextStartsAt.getTime();
  }
  if (wakeAt == null) return;
  const delay = Math.max(50, wakeAt - now);
  timer = setTimeout(() => {
    void tick();
  }, delay);
}

async function persist(data: {
  disabled?: boolean;
  activeUntil?: Date | null;
  nextStartsAt?: Date | null;
  windowStartedAt?: Date | null;
}): Promise<Row> {
  const row = await prisma.goldenHourState.upsert({
    where: { id: ROW_ID },
    create: {
      id: ROW_ID,
      disabled: data.disabled ?? false,
      activeUntil: data.activeUntil ?? null,
      nextStartsAt: data.nextStartsAt ?? null,
      windowStartedAt: data.windowStartedAt ?? null,
    },
    update: {
      ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
      ...(data.activeUntil !== undefined
        ? { activeUntil: data.activeUntil }
        : {}),
      ...(data.nextStartsAt !== undefined
        ? { nextStartsAt: data.nextStartsAt }
        : {}),
      ...(data.windowStartedAt !== undefined
        ? { windowStartedAt: data.windowStartedAt }
        : {}),
    },
  });
  cache = row;
  return row;
}

async function loadRow(): Promise<Row> {
  const existing = await prisma.goldenHourState.findUnique({
    where: { id: ROW_ID },
  });
  if (existing) {
    cache = existing;
    return existing;
  }
  return persist({});
}

async function ensureSchedule(row: Row): Promise<Row> {
  if (row.disabled) return row;
  const now = Date.now();
  const active =
    row.activeUntil != null && row.activeUntil.getTime() > now;
  if (active) return row;
  if (row.nextStartsAt != null && row.nextStartsAt.getTime() > now) {
    return row;
  }
  return persist({
    activeUntil: null,
    nextStartsAt: new Date(now + randomCooldownMs()),
  });
}

async function endWindow(row: Row, now: number): Promise<Row> {
  const windowStartedAt = row.windowStartedAt;
  const next = await persist({
    activeUntil: null,
    nextStartsAt: new Date(now + randomCooldownMs()),
    windowStartedAt: null,
  });
  if (windowStartedAt) {
    try {
      await payGoldenHourRebates(windowStartedAt);
    } catch (err) {
      console.error("[golden-hour] rebate payout failed", err);
    }
  }
  return next;
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    let row = cache ?? (await loadRow());
    const now = Date.now();
    let transition: Transition = null;

    if (!row.disabled) {
      if (row.activeUntil && row.activeUntil.getTime() <= now) {
        row = await endWindow(row, now);
        transition = "ended";
      } else if (
        !row.activeUntil &&
        row.nextStartsAt &&
        row.nextStartsAt.getTime() <= now
      ) {
        const startedAt = new Date(now);
        row = await persist({
          activeUntil: new Date(now + GOLDEN_HOUR_DURATION_MS),
          nextStartsAt: null,
          windowStartedAt: startedAt,
        });
        transition = "started";
      }
    }

    row = await ensureSchedule(row);
    emit(transition);
    scheduleWake();
  } finally {
    ticking = false;
  }
}

export function setGoldenHourBroadcaster(fn: Broadcaster | null) {
  broadcaster = fn;
}

export async function initGoldenHour(): Promise<void> {
  await loadRow();
  await tick();
}

export function getGoldenHourPublic(): GoldenHourPublic {
  if (!cache) {
    return {
      disabled: false,
      active: false,
      activeUntil: null,
      nextStartsAt: null,
      windowStartedAt: null,
    };
  }
  return toPublic(cache);
}

export function isGoldenHourActive(): boolean {
  return getGoldenHourPublic().active;
}

export function getGoldenHourWindowStartedAt(): Date | null {
  if (!cache?.windowStartedAt || !isGoldenHourActive()) return null;
  return cache.windowStartedAt;
}

/** Standard win payout (no global Golden Hour multiplier). */
export function goldenWinPayout(
  betCents: number,
  profitCents: number
): { resultCents: number; creditCents: number } {
  return { resultCents: profitCents, creditCents: betCents + profitCents };
}

/** Standard loss payout (no global Golden Hour half-loss). */
export function goldenLossPayout(betCents: number): {
  resultCents: number;
  refundCents: number;
} {
  return { resultCents: -betCents, refundCents: 0 };
}

/** Per-hand Golden Hand token: 1.5× profit. */
export function goldenHandWinPayout(
  betCents: number,
  profitCents: number
): { resultCents: number; creditCents: number } {
  const profit = Math.floor(profitCents * 1.5);
  return { resultCents: profit, creditCents: betCents + profit };
}

/** Per-hand Golden Hand token: half loss refunded. */
export function goldenHandLossPayout(betCents: number): {
  resultCents: number;
  refundCents: number;
} {
  const loss = Math.floor(betCents / 2);
  return { resultCents: -loss, refundCents: betCents - loss };
}

export async function adminStartGoldenHour(): Promise<GoldenHourPublic> {
  const now = Date.now();
  const startedAt = new Date(now);
  await persist({
    disabled: false,
    activeUntil: new Date(now + GOLDEN_HOUR_DURATION_MS),
    nextStartsAt: null,
    windowStartedAt: startedAt,
  });
  emit("started");
  scheduleWake();
  return getGoldenHourPublic();
}

export async function adminEndGoldenHour(): Promise<GoldenHourPublic> {
  const now = Date.now();
  const wasActive = isGoldenHourActive();
  if (wasActive && cache) {
    await endWindow(cache, now);
  } else {
    await persist({
      activeUntil: null,
      nextStartsAt: new Date(now + randomCooldownMs()),
      windowStartedAt: null,
    });
  }
  emit(wasActive ? "ended" : null);
  scheduleWake();
  return getGoldenHourPublic();
}

export async function adminSetGoldenHourDisabled(
  disabled: boolean
): Promise<GoldenHourPublic> {
  const wasActive = isGoldenHourActive();
  if (disabled) {
    if (wasActive && cache) {
      await endWindow(cache, Date.now());
    }
    await persist({
      disabled: true,
      activeUntil: null,
      nextStartsAt: null,
      windowStartedAt: null,
    });
    emit(wasActive ? "ended" : null);
    clearTimer();
  } else {
    await persist({
      disabled: false,
      activeUntil: null,
      nextStartsAt: new Date(Date.now() + randomCooldownMs()),
      windowStartedAt: null,
    });
    emit(null);
    scheduleWake();
  }
  return getGoldenHourPublic();
}
