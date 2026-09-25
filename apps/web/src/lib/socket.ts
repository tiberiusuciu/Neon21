import { io, type Socket } from "socket.io-client";
import type {
  LobbyTable,
  TableStateSnapshot,
  WalletUpdate,
  SocketError,
  TableChatMessage,
  TableChatHistory,
  TableChatReceipts,
  JackpotDelta,
  JackpotClaimEntry,
  JackpotWinBroadcast,
  GoldenHourPublic,
  GoldenHourRebateProgress,
} from "@neon21/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type ClientToServerEvents = {
  "lobby:subscribe": () => void;
  "golden-hour:subscribe": () => void;
  "golden-hour:unsubscribe": () => void;
  "jackpot:subscribe": () => void;
  "jackpot:unsubscribe": () => void;
  "table:join": (payload: { tableId: string }) => void;
  "table:leave": () => void;
  "table:away": () => void;
  "seat:take": (payload: { seatIndex: number }) => void;
  "seat:leave": () => void;
  "bet:add": (payload: { cents: number }) => void;
  "bet:remove": (payload: { cents: number }) => void;
  "bet:clear": () => void;
  "bet:reuse": () => void;
  "action:hit": () => void;
  "action:stand": () => void;
  "action:double": () => void;
  "action:split": () => void;
  "insurance:take": () => void;
  "insurance:decline": () => void;
  "spin:claim": () => void;
  "spin:go": () => void;
  "spin:cancel": () => void;
  "spin:done": () => void;
  "golden-hand:toggle": () => void;
  "table:chat": (payload: { text: string }) => void;
  "table:chat:read": (payload: { messageId: string }) => void;
  "debug:setBet": (payload: { cents: number }) => void;
  "debug:stackCards": (payload: { cards: string[] }) => void;
  "debug:clearStack": () => void;
  "debug:spawnBot": (payload: {
    seatIndex: number;
    name?: string;
    betCents: number;
  }) => void;
  "debug:clearBots": () => void;
  "debug:dealNow": () => void;
  "debug:setBotsHold": (payload: { hold: boolean }) => void;
  "debug:setTimerPaused": (payload: { paused: boolean }) => void;
  "debug:grantVoucher": (payload?: { count?: number }) => void;
  "debug:grantGoldenHands": (payload?: { count?: number }) => void;
  "debug:setSpinBias": (payload: { tileIndex: number | null }) => void;
};

export type ServerToClientEvents = {
  "lobby:tables": (payload: { tables: LobbyTable[] }) => void;
  "table:state": (payload: TableStateSnapshot) => void;
  "wallet:update": (payload: WalletUpdate) => void;
  "game:error": (payload: SocketError) => void;
  "table:chat": (payload: TableChatMessage) => void;
  "table:chat:history": (payload: TableChatHistory) => void;
  "table:chat:receipts": (payload: TableChatReceipts) => void;
  "jackpot:delta": (payload: JackpotDelta) => void;
  "jackpot:claim": (payload: JackpotClaimEntry) => void;
  "jackpot:win": (payload: JackpotWinBroadcast) => void;
  "golden-hour:state": (payload: GoldenHourPublic) => void;
  "golden-hour:started": (payload: GoldenHourPublic) => void;
  "golden-hour:ended": (payload: GoldenHourPublic) => void;
  "golden-hour:rebate": (payload: GoldenHourRebateProgress) => void;
  "golden-hour:rebate-paid": (payload: { rebateCents: number }) => void;
};

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

function authToken(s: GameSocket): string | undefined {
  const auth = s.auth;
  if (auth && typeof auth === "object" && "token" in auth) {
    return (auth as { token?: string }).token;
  }
  return undefined;
}

export function getSocket(token: string): GameSocket {
  if (socket) {
    if (authToken(socket) !== token) {
      socket.auth = { token };
    }
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(API_URL, {
    autoConnect: true,
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  }) as GameSocket;
  return socket;
}

export function disconnectSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function emitEvent<E extends keyof ClientToServerEvents>(
  s: GameSocket,
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
): void {
  (s as Socket).emit(event as string, ...(args as unknown[]));
}

export function onEvent<E extends keyof ServerToClientEvents>(
  s: GameSocket,
  event: E,
  handler: ServerToClientEvents[E]
): () => void {
  const fn = handler as (...args: unknown[]) => void;
  (s as Socket).on(event as string, fn);
  return () => {
    (s as Socket).off(event as string, fn);
  };
}
