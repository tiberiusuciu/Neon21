import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    balanceCents: user.balanceCents,
    lastClaimAt: user.lastClaimAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function ymdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** UTC instant of local midnight (00:00) for `date`'s calendar day in `timeZone`. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const ymd = ymdInTimeZone(date, timeZone);
  const utcGuess = Date.parse(`${ymd}T00:00:00.000Z`);
  let lo = utcGuess - 36 * 3600 * 1000;
  let hi = utcGuess + 36 * 3600 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ymdInTimeZone(new Date(mid), timeZone) < ymd) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}

/** Next local midnight after `date` in `timeZone`. */
export function nextLocalMidnight(date: Date, timeZone: string): Date {
  const start = startOfLocalDay(date, timeZone);
  const probe = new Date(start.getTime() + 25 * 3600 * 1000);
  return startOfLocalDay(probe, timeZone);
}

export function canClaimToday(
  lastClaimAt: Date | null | undefined,
  timeZone: string,
  now = new Date()
): boolean {
  if (!lastClaimAt) return true;
  return lastClaimAt < startOfLocalDay(now, timeZone);
}

export function resolveTimeZone(raw: string | undefined): string {
  const tz = raw?.trim();
  if (!tz) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
