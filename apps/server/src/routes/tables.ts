import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function tableRoutes(app: FastifyInstance) {
  app.get(
    "/tables",
    { preHandler: [app.authenticate] },
    async () => {
      const tables = await prisma.table.findMany({
        orderBy: { name: "asc" },
      });

      return {
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          seatCapacity: t.seatCapacity,
          status: t.status as "open" | "busy",
          playerCount: 0,
          createdAt: t.createdAt.toISOString(),
        })),
      };
    }
  );
}
