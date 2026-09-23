import type { TableChatMessage } from "@neon21/shared";
import { prisma } from "./prisma.js";

const HISTORY_LIMIT = 50;
const RETAIN_LIMIT = 100;
const THROTTLE_MS = 1_500;

/** tableId -> userId -> lastReadAt ms */
const readCursors = new Map<string, Map<string, number>>();
/** `${tableId}:${userId}` -> last send ms */
const sendThrottle = new Map<string, number>();

function cursorMap(tableId: string): Map<string, number> {
  let m = readCursors.get(tableId);
  if (!m) {
    m = new Map();
    readCursors.set(tableId, m);
  }
  return m;
}

export function clearChatCursors(tableId: string) {
  readCursors.delete(tableId);
}

function toPayload(
  row: { id: string; userId: string; name: string; text: string; createdAt: Date },
  seenByCount?: number
): TableChatMessage {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    text: row.text,
    at: row.createdAt.toISOString(),
    ...(seenByCount != null ? { seenByCount } : {}),
  };
}

export function seenByCountFor(
  tableId: string,
  authorId: string,
  createdAtMs: number,
  presentUserIds: string[]
): number {
  const cursors = cursorMap(tableId);
  let n = 0;
  for (const uid of presentUserIds) {
    if (uid === authorId) continue;
    const at = cursors.get(uid);
    if (at != null && at >= createdAtMs) n += 1;
  }
  return n;
}

export async function loadChatHistory(
  tableId: string,
  presentUserIds: string[]
): Promise<TableChatMessage[]> {
  const rows = await prisma.tableChatMessage.findMany({
    where: { tableId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  rows.reverse();
  return rows.map((row) =>
    toPayload(
      row,
      seenByCountFor(tableId, row.userId, row.createdAt.getTime(), presentUserIds)
    )
  );
}

export function checkChatThrottle(tableId: string, userId: string): string | null {
  const key = `${tableId}:${userId}`;
  const now = Date.now();
  const prev = sendThrottle.get(key) ?? 0;
  if (now - prev < THROTTLE_MS) return "Slow down";
  sendThrottle.set(key, now);
  return null;
}

export async function insertChatMessage(input: {
  tableId: string;
  userId: string;
  name: string;
  text: string;
}): Promise<TableChatMessage> {
  const row = await prisma.tableChatMessage.create({
    data: {
      tableId: input.tableId,
      userId: input.userId,
      name: input.name,
      text: input.text,
    },
  });

  const excess = await prisma.tableChatMessage.count({
    where: { tableId: input.tableId },
  });
  if (excess > RETAIN_LIMIT) {
    const old = await prisma.tableChatMessage.findMany({
      where: { tableId: input.tableId },
      orderBy: { createdAt: "asc" },
      take: excess - RETAIN_LIMIT,
      select: { id: true },
    });
    if (old.length) {
      await prisma.tableChatMessage.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
    }
  }

  // Author has "read" their own message.
  cursorMap(input.tableId).set(input.userId, row.createdAt.getTime());

  return toPayload(row, 0);
}

export async function markChatRead(input: {
  tableId: string;
  userId: string;
  messageId: string;
  presentUserIds: string[];
}): Promise<{ messageId: string; seenByCount: number } | null> {
  const row = await prisma.tableChatMessage.findFirst({
    where: { id: input.messageId, tableId: input.tableId },
  });
  if (!row) return null;

  const cursors = cursorMap(input.tableId);
  const prev = cursors.get(input.userId) ?? 0;
  const next = row.createdAt.getTime();
  if (next > prev) cursors.set(input.userId, next);

  return {
    messageId: row.id,
    seenByCount: seenByCountFor(
      input.tableId,
      row.userId,
      row.createdAt.getTime(),
      input.presentUserIds
    ),
  };
}
