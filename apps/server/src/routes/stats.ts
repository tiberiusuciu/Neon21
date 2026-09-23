import type { FastifyInstance } from "fastify";
import type { StatsResponse } from "@neon21/shared";
import { prisma } from "../lib/prisma.js";

const RECENT_LIMIT = 30;

export async function statsRoutes(app: FastifyInstance) {
  app.get(
    "/stats",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
      });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const recent = await prisma.handOutcome.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
      });

      const decided = user.wins + user.losses;
      const winRate = decided > 0 ? user.wins / decided : 0;

      const body: StatsResponse = {
        stats: {
          handsPlayed: user.handsPlayed,
          wins: user.wins,
          losses: user.losses,
          pushes: user.pushes,
          blackjacks: user.blackjacks,
          biggestWinCents: user.biggestWinCents,
          biggestLossCents: user.biggestLossCents,
          netProfitCents: user.netProfitCents,
          winRate,
        },
        recent: recent.map((r) => ({
          id: r.id,
          resultCents: r.resultCents,
          betCents: r.betCents,
          isBlackjack: r.isBlackjack,
          doubled: r.doubled,
          bust: r.bust,
          isInsurance: r.isInsurance,
          createdAt: r.createdAt.toISOString(),
        })),
      };
      return body;
    }
  );
}
