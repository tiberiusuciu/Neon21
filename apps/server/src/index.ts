import { buildApp } from "./app.js";
import { setupSocket } from "./socket.js";
import { env } from "./env.js";
import { initGoldenHour } from "./lib/golden-hour.js";

async function main() {
  const app = await buildApp();
  await app.ready();

  setupSocket(app, app.server);
  await initGoldenHour();

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
