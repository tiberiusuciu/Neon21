import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdminTopUpBodySchema,
  AdminResetStatsBodySchema,
  type AdminUserRow,
} from "@neon21/shared";
import { prisma } from "../lib/prisma.js";
import { isAdminEmail } from "../lib/auth.js";
import { getSeasonWindow } from "../lib/season.js";
import { recomputeUserStats } from "../game/stats.js";
import { env } from "../env.js";

function toAdminUser(u: {
  id: string;
  name: string;
  email: string;
  balanceCents: number;
  handsPlayed: number;
  netProfitCents: number;
}): AdminUserRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    balanceCents: u.balanceCents,
    handsPlayed: u.handsPlayed,
    netProfitCents: u.netProfitCents,
  };
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  if (!env.ADMIN_EMAIL || !isAdminEmail(request.user.email)) {
    await reply.status(403).send({ error: "Forbidden" });
    return false;
  }
  return true;
}

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/admin/users",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const q =
        typeof (request.query as { q?: string }).q === "string"
          ? (request.query as { q: string }).q.trim()
          : "";

      const users = await prisma.user.findMany({
        where: q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          email: true,
          balanceCents: true,
          handsPlayed: true,
          netProfitCents: true,
        },
      });

      return { users: users.map(toAdminUser) };
    }
  );

  app.post(
    "/admin/users/:userId/topup",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const parsed = AdminTopUpBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { userId } = request.params as { userId: string };
      const cents = Math.round(parsed.data.dollars * 100);
      if (cents <= 0) {
        return reply.status(400).send({ error: "Amount must be positive" });
      }

      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { balanceCents: { increment: cents } },
        select: {
          id: true,
          name: true,
          email: true,
          balanceCents: true,
          handsPlayed: true,
          netProfitCents: true,
        },
      });

      return { user: toAdminUser(user), creditedCents: cents };
    }
  );

  app.post(
    "/admin/users/:userId/reset-stats",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const parsed = AdminResetStatsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { userId } = request.params as { userId: string };
      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      let from: Date | null = null;
      let to: Date | null = null;
      const period = parsed.data.period;

      if (period === "season") {
        const window = getSeasonWindow();
        from = window.startsAt;
        to = window.endsAt;
      } else if (period === "custom") {
        from = new Date(parsed.data.from);
        to = new Date(parsed.data.to);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          return reply.status(400).send({ error: "Invalid date range" });
        }
        if (!(from < to)) {
          return reply
            .status(400)
            .send({ error: "`from` must be before `to`" });
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const deleted = await tx.handOutcome.deleteMany({
          where:
            period === "alltime"
              ? { userId }
              : {
                  userId,
                  createdAt: { gte: from!, lt: to! },
                },
        });
        await recomputeUserStats(tx, userId);
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            balanceCents: true,
            handsPlayed: true,
            netProfitCents: true,
          },
        });
        return { deleted: deleted.count, user };
      });

      return {
        user: toAdminUser(result.user),
        deletedOutcomes: result.deleted,
        period,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      };
    }
  );

  app.delete(
    "/admin/users/:userId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { userId } = request.params as { userId: string };
      if (userId === request.user.sub) {
        return reply.status(400).send({ error: "Cannot delete your own account" });
      }

      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      await prisma.user.delete({ where: { id: userId } });
      return { ok: true, id: userId, email: existing.email };
    }
  );
}
