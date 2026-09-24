import { GOLDEN_HANDS_PER_HANDS } from "@neon21/shared";
import { prisma } from "./prisma.js";

/** Increment GH hands played and grant Golden Hands on threshold crossings. */
export async function recordGoldenHourHandsPlayed(
  userId: string,
  newHands: number
): Promise<{ granted: number; goldenHands: number }> {
  const fresh = Math.max(0, Math.floor(newHands));
  if (fresh <= 0) return { granted: 0, goldenHands: 0 };

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
    return { granted: 0, goldenHands: user.goldenHands };
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { goldenHands: { increment: toGrant } },
    select: { goldenHands: true },
  });
  return { granted: toGrant, goldenHands: updated.goldenHands };
}

export async function getGoldenHandsInventory(
  userId: string
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { goldenHands: true },
  });
  return user?.goldenHands ?? 0;
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
