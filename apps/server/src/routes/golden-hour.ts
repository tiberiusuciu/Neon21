import type { FastifyInstance } from "fastify";
import type { GoldenHourPublic } from "@neon21/shared";
import { getGoldenHourPublic } from "../lib/golden-hour.js";

export async function goldenHourRoutes(app: FastifyInstance) {
  app.get(
    "/golden-hour",
    { preHandler: [app.authenticate] },
    async (): Promise<GoldenHourPublic> => getGoldenHourPublic()
  );
}
