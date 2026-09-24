import { GOLDEN_HANDS_PER_HANDS } from "@neon21/shared";
import { prisma } from "./prisma.js";

export type GoldenHandsProgress = {
  granted: number;
  goldenHands: number;
  handsTowardNext: number;
};

function towardNext(played: number): number {
  return Math.max(0, played) % GOLDEN_HANDS_PER_HANDS;
}

/** Increment GH hands played and grant Golden Hands on threshold crossings. */
export async function recordGoldenHourHandsPlayed(
  userId: string,
  newHands: number
): Promise<GoldenHandsProgress> {
  const fresh = Math.max(0, Math.floor(newHands));
  if (fresh <= 0) {
    const cur = await getGoldenHandsProgress(userId);
    return { granted: 0, ...cur };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { goldenHourHandsPlayed: { increment: fresh } },
    select: { goldenHourHandsPlayed: true, goldenHands: true },
  });
  const prev = Math.max(0, user.goldenHourHandsPlayed - fresh);
  const toGrant =
    Math.floor(user.goldenHourHandsPlayed / GOLDEN_HANDS_PER_HANDS) -
    Math.floor(prev / GOLDEN_HANDS_PER_HANDS);
  if (toGrant <= 0) {
    return {
      granted: 0,
      goldenHands: user.goldenHands,
      handsTowardNext: towardNext(user.goldenHourHandsPlayed),
    };
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { goldenHands: { increment: toGrant } },
    select: { goldenHands: true },
  });
  return {
    granted: toGrant,
    goldenHands: updated.goldenHands,
    handsTowardNext: towardNext(user.goldenHourHandsPlayed),
  };
}

export async function getGoldenHandsProgress(
  userId: string
): Promise<{ goldenHands: number; handsTowardNext: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { goldenHands: true, goldenHourHandsPlayed: true },
  });
  return {
    goldenHands: user?.goldenHands ?? 0,
    handsTowardNext: towardNext(user?.goldenHourHandsPlayed ?? 0),
  };
}

export async function getGoldenHandsInventory(
  userId: string
): Promise<number> {
  const prog = await getGoldenHandsProgress(userId);
  return prog.goldenHands;
}

/** Atomically reserve one Golden Hand token. Returns false if none left. */
export async function reserveGoldenHand(userId: string): Promise<boolean> {
  const updated = await prisma.user.updateMany({
    where: { id: userId, goldenHands: { gte: 1 } },
    data: { goldenHands: { decrement: 1 } },
  });
  return updated.count > 0;
}

export async function returnGoldenHand(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { goldenHands: { increment: 1 } },
    select: { goldenHands: true },
  });
  return user.goldenHands;
}

export async function grantGoldenHands(
  userId: string,
  count: number
): Promise<number> {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) {
    return getGoldenHandsInventory(userId);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { goldenHands: { increment: n } },
    select: { goldenHands: true },
  });
  return user.goldenHands;
}
