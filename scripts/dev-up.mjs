import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function runShell(command) {
  const res = spawnSync("bash", ["-lc", command], {
    cwd: root,
    stdio: "inherit",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log("==> Building shared package");
run("pnpm", ["--filter", "@neon21/shared", "build"]);

console.log("==> Starting Docker (Postgres + API)");
runShell("docker compose up --build -d");

console.log("==> Waiting for API health");
let ready = false;
for (let i = 0; i < 90; i++) {
  const check = spawnSync(
    "curl",
    ["-sf", "http://127.0.0.1:4000/health"],
    { cwd: root, stdio: "ignore" }
  );
  if (check.status === 0) {
    ready = true;
    break;
  }
  spawnSync("sleep", ["1"]);
}

if (!ready) {
  console.error("error: API did not become healthy on :4000");
  console.error("Check: docker compose logs -f server");
  process.exit(1);
}

console.log("");
console.log("  API  http://localhost:4000");
console.log("  Web  http://localhost:5173");
console.log("  Stop with Ctrl+C (web) then: pnpm stop");
console.log("");

const child = spawn("pnpm", ["--filter", "@neon21/web", "dev"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
