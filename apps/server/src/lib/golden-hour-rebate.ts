import type { GoldenHourRebateProgress } from "@neon21/shared";
import { GOLDEN_HOUR_REBATE_CAP_CENTS } from "@neon21/shared";
import { prisma } from "./prisma.js";
import { creditCents } from "../game/wallet.js";

/** 10% of gross losses this window, capped. Wins do not reduce the rebate. */
export function computeGoldenRebateCents(lostCents: number): number {
  return Math.min(
    Math.floor(Math.max(0, lostCents) * 0.1),
    GOLDEN_HOUR_REBATE_CAP_CENTS
  );
}

export function toRebateProgress(
  lostCents: number,
  paidCents = 0,
  wonCents = 0
): GoldenHourRebateProgress {
  return {
    wonCents,
    lostCents,
    rebateCents: computeGoldenRebateCents(lostCents),
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

/** Accumulate gross losses for a Golden Hour window (wins ignored for rebate). */
export async function recordGoldenHourResults(
  userId: string,
  windowStartedAt: Date,
  resultCentsList: number[]
): Promise<GoldenHourRebateProgress | null> {
  if (resultCentsList.length === 0) return null;

  let lost = 0;
  for (const r of resultCentsList) {
    if (r < 0) lost += -r;
  }
  if (lost === 0) {
    const progress = await getGoldenHourRebateProgress(
      userId,
      windowStartedAt
    );
    progressEmitter?.(userId, progress);
    return progress;
  }

  const row = await prisma.goldenHourPlayerStats.upsert({
    where: {
      userId_windowStartedAt: { userId, windowStartedAt },
    },
    create: {
      userId,
      windowStartedAt,
      wonCents: 0,
      lostCents: lost,
    },
    update: {
      lostCents: { increment: lost },
    },
  });

  const progress = toRebateProgress(
    row.lostCents,
    row.rebatePaidCents,
    row.wonCents
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
  return toRebateProgress(row.lostCents, row.rebatePaidCents, row.wonCents);
}

/** Credit 10% gross-loss rebates (capped) for a closed window. */
export async function payGoldenHourRebates(
  windowStartedAt: Date
): Promise<void> {
  const rows = await prisma.goldenHourPlayerStats.findMany({
    where: { windowStartedAt, rebatePaidCents: 0 },
  });
  for (const row of rows) {
    const rebate = computeGoldenRebateCents(row.lostCents);
    if (rebate <= 0) continue;
    const balanceCents = await creditCents(row.userId, rebate);
    await prisma.goldenHourPlayerStats.update({
      where: { id: row.id },
      data: { rebatePaidCents: rebate },
    });
    paidEmitter?.(row.userId, rebate, balanceCents);
    progressEmitter?.(
      row.userId,
      toRebateProgress(row.lostCents, rebate, row.wonCents)
    );
  }
}
