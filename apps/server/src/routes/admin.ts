import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdminTopUpBodySchema,
  AdminResetStatsBodySchema,
  AdminSetJackpotBodySchema,
  AdminGrantVoucherBodySchema,
  AdminGrantGoldenHandsBodySchema,
  AdminGoldenHourDisableBodySchema,
  type AdminUserRow,
  type AdminHandOutcome,
} from "@neon21/shared";
import { prisma } from "../lib/prisma.js";
import { isAdminEmail } from "../lib/auth.js";
import { getSeasonWindow } from "../lib/season.js";
import { recomputeUserStats } from "../game/stats.js";
import { env } from "../env.js";
import { getPool } from "../game/table-pool.js";
import {
  countOpenVouchers,
  getAdjustmentsSumCents,
  getAdminJackpotLedger,
  getAvailablePotCents,
  getClaimsSumCents,
  getGrossTakeCents,
  getRawPotCents,
  jackpotStartsAt,
  setAvailablePotCents,
} from "../lib/jackpot.js";
import {
  getGoldenHandsInventory,
  grantGoldenHands,
} from "../lib/golden-hands.js";
import {
  adminEndGoldenHour,
  adminSetGoldenHourDisabled,
  adminStartGoldenHour,
  getGoldenHourPublic,
} from "../lib/golden-hour.js";

function toAdminUser(u: {
  id: string;
  name: string;
  email: string;
  balanceCents: number;
  handsPlayed: number;
  netProfitCents: number;
  openVouchers?: number;
  goldenHands?: number;
}): AdminUserRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    balanceCents: u.balanceCents,
    handsPlayed: u.handsPlayed,
    netProfitCents: u.netProfitCents,
    openVouchers: u.openVouchers,
    goldenHands: u.goldenHands,
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

/** Fill null balanceAfterCents by walking newest→oldest from current wallet. */
function withBalances(
  rows: {
    id: string;
    resultCents: number;
    betCents: number;
    isBlackjack: boolean;
    doubled: boolean;
    bust: boolean;
    isInsurance: boolean;
    balanceAfterCents: number | null;
    createdAt: Date;
  }[],
  currentBalanceCents: number
): AdminHandOutcome[] {
  let cursor = currentBalanceCents;
  const out: AdminHandOutcome[] = [];
  for (const r of rows) {
    let balanceAfterCents = r.balanceAfterCents;
    let balanceApproximate = false;
    if (balanceAfterCents == null) {
      balanceAfterCents = cursor;
      balanceApproximate = true;
    } else {
      cursor = balanceAfterCents;
    }
    out.push({
      id: r.id,
      resultCents: r.resultCents,
      betCents: r.betCents,
      isBlackjack: r.isBlackjack,
      doubled: r.doubled,
      bust: r.bust,
      isInsurance: r.isInsurance,
      balanceAfterCents,
      balanceApproximate,
      createdAt: r.createdAt.toISOString(),
    });
    cursor = cursor - r.resultCents;
  }
  return out;
}

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/admin/golden-hour",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      return getGoldenHourPublic();
    }
  );

  app.post(
    "/admin/golden-hour/start",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      return adminStartGoldenHour();
    }
  );

  app.post(
    "/admin/golden-hour/end",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      return adminEndGoldenHour();
    }
  );

  app.post(
    "/admin/golden-hour/disable",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const body = AdminGoldenHourDisableBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid body" });
      }
      return adminSetGoldenHourDisabled(body.data.disabled);
    }
  );

  app.get(
    "/admin/jackpot",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const [
        takeCents,
        rawPotCents,
        grossTakeCents,
        claimsSumCents,
        adjustmentsCents,
        ledger,
      ] = await Promise.all([
        getAvailablePotCents(),
        getRawPotCents(),
        getGrossTakeCents(),
        getClaimsSumCents(),
        getAdjustmentsSumCents(),
        getAdminJackpotLedger(80),
      ]);
      return {
        takeCents,
        rawPotCents,
        grossTakeCents,
        claimsSumCents,
        adjustmentsCents,
        ledger,
      };
    }
  );

  app.post(
    "/admin/jackpot/set-pot",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const parsed = AdminSetJackpotBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const targetCents = Math.round(parsed.data.dollars * 100);
      const result = await setAvailablePotCents(
        targetCents,
        `admin:${request.user.email}`
      );

      if (result.availableDeltaCents !== 0) {
        try {
          getPool().emitJackpotDelta(result.availableDeltaCents);
        } catch {
          // Socket pool not up yet — HTTP response still ok.
        }
      }

      return {
        takeCents: result.takeCents,
        previousTakeCents: result.previousTakeCents,
        deltaCents: result.deltaCents,
      };
    }
  );

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
          goldenHands: true,
          spinVouchers: {
            where: { status: "open" },
            select: { id: true },
          },
        },
      });

      return {
        users: users.map((u) =>
          toAdminUser({
            ...u,
            openVouchers: u.spinVouchers.length,
            goldenHands: u.goldenHands,
          })
        ),
      };
    }
  );

  app.get(
    "/admin/users/:userId/hands",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { userId } = request.params as { userId: string };
      const rawLimit = Number((request.query as { limit?: string }).limit);
      const rawOffset = Number((request.query as { offset?: string }).offset);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(200, Math.max(1, Math.floor(rawLimit)))
        : 80;
      const offset = Number.isFinite(rawOffset)
        ? Math.max(0, Math.floor(rawOffset))
        : 0;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, balanceCents: true },
      });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const [total, rows, openVouchers, goldenHands] = await Promise.all([
        prisma.handOutcome.count({ where: { userId } }),
        prisma.handOutcome.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
          select: {
            id: true,
            resultCents: true,
            betCents: true,
            isBlackjack: true,
            doubled: true,
            bust: true,
            isInsurance: true,
            balanceAfterCents: true,
            createdAt: true,
          },
        }),
        countOpenVouchers(userId),
        getGoldenHandsInventory(userId),
      ]);

      // Reconstruct only works cleanly from offset 0 (current wallet as tip).
      const seedBalance =
        offset === 0
          ? user.balanceCents
          : (rows[0]?.balanceAfterCents ?? user.balanceCents);

      return {
        userId,
        balanceCents: user.balanceCents,
        openVouchers,
        goldenHands,
        total,
        hands: withBalances(rows, seedBalance),
      };
    }
  );

  app.post(
    "/admin/users/:userId/grant-voucher",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const parsed = AdminGrantVoucherBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { userId } = request.params as { userId: string };
      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const granted = parsed.data.count;
      await prisma.spinVoucher.createMany({
        data: Array.from({ length: granted }, () => ({
          userId,
          status: "open",
        })),
      });

      const openVouchers = await countOpenVouchers(userId);

      try {
        await getPool().refreshUserSpinProgress(userId);
      } catch {
        // Socket pool not up yet — HTTP response still ok.
      }

      return { userId, granted, openVouchers };
    }
  );

  app.post(
    "/admin/users/:userId/grant-golden-hands",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const parsed = AdminGrantGoldenHandsBodySchema.safeParse(
        request.body ?? {}
      );
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { userId } = request.params as { userId: string };
      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const granted = parsed.data.count;
      const goldenHands = await grantGoldenHands(userId, granted);

      try {
        await getPool().refreshUserGoldenHands(userId);
      } catch {
        // Socket pool not up yet — HTTP response still ok.
      }

      return { userId, granted, goldenHands };
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
      if (cents === 0) {
        return reply.status(400).send({ error: "Amount must be non-zero" });
      }

      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Don't let admin debit below zero.
      const applied =
        cents < 0 ? Math.max(cents, -existing.balanceCents) : cents;
      if (applied === 0) {
        return reply.status(400).send({ error: "Balance is already zero" });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { balanceCents: { increment: applied } },
        select: {
          id: true,
          name: true,
          email: true,
          balanceCents: true,
          handsPlayed: true,
          netProfitCents: true,
        },
      });

      try {
        getPool().emitWalletUpdate(userId, user.balanceCents, applied);
      } catch {
        // Socket pool not up yet (tests / early boot) — HTTP response still ok.
      }

      return { user: toAdminUser(user), creditedCents: applied };
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

      const removeJackpotTake = parsed.data.removeJackpotTake === true;
      const epoch = jackpotStartsAt();

      const result = await prisma.$transaction(async (tx) => {
        const outcomeWhere =
          period === "alltime"
            ? { userId }
            : {
                userId,
                createdAt: { gte: from!, lt: to! },
              };

        const takeAgg = await tx.handOutcome.aggregate({
          where: {
            ...outcomeWhere,
            createdAt:
              period === "alltime"
                ? { gte: epoch }
                : {
                    gte: from!.getTime() > epoch.getTime() ? from! : epoch,
                    lt: to!,
                  },
            jackpotTakeCents: { gt: 0 },
          },
          _sum: { jackpotTakeCents: true },
        });
        const jackpotTakeCents = takeAgg._sum.jackpotTakeCents ?? 0;

        if (!removeJackpotTake && jackpotTakeCents > 0) {
          await tx.jackpotAdjustment.create({
            data: {
              deltaCents: jackpotTakeCents,
              note: `admin:reset-stats preserve:${request.user.email}:${userId}`,
            },
          });
        }

        const deleted = await tx.handOutcome.deleteMany({
          where: outcomeWhere,
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
        return {
          deleted: deleted.count,
          user,
          jackpotTakeCents,
        };
      });

      if (removeJackpotTake && result.jackpotTakeCents > 0) {
        try {
          getPool().emitJackpotDelta(-result.jackpotTakeCents);
        } catch {
          // Socket pool not up yet — HTTP response still ok.
        }
      }

      return {
        user: toAdminUser(result.user),
        deletedOutcomes: result.deleted,
        period,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        jackpotTakeCents: result.jackpotTakeCents,
        jackpotTakeRemoved: removeJackpotTake,
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
