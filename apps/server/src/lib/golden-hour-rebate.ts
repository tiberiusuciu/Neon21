import type { GoldenHourRebateProgress } from "@neon21/shared";
import { GOLDEN_HOUR_REBATE_CAP_CENTS } from "@neon21/shared";
import { prisma } from "./prisma.js";
import { creditCents } from "../game/wallet.js";

export function computeGoldenRebateCents(
  wonCents: number,
  lostCents: number
): number {
  const net = Math.max(0, lostCents - wonCents);
  return Math.min(Math.floor(net * 0.1), GOLDEN_HOUR_REBATE_CAP_CENTS);
}

export function toRebateProgress(
  wonCents: number,
  lostCents: number,
  paidCents = 0
): GoldenHourRebateProgress {
  return {
    wonCents,
    lostCents,
    rebateCents: computeGoldenRebateCents(wonCents, lostCents),
    capCents: GOLDEN_HOUR_REBATE_CAP_CENTS,
    paidCents,
  };
}

type ProgressEmitter = (
  userId: string,
  progress: GoldenHourRebateProgress
) => void;
type PaidEmitter = (
  userId: string,
  rebateCents: number,
  balanceCents: number
) => void;

let progressEmitter: ProgressEmitter | null = null;
let paidEmitter: PaidEmitter | null = null;

export function setGoldenHourRebateEmitters(opts: {
  onProgress?: ProgressEmitter | null;
  onPaid?: PaidEmitter | null;
}) {
  if (opts.onProgress !== undefined) progressEmitter = opts.onProgress;
  if (opts.onPaid !== undefined) paidEmitter = opts.onPaid;
}

/** Accumulate win/loss cents for a Golden Hour window. */
export async function recordGoldenHourResults(
  userId: string,
  windowStartedAt: Date,
  resultCentsList: number[]
): Promise<GoldenHourRebateProgress | null> {
  if (resultCentsList.length === 0) return null;

  let won = 0;
  let lost = 0;
  for (const r of resultCentsList) {
    if (r > 0) won += r;
    else if (r < 0) lost += -r;
  }
  if (won === 0 && lost === 0) {
    return getGoldenHourRebateProgress(userId, windowStartedAt);
  }

  const row = await prisma.goldenHourPlayerStats.upsert({
    where: {
      userId_windowStartedAt: { userId, windowStartedAt },
    },
    create: {
      userId,
      windowStartedAt,
      wonCents: won,
      lostCents: lost,
    },
    update: {
      wonCents: { increment: won },
      lostCents: { increment: lost },
    },
  });

  const progress = toRebateProgress(
    row.wonCents,
    row.lostCents,
    row.rebatePaidCents
  );
  progressEmitter?.(userId, progress);
  return progress;
}

export async function getGoldenHourRebateProgress(
  userId: string,
  windowStartedAt: Date
): Promise<GoldenHourRebateProgress> {
  const row = await prisma.goldenHourPlayerStats.findUnique({
    where: {
      userId_windowStartedAt: { userId, windowStartedAt },
    },
  });
  if (!row) return toRebateProgress(0, 0, 0);
  return toRebateProgress(row.wonCents, row.lostCents, row.rebatePaidCents);
}

/** Credit 10% net-loss rebates (capped) for a closed window. */
export async function payGoldenHourRebates(
  windowStartedAt: Date
): Promise<void> {
  const rows = await prisma.goldenHourPlayerStats.findMany({
    where: { windowStartedAt, rebatePaidCents: 0 },
  });
  for (const row of rows) {
    const rebate = computeGoldenRebateCents(row.wonCents, row.lostCents);
    if (rebate <= 0) continue;
    const balanceCents = await creditCents(row.userId, rebate);
    await prisma.goldenHourPlayerStats.update({
      where: { id: row.id },
      data: { rebatePaidCents: rebate },
    });
    paidEmitter?.(row.userId, rebate, balanceCents);
    progressEmitter?.(
      row.userId,
      toRebateProgress(row.wonCents, row.lostCents, rebate)
    );
  }
}
