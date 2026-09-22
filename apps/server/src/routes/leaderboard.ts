import type { FastifyInstance } from "fastify";
import type { LeaderboardEntry, LeaderboardResponse, LeaderboardScope } from "@neon21/shared";
import { prisma } from "../lib/prisma.js";
import { getSeasonWindow } from "../lib/season.js";

const TOP_N = 50;

type AggRow = {
  userId: string;
  name: string;
  handsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  netProfitCents: number;
  biggestWinCents: number;
};

function winRate(wins: number, losses: number): number {
  const decided = wins + losses;
  return decided > 0 ? wins / decided : 0;
}

function toEntry(row: AggRow, rank: number, viewerId: string): LeaderboardEntry {
  return {
    rank,
    userId: row.userId,
    name: row.name,
    handsPlayed: row.handsPlayed,
    wins: row.wins,
    losses: row.losses,
    pushes: row.pushes,
    blackjacks: row.blackjacks,
    netProfitCents: row.netProfitCents,
    biggestWinCents: row.biggestWinCents,
    winRate: winRate(row.wins, row.losses),
    isYou: row.userId === viewerId,
  };
}

function rankRows(rows: AggRow[], viewerId: string): {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
} {
  const sorted = [...rows].sort((a, b) => {
    if (b.netProfitCents !== a.netProfitCents) {
      return b.netProfitCents - a.netProfitCents;
    }
    if (b.handsPlayed !== a.handsPlayed) {
      return b.handsPlayed - a.handsPlayed;
    }
    return a.name.localeCompare(b.name);
  });

  const ranked = sorted.map((row, i) => toEntry(row, i + 1, viewerId));
  const entries = ranked.slice(0, TOP_N);
  const me = ranked.find((e) => e.isYou) ?? null;
  return { entries, me };
}

async function alltimeRows(): Promise<AggRow[]> {
  const users = await prisma.user.findMany({
    where: { handsPlayed: { gt: 0 } },
    select: {
      id: true,
      name: true,
      handsPlayed: true,
      wins: true,
      losses: true,
      pushes: true,
      blackjacks: true,
      netProfitCents: true,
      biggestWinCents: true,
    },
  });
  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    handsPlayed: u.handsPlayed,
    wins: u.wins,
    losses: u.losses,
    pushes: u.pushes,
    blackjacks: u.blackjacks,
    netProfitCents: u.netProfitCents,
    biggestWinCents: u.biggestWinCents,
  }));
}

async function seasonRows(startsAt: Date, endsAt: Date): Promise<AggRow[]> {
  const outcomes = await prisma.handOutcome.findMany({
    where: {
      createdAt: { gte: startsAt, lt: endsAt },
    },
    select: {
      userId: true,
      resultCents: true,
      isBlackjack: true,
      user: { select: { name: true } },
    },
  });

  const byUser = new Map<string, AggRow>();
  for (const o of outcomes) {
    let row = byUser.get(o.userId);
    if (!row) {
      row = {
        userId: o.userId,
        name: o.user.name,
        handsPlayed: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        blackjacks: 0,
        netProfitCents: 0,
        biggestWinCents: 0,
      };
      byUser.set(o.userId, row);
    }
    row.handsPlayed++;
    row.netProfitCents += o.resultCents;
    if (o.resultCents > 0) {
      row.wins++;
      if (o.resultCents > row.biggestWinCents) row.biggestWinCents = o.resultCents;
    } else if (o.resultCents < 0) {
      row.losses++;
    } else {
      row.pushes++;
    }
    if (o.isBlackjack) row.blackjacks++;
  }
  return [...byUser.values()];
}

export async function leaderboardRoutes(app: FastifyInstance) {
  app.get(
    "/leaderboard",
    { preHandler: [app.authenticate] },
    async (request) => {
      const q = request.query as { scope?: string };
      const scope: LeaderboardScope =
        q.scope === "alltime" ? "alltime" : "season";
      const viewerId = request.user.sub;

      if (scope === "alltime") {
        const { entries, me } = rankRows(await alltimeRows(), viewerId);
        const body: LeaderboardResponse = {
          scope,
          seasonId: null,
          seasonStartsAt: null,
          seasonEndsAt: null,
          entries,
          me,
        };
        return body;
      }

      const window = getSeasonWindow();
      const { entries, me } = rankRows(
        await seasonRows(window.startsAt, window.endsAt),
        viewerId
      );
      const body: LeaderboardResponse = {
        scope,
        seasonId: window.seasonId,
        seasonStartsAt: window.startsAt.toISOString(),
        seasonEndsAt: window.endsAt.toISOString(),
        entries,
        me,
      };
      return body;
    }
  );
}
