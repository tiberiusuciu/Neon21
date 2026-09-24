import type { FastifyInstance } from "fastify";
import type { JackpotClaimEntry, JackpotResponse } from "@neon21/shared";
import { JACKPOT_WHEEL } from "@neon21/shared";
import {
  getAvailablePotCents,
  getGrossTakeCents,
  listRecentClaims,
} from "../lib/jackpot.js";

function claimLabel(kind: string, pctBps: number, payoutCents: number): string {
  if (kind === "flat") return `$${(payoutCents / 100).toFixed(0)}`;
  const tile = JACKPOT_WHEEL.find(
    (t) => t.kind === "percent" && t.pctBps === pctBps
  );
  return tile?.label ?? `${(pctBps / 100).toFixed(1)}%`;
}

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
        kind: r.kind === "flat" ? "flat" : "percent",
        pctBps: r.pctBps,
        payoutCents: r.payoutCents,
        potBeforeCents: r.potBeforeCents,
        label: claimLabel(r.kind, r.pctBps, r.payoutCents),
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
