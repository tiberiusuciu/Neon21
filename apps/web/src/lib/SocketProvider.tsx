import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  GoldenHourPublic,
  GoldenHourRebateProgress,
  JackpotWinBroadcast,
  LobbyTable,
  TableChatMessage,
  TableStateSnapshot,
} from "@neon21/shared";
import { formatCents } from "./format";
import { useAuth } from "./auth";
import { useToast } from "./toast";
import { getActiveTableId, setActiveTableId } from "./activeTable";
import {
  disconnectSocket,
  emitEvent,
  getSocket,
  onEvent,
  type GameSocket,
} from "./socket";
const CHAT_BUFFER = 80;
type GameSocketApi = {
  socket: GameSocket | null;
  connected: boolean;
  lobbyTables: LobbyTable[];
  tableState: TableStateSnapshot | null;
  chatMessages: TableChatMessage[];
  goldenHour: GoldenHourPublic | null;
  goldenHourRebate: GoldenHourRebateProgress | null;
  subscribeLobby: () => void;
  joinTable: (tableId: string) => void;
  /** Soft by default keeps seat + activeTableId; pass hard to fully leave when allowed. */
  leaveTable: (opts?: { hard?: boolean }) => void;
  takeSeat: (seatIndex: number) => void;
  leaveSeat: () => void;
  addBet: (cents: number) => void;
  removeBet: (cents: number) => void;
  clearBet: () => void;
  reuseBet: () => void;
  hit: () => void;
  stand: () => void;
  double: () => void;
  split: () => void;
  takeInsurance: () => void;
  declineInsurance: () => void;
  claimSpin: () => void;
  goSpin: () => void;
  cancelSpin: () => void;
  spinDone: () => void;
  toggleGoldenHand: () => void;
  sendChat: (text: string) => void;
  clearTableState: () => void;
  debugSetBet: (cents: number) => void;
  debugStackCards: (cards: string[]) => void;
  debugClearStack: () => void;
  debugSpawnBot: (opts: {
    seatIndex: number;
    name?: string;
    betCents: number;
  }) => void;
  debugClearBots: () => void;
  debugDealNow: () => void;
  debugSetBotsHold: (hold: boolean) => void;
  debugSetTimerPaused: (paused: boolean) => void;
  debugGrantVoucher: (count?: number) => void;
  debugGrantGoldenHands: (count?: number) => void;
  debugSetSpinBias: (tileIndex: number | null) => void;
  subscribeJackpot: () => void;
  unsubscribeJackpot: () => void;
};
const GameSocketContext = createContext<GameSocketApi | null>(null);
function mergeChat(
  prev: TableChatMessage[],
  incoming: TableChatMessage[]
): TableChatMessage[] {
  const map = new Map<string, TableChatMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) {
    const existing = map.get(m.id);
    map.set(m.id, existing ? { ...existing, ...m } : m);
  }
  return [...map.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-CHAT_BUFFER);
}
export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, setBalanceCents } = useAuth();
  const toast = useToast();
  const toastError = useRef(toast.error);
  toastError.current = toast.error;
  const toastSuccess = useRef(toast.success);
  toastSuccess.current = toast.success;
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobbyTables, setLobbyTables] = useState<LobbyTable[]>([]);
  const [tableState, setTableState] = useState<TableStateSnapshot | null>(null);
  const [chatMessages, setChatMessages] = useState<TableChatMessage[]>([]);
  const [goldenHour, setGoldenHour] = useState<GoldenHourPublic | null>(null);
  const [goldenHourRebate, setGoldenHourRebate] =
    useState<GoldenHourRebateProgress | null>(null);
  const tableStateRef = useRef<TableStateSnapshot | null>(null);
  const pendingWinToast = useRef<JackpotWinBroadcast | null>(null);
  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
      setLobbyTables([]);
      setTableState(null);
      setChatMessages([]);
      setGoldenHour(null);
      setActiveTableId(null);
      tableStateRef.current = null;
      pendingWinToast.current = null;
      return;
    }
    const s = getSocket(token);
    setSocket(s);
    const rejoinActiveTable = () => {
      const tableId = getActiveTableId();
      if (tableId) emitEvent(s, "table:join", { tableId });
    };
    const onConnect = () => {
      setConnected(true);
      rejoinActiveTable();
    };
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) {
      setConnected(true);
      rejoinActiveTable();
    }
    const flushPendingWin = () => {
      const pending = pendingWinToast.current;
      if (!pending) return;
      pendingWinToast.current = null;
      const amt = (pending.payoutCents / 100).toFixed(2);
      toastSuccess.current(
        `${pending.name} at ${pending.tableName} hit ${pending.label} — $${amt} from the jackpot`
      );
    };
    const offTables = onEvent(s, "lobby:tables", ({ tables }) => {
      setLobbyTables(tables);
    });
    const offState = onEvent(s, "table:state", (state) => {
      tableStateRef.current = state;
      setTableState(state);
      const spin = state.spin;
      if (
        pendingWinToast.current &&
        (spin?.payoutCents != null || spin == null)
      ) {
        flushPendingWin();
      }
    });
    const offWallet = onEvent(s, "wallet:update", ({ balanceCents, creditedCents }) => {
      setBalanceCents(balanceCents);
      if (creditedCents == null || creditedCents === 0) return;
      // Jackpot spin credit is announced via jackpot:win after the wheel stops.
      const spin = tableStateRef.current?.spin;
      if (spin?.phase === "result") return;
      const dollars = (Math.abs(creditedCents) / 100).toFixed(2);
      toastSuccess.current(
        creditedCents > 0
          ? `+$${dollars} added to your wallet`
          : `$${dollars} removed from your wallet`
      );
    });
    const offError = onEvent(s, "game:error", ({ message }) => {
      toastError.current(message);
    });
    const offChat = onEvent(s, "table:chat", (msg) => {
      setChatMessages((prev) => mergeChat(prev, [msg]));
    });
    const offHistory = onEvent(s, "table:chat:history", ({ messages }) => {
      setChatMessages((prev) => mergeChat(prev, messages));
    });
    const offJackpotWin = onEvent(s, "jackpot:win", (win) => {
      const spinning =
        tableStateRef.current?.spin?.phase === "result" &&
        tableStateRef.current.spin.payoutCents == null;
      if (spinning) {
        pendingWinToast.current = win;
        return;
      }
      const amt = (win.payoutCents / 100).toFixed(2);
      toastSuccess.current(
        `${win.name} at ${win.tableName} hit ${win.label} — $${amt} from the jackpot`
      );
    });
    const offGhState = onEvent(s, "golden-hour:state", (state) => {
      setGoldenHour(state);
    });
    const offGhStarted = onEvent(s, "golden-hour:started", (state) => {
      setGoldenHour((prev) => {
        if (prev?.windowStartedAt !== state.windowStartedAt) {
          setGoldenHourRebate({
            wonCents: 0,
            lostCents: 0,
            rebateCents: 0,
            capCents: 500_000,
          });
        }
        return state;
      });
      toastSuccess.current(
        "Golden Hour — the house treasury is vulnerable"
      );
    });
    const offGhEnded = onEvent(s, "golden-hour:ended", (state) => {
      setGoldenHour(state);
      setGoldenHourRebate(null);
    });
    const offGhRebate = onEvent(s, "golden-hour:rebate", (progress) => {
      setGoldenHourRebate(progress);
    });
    const offGhRebatePaid = onEvent(s, "golden-hour:rebate-paid", ({ rebateCents }) => {
      if (rebateCents > 0) {
        toastSuccess.current(
          `Golden rebate paid — ${formatCents(rebateCents)}`
        );
      }
    });
    emitEvent(s, "golden-hour:subscribe");
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      offTables();
      offState();
      offWallet();
      offError();
      offChat();
      offHistory();
      offJackpotWin();
      offGhState();
      offGhStarted();
      offGhEnded();
      offGhRebate();
      offGhRebatePaid();
    };
  }, [token, setBalanceCents]);
  const leaveTimerRef = useRef<number | null>(null);
  const subscribeLobby = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "lobby:subscribe");
  }, [socket]);
  const subscribeJackpot = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "jackpot:subscribe");
  }, [socket]);
  const unsubscribeJackpot = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "jackpot:unsubscribe");
  }, [socket]);
  const joinTable = useCallback(
    (tableId: string) => {
      if (leaveTimerRef.current != null) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      const prev = getActiveTableId();
      if (prev && prev !== tableId) {
        setTableState(null);
        setChatMessages([]);
      }
      setActiveTableId(tableId);
      if (!socket) return;
      emitEvent(socket, "table:join", { tableId });
    },
    [socket]
  );
  const leaveTable = useCallback((opts?: { hard?: boolean }) => {
    if (leaveTimerRef.current != null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    const hard = opts?.hard === true;
    if (!hard) {
      setTableState(null);
      setChatMessages([]);
      if (socket) emitEvent(socket, "table:away");
      return;
    }
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setActiveTableId(null);
      setTableState(null);
      setChatMessages([]);
      if (!socket) return;
      emitEvent(socket, "table:leave");
    }, 400);
  }, [socket]);
  const takeSeat = useCallback(
    (seatIndex: number) => {
      if (!socket) return;
      emitEvent(socket, "seat:take", { seatIndex });
    },
    [socket]
  );
  const leaveSeat = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "seat:leave");
  }, [socket]);
  const addBet = useCallback(
    (cents: number) => {
      if (!socket) return;
      emitEvent(socket, "bet:add", { cents });
    },
    [socket]
  );
  const removeBet = useCallback(
    (cents: number) => {
      if (!socket) return;
      emitEvent(socket, "bet:remove", { cents });
    },
    [socket]
  );
  const clearBet = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "bet:clear");
  }, [socket]);
  const reuseBet = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "bet:reuse");
  }, [socket]);
  const hit = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "action:hit");
  }, [socket]);
  const stand = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "action:stand");
  }, [socket]);
  const double = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "action:double");
  }, [socket]);
  const split = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "action:split");
  }, [socket]);
  const takeInsurance = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "insurance:take");
  }, [socket]);
  const declineInsurance = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "insurance:decline");
  }, [socket]);
  const claimSpin = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "spin:claim");
  }, [socket]);
  const goSpin = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "spin:go");
  }, [socket]);
  const cancelSpin = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "spin:cancel");
  }, [socket]);
  const spinDone = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "spin:done");
  }, [socket]);
  const toggleGoldenHand = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "golden-hand:toggle");
  }, [socket]);
  const sendChat = useCallback(
    (text: string) => {
      if (!socket) return;
      emitEvent(socket, "table:chat", { text });
    },
    [socket]
  );
  const clearTableState = useCallback(() => {
    setTableState(null);
    setChatMessages([]);
  }, []);
  const debugSetBet = useCallback(
    (cents: number) => {
      if (!socket) return;
      emitEvent(socket, "debug:setBet", { cents });
    },
    [socket]
  );
  const debugStackCards = useCallback(
    (cards: string[]) => {
      if (!socket) return;
      emitEvent(socket, "debug:stackCards", { cards });
    },
    [socket]
  );
  const debugClearStack = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "debug:clearStack");
  }, [socket]);
  const debugSpawnBot = useCallback(
    (opts: { seatIndex: number; name?: string; betCents: number }) => {
      if (!socket) return;
      emitEvent(socket, "debug:spawnBot", opts);
    },
    [socket]
  );
  const debugClearBots = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "debug:clearBots");
  }, [socket]);
  const debugDealNow = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "debug:dealNow");
  }, [socket]);
  const debugSetBotsHold = useCallback(
    (hold: boolean) => {
      if (!socket) return;
      emitEvent(socket, "debug:setBotsHold", { hold });
    },
    [socket]
  );
  const debugSetTimerPaused = useCallback(
    (paused: boolean) => {
      if (!socket) return;
      emitEvent(socket, "debug:setTimerPaused", { paused });
    },
    [socket]
  );
  const debugGrantVoucher = useCallback(
    (count = 1) => {
      if (!socket) return;
      emitEvent(socket, "debug:grantVoucher", { count });
    },
    [socket]
  );
  const debugGrantGoldenHands = useCallback(
    (count = 1) => {
      if (!socket) return;
      emitEvent(socket, "debug:grantGoldenHands", { count });
    },
    [socket]
  );
  const debugSetSpinBias = useCallback(
    (tileIndex: number | null) => {
      if (!socket) return;
      emitEvent(socket, "debug:setSpinBias", { tileIndex });
    },
    [socket]
  );
  const value = useMemo<GameSocketApi>(
    () => ({
      socket,
      connected,
      lobbyTables,
      tableState,
      chatMessages,
      goldenHour,
      goldenHourRebate,
      subscribeLobby,
      joinTable,
      leaveTable,
      takeSeat,
      leaveSeat,
      addBet,
      removeBet,
      clearBet,
      reuseBet,
      hit,
      stand,
      double,
      split,
      takeInsurance,
      declineInsurance,
      claimSpin,
      goSpin,
      cancelSpin,
      spinDone,
      toggleGoldenHand,
      sendChat,
      clearTableState,
      debugSetBet,
      debugStackCards,
      debugClearStack,
      debugSpawnBot,
      debugClearBots,
      debugDealNow,
      debugSetBotsHold,
      debugSetTimerPaused,
      debugGrantVoucher,
      debugGrantGoldenHands,
      debugSetSpinBias,
      subscribeJackpot,
      unsubscribeJackpot,
    }),
    [
      socket,
      connected,
      lobbyTables,
      tableState,
      chatMessages,
      goldenHour,
      goldenHourRebate,
      subscribeLobby,
      joinTable,
      leaveTable,
      takeSeat,
      leaveSeat,
      addBet,
      removeBet,
      clearBet,
      reuseBet,
      hit,
      stand,
      double,
      split,
      takeInsurance,
      declineInsurance,
      claimSpin,
      goSpin,
      cancelSpin,
      spinDone,
      toggleGoldenHand,
      sendChat,
      clearTableState,
      debugSetBet,
      debugStackCards,
      debugClearStack,
      debugSpawnBot,
      debugClearBots,
      debugDealNow,
      debugSetBotsHold,
      debugSetTimerPaused,
      debugGrantVoucher,
      debugGrantGoldenHands,
      debugSetSpinBias,
      subscribeJackpot,
      unsubscribeJackpot,
    ]
  );
  return (
    <GameSocketContext.Provider value={value}>
      {children}
    </GameSocketContext.Provider>
  );
}
export function useGameSocket() {
  const ctx = useContext(GameSocketContext);
  if (!ctx) throw new Error("useGameSocket must be used within SocketProvider");
  return ctx;
}
