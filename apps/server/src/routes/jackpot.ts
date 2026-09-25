import type { FastifyInstance } from "fastify";
import type { JackpotClaimEntry, JackpotResponse } from "@neon21/shared";
import { formatClaimLabel } from "@neon21/shared";
import {
  getAvailablePotCents,
  getGrossTakeCents,
  listRecentClaims,
} from "../lib/jackpot.js";

export async function jackpotRoutes(app: FastifyInstance) {
  app.get(
    "/jackpot",
    { preHandler: [app.authenticate] },
    async (): Promise<JackpotResponse> => {
      const [gross, available, rows] = await Promise.all([
        getGrossTakeCents(),
        getAvailablePotCents(),
        listRecentClaims(40),
      ]);

      const claims: JackpotClaimEntry[] = rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userName,
        tableId: r.tableId,
        tableName: r.tableName,
        tileIndex: r.tileIndex,
        kind:
          r.kind === "flat"
            ? "flat"
            : r.kind === "goldenHands"
              ? "goldenHands"
              : "percent",
        pctBps: r.pctBps,
        payoutCents: r.payoutCents,
        potBeforeCents: r.potBeforeCents,
        goldenHandsGranted:
          r.goldenHandsGranted > 0 ? r.goldenHandsGranted : undefined,
        label: formatClaimLabel(
          r.kind,
          r.pctBps,
          r.payoutCents,
          r.goldenHandsGranted
        ),
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        takeCents: available,
        grossTakeCents: gross,
        claims,
      };
    }
  );
}
