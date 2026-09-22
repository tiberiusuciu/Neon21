import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import jwtPlugin from "./plugins/jwt.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { walletRoutes } from "./routes/wallet.js";
import { tableRoutes } from "./routes/tables.js";
import { statsRoutes } from "./routes/stats.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Frontend POSTs (e.g. /wallet/claim) send Content-Type: application/json
  // with no body; Fastify rejects that by default.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      if (!body || body.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  await app.register(cors, {
    origin: env.corsOrigin,
    credentials: true,
  });

  await app.register(jwtPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(walletRoutes);
  await app.register(tableRoutes);
  await app.register(statsRoutes);
  await app.register(leaderboardRoutes);

  return app;
}
