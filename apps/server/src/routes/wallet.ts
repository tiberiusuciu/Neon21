import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import {
  canClaimToday,
  nextLocalMidnight,
  resolveTimeZone,
  toPublicUser,
} from "../lib/auth.js";

const CLAIM_CENTS = 10_000;

function clientTimeZone(request: { headers: Record<string, unknown> }): string {
  const raw = request.headers["x-timezone"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return resolveTimeZone(typeof value === "string" ? value : undefined);
}

export async function walletRoutes(app: FastifyInstance) {
  app.get(
    "/wallet",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
      });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const timeZone = clientTimeZone(request);
      const now = new Date();
      const eligible = canClaimToday(user.lastClaimAt, timeZone, now);
      return {
        balanceCents: user.balanceCents,
        lastClaimAt: user.lastClaimAt?.toISOString() ?? null,
        canClaim: eligible,
        nextClaimAt: eligible
          ? null
          : nextLocalMidnight(now, timeZone).toISOString(),
      };
    }
  );

  app.post(
    "/wallet/claim",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
      });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const timeZone = clientTimeZone(request);
      const now = new Date();

      if (!canClaimToday(user.lastClaimAt, timeZone, now)) {
        const nextClaimAt = nextLocalMidnight(now, timeZone).toISOString();
        return reply.status(429).send({
          error: "Already claimed today",
          nextClaimAt,
        });
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          balanceCents: { increment: CLAIM_CENTS },
          lastClaimAt: now,
        },
      });

      return {
        balanceCents: updated.balanceCents,
        lastClaimAt: now.toISOString(),
        creditedCents: CLAIM_CENTS,
        nextClaimAt: nextLocalMidnight(now, timeZone).toISOString(),
        user: toPublicUser(updated),
      };
    }
  );
}
