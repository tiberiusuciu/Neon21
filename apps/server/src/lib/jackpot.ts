import { prisma } from "./prisma.js";
import { env } from "../env.js";

/** Default epoch — prior HandOutcomes do not count toward jackpot. */
export const JACKPOT_EPOCH = new Date("2026-09-23T20:40:00.000Z");

/** Share of player losses (hand + insurance) that funds the vault. */
export const JACKPOT_LOSS_TAKE_BPS = 500; // 5%

export function jackpotStartsAt(): Date {
  const raw = env.JACKPOT_STARTS_AT?.trim();
  if (!raw) return JACKPOT_EPOCH;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? JACKPOT_EPOCH : d;
}

/** Cents contributed to the vault from a batch of absolute losses. */
export function jackpotTakeFromLosses(lossAbsCents: number): number {
  if (lossAbsCents <= 0) return 0;
  return Math.floor((lossAbsCents * JACKPOT_LOSS_TAKE_BPS) / 10_000);
}

/**
 * Gross vault funding = 5% of all player losses since epoch.
 * Player wins never reduce this; only JackpotClaim payouts do.
 */
export async function getGrossTakeCents(): Promise<number> {
  const epoch = jackpotStartsAt();
  const agg = await prisma.handOutcome.aggregate({
    where: {
      createdAt: { gte: epoch },
      resultCents: { lt: 0 },
    },
    _sum: { resultCents: true },
  });
  const lossAbs = -(agg._sum.resultCents ?? 0);
  return jackpotTakeFromLosses(lossAbs);
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

export async function getAvailablePotCents(): Promise<number> {
  const [gross, claimed, adjusted] = await Promise.all([
    getGrossTakeCents(),
    getClaimsSumCents(),
    getAdjustmentsSumCents(),
  ]);
  return Math.max(0, gross + adjusted - claimed);
}

/** Set available pot to an absolute amount via a ledger adjustment. */
export async function setAvailablePotCents(
  targetCents: number,
  note = "admin set-pot"
): Promise<{
  takeCents: number;
  previousTakeCents: number;
  deltaCents: number;
}> {
  const target = Math.max(0, Math.floor(targetCents));
  const previousTakeCents = await getAvailablePotCents();
  const deltaCents = target - previousTakeCents;
  if (deltaCents !== 0) {
    await prisma.jackpotAdjustment.create({
      data: { deltaCents, note },
    });
  }
  return {
    takeCents: target,
    previousTakeCents,
    deltaCents,
  };
}

export const SPIN_BJ_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SPIN_BJ_PER_VOUCHER = 5;

export function windowStart(now = Date.now()): Date {
  return new Date(now - SPIN_BJ_WINDOW_MS);
}

export async function countBlackjacks24h(userId: string): Promise<number> {
  return prisma.handOutcome.count({
    where: {
      userId,
      isBlackjack: true,
      createdAt: { gte: windowStart() },
    },
  });
}

export async function countVouchersInWindow(userId: string): Promise<number> {
  return prisma.spinVoucher.count({
    where: { userId, createdAt: { gte: windowStart() } },
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
 * Grant stackable vouchers: every 5 BJs in 24h earns one voucher created in-window.
 */
export async function maybeGrantSpinVouchers(userId: string): Promise<number> {
  const [bj, vouchers] = await Promise.all([
    countBlackjacks24h(userId),
    countVouchersInWindow(userId),
  ]);
  const earned = Math.floor(bj / SPIN_BJ_PER_VOUCHER);
  const toGrant = earned - vouchers;
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
