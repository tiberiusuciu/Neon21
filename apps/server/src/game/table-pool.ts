import { randomUUID } from "node:crypto";
import type { Server as SocketIOServer } from "socket.io";
import type { LobbyTable, TableStateSnapshot } from "@neon21/shared";
import { SEAT_CAPACITY } from "@neon21/shared";
import { TableRoom } from "./table-room.js";
import { EMPTY_DELETE_MS } from "./types.js";

export class TablePool {
  private tables = new Map<string, TableRoom>();
  private deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextNumber = 1;
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.createTable();
  }

  list(): LobbyTable[] {
    return [...this.tables.values()]
      .map((t) => t.toLobby())
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  get(tableId: string): TableRoom | undefined {
    return this.tables.get(tableId);
  }

  broadcastLobby() {
    this.io.to("lobby").emit("lobby:tables", { tables: this.list() });
  }

  private createTable(): TableRoom {
    const id = randomUUID();
    const name = `Table ${this.nextNumber++}`;
    const room = new TableRoom(id, name, {
      broadcastState: (snapshot: TableStateSnapshot) => {
        this.io.to(`table:${id}`).emit("table:state", snapshot);
      },
      onLobbyChanged: () => this.broadcastLobby(),
      onWalletUpdate: (userId, balanceCents) => {
        this.io.to(`user:${userId}`).emit("wallet:update", { balanceCents });
        if (balanceCents <= 0) {
          for (const room of this.tables.values()) {
            void room.kickIfBroke(userId);
          }
        }
      },
      onSeatedChanged: (tableId) => this.handleSeatedChanged(tableId),
      onNotice: (userId, message) => {
        this.io.to(`user:${userId}`).emit("game:error", { message });
      },
    });
    this.tables.set(id, room);
    this.broadcastLobby();
    return room;
  }

  private handleSeatedChanged(tableId: string) {
    const room = this.tables.get(tableId);
    if (!room) return;

    if (room.seatedCount() === 0) {
      this.scheduleDelete(tableId);
    } else {
      this.cancelDelete(tableId);
    }

    if (room.isFull()) {
      const hasEmpty = [...this.tables.values()].some((t) => t.seatedCount() === 0);
      if (!hasEmpty) {
        this.createTable();
      }
    }
  }

  private scheduleDelete(tableId: string) {
    if (this.deleteTimers.has(tableId)) return;
    if (this.tables.size <= 1) return;

    const timer = setTimeout(() => {
      this.deleteTimers.delete(tableId);
      this.destroyTable(tableId);
    }, EMPTY_DELETE_MS);
    this.deleteTimers.set(tableId, timer);
  }

  private cancelDelete(tableId: string) {
    const timer = this.deleteTimers.get(tableId);
    if (timer) {
      clearTimeout(timer);
      this.deleteTimers.delete(tableId);
    }
  }

  private destroyTable(tableId: string) {
    if (this.tables.size <= 1) return;
    const room = this.tables.get(tableId);
    if (!room) return;
    if (room.seatedCount() > 0) return;

    this.cancelDelete(tableId);
    room.destroy();
    this.tables.delete(tableId);
    this.io.to(`table:${tableId}`).emit("game:error", { message: "Table closed" });
    this.broadcastLobby();

    if (this.tables.size === 0) {
      this.createTable();
    }
  }
}

let pool: TablePool | null = null;

export function initPool(io: SocketIOServer): TablePool {
  pool = new TablePool(io);
  return pool;
}

export function getPool(): TablePool {
  if (!pool) throw new Error("Table pool not initialized");
  return pool;
}

export { SEAT_CAPACITY };
