import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

const nodeEnv = process.env.NODE_ENV ?? "development";
if (nodeEnv === "production") {
  console.error("wallet:topup is disabled when NODE_ENV=production");
  process.exit(1);
}

function usage(): never {
  console.error("Usage: pnpm wallet:topup -- <email> <dollars>");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== "--");
const email = args[0];
const dollarsRaw = args[1];

if (!email || dollarsRaw === undefined) usage();

const dollars = Number(dollarsRaw);
if (!Number.isFinite(dollars) || dollars <= 0) {
  console.error("dollars must be a positive number");
  process.exit(1);
}

const cents = Math.round(dollars * 100);

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Host-side script: Compose service hostname `db` is not resolvable
if (databaseUrl.includes("@db:")) {
  databaseUrl = databaseUrl.replace("@db:", "@localhost:");
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { balanceCents: { increment: cents } },
  });

  console.log(
    `Credited $${dollars.toFixed(2)} to ${email}. New balance: $${(updated.balanceCents / 100).toFixed(2)}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
