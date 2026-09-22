import type { FastifyInstance } from "fastify";
import { getPool } from "../game/table-pool.js";

export async function tableRoutes(app: FastifyInstance) {
  app.get(
    "/tables",
    { preHandler: [app.authenticate] },
    async () => {
      const pool = getPool();
      return { tables: pool.list() };
    }
  );
}
