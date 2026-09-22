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
import type { LobbyTable, TableStateSnapshot } from "@neon21/shared";
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

type GameSocketApi = {
  socket: GameSocket | null;
  connected: boolean;
  lobbyTables: LobbyTable[];
  tableState: TableStateSnapshot | null;
  subscribeLobby: () => void;
  joinTable: (tableId: string) => void;
  leaveTable: () => void;
  takeSeat: (seatIndex: number) => void;
  leaveSeat: () => void;
  addBet: (cents: number) => void;
  clearBet: () => void;
  reuseBet: () => void;
  hit: () => void;
  stand: () => void;
  double: () => void;
  split: () => void;
  takeInsurance: () => void;
  declineInsurance: () => void;
  clearTableState: () => void;
};

const GameSocketContext = createContext<GameSocketApi | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, setBalanceCents } = useAuth();
  const toast = useToast();
  const toastError = useRef(toast.error);
  toastError.current = toast.error;

  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lobbyTables, setLobbyTables] = useState<LobbyTable[]>([]);
  const [tableState, setTableState] = useState<TableStateSnapshot | null>(null);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
      setLobbyTables([]);
      setTableState(null);
      setActiveTableId(null);
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

    const offTables = onEvent(s, "lobby:tables", ({ tables }) => {
      setLobbyTables(tables);
    });
    const offState = onEvent(s, "table:state", (state) => {
      setTableState(state);
    });
    const offWallet = onEvent(s, "wallet:update", ({ balanceCents }) => {
      setBalanceCents(balanceCents);
    });
    const offError = onEvent(s, "game:error", ({ message }) => {
      toastError.current(message);
    });

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      offTables();
      offState();
      offWallet();
      offError();
    };
  }, [token, setBalanceCents]);

  const subscribeLobby = useCallback(() => {
    if (!socket) return;
    emitEvent(socket, "lobby:subscribe");
  }, [socket]);

  const joinTable = useCallback(
    (tableId: string) => {
      if (!socket) return;
      setActiveTableId(tableId);
      emitEvent(socket, "table:join", { tableId });
    },
    [socket]
  );

  const leaveTable = useCallback(() => {
    if (!socket) return;
    setActiveTableId(null);
    emitEvent(socket, "table:leave");
    setTableState(null);
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

  const clearTableState = useCallback(() => setTableState(null), []);

  const value = useMemo<GameSocketApi>(
    () => ({
      socket,
      connected,
      lobbyTables,
      tableState,
      subscribeLobby,
      joinTable,
      leaveTable,
      takeSeat,
      leaveSeat,
      addBet,
      clearBet,
      reuseBet,
      hit,
      stand,
      double,
      split,
      takeInsurance,
      declineInsurance,
      clearTableState,
    }),
    [
      socket,
      connected,
      lobbyTables,
      tableState,
      subscribeLobby,
      joinTable,
      leaveTable,
      takeSeat,
      leaveSeat,
      addBet,
      clearBet,
      reuseBet,
      hit,
      stand,
      double,
      split,
      takeInsurance,
      declineInsurance,
      clearTableState,
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
