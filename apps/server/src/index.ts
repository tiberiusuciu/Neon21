import { buildApp } from "./app.js";
import { setupSocket } from "./socket.js";
import { env } from "./env.js";
import { seedSystemTables } from "./lib/seed.js";

async function main() {
  await seedSystemTables();

  const app = await buildApp();
  await app.ready();

  setupSocket(app, app.server);

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
