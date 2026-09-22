import { prisma } from "../lib/prisma.js";

export type HandOutcomeInput = {
  resultCents: number;
  betCents: number;
  isBlackjack: boolean;
  doubled: boolean;
  bust: boolean;
};

export async function recordHandOutcomes(
  userId: string,
  hands: HandOutcomeInput[]
): Promise<void> {
  if (hands.length === 0) return;

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let blackjacks = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let net = 0;

  for (const h of hands) {
    net += h.resultCents;
    if (h.resultCents > 0) {
      wins++;
      if (h.resultCents > biggestWin) biggestWin = h.resultCents;
    } else if (h.resultCents < 0) {
      losses++;
      const abs = -h.resultCents;
      if (abs > biggestLoss) biggestLoss = abs;
    } else {
      pushes++;
    }
    if (h.isBlackjack) blackjacks++;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await tx.user.update({
      where: { id: userId },
      data: {
        handsPlayed: { increment: hands.length },
        wins: { increment: wins },
        losses: { increment: losses },
        pushes: { increment: pushes },
        blackjacks: { increment: blackjacks },
        netProfitCents: { increment: net },
        biggestWinCents: Math.max(user.biggestWinCents, biggestWin),
        biggestLossCents: Math.max(user.biggestLossCents, biggestLoss),
      },
    });

    await tx.handOutcome.createMany({
      data: hands.map((h) => ({
        userId,
        resultCents: h.resultCents,
        betCents: h.betCents,
        isBlackjack: h.isBlackjack,
        doubled: h.doubled,
        bust: h.bust,
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
