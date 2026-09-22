import { buildApp } from "./app.js";
import { setupSocket } from "./socket.js";
import { env } from "./env.js";

async function main() {
  const app = await buildApp();
  await app.ready();

  setupSocket(app, app.server);

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
