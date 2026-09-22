import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type QueuedAction = "hit" | "stand" | "double" | "split";

type Props = {
  phase: string;
  bannerTitle?: string;
  bannerHint?: string;
  showBet: boolean;
  showInsurance: boolean;
  showActions: boolean;
  showPreActions?: boolean;
  queuedAction?: QueuedAction | null;
  canDouble?: boolean;
  canSplit?: boolean;
  holding?: boolean;
  handBusted?: boolean;
  timerProgress?: number | null;
  timerUrgent?: boolean;
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onSplit: () => void;
  onQueue?: (action: QueuedAction) => void;
  onTakeInsurance: () => void;
  onDeclineInsurance: () => void;
  chipTray?: ReactNode;
};

const QUEUE_LABEL: Record<QueuedAction, string> = {
  hit: "Hit",
  stand: "Hold",
  double: "Double",
  split: "Split",
};

type DrawerMode = "open" | "peek";

function useIsNarrow(maxPx = 639) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${maxPx}px)`).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxPx]);
  return narrow;
}

export function ActionBar({
  phase,
  bannerTitle,
  bannerHint,
  showBet,
  showInsurance,
  showActions,
  showPreActions = false,
  queuedAction = null,
  canDouble = true,
  canSplit = false,
  holding = false,
  handBusted = false,
  timerProgress = null,
  timerUrgent = false,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onQueue,
  onTakeInsurance,
  onDeclineInsurance,
  chipTray,
}: Props) {
  const isMobile = useIsNarrow();
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doubleBurst, setDoubleBurst] = useState(false);
  const [splitBurst, setSplitBurst] = useState(false);
  const [drawer, setDrawer] = useState<DrawerMode>("open");
  const [bustLinger, setBustLinger] = useState(false);
  const peekPinnedRef = useRef(false);
  const collapseTimerRef = useRef<number | null>(null);
  const prevPhaseRef = useRef(phase);

  const showPlayRow = showActions || showPreActions;
  const panelKey = showBet
    ? "bet"
    : showInsurance
      ? "insurance"
      : showActions
        ? "act"
        : showPreActions
          ? "queue"
          : holding
            ? "hold"
            : bustLinger
              ? "bust"
              : "none";
  const drawerActive = panelKey !== "none";
  const showDrawer = isMobile && drawerActive;
  const drawerLocked = holding || bustLinger;

  function clearCollapseTimer() {
    if (collapseTimerRef.current == null) return;
    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }

  useEffect(() => {
    setFlash(null);
    setBusy(false);
    setDoubleBurst(false);
    setSplitBurst(false);
  }, [showActions, showInsurance, showBet, showPreActions, phase]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (panelKey === "none") {
      peekPinnedRef.current = false;
      clearCollapseTimer();
      return;
    }
    if (panelKey === "hold" || panelKey === "bust") return;
    clearCollapseTimer();
    peekPinnedRef.current = false;
    setDrawer("open");
  }, [panelKey]);

  // Insurance decision peeks the drawer; when play resumes the panel may
  // still be "queue", so force-open if they can still pick a pre-action.
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (!isMobile || prev !== "insurance") return;
    if (phase !== "playerTurns" && phase !== "dealing") return;
    if (showPreActions && !queuedAction) {
      clearCollapseTimer();
      peekPinnedRef.current = false;
      setDrawer("open");
      return;
    }
    if (showActions) {
      clearCollapseTimer();
      peekPinnedRef.current = false;
      setDrawer("open");
    }
  }, [phase, isMobile, showPreActions, showActions, queuedAction]);

  useEffect(() => {
    if (!isMobile) return;
    if (holding) {
      peekPinnedRef.current = true;
      setDrawer("peek");
    }
  }, [holding, isMobile]);

  useEffect(() => {
    if (!isMobile || !handBusted) return;
    setBustLinger(true);
    peekPinnedRef.current = true;
    setDrawer("peek");
  }, [handBusted, isMobile]);

  useEffect(() => {
    if (!bustLinger) return;
    const id = window.setTimeout(() => setBustLinger(false), 2800);
    return () => window.clearTimeout(id);
  }, [bustLinger]);

  useEffect(() => {
    if (!showDrawer) {
      document.documentElement.style.removeProperty("--action-drawer-pad");
      return;
    }
    const openPad = showBet ? "16rem" : showInsurance ? "12rem" : "10.5rem";
    document.documentElement.style.setProperty(
      "--action-drawer-pad",
      drawer === "open" ? openPad : "5.5rem"
    );
    return () => {
      document.documentElement.style.removeProperty("--action-drawer-pad");
    };
  }, [showDrawer, drawer, showBet, showInsurance]);

  useEffect(() => {
    if (!showDrawer || drawer !== "open") return;
    const seat = document.querySelector(".seat-you");
    if (!(seat instanceof HTMLElement)) return;
    const id = window.setTimeout(() => {
      seat.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [showDrawer, drawer, showActions, showBet, showInsurance]);

  useEffect(() => () => clearCollapseTimer(), []);

  function act(
    label: string,
    fn: () => void,
    opts?: { double?: boolean; split?: boolean; collapse?: boolean }
  ) {
    if (busy) return;
    setBusy(true);
    setFlash(label);
    if (opts?.double) {
      setDoubleBurst(true);
      window.setTimeout(() => setDoubleBurst(false), 900);
    }
    if (opts?.split) {
      setSplitBurst(true);
      window.setTimeout(() => setSplitBurst(false), 900);
    }
    fn();
    window.setTimeout(() => setBusy(false), 450);
    if (isMobile && opts?.collapse) {
      peekPinnedRef.current = true;
      clearCollapseTimer();
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null;
        setDrawer("peek");
      }, 220);
    }
  }

  function queue(action: QueuedAction) {
    if (!onQueue) return;
    onQueue(action);
    if (isMobile) {
      peekPinnedRef.current = true;
      setDrawer("peek");
    }
  }

  const displayFlash = holding
    ? "HOLDING"
    : handBusted || bustLinger
      ? "BUST"
      : flash;

  if (
    !showBet &&
    !showInsurance &&
    !showPlayRow &&
    !displayFlash &&
    !showDrawer
  ) {
    return null;
  }

  const insurancePanel = (
    <div className="insurance-panel">
      <div className="insurance-panel-copy">
        <strong>Insurance</strong>
        <span>Half your bet · pays 2:1 if dealer has blackjack</span>
      </div>
      <div className="action-row insurance-row">
        <motion.button
          type="button"
          className="btn btn-insurance-take"
          whileHover={!busy ? { scale: 1.03 } : undefined}
          whileTap={!busy ? { scale: 0.94 } : undefined}
          disabled={busy}
          onClick={() =>
            act("Insurance taken", onTakeInsurance, { collapse: true })
          }
        >
          Take insurance <kbd className="kbd kbd-on-accent">Y</kbd>
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-ghost btn-insurance-skip"
          whileTap={{ scale: 0.94 }}
          disabled={busy}
          onClick={() =>
            act("No insurance", onDeclineInsurance, { collapse: true })
          }
        >
          No thanks <kbd className="kbd">N</kbd>
        </motion.button>
      </div>
    </div>
  );

  const playButtons = (
    <div className={`action-row${showPreActions ? " action-row-pre" : ""}`}>
      <motion.button
        type="button"
        className={`btn${queuedAction === "hit" ? " is-queued" : ""}`}
        whileTap={{ scale: 0.94 }}
        disabled={busy && showActions}
        onClick={() =>
          showPreActions
            ? queue("hit")
            : act("Hit", onHit)
        }
      >
        Hit <kbd className="kbd">Q</kbd>
      </motion.button>
      <motion.button
        type="button"
        className={`btn${queuedAction === "stand" ? " is-queued" : ""}`}
        whileTap={{ scale: 0.94 }}
        disabled={busy && showActions}
        onClick={() =>
          showPreActions
            ? queue("stand")
            : act("Holding", onStand, { collapse: true })
        }
      >
        Hold <kbd className="kbd">W</kbd>
      </motion.button>
      <motion.button
        type="button"
        className={`btn btn-double${canDouble ? " is-ready" : ""}${queuedAction === "double" ? " is-queued" : ""}`}
        whileHover={
          canDouble && !(busy && showActions) ? { scale: 1.04 } : undefined
        }
        whileTap={
          canDouble && !(busy && showActions) ? { scale: 0.9 } : undefined
        }
        animate={
          doubleBurst
            ? {
                scale: [1, 1.12, 1],
                boxShadow: [
                  "0 0 0 0 rgba(124,255,178,0)",
                  "0 0 0 10px rgba(124,255,178,0.35)",
                  "0 0 0 0 rgba(124,255,178,0)",
                ],
              }
            : { scale: 1 }
        }
        transition={{ duration: 0.55 }}
        disabled={(busy && showActions) || !canDouble}
        title={
          canDouble
            ? undefined
            : "Need a two-card hand and enough chips to double"
        }
        onClick={() => {
          if (!canDouble) return;
          if (showPreActions) queue("double");
          else act("DOUBLE ×2", onDouble, { double: true, collapse: true });
        }}
      >
        <span className="btn-double-label">Double</span>
        <span className="btn-double-x2">×2</span>
        <kbd className={`kbd${canDouble ? " kbd-on-accent" : ""}`}>E</kbd>
      </motion.button>
      <motion.button
        type="button"
        className={`btn btn-split${canSplit ? " is-ready" : ""}${queuedAction === "split" ? " is-queued" : ""}`}
        whileHover={
          canSplit && !(busy && showActions) ? { scale: 1.06 } : undefined
        }
        whileTap={
          canSplit && !(busy && showActions) ? { scale: 0.9 } : undefined
        }
        animate={
          splitBurst
            ? { scale: [1, 1.12, 1], x: [0, -8, 8, -4, 0] }
            : canSplit && !showPreActions
              ? { scale: [1, 1.03, 1] }
              : { scale: 1, x: 0 }
        }
        transition={
          splitBurst
            ? { duration: 0.5 }
            : canSplit && !showPreActions
              ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
        }
        disabled={(busy && showActions) || !canSplit}
        title={
          canSplit
            ? "Split your pair into two hands"
            : "Split only with a matching pair"
        }
        onClick={() => {
          if (!canSplit) return;
          if (showPreActions) queue("split");
          else act("SPLIT → ←", onSplit, { split: true });
        }}
      >
        <span className="btn-split-arrows" aria-hidden>
          <span className="btn-split-arrow btn-split-arrow-l">←</span>
          <span className="btn-split-arrow btn-split-arrow-r">→</span>
        </span>
        <span className="btn-split-label">Split</span>
        <kbd className={`kbd${canSplit ? " kbd-on-accent" : ""}`}>R</kbd>
      </motion.button>
    </div>
  );

  const phaseLabel = showInsurance
    ? "Your decision"
    : showBet
      ? "Place your bet"
      : showPreActions
        ? queuedAction
          ? `Queued ${QUEUE_LABEL[queuedAction]} — plays on your turn`
          : "Choose early — plays when it’s your turn"
        : phase;

  let peekTitle = bannerTitle ?? "Your move";
  let peekHint = bannerHint ?? "What will you do?";
  if (holding) {
    peekTitle = "Holding";
    peekHint = "\u00a0";
  } else if (bustLinger || handBusted) {
    peekTitle = "Bust";
    peekHint = "\u00a0";
  } else if (showBet) {
    peekTitle = bannerTitle ?? "Place your bets";
    peekHint =
      drawer === "peek"
        ? "Tap to add chips"
        : bannerHint ?? "Chips lock when the timer ends";
  } else if (showInsurance) {
    peekTitle = bannerTitle ?? "Insurance";
    peekHint =
      drawer === "peek"
        ? "Tap to decide"
        : bannerHint ?? "Dealer shows an Ace";
  } else if (showPreActions) {
    peekTitle = queuedAction
      ? `Queued ${QUEUE_LABEL[queuedAction]}`
      : bannerTitle ?? "Queue your move";
    peekHint =
      drawer === "peek"
        ? queuedAction
          ? "Tap to change"
          : "Tap to choose"
        : bannerHint ?? "Plays when it’s your turn";
  } else if (showActions) {
    peekTitle = bannerTitle ?? "Your move";
    peekHint =
      drawer === "peek"
        ? "Tap to change"
        : bannerHint ?? "What will you do?";
  }

  const showChrome =
    !!displayFlash ||
    (!isMobile && (showBet || showInsurance || showPlayRow));

  return (
    <>
      {showChrome && (
        <div
          className={[
            "action-bar",
            showActions && !isMobile ? "action-bar-live" : "",
            showPreActions && !isMobile ? "action-bar-pre" : "",
            showInsurance && !isMobile ? "action-bar-insurance" : "",
            holding ? "action-bar-holding" : "",
            doubleBurst ? "action-bar-double" : "",
            splitBurst ? "action-bar-split" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {!isMobile && <div className="action-phase">{phaseLabel}</div>}

          <div className="action-flash-slot" aria-live="polite">
            <AnimatePresence>
              {displayFlash && (
                <motion.div
                  className={`action-flash${displayFlash.startsWith("DOUBLE") ? " action-flash-double" : ""}${displayFlash.startsWith("SPLIT") ? " action-flash-split" : ""}${holding ? " action-flash-hold" : ""}${displayFlash === "BUST" ? " action-flash-bust" : ""}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  key={displayFlash}
                >
                  {displayFlash}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isMobile && showBet && chipTray}
          {!isMobile && showInsurance && insurancePanel}
          {!isMobile && showPlayRow && playButtons}
        </div>
      )}

      <AnimatePresence>
        {showDrawer && (
          <motion.div
            className={[
              "action-drawer",
              showActions ? "is-live" : "",
              showPreActions ? "is-pre is-queue" : "",
              showBet ? "is-bet" : "",
              showInsurance ? "is-insurance" : "",
              drawer === "peek" ? "is-peek" : "",
              holding ? "is-holding" : "",
              bustLinger || handBusted ? "is-bust" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (drawerLocked) return;
              if (info.offset.y > 72 || info.velocity.y > 400) {
                peekPinnedRef.current = true;
                setDrawer("peek");
              } else if (info.offset.y < -40 || info.velocity.y < -300) {
                peekPinnedRef.current = false;
                setDrawer("open");
              }
            }}
          >
            <button
              type="button"
              className="action-drawer-handle"
              aria-label={
                drawer === "open" ? "Collapse panel" : "Expand panel"
              }
              onClick={() => {
                if (drawerLocked) return;
                peekPinnedRef.current = false;
                setDrawer((d) => (d === "open" ? "peek" : "open"));
              }}
            >
              <span className="action-drawer-grip" />
            </button>

            <div
              className={`action-drawer-timer${timerProgress == null || showPreActions ? " is-empty" : ""}${timerUrgent && !showPreActions ? " is-urgent" : ""}`}
              aria-hidden
            >
              {timerProgress != null && !showPreActions && (
                <motion.div
                  className="action-drawer-timer-fill"
                  animate={{ scaleX: timerProgress }}
                  transition={{ duration: 0.2, ease: "linear" }}
                  style={{ transformOrigin: "center" }}
                />
              )}
            </div>

            <button
              type="button"
              className="action-drawer-peek"
              onClick={() => {
                if (drawerLocked) return;
                peekPinnedRef.current = false;
                setDrawer("open");
              }}
            >
              <span className="action-drawer-peek-title">{peekTitle}</span>
              <span className="action-drawer-peek-hint">{peekHint}</span>
            </button>

            <div className="action-drawer-body">
              {showBet && chipTray}
              {showInsurance && insurancePanel}
              {showPlayRow && playButtons}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
