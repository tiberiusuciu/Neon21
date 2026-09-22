import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { getPool, initPool } from "./game/table-pool.js";

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
        prevRoom?.leave(userId);
      }
      socket.data.tableId = room.id;
      socket.join(`table:${room.id}`);
      room.join(userId, name);
      socket.emit("table:state", room.getSnapshot());
    });

    socket.on("table:leave", () => {
      const tableId = socket.data.tableId as string | undefined;
      if (!tableId) return;
      socket.leave(`table:${tableId}`);
      pool.get(tableId)?.leave(userId);
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
