import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./env.js";

export function setupSocket(app: FastifyInstance, httpServer: import("node:http").Server) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error("Unauthorized"));
    }
    try {
      const payload = app.jwt.verify<{ sub: string; email: string }>(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("ping", () => {
      socket.emit("pong");
    });
  });

  return io;
}
