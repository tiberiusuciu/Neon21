import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { TableChatReadSchema, TableChatSendSchema } from "@neon21/shared";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { getPool, initPool } from "./game/table-pool.js";
import {
  checkChatThrottle,
  insertChatMessage,
  insertSystemChatMessage,
  loadChatHistory,
  markChatRead,
} from "./lib/table-chat.js";

const TableIdSchema = z.object({ tableId: z.string().min(1) });
const SeatTakeSchema = z.object({ seatIndex: z.number().int().min(0).max(6) });
const BetAddSchema = z.object({ cents: z.number().int().positive() });

async function loadUserName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return user?.name ?? null;
}

const PRESENCE_GRACE_MS = 2_500;
/** Pending leave announces: cancel if the same user rejoins quickly. */
const pendingLeaveAnnounces = new Map<string, ReturnType<typeof setTimeout>>();

function presenceKey(tableId: string, userId: string) {
  return `${tableId}:${userId}`;
}

async function writePresenceChat(
  io: SocketIOServer,
  tableId: string,
  userId: string,
  name: string,
  action: "joined" | "left",
  log?: { error: (err: unknown, msg?: string) => void },
  exceptSocketId?: string
) {
  try {
    const msg = await insertSystemChatMessage({
      tableId,
      userId,
      name,
      text: action === "joined" ? "has joined" : "has left",
    });
    const target = exceptSocketId
      ? io.to(`table:${tableId}`).except(exceptSocketId)
      : io.to(`table:${tableId}`);
    target.emit("table:chat", msg);
  } catch (err) {
    log?.error(err, "presence chat failed");
  }
}

function emitPresenceChat(
  io: SocketIOServer,
  tableId: string,
  userId: string,
  name: string,
  action: "joined" | "left",
  log?: { error: (err: unknown, msg?: string) => void },
  exceptSocketId?: string
) {
  const key = presenceKey(tableId, userId);
  if (action === "joined") {
    const pending = pendingLeaveAnnounces.get(key);
    if (pending) {
      clearTimeout(pending);
      pendingLeaveAnnounces.delete(key);
      return;
    }
    void writePresenceChat(
      io,
      tableId,
      userId,
      name,
      "joined",
      log,
      exceptSocketId
    );
    return;
  }
  const existing = pendingLeaveAnnounces.get(key);
  if (existing) clearTimeout(existing);
  pendingLeaveAnnounces.set(
    key,
    setTimeout(() => {
      pendingLeaveAnnounces.delete(key);
      void writePresenceChat(io, tableId, userId, name, "left", log);
    }, PRESENCE_GRACE_MS)
  );
}

export function setupSocket(app: FastifyInstance, httpServer: import("node:http").Server) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.corsOrigin,
      credentials: true,
    },
  });

  const pool = initPool(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Unauthorized"));
    }
    try {
      const payload = app.jwt.verify<{ sub: string; email: string }>(token);
      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on("lobby:subscribe", () => {
      socket.join("lobby");
      socket.emit("lobby:tables", { tables: pool.list() });
    });

    socket.on("table:join", async (raw) => {
      const parsed = TableIdSchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit("game:error", { message: "Invalid table id" });
        return;
      }
      const room = pool.get(parsed.data.tableId);
      if (!room) {
        socket.emit("game:error", { message: "Table not found" });
        return;
      }
      const name = (await loadUserName(userId)) ?? "Player";
      const prev = socket.data.tableId as string | undefined;
      if (prev && prev !== room.id) {
        socket.leave(`table:${prev}`);
        const prevRoom = pool.get(prev);
        const leftName = prevRoom?.leave(userId) ?? null;
        if (prevRoom && leftName) {
          emitPresenceChat(io, prev, userId, leftName, "left", app.log);
        }
      }
      socket.data.tableId = room.id;
      socket.join(`table:${room.id}`);
      const isNew = room.join(userId, name);
      socket.emit("table:state", room.getSnapshot());
      try {
        const messages = (await loadChatHistory(room.id, room.presentUserIds())).filter(
          (m) =>
            !(
              m.kind === "system" &&
              m.userId === userId &&
              (m.text === "has joined" || m.text === "has left")
            )
        );
        socket.emit("table:chat:history", { messages });
      } catch (err) {
        app.log.error(err, "chat history failed");
      }
      if (isNew) {
        emitPresenceChat(
          io,
          room.id,
          userId,
          name,
          "joined",
          app.log,
          socket.id
        );
      }
    });

    socket.on("table:leave", () => {
      const tableId = socket.data.tableId as string | undefined;
      if (!tableId) return;
      socket.leave(`table:${tableId}`);
      const leftName = pool.get(tableId)?.leave(userId) ?? null;
      if (leftName) {
        emitPresenceChat(io, tableId, userId, leftName, "left", app.log);
      }
      socket.data.tableId = undefined;
    });

    socket.on("seat:take", async (raw) => {
      const parsed = SeatTakeSchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit("game:error", { message: "Invalid seat" });
        return;
      }
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) {
        socket.emit("game:error", { message: "Join a table first" });
        return;
      }
      const err = await room.takeSeat(userId, parsed.data.seatIndex);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("seat:leave", () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = room.leaveSeat(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("bet:add", async (raw) => {
      const parsed = BetAddSchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit("game:error", { message: "Invalid bet" });
        return;
      }
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) {
        socket.emit("game:error", { message: "Join a table first" });
        return;
      }
      const err = await room.addBet(userId, parsed.data.cents);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("bet:remove", async (raw) => {
      const parsed = BetAddSchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit("game:error", { message: "Invalid bet" });
        return;
      }
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) {
        socket.emit("game:error", { message: "Join a table first" });
        return;
      }
      const err = await room.removeBet(userId, parsed.data.cents);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("bet:clear", () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = room.clearBet(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("bet:reuse", async () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = await room.reuseBet(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("action:hit", () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = room.hit(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("action:stand", () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = room.stand(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("action:double", async () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = await room.double(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("action:split", async () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = await room.split(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("insurance:take", async () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = await room.takeInsurance(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("insurance:decline", () => {
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room) return;
      const err = room.declineInsurance(userId);
      if (err) socket.emit("game:error", { message: err });
    });

    socket.on("table:chat", async (raw) => {
      const parsed = TableChatSendSchema.safeParse(raw);
      if (!parsed.success) {
        socket.emit("game:error", { message: "Invalid message" });
        return;
      }
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room || !tableId) {
        socket.emit("game:error", { message: "Join a table first" });
        return;
      }
      if (!room.isPresent(userId)) {
        socket.emit("game:error", { message: "Join a table first" });
        return;
      }
      const throttled = checkChatThrottle(tableId, userId);
      if (throttled) {
        socket.emit("game:error", { message: throttled });
        return;
      }
      const name =
        room.displayName(userId) ??
        (await loadUserName(userId)) ??
        "Player";
      try {
        const msg = await insertChatMessage({
          tableId,
          userId,
          name,
          text: parsed.data.text,
        });
        io.to(`table:${tableId}`).emit("table:chat", msg);
      } catch (err) {
        app.log.error(err, "chat send failed");
        socket.emit("game:error", { message: "Could not send message" });
      }
    });

    socket.on("table:chat:read", async (raw) => {
      const parsed = TableChatReadSchema.safeParse(raw);
      if (!parsed.success) return;
      const tableId = socket.data.tableId as string | undefined;
      const room = tableId ? pool.get(tableId) : undefined;
      if (!room || !tableId || !room.isPresent(userId)) return;
      try {
        const receipt = await markChatRead({
          tableId,
          userId,
          messageId: parsed.data.messageId,
          presentUserIds: room.presentUserIds(),
        });
        if (receipt) {
          io.to(`table:${tableId}`).emit("table:chat:receipts", receipt);
        }
      } catch (err) {
        app.log.error(err, "chat read failed");
      }
    });

    socket.on("disconnect", () => {
      const tableId = socket.data.tableId as string | undefined;
      if (!tableId) return;
      const room = pool.get(tableId);
      if (!room) return;
      // Keep seat + spectator membership across blips / HMR / reloads.
      // Explicit table:leave clears presence.
      if (room.findSeatIndex(userId) >= 0) {
        room.setConnected(userId, false);
      }
    });
  });

  return io;
}
