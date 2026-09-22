import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { PublicSeat, TablePhase } from "@neon21/shared";
import { MIN_BET_CENTS, SEAT_CAPACITY, handValueLabel } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { useGameSocket } from "../lib/SocketProvider";
import { useTableKeyboard } from "../lib/useTableKeyboard";
import { useCashFx } from "../lib/cashFx";
import { formatCountdown } from "../lib/format";
import { useAutoHeight } from "../lib/useAutoHeight";
import { PlayingCard } from "../components/table/PlayingCard";
import { HandValueBadge } from "../components/table/HandValueBadge";
import { SeatView } from "../components/table/SeatView";
import { ChipTray } from "../components/table/ChipTray";
import { ActionBar, type QueuedAction } from "../components/table/ActionBar";
import { PhaseBanner } from "../components/table/PhaseBanner";
import { getPhaseBannerCopy } from "../components/table/phaseCopy";
import {
  RoundHistoryDrawer,
  toHistoryCards,
  type RoundHistoryEntry,
} from "../components/table/RoundHistoryDrawer";
import { loadRoundHistory, saveRoundHistory } from "../lib/roundHistory";
import { useToast } from "../lib/toast";

const HISTORY_MAX = 24;

const PHASE_LABEL: Record<TablePhase, string> = {
  betting: "Betting",
  dealing: "Dealing",
  insurance: "Insurance",
  playerTurns: "Players",
  dealer: "Dealer",
  settle: "Results",
};

const EMPTY_SEATS: PublicSeat[] = Array.from({ length: SEAT_CAPACITY }, (_, i) => ({
  index: i,
  userId: null,
  name: null,
  pendingBetCents: 0,
  lastBetCents: 0,
  hands: [],
  insuranceCents: 0,
  connected: false,
}));

export function TablePage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user, wallet } = useAuth();
  const toast = useToast();
  const {
    connected,
    tableState,
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
  } = useGameSocket();
  const { playWin, playSpend } = useCashFx();
  const { ref: feltMeasureRef, height: feltHeight } = useAutoHeight<HTMLDivElement>();
  const balanceCents = wallet?.balanceCents ?? user?.balanceCents ?? 0;

  const [now, setNow] = useState(() => Date.now());
  const [insuranceDecided, setInsuranceDecided] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>(() =>
    tableId ? loadRoundHistory(tableId) : []
  );
  const celebratedSettle = useRef(false);
  const spentBetRound = useRef(false);
  const spentInsuranceRound = useRef(false);
  const loggedSettle = useRef(false);
  const celebrateTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!tableId || !connected) return;
    joinTable(tableId);
    return () => {
      leaveTable();
    };
  }, [tableId, connected, joinTable, leaveTable]);

  useEffect(() => {
    if (!tableId) return;
    setRoundHistory(loadRoundHistory(tableId));
    setHistoryOpen(false);
  }, [tableId]);

  useEffect(() => {
    if (!tableId) return;
    saveRoundHistory(tableId, roundHistory);
  }, [tableId, roundHistory]);

  function goLobby() {
    leaveTable();
    navigate("/lobby");
  }

  const endsAt = tableState?.phaseEndsAt ?? null;

  const phase: TablePhase = tableState?.phase ?? "betting";
  useEffect(() => {
    if (phase !== "insurance") setInsuranceDecided(false);
  }, [phase]);

  const mySeat = useMemo(() => {
    if (!tableState || !user) return null;
    return tableState.seats.find((s) => s.userId === user.id) ?? null;
  }, [tableState, user]);

  useEffect(() => {
    if (phase !== "settle") {
      celebratedSettle.current = false;
      loggedSettle.current = false;
      if (celebrateTimer.current != null) {
        window.clearTimeout(celebrateTimer.current);
        celebrateTimer.current = null;
      }
      return;
    }
    if (!mySeat) return;
    if (mySeat.hands.length === 0) return;
    if (mySeat.hands.some((h) => h.resultCents == null)) return;

    if (!loggedSettle.current) {
      loggedSettle.current = true;
      const hands = mySeat.hands.map((h) => ({
        resultCents: h.resultCents ?? 0,
        betCents: h.betCents,
        doubled: h.doubled,
        isBlackjack: h.isBlackjack,
        bust: h.value.bust,
        valueLabel: h.value.label || handValueLabel(h.value),
        cards: toHistoryCards(h.cards),
      }));
      const dealer = tableState?.dealer;
      const entry: RoundHistoryEntry = {
        id: `${Date.now()}-${hands.map((h) => h.resultCents).join(",")}`,
        at: Date.now(),
        netCents: hands.reduce((s, h) => s + h.resultCents, 0),
        betCents: hands.reduce((s, h) => s + h.betCents, 0),
        hands,
        dealerCards: toHistoryCards(dealer?.cards ?? []),
        dealerValueLabel: dealer?.value
          ? dealer.value.label || handValueLabel(dealer.value)
          : "—",
      };
      setRoundHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX));
    }

    if (celebratedSettle.current) return;
    const net = mySeat.hands.reduce((sum, h) => sum + (h.resultCents ?? 0), 0);
    if (net <= 0) return;

    celebratedSettle.current = true;
    const from = document.querySelector(".seat-you") as HTMLElement | null;
    const winners = mySeat.hands.filter((h) => (h.resultCents ?? 0) > 0);
    const kind = winners.some((h) => h.isBlackjack)
      ? "blackjack"
      : winners.some((h) => h.doubled)
        ? "double"
        : "normal";
    const fire = () => playWin(net, { kind, fromEl: from });
    // Let players see the outcome before cash flies (wallet credits are deferred server-side)
    celebrateTimer.current = window.setTimeout(() => {
      celebrateTimer.current = null;
      fire();
    }, 1000);
  }, [phase, mySeat, playWin, tableState?.dealer]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape" && historyOpen) {
        e.preventDefault();
        setHistoryOpen(false);
        return;
      }
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistoryOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  useEffect(() => {
    if (phase === "betting") {
      spentBetRound.current = false;
      spentInsuranceRound.current = false;
      return;
    }
    if (phase !== "dealing" || spentBetRound.current || !mySeat) return;
    const bet = mySeat.hands.reduce((sum, h) => sum + h.betCents, 0);
    if (bet <= 0) return;
    spentBetRound.current = true;
    playSpend(bet);
  }, [phase, mySeat, playSpend]);

  useEffect(() => {
    if (phase !== "insurance" || !mySeat || spentInsuranceRound.current) return;
    const cost = mySeat.insuranceCents;
    if (cost <= 0) return;
    spentInsuranceRound.current = true;
    playSpend(cost);
  }, [phase, mySeat, playSpend]);

  const seated = !!mySeat;

  // Client safety net: leave the seat if broke during betting with nothing in play.
  useEffect(() => {
    if (balanceCents > 0 || !seated || !mySeat) return;
    if (phase !== "betting") return;
    if (mySeat.hands.some((h) => h.cards.length > 0)) return;
    if (mySeat.pendingBetCents > 0) return;
    leaveSeat();
    toast.info("Out of chips — spectating. Claim more to sit again.");
  }, [balanceCents, seated, mySeat, phase, leaveSeat, toast]);

  const isMyTurn =
    seated &&
    phase === "playerTurns" &&
    tableState?.activeSeatIndex === mySeat?.index;

  const myActiveHand =
    isMyTurn && mySeat && tableState?.activeHandIndex != null
      ? mySeat.hands[tableState.activeHandIndex] ?? null
      : null;

  const queueHand = useMemo(() => {
    if (!mySeat?.hands.length) return null;
    if (myActiveHand && !myActiveHand.stood && !myActiveHand.value.bust) {
      return myActiveHand;
    }
    return (
      mySeat.hands.find((h) => !h.stood && !h.value.bust && h.cards.length >= 2) ??
      null
    );
  }, [mySeat, myActiveHand]);

  const isHolding =
    !!myActiveHand && myActiveHand.stood && !myActiveHand.value.bust;

  const canAct =
    isMyTurn &&
    !!myActiveHand &&
    !myActiveHand.stood &&
    !myActiveHand.value.bust;

  const turnLocked = isMyTurn && !canAct;

  const [queuedAction, setQueuedAction] = useState<QueuedAction | null>(null);
  const queuedRef = useRef<QueuedAction | null>(null);
  const firedQueueRef = useRef(false);
  queuedRef.current = queuedAction;

  const [pauseEndsAt, setPauseEndsAt] = useState<number | null>(null);
  useEffect(() => {
    if (turnLocked) {
      setPauseEndsAt((prev) => prev ?? Date.now() + 2_500);
    } else {
      setPauseEndsAt(null);
    }
  }, [turnLocked]);

  useEffect(() => {
    if (endsAt == null && pauseEndsAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt, pauseEndsAt]);

  const [turnBudgetMs, setTurnBudgetMs] = useState(25_000);
  const [betBudgetMs, setBetBudgetMs] = useState(20_000);
  const [insuranceBudgetMs, setInsuranceBudgetMs] = useState(10_000);
  useEffect(() => {
    if (!isMyTurn) {
      setTurnBudgetMs(25_000);
      return;
    }
    setTurnBudgetMs(turnLocked ? 2_500 : 25_000);
  }, [isMyTurn, turnLocked, endsAt]);

  useEffect(() => {
    if (phase !== "betting" || endsAt == null) {
      setBetBudgetMs(20_000);
      return;
    }
    const rem = endsAt - Date.now();
    // Short “about to begin” window is 5s; full open betting is 20s
    setBetBudgetMs(rem <= 5_500 ? 5_000 : 20_000);
  }, [phase, endsAt]);

  useEffect(() => {
    if (phase !== "insurance" || endsAt == null) {
      setInsuranceBudgetMs(10_000);
      return;
    }
    setInsuranceBudgetMs(Math.max(endsAt - Date.now(), 1_000));
  }, [phase, endsAt]);

  const effectiveEndsAt =
    pauseEndsAt != null && endsAt != null
      ? Math.min(endsAt, pauseEndsAt)
      : (pauseEndsAt ?? endsAt);

  const remainingMs =
    effectiveEndsAt != null ? Math.max(0, effectiveEndsAt - now) : null;
  const timerUrgent = remainingMs != null && remainingMs <= 5000 && !turnLocked;

  const timerProgress = useMemo(() => {
    if (effectiveEndsAt == null || remainingMs == null) return null;
    const total =
      phase === "betting"
        ? betBudgetMs
        : phase === "insurance"
          ? insuranceBudgetMs
          : phase === "playerTurns"
            ? turnBudgetMs
            : 20_000;
    return Math.max(0, Math.min(1, remainingMs / total));
  }, [
    effectiveEndsAt,
    remainingMs,
    phase,
    turnBudgetMs,
    betBudgetMs,
    insuranceBudgetMs,
  ]);

  const dealerHasAce = useMemo(() => {
    const cards = tableState?.dealer.cards ?? [];
    return cards.some(
      (c) => !("hidden" in c && c.hidden) && "rank" in c && c.rank === "A"
    );
  }, [tableState]);

  const activeSeatName = useMemo(() => {
    if (tableState?.activeSeatIndex == null) return null;
    const s = tableState.seats[tableState.activeSeatIndex];
    if (!s?.userId) return null;
    if (user && s.userId === user.id) return "You";
    return s.name ?? `Seat ${s.index + 1}`;
  }, [tableState, user]);

  const splitHandCount = mySeat && mySeat.hands.length > 1 ? mySeat.hands.length : 0;
  const activeHandOrdinal =
    isMyTurn && tableState?.activeHandIndex != null
      ? tableState.activeHandIndex + 1
      : null;

  const showInsurance =
    seated &&
    phase === "insurance" &&
    dealerHasAce &&
    !insuranceDecided &&
    (mySeat?.insuranceCents ?? 0) === 0;

  const statusLine = useMemo(() => {
    if (phase === "playerTurns") {
      if (isHolding) {
        return splitHandCount > 0
          ? "Holding — next hand soon"
          : "Holding — next seat soon";
      }
      if (isMyTurn && splitHandCount > 0 && activeHandOrdinal != null) {
        return `Hand ${activeHandOrdinal} of ${splitHandCount} — act now`;
      }
      if (isMyTurn) return "Your turn — act now";
      if (activeSeatName) {
        const ai = tableState?.activeSeatIndex;
        const hi = tableState?.activeHandIndex;
        const theirHands =
          ai != null ? tableState?.seats[ai]?.hands.length ?? 0 : 0;
        if (theirHands > 1 && hi != null) {
          return `${activeSeatName} — hand ${hi + 1} of ${theirHands}`;
        }
        return `${activeSeatName} is acting`;
      }
      return "Waiting for players";
    }
    if (phase === "dealer") return "Dealer is playing";
    if (phase === "dealing") return "Cards dealing…";
    if (phase === "settle") return "Round complete";
    if (phase === "betting") return "Betting open";
    if (phase === "insurance") {
      return showInsurance
        ? "Insurance — Take or decline"
        : "Insurance — waiting on players";
    }
    return PHASE_LABEL[phase];
  }, [
    phase,
    isMyTurn,
    isHolding,
    activeSeatName,
    splitHandCount,
    activeHandOrdinal,
    tableState,
    showInsurance,
  ]);

  const showBet = seated && phase === "betting";
  const showActions = canAct;
  const phaseBanner = useMemo(
    () =>
      getPhaseBannerCopy({
        phase,
        isYourTurn: isMyTurn && !isHolding,
        isHolding,
        needsInsurance: showInsurance,
      }),
    [phase, isMyTurn, isHolding, showInsurance]
  );
  const actionHand = canAct ? myActiveHand : queueHand;
  const canDouble = useMemo(() => {
    if (!actionHand || actionHand.cards.length !== 2) return false;
    return balanceCents >= actionHand.betCents;
  }, [actionHand, balanceCents]);
  const canSplit = useMemo(() => {
    if (!actionHand || !mySeat) return false;
    if (mySeat.hands.length >= 4) return false;
    if (actionHand.cards.length !== 2) return false;
    const [a, b] = actionHand.cards;
    if (!a || !b || "hidden" in a || "hidden" in b) return false;
    if (!("rank" in a) || !("rank" in b) || a.rank !== b.rank) return false;
    // Match server: no re-split aces
    if (a.rank === "A" && mySeat.hands.length > 1) return false;
    return balanceCents >= actionHand.betCents;
  }, [actionHand, mySeat, balanceCents]);

  const amFirstToAct = useMemo(() => {
    if (!mySeat?.hands.length) return false;
    for (const seat of tableState?.seats ?? []) {
      if (!seat.hands.length) continue;
      const playable = seat.hands.some(
        (h) => !h.stood && !h.value.bust && !h.isBlackjack
      );
      if (!playable) continue;
      return seat.index === mySeat.index;
    }
    return false;
  }, [tableState?.seats, mySeat]);

  const showPreActions =
    seated &&
    !canAct &&
    !showBet &&
    !showInsurance &&
    !isHolding &&
    !!queueHand &&
    queueHand.cards.length >= 2 &&
    (phase === "dealing" || phase === "insurance" || phase === "playerTurns") &&
    !(amFirstToAct && (phase === "dealing" || phase === "insurance"));

  useEffect(() => {
    if (phase === "betting" || phase === "settle" || !seated) {
      setQueuedAction(null);
      firedQueueRef.current = false;
    }
  }, [phase, seated]);

  useEffect(() => {
    if (amFirstToAct && (phase === "dealing" || phase === "insurance")) {
      setQueuedAction(null);
    }
  }, [amFirstToAct, phase]);

  useEffect(() => {
    if (!queuedAction) return;
    if (queuedAction === "double" && !canDouble) setQueuedAction(null);
    if (queuedAction === "split" && !canSplit) setQueuedAction(null);
  }, [queuedAction, canDouble, canSplit]);

  useEffect(() => {
    if (!canAct) {
      firedQueueRef.current = false;
      return;
    }
    if (firedQueueRef.current) return;
    const action = queuedRef.current;
    if (!action) return;
    if (action === "double" && !canDouble) {
      setQueuedAction(null);
      return;
    }
    if (action === "split" && !canSplit) {
      setQueuedAction(null);
      return;
    }
    firedQueueRef.current = true;
    setQueuedAction(null);
    if (action === "hit") hit();
    else if (action === "stand") stand();
    else if (action === "double") double();
    else if (action === "split") split();
  }, [canAct, canDouble, canSplit, hit, stand, double, split]);

  const onQueue = useCallback((action: QueuedAction) => {
    setQueuedAction((prev) => (prev === action ? null : action));
  }, []);

  const emptySeatIndexes = useMemo(
    () =>
      (tableState?.seats ?? EMPTY_SEATS)
        .filter((s) => !s.userId)
        .map((s) => s.index),
    [tableState]
  );

  const onTakeInsuranceKb = useCallback(() => {
    setInsuranceDecided(true);
    takeInsurance();
  }, [takeInsurance]);

  const onDeclineInsuranceKb = useCallback(() => {
    setInsuranceDecided(true);
    declineInsurance();
  }, [declineInsurance]);

  const onSitKb = useCallback(
    (seatIndex: number) => {
      if (balanceCents <= 0) {
        toast.error("Need chips to sit — claim from the lobby");
        return;
      }
      takeSeat(seatIndex);
    },
    [balanceCents, takeSeat, toast]
  );

  const onAddBetKb = useCallback(
    (cents: number) => {
      const pending = mySeat?.pendingBetCents ?? 0;
      const remaining = balanceCents - pending;
      if (remaining <= 0) {
        toast.error("Insufficient funds");
        return;
      }
      if (pending === 0 && Math.min(cents, remaining) < 500) {
        toast.error("Minimum bet is $5");
        return;
      }
      addBet(cents);
    },
    [mySeat?.pendingBetCents, balanceCents, addBet, toast]
  );

  useTableKeyboard({
    enabled: connected,
    showBet,
    showInsurance,
    showActions,
    showPreActions,
    canDouble,
    canSplit,
    canSit: !seated,
    emptySeatIndexes,
    onHit: hit,
    onStand: stand,
    onDouble: double,
    onSplit: split,
    onQueue,
    onTakeInsurance: onTakeInsuranceKb,
    onDeclineInsurance: onDeclineInsuranceKb,
    onAddBet: onAddBetKb,
    onClearBet: () => {
      if ((mySeat?.pendingBetCents ?? 0) <= 0) return;
      clearBet();
    },
    onReuseBet: () => {
      const last = mySeat?.lastBetCents ?? 0;
      if (last < MIN_BET_CENTS || last > balanceCents) return;
      reuseBet();
    },
    onSit: onSitKb,
  });

  const shortcutHint = useMemo(() => {
    const z = "Z History";
    if (showActions || showPreActions) {
      const parts = ["Q Hit", "W Hold", "E Double"];
      if (canSplit) parts.push("R Split");
      const suffix = showPreActions ? " (queue)" : "";
      return `${parts.join(" · ")}${suffix} · ${z}`;
    }
    if (showInsurance) return `Y / T Take · N Decline · ${z}`;
    if (showBet) return `Q-E chips · C Clear · D Reuse · ${z}`;
    if (!seated) return `1–7 Sit · ${z}`;
    return z;
  }, [showActions, showPreActions, showInsurance, showBet, seated, canSplit]);

  if (!tableId) {
    return <p className="muted">Missing table id.</p>;
  }

  return (
    <motion.div
      className="table-page"
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="table-toolbar">
        <div className="table-toolbar-top">
          <h1 className="page-title table-title">{tableState?.name ?? "Table"}</h1>
          <div className="table-toolbar-actions">
            {tableState != null && (
              <span className="table-spectators" title="Spectators">
                <svg
                  className="table-spectators-icon"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  aria-hidden
                >
                  <path
                    fill="currentColor"
                    d="M12 5c-5.5 0-9.5 5.2-10.7 6.7a1 1 0 0 0 0 1.2C2.5 14.3 6.5 19 12 19s9.5-4.7 10.7-6.1a1 1 0 0 0 0-1.2C21.5 10.2 17.5 5 12 5Zm0 12c-3.9 0-7.1-3.2-8.5-5 1.4-1.8 4.6-5 8.5-5s7.1 3.2 8.5 5c-1.4 1.8-4.6 5-8.5 5Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
                  />
                </svg>
                {tableState.spectatorCount}
              </span>
            )}
            <button
              type="button"
              className={`btn btn-sm btn-ghost${historyOpen ? " is-active" : ""}`}
              onClick={() => setHistoryOpen((v) => !v)}
              title="Round history (Z)"
            >
              History <kbd className="kbd">Z</kbd>
            </button>
            {seated && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={leaveSeat}
              >
                Leave seat
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={goLobby}
            >
              Lobby
            </button>
          </div>
        </div>
        <p className="page-sub table-sub">
          <AnimatePresence mode="wait">
            <motion.span
              key={statusLine}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {statusLine}
            </motion.span>
          </AnimatePresence>
          {remainingMs != null && (
            <span className={timerUrgent ? "timer-urgent" : ""}>
              {" "}
              · {formatCountdown(remainingMs)}
            </span>
          )}
          {!connected && <> · reconnecting…</>}
        </p>
        <div className="phase-timer-slot phase-timer-desktop" aria-hidden>
          <div
            className={`phase-timer-track${timerProgress == null ? " is-empty" : ""}`}
          >
            {timerProgress != null && (
              <motion.div
                className={`phase-timer-fill${timerUrgent ? " is-urgent" : ""}`}
                animate={{ scaleX: timerProgress }}
                transition={{ duration: 0.2, ease: "linear" }}
                style={{ transformOrigin: "left center" }}
              />
            )}
          </div>
        </div>
      </div>

      <PhaseBanner
        phase={phase}
        isYourTurn={isMyTurn && !isHolding}
        isHolding={isHolding}
        needsInsurance={showInsurance}
      />

      {!seated && (
        <div className="spectator-banner">
          Spectating — sit at an empty seat to play.
        </div>
      )}

      <motion.div
        className={[
          "felt",
          phase === "dealer" ? "felt-dealer" : "",
          phase === "dealing" ? "felt-dealing" : "",
          phase === "insurance" ? "felt-insurance" : "",
          phase === "settle" ? "felt-settle" : "",
          isMyTurn ? "felt-your-turn" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        initial={false}
        animate={
          feltHeight != null ? { height: feltHeight } : undefined
        }
        transition={{
          height: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
        }}
      >
        <div ref={feltMeasureRef} className="felt-measure">
          <div
            className={[
              "dealer-zone",
              phase === "dealer" || phase === "dealing" ? "dealer-zone-live" : "",
              phase === "insurance" ? "dealer-zone-insurance" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="zone-label">
              Dealer
              <span
                className={[
                  "zone-live-tag",
                  phase === "insurance" ? "zone-insurance-tag" : "",
                  phase !== "insurance" &&
                  phase !== "dealer" &&
                  phase !== "dealing"
                    ? "is-hidden"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden={
                  phase !== "insurance" &&
                  phase !== "dealer" &&
                  phase !== "dealing"
                }
              >
                {phase === "insurance"
                  ? "Ace up"
                  : phase === "dealing"
                    ? "dealing"
                    : "playing"}
              </span>
            </div>
            <div className="card-row">
              {(tableState?.dealer.cards ?? []).map((c, i) => (
                <PlayingCard
                  key={`${i}-${"rank" in c ? `${c.rank}${c.suit}` : "h"}`}
                  card={c}
                  index={i}
                />
              ))}
            </div>
            <HandValueBadge value={tableState?.dealer.value} />
          </div>

          <LayoutGroup id="seats-arc">
            <div className="seats-arc">
              {(tableState?.seats ?? EMPTY_SEATS).map((seat) => {
                const seatIsYou = !!user && seat.userId === user.id;
                const seatIsActive = tableState?.activeSeatIndex === seat.index;
                const showWaitTimer =
                  phase === "playerTurns" &&
                  seatIsActive &&
                  !seatIsYou &&
                  timerProgress != null;
                return (
                  <SeatView
                    key={seat.index}
                    seat={seat}
                    isYou={seatIsYou}
                    isActive={seatIsActive}
                    activeHandIndex={
                      seatIsActive ? tableState.activeHandIndex : null
                    }
                    settle={phase === "settle"}
                    waitTimerProgress={showWaitTimer ? timerProgress : null}
                    waitTimerUrgent={showWaitTimer && timerUrgent}
                    canSit={balanceCents > 0}
                    onSit={() => {
                      if (balanceCents <= 0) {
                        toast.error("Need chips to sit — claim from the lobby");
                        return;
                      }
                      takeSeat(seat.index);
                    }}
                  />
                );
              })}
            </div>
          </LayoutGroup>
        </div>
      </motion.div>

      <ActionBar
        phase={statusLine}
        bannerTitle={phaseBanner.title}
        bannerHint={phaseBanner.hint}
        showBet={showBet}
        showInsurance={showInsurance}
        showActions={showActions}
        showPreActions={showPreActions}
        queuedAction={queuedAction}
        canDouble={canDouble}
        canSplit={canSplit}
        holding={isHolding}
        handBusted={
          isMyTurn && !!myActiveHand?.value.bust
        }
        timerProgress={timerProgress}
        timerUrgent={timerUrgent}
        onHit={hit}
        onStand={stand}
        onDouble={double}
        onSplit={split}
        onQueue={onQueue}
        onTakeInsurance={() => {
          setInsuranceDecided(true);
          takeInsurance();
        }}
        onDeclineInsurance={() => {
          setInsuranceDecided(true);
          declineInsurance();
        }}
        chipTray={
          mySeat ? (
            <ChipTray
              pendingBetCents={mySeat.pendingBetCents}
              balanceCents={balanceCents}
              lastBetCents={mySeat.lastBetCents}
              onAdd={addBet}
              onClear={clearBet}
              onReuse={reuseBet}
            />
          ) : null
        }
      />

      {shortcutHint && (
        <p className="kbd-hints desktop-only" aria-hidden>
          {shortcutHint}
        </p>
      )}

      <RoundHistoryDrawer
        open={historyOpen}
        entries={roundHistory}
        onClose={() => setHistoryOpen(false)}
      />
    </motion.div>
  );
}
