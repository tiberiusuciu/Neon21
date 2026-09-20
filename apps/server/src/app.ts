import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import jwtPlugin from "./plugins/jwt.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(jwtPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes);

  return app;
}
