import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type HandOutcomeInput = {
  resultCents: number;
  betCents: number;
  isBlackjack: boolean;
  doubled: boolean;
  bust: boolean;
  isInsurance?: boolean;
};

type OutcomeLike = {
  resultCents: number;
  isBlackjack: boolean;
  isInsurance?: boolean;
};

export function aggregateOutcomes(hands: OutcomeLike[]) {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let blackjacks = 0;
  let biggestWinCents = 0;
  let biggestLossCents = 0;
  let netProfitCents = 0;
  let handsPlayed = 0;

  for (const h of hands) {
    netProfitCents += h.resultCents;
    if (h.resultCents > 0) {
      if (h.resultCents > biggestWinCents) biggestWinCents = h.resultCents;
    } else if (h.resultCents < 0) {
      const abs = -h.resultCents;
      if (abs > biggestLossCents) biggestLossCents = abs;
    }

    if (h.isInsurance) continue;

    handsPlayed++;
    if (h.resultCents > 0) {
      wins++;
    } else if (h.resultCents < 0) {
      losses++;
    } else {
      pushes++;
    }
    if (h.isBlackjack) blackjacks++;
  }

  return {
    handsPlayed,
    wins,
    losses,
    pushes,
    blackjacks,
    biggestWinCents,
    biggestLossCents,
    netProfitCents,
  };
}

/** Recompute denormalized User stats from remaining HandOutcome rows. */
export async function recomputeUserStats(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const outcomes = await tx.handOutcome.findMany({
    where: { userId },
    select: { resultCents: true, isBlackjack: true, isInsurance: true },
  });
  const stats = aggregateOutcomes(outcomes);
  await tx.user.update({
    where: { id: userId },
    data: stats,
  });
  return stats;
}

export async function recordHandOutcomes(
  userId: string,
  hands: HandOutcomeInput[]
): Promise<void> {
  if (hands.length === 0) return;

  const batch = aggregateOutcomes(hands);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await tx.user.update({
      where: { id: userId },
      data: {
        handsPlayed: { increment: batch.handsPlayed },
        wins: { increment: batch.wins },
        losses: { increment: batch.losses },
        pushes: { increment: batch.pushes },
        blackjacks: { increment: batch.blackjacks },
        netProfitCents: { increment: batch.netProfitCents },
        biggestWinCents: Math.max(user.biggestWinCents, batch.biggestWinCents),
        biggestLossCents: Math.max(
          user.biggestLossCents,
          batch.biggestLossCents
        ),
      },
    });

    const balanceAfterCents = user.balanceCents;
    await tx.handOutcome.createMany({
      data: hands.map((h) => ({
        userId,
        resultCents: h.resultCents,
        betCents: h.betCents,
        isBlackjack: h.isBlackjack,
        doubled: h.doubled,
        bust: h.bust,
        isInsurance: h.isInsurance ?? false,
        balanceAfterCents,
      })),
    });
  });
}

export function recordHandOutcomesSafe(
  userId: string,
  hands: HandOutcomeInput[]
): void {
  void recordHandOutcomes(userId, hands).catch((err) => {
    console.error("[stats] recordHandOutcomes failed", userId, err);
  });
}
