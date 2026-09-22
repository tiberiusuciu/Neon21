import { prisma } from "../lib/prisma.js";

export class InsufficientFundsError extends Error {
  constructor() {
    super("Insufficient funds");
    this.name = "InsufficientFundsError";
  }
}

export async function getBalanceCents(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceCents: true },
  });
  return user?.balanceCents ?? null;
}

export async function debitCents(userId: string, cents: number): Promise<number> {
  if (cents <= 0) {
    const bal = await getBalanceCents(userId);
    if (bal == null) throw new Error("User not found");
    return bal;
  }
  const updated = await prisma.user.updateMany({
    where: { id: userId, balanceCents: { gte: cents } },
    data: { balanceCents: { decrement: cents } },
  });
  if (updated.count === 0) {
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new Error("User not found");
    throw new InsufficientFundsError();
  }
  const bal = await getBalanceCents(userId);
  return bal!;
}

export async function creditCents(userId: string, cents: number): Promise<number> {
  if (cents <= 0) {
    const bal = await getBalanceCents(userId);
    if (bal == null) throw new Error("User not found");
    return bal;
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { balanceCents: { increment: cents } },
    select: { balanceCents: true },
  });
  return user.balanceCents;
}
