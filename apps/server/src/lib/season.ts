import { startOfLocalDay } from "./auth.js";

export const SEASON_TZ = "America/New_York";

export type SeasonWindow = {
  seasonId: string;
  startsAt: Date;
  endsAt: Date;
};

function partsInTz(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday!] ?? 1,
  };
}

/** UTC instant for local calendar Y-M-D at 00:00 in timeZone. */
function localMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return startOfLocalDay(probe, timeZone);
}

function addLocalDays(start: Date, days: number, timeZone: string): Date {
  const p = partsInTz(
    new Date(start.getTime() + days * 24 * 3600 * 1000 + 12 * 3600 * 1000),
    timeZone
  );
  return localMidnight(p.year, p.month, p.day, timeZone);
}

/** ISO week-year and week number for a Monday 00:00 instant in timeZone. */
function isoWeekFromMonday(monday: Date, timeZone: string): {
  weekYear: number;
  week: number;
} {
  const thu = addLocalDays(monday, 3, timeZone);
  const weekYear = partsInTz(thu, timeZone).year;
  // Jan 4 is always in ISO week 1
  const jan4 = localMidnight(weekYear, 1, 4, timeZone);
  const jan4Parts = partsInTz(jan4, timeZone);
  const week1Monday = addLocalDays(jan4, 1 - jan4Parts.weekday, timeZone);
  const week =
    Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 24 * 3600 * 1000)) +
    1;
  return { weekYear, week };
}

/**
 * Current ISO week season in America/New_York:
 * Monday 00:00 → next Monday 00:00 (handles EST/EDT).
 * seasonId e.g. "2026-W39"
 */
export function getSeasonWindow(now = new Date()): SeasonWindow {
  const p = partsInTz(now, SEASON_TZ);
  const monday = addLocalDays(
    localMidnight(p.year, p.month, p.day, SEASON_TZ),
    1 - p.weekday,
    SEASON_TZ
  );
  const endsAt = addLocalDays(monday, 7, SEASON_TZ);
  const { weekYear, week } = isoWeekFromMonday(monday, SEASON_TZ);
  const seasonId = `${weekYear}-W${String(week).padStart(2, "0")}`;
  return { seasonId, startsAt: monday, endsAt };
}
