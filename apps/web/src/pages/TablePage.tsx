import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { PublicSeat, TablePhase, TableSpinState, TableStraightBonusEvent } from "@neon21/shared";
import { JACKPOT_CELEBRATE_MS, MIN_BET_CENTS, SEAT_CAPACITY, handValueLabel } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { useGameSocket } from "../lib/SocketProvider";
import { onEvent } from "../lib/socket";
import { api } from "../lib/api";
import { useTableKeyboard } from "../lib/useTableKeyboard";
import { useCashFx } from "../lib/cashFx";
import { formatCents, formatCountdown } from "../lib/format";
import { useAutoHeight } from "../lib/useAutoHeight";
import { PlayingCard } from "../components/table/PlayingCard";
import { HandValueBadge } from "../components/table/HandValueBadge";
import { SeatView } from "../components/table/SeatView";
import { ChipTray } from "../components/table/ChipTray";
import { ActionBar, type QueuedAction } from "../components/table/ActionBar";
import { PhaseBanner } from "../components/table/PhaseBanner";
import { TableChat } from "../components/table/TableChat";
import { TableDebugPanel } from "../components/table/TableDebugPanel";
import { getPhaseBannerCopy } from "../components/table/phaseCopy";
import {
  RoundHistoryDrawer,
  toHistoryCards,
  type RoundHistoryEntry,
} from "../components/table/RoundHistoryDrawer";
import { loadRoundHistory, saveRoundHistory } from "../lib/roundHistory";
import { useToast } from "../lib/toast";
import { scheduleScrollSeatIntoClearView } from "../lib/scrollSeatIntoClearView";
import {
  HowToPlayModal,
  type HowToPlayTab,
} from "../components/HowToPlayModal";
import { JackpotWinFx } from "../components/table/JackpotWinFx";

const HISTORY_MAX = 24;
const JACKPOT_WIN_FX_MS = JACKPOT_CELEBRATE_MS;
const SHOW_TABLE_DEBUG =
  import.meta.env.VITE_STAGING === "true" || import.meta.env.DEV;

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
  insuranceResolved: false,
  connected: false,
}));

export function TablePage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user, wallet, token } = useAuth();
  const toast = useToast();
  const {
    connected,
    tableState,
    socket,
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
    chatMessages,
    sendChat,
    subscribeJackpot,
    unsubscribeJackpot,
    goldenHour,
    goldenHourRebate,
  } = useGameSocket();
  const { playWin, playSpend, playPush } = useCashFx();
  const { ref: feltMeasureRef, height: feltHeight } = useAutoHeight<HTMLDivElement>();
  const balanceCents = wallet?.balanceCents ?? user?.balanceCents ?? 0;
  const [jackpotTakeCents, setJackpotTakeCents] = useState(0);
  const jackpotTakeRef = useRef(0);
  const [potBump, setPotBump] = useState<{ id: number; cents: number } | null>(
    null
  );
  const potBumpId = useRef(0);
  const [rebateBump, setRebateBump] = useState(false);
  const prevRebateCents = useRef<number | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [howtoOpen, setHowtoOpen] = useState(false);
  const [howtoTab, setHowtoTab] = useState<HowToPlayTab>("basics");
  const [straightFxBySeat, setStraightFxBySeat] = useState<
    Record<number, TableStraightBonusEvent>
  >({});
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>(() =>
    tableId ? loadRoundHistory(tableId) : []
  );
  const [jackpotFxUntil, setJackpotFxUntil] = useState<number | null>(null);
  const celebratedSettle = useRef(false);
  const celebratedSpin = useRef<string | null>(null);
  const spentBetRound = useRef(false);
  const spentInsuranceRound = useRef(false);
  const loggedSettle = useRef(false);
  const celebrateTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!tableId) return;
    joinTable(tableId);
    return () => {
      leaveTable({ hard: false });
    };
  }, [tableId, joinTable, leaveTable]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.jackpot(token);
        if (cancelled) return;
        jackpotTakeRef.current = res.takeCents;
        setJackpotTakeCents(res.takeCents);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    subscribeJackpot();
    return () => unsubscribeJackpot();
  }, [subscribeJackpot, unsubscribeJackpot]);

  useEffect(() => {
    if (!socket) return;
    const off = onEvent(socket, "table:straight_bonus", (ev) => {
      if (tableId && ev.tableId !== tableId) return;
      setStraightFxBySeat((prev) => ({ ...prev, [ev.seatIndex]: ev }));
      const ms = Math.max(0, ev.until - Date.now()) + 50;
      window.setTimeout(() => {
        setStraightFxBySeat((prev) => {
          const cur = prev[ev.seatIndex];
          if (!cur || cur.until !== ev.until) return prev;
          const next = { ...prev };
          delete next[ev.seatIndex];
          return next;
        });
      }, ms);
    });
    return off;
  }, [socket, tableId]);

  useEffect(() => {
    if (!socket) return;
    const offDelta = onEvent(socket, "jackpot:delta", ({ deltaCents }) => {
      if (deltaCents === 0) return;
      const next = Math.max(0, jackpotTakeRef.current + deltaCents);
      jackpotTakeRef.current = next;
      setJackpotTakeCents(next);
      if (deltaCents > 0) {
        potBumpId.current += 1;
        setPotBump({ id: potBumpId.current, cents: deltaCents });
      }
    });
    const offClaim = onEvent(socket, "jackpot:claim", (claim) => {
      const next = Math.max(0, jackpotTakeRef.current - claim.payoutCents);
      jackpotTakeRef.current = next;
      setJackpotTakeCents(next);
    });
    return () => {
      offDelta();
      offClaim();
    };
  }, [socket]);

  useEffect(() => {
    if (!potBump) return;
    const t = window.setTimeout(() => setPotBump(null), 1400);
    return () => window.clearTimeout(t);
  }, [potBump]);

  useEffect(() => {
    const next = goldenHourRebate?.rebateCents ?? null;
    if (!goldenHour?.active) {
      prevRebateCents.current = null;
      setRebateBump(false);
      return;
    }
    const prev = prevRebateCents.current;
    prevRebateCents.current = next ?? 0;
    if (prev == null || next == null || next <= prev) return;
    setRebateBump(true);
    const t = window.setTimeout(() => setRebateBump(false), 1400);
    return () => window.clearTimeout(t);
  }, [goldenHour?.active, goldenHourRebate?.rebateCents]);

  useEffect(() => {
    if (!tableId) return;
    setRoundHistory(loadRoundHistory(tableId));
    setHistoryOpen(false);
  }, [tableId]);

  useEffect(() => {
    if (!tableId) return;
    saveRoundHistory(tableId, roundHistory);
  }, [tableId, roundHistory]);

  const mySeat = useMemo(() => {
    if (!tableState || !user) return null;
    return tableState.seats.find((s) => s.userId === user.id) ?? null;
  }, [tableState, user]);

  function goLobby() {
    const liveHand = (mySeat?.hands.length ?? 0) > 0;
    if (liveHand) {
      leaveTable({ hard: false });
      toast.info("Hand in progress — seat held until the round ends");
    } else {
      leaveTable({ hard: true });
    }
    navigate("/lobby");
  }

  const endsAt = tableState?.phaseEndsAt ?? null;
  const phase: TablePhase = tableState?.phase ?? "betting";

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
      const dealerCards = toHistoryCards(dealer?.cards ?? []);
      const dealerBj =
        dealerCards.length === 2 &&
        (dealer?.value?.soft === 21 || dealer?.value?.hard === 21);
      const insuranceCents = mySeat.insuranceCents;
      // Insurance stake already left the wallet; win pays 2:1 profit (+2×).
      const insuranceNetCents =
        insuranceCents > 0 ? (dealerBj ? insuranceCents * 2 : -insuranceCents) : 0;
      const handNet = hands.reduce((s, h) => s + h.resultCents, 0);
      const entry: RoundHistoryEntry = {
        id: `${Date.now()}-${hands.map((h) => h.resultCents).join(",")}`,
        at: Date.now(),
        netCents: handNet + insuranceNetCents,
        betCents: hands.reduce((s, h) => s + h.betCents, 0),
        insuranceCents: insuranceCents > 0 ? insuranceCents : undefined,
        insuranceNetCents: insuranceCents > 0 ? insuranceNetCents : undefined,
        hands,
        dealerCards,
        dealerValueLabel: dealer?.value
          ? dealer.value.label || handValueLabel(dealer.value)
          : "—",
      };
      setRoundHistory((prev) => [entry, ...prev].slice(0, HISTORY_MAX));
    }

    if (celebratedSettle.current) return;
    const dealer = tableState?.dealer;
    const dealerCards = toHistoryCards(dealer?.cards ?? []);
    const dealerBj =
      dealerCards.length === 2 &&
      (dealer?.value?.soft === 21 || dealer?.value?.hard === 21);
    const insuranceCents = mySeat.insuranceCents;
    const insuranceNetCents =
      insuranceCents > 0 ? (dealerBj ? insuranceCents * 2 : -insuranceCents) : 0;
    const net =
      mySeat.hands.reduce((sum, h) => sum + (h.resultCents ?? 0), 0) +
      insuranceNetCents;
    if (net < 0) return;

    celebratedSettle.current = true;
    const from = document.querySelector(".seat-you") as HTMLElement | null;

    if (net === 0) {
      // Stake returned — soft yellow wallet flash (no win confetti).
      celebrateTimer.current = window.setTimeout(() => {
        celebrateTimer.current = null;
        playPush();
      }, 1000);
      return;
    }

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
  }, [phase, mySeat, playWin, playPush, tableState?.dealer]);

  const spin = tableState?.spin ?? null;

  useEffect(() => {
    const until = tableState?.jackpotCelebrateUntil;
    if (until == null || until <= Date.now()) return;
    setJackpotFxUntil((prev) =>
      prev != null && prev >= until ? prev : until
    );
  }, [tableState?.jackpotCelebrateUntil]);

  const onSpinReveal = useCallback(
    (s: TableSpinState) => {
      const isJackpot =
        s.tileIndex === 0 ||
        (s.kind === "percent" && s.pctBps === 10_000);
      if (isJackpot) {
        setJackpotFxUntil(Date.now() + JACKPOT_WIN_FX_MS);
      }

      if (s.userId !== user?.id) return;
      const key = `${s.tileIndex}-${s.payoutCents}-${s.potBeforeCents}`;
      if (celebratedSpin.current === key) return;
      celebratedSpin.current = key;
      if ((s.payoutCents ?? 0) <= 0) return;
      const from = document.querySelector(".seat-you") as HTMLElement | null;
      playWin(s.payoutCents!, { kind: "blackjack", fromEl: from });
    },
    [user?.id, playWin]
  );

  useEffect(() => {
    if (!spin) celebratedSpin.current = null;
  }, [spin]);

  useEffect(() => {
    if (jackpotFxUntil == null) return;
    const ms = jackpotFxUntil - Date.now();
    if (ms <= 0) {
      setJackpotFxUntil(null);
      return;
    }
    const t = window.setTimeout(() => setJackpotFxUntil(null), ms);
    return () => window.clearTimeout(t);
  }, [jackpotFxUntil]);

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
  const hasSeatedPlayers = useMemo(
    () => (tableState?.seats ?? []).some((s) => s.userId != null),
    [tableState]
  );

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

  const prevActiveSeat = useRef<number | null>(null);
  const prevMySeatIndex = useRef<number | null>(null);
  const prevPhase = useRef<string | null>(null);

  const focusSeatIndex = useMemo(() => {
    if (phase === "playerTurns" && tableState?.activeSeatIndex != null) {
      return tableState.activeSeatIndex;
    }
    if (
      mySeat &&
      (phase === "betting" || phase === "insurance" || phase === "settle")
    ) {
      return mySeat.index;
    }
    return mySeat?.index ?? null;
  }, [phase, tableState?.activeSeatIndex, mySeat]);

  useEffect(() => {
    const active = tableState?.activeSeatIndex ?? null;
    const mine = mySeat?.index ?? null;
    const phaseChanged = phase !== prevPhase.current;
    let target: number | null = null;

    if (
      phase === "playerTurns" &&
      active != null &&
      (active !== prevActiveSeat.current || phaseChanged)
    ) {
      target = active;
    } else if (
      mine != null &&
      (phase === "betting" || phase === "insurance") &&
      (mine !== prevMySeatIndex.current ||
        phaseChanged ||
        prevMySeatIndex.current == null)
    ) {
      target = mine;
    } else if (mine != null && prevMySeatIndex.current == null) {
      target = mine;
    }

    prevActiveSeat.current = active;
    prevMySeatIndex.current = mine;
    prevPhase.current = phase;

    if (target == null) return;
    const seatIndex = target;
    const timeout = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-seat-index="${seatIndex}"]`
      );
      if (el) scheduleScrollSeatIntoClearView(el);
    }, 60);
    return () => window.clearTimeout(timeout);
  }, [phase, tableState?.activeSeatIndex, mySeat?.index]);

  useEffect(() => {
    const onDrawer = () => {
      if (focusSeatIndex == null) return;
      const el = document.querySelector<HTMLElement>(
        `[data-seat-index="${focusSeatIndex}"]`
      );
      if (el) scheduleScrollSeatIntoClearView(el);
    };
    window.addEventListener("neon21:action-drawer", onDrawer);
    return () => window.removeEventListener("neon21:action-drawer", onDrawer);
  }, [focusSeatIndex]);

  useEffect(() => {
    if (focusSeatIndex == null) return;
    const el = document.querySelector<HTMLElement>(
      `[data-seat-index="${focusSeatIndex}"]`
    );
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastH = el.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (Math.abs(h - lastH) < 4) return;
      lastH = h;
      scheduleScrollSeatIntoClearView(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [focusSeatIndex]);

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
    const goldenActive =
      goldenHour?.active === true && goldenHour.activeUntil != null;
    const goldenNext =
      goldenHour != null &&
      !goldenHour.disabled &&
      !goldenHour.active &&
      goldenHour.nextStartsAt != null;
    if (
      endsAt == null &&
      pauseEndsAt == null &&
      !goldenActive &&
      !goldenNext
    ) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [
    endsAt,
    pauseEndsAt,
    goldenHour?.active,
    goldenHour?.activeUntil,
    goldenHour?.disabled,
    goldenHour?.nextStartsAt,
  ]);

  const [turnBudgetMs, setTurnBudgetMs] = useState(25_000);
  const [betBudgetMs, setBetBudgetMs] = useState(40_000);
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
      setBetBudgetMs(40_000);
      return;
    }
    const rem = endsAt - Date.now();
    // Short clamp once everyone has bet is 5s; open betting is 40s
    setBetBudgetMs(rem <= 5_500 ? 5_000 : 40_000);
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

  const insuranceCostCents = useMemo(() => {
    if (!mySeat?.hands[0]) return 0;
    return Math.floor(mySeat.hands[0].betCents / 2);
  }, [mySeat]);

  const canAffordInsurance =
    insuranceCostCents > 0 && balanceCents >= insuranceCostCents;

  const showInsurance =
    seated &&
    phase === "insurance" &&
    dealerHasAce &&
    (mySeat?.hands.length ?? 0) > 0 &&
    !mySeat?.insuranceResolved;

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
      if (isMyTurn && queuedAction) {
        const label =
          queuedAction === "hit"
            ? "Hit"
            : queuedAction === "stand"
              ? "Hold"
              : queuedAction === "double"
                ? "Double"
                : "Split";
        return `Playing queued ${label}…`;
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
    if (phase === "betting") {
      return hasSeatedPlayers ? "Betting open" : "Waiting for players";
    }
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
    hasSeatedPlayers,
    queuedAction,
  ]);

  const showBet = seated && phase === "betting";
  const showActions = canAct;
  const phaseBanner = useMemo(
    () =>
      getPhaseBannerCopy({
        phase,
        isYourTurn: isMyTurn && !isHolding && !queuedAction,
        isHolding,
        needsInsurance: showInsurance,
        hasSeatedPlayers,
      }),
    [phase, isMyTurn, isHolding, showInsurance, hasSeatedPlayers, queuedAction]
  );
  const actionHand = canAct ? myActiveHand : queueHand;
  const canDouble = useMemo(() => {
    if (!actionHand || actionHand.cards.length !== 2) return false;
    return balanceCents >= actionHand.betCents;
  }, [actionHand, balanceCents]);
  const canSplit = useMemo(() => {
    if (!actionHand || !mySeat) return false;
    if (actionHand.cards.length !== 2) return false;
    const [a, b] = actionHand.cards;
    if (!a || !b || "hidden" in a || "hidden" in b) return false;
    if (!("rank" in a) || !("rank" in b) || a.rank !== b.rank) return false;
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
    if (!canAffordInsurance) {
      toast.error(
        `Need ${formatCents(insuranceCostCents)} in chips for insurance`
      );
      return;
    }
    takeInsurance();
  }, [canAffordInsurance, insuranceCostCents, takeInsurance, toast]);

  const onDeclineInsuranceKb = useCallback(() => {
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

  const onRemoveBetKb = useCallback(
    (cents: number) => {
      if ((mySeat?.pendingBetCents ?? 0) <= 0) return;
      removeBet(cents);
    },
    [mySeat?.pendingBetCents, removeBet]
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
    balanceCents,
    pendingBetCents: mySeat?.pendingBetCents ?? 0,
    onHit: hit,
    onStand: stand,
    onDouble: double,
    onSplit: split,
    onQueue,
    onTakeInsurance: onTakeInsuranceKb,
    onDeclineInsurance: onDeclineInsuranceKb,
    onAddBet: onAddBetKb,
    onRemoveBet: onRemoveBetKb,
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
    const z = "Z History · / Chat";
    if (showActions || showPreActions) {
      const parts = ["Q Hit", "W Hold", "E Double"];
      if (canSplit) parts.push("R Split");
      const suffix = showPreActions ? " (queue)" : "";
      return `${parts.join(" · ")}${suffix} · ${z}`;
    }
    if (showInsurance) return `Y / T Take · N Decline · ${z}`;
    if (showBet) return `Q–O chips · A All-in · C Clear · D Reuse · ${z}`;
    if (!seated) return `1–7 Sit · ${z}`;
    return z;
  }, [showActions, showPreActions, showInsurance, showBet, seated, canSplit]);

  if (!tableId) {
    return <p className="muted">Missing table id.</p>;
  }

  const jackpotFxLive = jackpotFxUntil != null;

  return (
    <motion.div
      className={`table-page${spin ? " is-spin-spotlight" : ""}${spin?.phase === "result" ? " is-spin-active" : ""}${jackpotFxLive ? " is-jackpot-win" : ""}`}
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <JackpotWinFx until={jackpotFxUntil} />
      <div className="table-toolbar">
        <div className="table-toolbar-top">
          <h1 className="page-title table-title">{tableState?.name ?? "Table"}</h1>
          <div className="table-toolbar-actions">
            {goldenHour?.active && goldenHour.activeUntil != null && (
              <button
                type="button"
                className="table-golden-hour"
                title="Golden Hour — jackpot grows faster, rebates & hand bonuses live"
                onClick={() => {
                  setHowtoTab("heist");
                  setHowtoOpen(true);
                }}
              >
                <span className="table-golden-hour-label">Golden</span>
                <span className="table-golden-hour-time">
                  {formatCountdown(
                    Math.max(0, goldenHour.activeUntil - now)
                  )}
                </span>
              </button>
            )}
            {goldenHour &&
              !goldenHour.disabled &&
              !goldenHour.active &&
              goldenHour.nextStartsAt != null && (
                <button
                  type="button"
                  className="table-golden-hour table-golden-hour-next"
                  title="Next Golden Hour heist — how it works"
                  onClick={() => {
                    setHowtoTab("heist");
                    setHowtoOpen(true);
                  }}
                >
                  <span className="table-golden-hour-label">Heist</span>
                  <span className="table-golden-hour-time">
                    {formatCountdown(
                      Math.max(0, goldenHour.nextStartsAt - now)
                    )}
                  </span>
                </button>
              )}
            {goldenHour?.active && (
              <span
                className={`table-golden-rebate${
                  rebateBump ? " is-bump" : ""
                }`}
                title="Projected loss rebate at end of Golden Hour (10% of losses, wins don't reduce it)"
              >
                <span className="table-golden-rebate-label">Rebate</span>
                <span className="table-golden-rebate-value">
                  {formatCents(goldenHourRebate?.rebateCents ?? 0)}
                  <span className="table-golden-rebate-cap">
                    {" "}
                    /{" "}
                    {formatCents(
                      goldenHourRebate?.capCents ?? 500_000
                    )}
                  </span>
                </span>
              </span>
            )}
            <Link
              to="/jackpot"
              className={`table-pot${potBump ? " is-bump" : ""}${
                potBump && goldenHour?.active ? " is-heist" : ""
              }`}
              title="House jackpot"
            >
              <span className="table-pot-label">Pot</span>
              <span className="table-pot-value">
                {formatCents(jackpotTakeCents)}
              </span>
              {potBump && (
                <span
                  key={potBump.id}
                  className="table-pot-delta"
                  onAnimationEnd={() => setPotBump(null)}
                >
                  +{formatCents(potBump.cents)}
                </span>
              )}
            </Link>
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
                <span className="table-spectators-count">
                  {tableState.spectatorCount}
                </span>
              </span>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost table-howto-btn"
              onClick={() => {
                setHowtoTab("basics");
                setHowtoOpen(true);
              }}
              title="How to play"
              aria-label="How to play"
            >
              ?
            </button>
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
                <span className="table-action-full">Leave seat</span>
                <span className="table-action-short">Leave</span>
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
        isYourTurn={isMyTurn && !isHolding && !queuedAction}
        isHolding={isHolding}
        needsInsurance={showInsurance}
        hasSeatedPlayers={hasSeatedPlayers}
      />

      {!seated && (
        <div className="spectator-banner">
          Spectating — sit at an empty seat to play.
        </div>
      )}

      <motion.div
        className={[
          "felt",
          spin ? "felt-spin" : "",
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
              {(phase === "insurance" ||
                phase === "dealer" ||
                phase === "dealing") && (
                <span
                  className={[
                    "zone-live-tag",
                    phase === "insurance" ? "zone-insurance-tag" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {phase === "insurance"
                    ? "Ace up"
                    : phase === "dealing"
                      ? "dealing"
                      : "playing"}
                </span>
              )}
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
                    showSpinCta={
                      seatIsYou &&
                      phase === "betting" &&
                      !spin &&
                      seat.pendingBetCents <= 0 &&
                      (seat.spinVouchers ?? 0) > 0
                    }
                    spinCtaDisabled={jackpotTakeCents <= 0}
                    spin={
                      spin && spin.seatIndex === seat.index ? spin : null
                    }
                    straightFx={straightFxBySeat[seat.index] ?? null}
                    onClaimSpin={claimSpin}
                    onSpinGo={goSpin}
                    onSpinCancel={cancelSpin}
                    onSpinDone={spinDone}
                    onSpinReveal={onSpinReveal}
                    showGoldenHourProgress={goldenHour?.active === true}
                    goldenHandsPerHands={
                      goldenHour?.goldenHandsPerHands ?? undefined
                    }
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
        onTakeInsurance={onTakeInsuranceKb}
        onDeclineInsurance={onDeclineInsuranceKb}
        insuranceCostCents={insuranceCostCents}
        canAffordInsurance={canAffordInsurance}
        chipTray={
          mySeat ? (
            <ChipTray
              pendingBetCents={mySeat.pendingBetCents}
              balanceCents={balanceCents}
              lastBetCents={mySeat.lastBetCents}
              onAdd={addBet}
              onRemove={removeBet}
              onClear={clearBet}
              onReuse={reuseBet}
              goldenHands={mySeat.goldenHands ?? 0}
              goldenHandArmed={mySeat.goldenHandActive === true}
              goldenHourHandsToward={mySeat.goldenHourHandsToward ?? 0}
              goldenHandsPerHands={
                goldenHour?.goldenHandsPerHands ?? undefined
              }
              showGoldenHourProgress={goldenHour?.active === true}
              onToggleGoldenHand={toggleGoldenHand}
            />
          ) : null
        }
      />

      <TableChat
        messages={chatMessages}
        selfUserId={user?.id ?? null}
        onSend={sendChat}
      />

      {SHOW_TABLE_DEBUG ? <TableDebugPanel /> : null}

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

      <HowToPlayModal
        open={howtoOpen}
        initialTab={howtoTab}
        onClose={() => setHowtoOpen(false)}
      />
    </motion.div>
  );
}
