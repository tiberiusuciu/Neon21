import { prisma } from "../lib/prisma.js";

const TABLE_NAMES = [
  "Table 1",
  "Table 2",
  "Table 3",
  "Table 4",
  "Table 5",
  "Table 6",
  "Table 7",
  "Table 8",
];

export async function seedSystemTables() {
  for (const name of TABLE_NAMES) {
    await prisma.table.upsert({
      where: { name },
      create: { name, seatCapacity: 5, status: "open" },
      update: {},
    });
  }
}
