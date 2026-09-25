import type { AdminJackpotLedgerEntry } from "@neon21/shared";
import { formatClaimLabel } from "@neon21/shared";
import { prisma } from "./prisma.js";
import { env } from "../env.js";

/** Default epoch — prior HandOutcomes do not count toward jackpot. */
export const JACKPOT_EPOCH = new Date("2026-09-23T20:40:00.000Z");

/** Share of player losses (hand + insurance) that funds the vault. */
export const JACKPOT_LOSS_TAKE_BPS = 500; // 5%
/** Vault take during Golden Hour (Heist). */
export const JACKPOT_LOSS_TAKE_BPS_GOLDEN = 1000; // 10%

export function jackpotStartsAt(): Date {
  const raw = env.JACKPOT_STARTS_AT?.trim();
  if (!raw) return JACKPOT_EPOCH;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? JACKPOT_EPOCH : d;
}

/** Cents contributed to the vault from absolute losses at the given take rate. */
export function jackpotTakeFromLosses(
  lossAbsCents: number,
  bps: number = JACKPOT_LOSS_TAKE_BPS
): number {
  if (lossAbsCents <= 0 || bps <= 0) return 0;
  return Math.floor((lossAbsCents * bps) / 10_000);
}

/**
 * Gross vault funding = sum of per-outcome jackpotTakeCents since epoch.
 * Player wins never reduce this; only JackpotClaim payouts do.
 */
export async function getGrossTakeCents(): Promise<number> {
  const epoch = jackpotStartsAt();
  const agg = await prisma.handOutcome.aggregate({
    where: { createdAt: { gte: epoch } },
    _sum: { jackpotTakeCents: true },
  });
  return agg._sum.jackpotTakeCents ?? 0;
}

export async function getClaimsSumCents(): Promise<number> {
  const agg = await prisma.jackpotClaim.aggregate({
    _sum: { payoutCents: true },
  });
  return agg._sum.payoutCents ?? 0;
}

export async function getAdjustmentsSumCents(): Promise<number> {
  const agg = await prisma.jackpotAdjustment.aggregate({
    _sum: { deltaCents: true },
  });
  return agg._sum.deltaCents ?? 0;
}

/** Unclamped ledger: can be negative when claims exceed funding. */
export async function getRawPotCents(): Promise<number> {
  const [gross, claimed, adjusted] = await Promise.all([
    getGrossTakeCents(),
    getClaimsSumCents(),
    getAdjustmentsSumCents(),
  ]);
  return gross + adjusted - claimed;
}

export async function getAvailablePotCents(): Promise<number> {
  return Math.max(0, await getRawPotCents());
}

/**
 * Set available pot to an absolute amount via a ledger adjustment.
 * Delta is vs the unclamped raw pot so underwater vaults can be filled.
 */
export async function setAvailablePotCents(
  targetCents: number,
  note = "admin set-pot"
): Promise<{
  takeCents: number;
  previousTakeCents: number;
  deltaCents: number;
  availableDeltaCents: number;
}> {
  const target = Math.max(0, Math.floor(targetCents));
  const previousRaw = await getRawPotCents();
  const previousTakeCents = Math.max(0, previousRaw);
  const deltaCents = target - previousRaw;
  if (deltaCents !== 0) {
    await prisma.jackpotAdjustment.create({
      data: { deltaCents, note },
    });
  }
  return {
    takeCents: target,
    previousTakeCents,
    deltaCents,
    availableDeltaCents: target - previousTakeCents,
  };
}

export const SPIN_BJ_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SPIN_BJ_PER_VOUCHER = 5;

export function windowStart(now = Date.now()): Date {
  return new Date(now - SPIN_BJ_WINDOW_MS);
}

/** BJ progress only counts hands after jackpot/voucher feature start (no retroactive backlog). */
export function spinBjCountStartsAt(now = Date.now()): Date {
  const window = windowStart(now);
  const epoch = jackpotStartsAt();
  return epoch > window ? epoch : window;
}

export async function countBlackjacks24h(userId: string): Promise<number> {
  return prisma.handOutcome.count({
    where: {
      userId,
      isBlackjack: true,
      createdAt: { gte: spinBjCountStartsAt() },
    },
  });
}

export async function countVouchersInWindow(userId: string): Promise<number> {
  return prisma.spinVoucher.count({
    where: { userId, createdAt: { gte: spinBjCountStartsAt() } },
  });
}

export async function countOpenVouchers(userId: string): Promise<number> {
  return prisma.spinVoucher.count({
    where: { userId, status: "open" },
  });
}

/** Seat progress toward next voucher (0–4) + open voucher count. */
export async function getSpinSeatProgress(userId: string): Promise<{
  bjTowardSpin: number;
  spinVouchers: number;
}> {
  const [bj, open] = await Promise.all([
    countBlackjacks24h(userId),
    countOpenVouchers(userId),
  ]);
  return {
    bjTowardSpin: bj % SPIN_BJ_PER_VOUCHER,
    spinVouchers: open,
  };
}

/**
 * Grant vouchers only for thresholds crossed by *this* settle's new BJs.
 * Never catch up on historical backlog (that caused multi-voucher spikes).
 * Do not cap against all vouchers-in-window — admin/debug grants would
 * permanently eat natural 5th-BJ tickets.
 */
export async function maybeGrantSpinVouchers(
  userId: string,
  newBlackjacks: number
): Promise<number> {
  const fresh = Math.max(0, Math.floor(newBlackjacks));
  if (fresh <= 0) return 0;

  const bj = await countBlackjacks24h(userId);
  const prev = Math.max(0, bj - fresh);
  const toGrant =
    Math.floor(bj / SPIN_BJ_PER_VOUCHER) -
    Math.floor(prev / SPIN_BJ_PER_VOUCHER);
  if (toGrant <= 0) return 0;
  await prisma.spinVoucher.createMany({
    data: Array.from({ length: toGrant }, () => ({
      userId,
      status: "open",
    })),
  });
  return toGrant;
}

export async function listRecentClaims(limit = 40) {
  return prisma.jackpotClaim.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listRecentAdjustments(limit = 40) {
  return prisma.jackpotAdjustment.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Recent outcomes that contributed ≥1¢ vault take. */
export async function listRecentTakeOutcomes(limit = 80) {
  const epoch = jackpotStartsAt();
  return prisma.handOutcome.findMany({
    where: {
      createdAt: { gte: epoch },
      jackpotTakeCents: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      resultCents: true,
      jackpotTakeCents: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
}

/** Merged newest-first vault history for admin audit. */
export async function getAdminJackpotLedger(
  limit = 80
): Promise<AdminJackpotLedgerEntry[]> {
  const claimCap = Math.min(40, limit);
  const adjCap = Math.min(20, limit);
  const takeCap = limit;

  const [claims, adjustments, outcomes] = await Promise.all([
    listRecentClaims(claimCap),
    listRecentAdjustments(adjCap),
    listRecentTakeOutcomes(takeCap),
  ]);

  const claimEntries: AdminJackpotLedgerEntry[] = claims.map((c) => ({
    id: `claim:${c.id}`,
    kind: "claim",
    deltaCents: -c.payoutCents,
    createdAt: c.createdAt.toISOString(),
    userName: c.userName,
    label: formatClaimLabel(
      c.kind,
      c.pctBps,
      c.payoutCents,
      c.goldenHandsGranted
    ),
    pctBps: c.pctBps,
    payoutCents: c.payoutCents,
    potBeforeCents: c.potBeforeCents,
    tableName: c.tableName,
  }));

  const adjEntries: AdminJackpotLedgerEntry[] = adjustments.map((a) => ({
    id: `adj:${a.id}`,
    kind: "adjustment",
    deltaCents: a.deltaCents,
    createdAt: a.createdAt.toISOString(),
    note: a.note,
  }));

  const takeEntries: AdminJackpotLedgerEntry[] = outcomes.map((o) => ({
    id: `take:${o.id}`,
    kind: "take" as const,
    deltaCents: o.jackpotTakeCents,
    createdAt: o.createdAt.toISOString(),
    userName: o.user.name,
    lossCents: o.resultCents < 0 ? -o.resultCents : 0,
  }));

  const reserved = claimEntries.length + adjEntries.length;
  const takeSlots = Math.max(0, limit - reserved);
  const entries = [
    ...claimEntries,
    ...adjEntries,
    ...takeEntries.slice(0, takeSlots),
  ];

  entries.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return entries;
}
