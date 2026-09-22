import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type QueuedAction = "hit" | "stand" | "double" | "split";

type Props = {
  phase: string;
  showBet: boolean;
  showInsurance: boolean;
  showActions: boolean;
  showPreActions?: boolean;
  queuedAction?: QueuedAction | null;
  canDouble?: boolean;
  canSplit?: boolean;
  holding?: boolean;
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

export function ActionBar({
  phase,
  showBet,
  showInsurance,
  showActions,
  showPreActions = false,
  queuedAction = null,
  canDouble = true,
  canSplit = false,
  holding = false,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onQueue,
  onTakeInsurance,
  onDeclineInsurance,
  chipTray,
}: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doubleBurst, setDoubleBurst] = useState(false);
  const [splitBurst, setSplitBurst] = useState(false);

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

  function act(
    label: string,
    fn: () => void,
    opts?: { double?: boolean; split?: boolean }
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
  }

  function queue(action: QueuedAction) {
    if (!onQueue) return;
    onQueue(action);
  }

  const displayFlash = holding ? "HOLDING" : flash;
  const showPlayRow = showActions || showPreActions;

  if (
    !showBet &&
    !showInsurance &&
    !showPlayRow &&
    !displayFlash
  ) {
    return null;
  }

  return (
    <div
      className={[
        "action-bar",
        showActions ? "action-bar-live" : "",
        showPreActions ? "action-bar-pre" : "",
        showInsurance ? "action-bar-insurance" : "",
        holding ? "action-bar-holding" : "",
        doubleBurst ? "action-bar-double" : "",
        splitBurst ? "action-bar-split" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="action-phase">
        {showInsurance
          ? "Your decision"
          : showPreActions
            ? queuedAction
              ? `Queued ${QUEUE_LABEL[queuedAction]} — plays on your turn`
              : "Choose early — plays when it’s your turn"
            : phase}
      </div>

      <div className="action-flash-slot" aria-live="polite">
        <AnimatePresence>
          {displayFlash && (
            <motion.div
              className={`action-flash${displayFlash.startsWith("DOUBLE") ? " action-flash-double" : ""}${displayFlash.startsWith("SPLIT") ? " action-flash-split" : ""}${holding ? " action-flash-hold" : ""}`}
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

      {showBet && chipTray}

      {showInsurance && (
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
              onClick={() => act("Insurance taken", onTakeInsurance)}
            >
              Take insurance <kbd className="kbd kbd-on-accent">Y</kbd>
            </motion.button>
            <motion.button
              type="button"
              className="btn btn-ghost btn-insurance-skip"
              whileTap={{ scale: 0.94 }}
              disabled={busy}
              onClick={() => act("No insurance", onDeclineInsurance)}
            >
              No thanks <kbd className="kbd">N</kbd>
            </motion.button>
          </div>
        </div>
      )}

      {showPlayRow && (
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
                : act("Holding", onStand)
            }
          >
            Hold <kbd className="kbd">W</kbd>
          </motion.button>
          <motion.button
            type="button"
            className={`btn btn-double${queuedAction === "double" ? " is-queued" : ""}`}
            whileHover={canDouble && !(busy && showActions) ? { scale: 1.04 } : undefined}
            whileTap={canDouble && !(busy && showActions) ? { scale: 0.9 } : undefined}
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
            title={canDouble ? undefined : "Double only on your first action"}
            onClick={() => {
              if (!canDouble) return;
              if (showPreActions) queue("double");
              else act("DOUBLE ×2", onDouble, { double: true });
            }}
          >
            <span className="btn-double-label">Double</span>
            <span className="btn-double-x2">×2</span>
            <kbd className="kbd kbd-on-accent">E</kbd>
          </motion.button>
          <motion.button
            type="button"
            className={`btn btn-split${canSplit ? " is-ready" : ""}${queuedAction === "split" ? " is-queued" : ""}`}
            whileHover={canSplit && !(busy && showActions) ? { scale: 1.06 } : undefined}
            whileTap={canSplit && !(busy && showActions) ? { scale: 0.9 } : undefined}
            animate={
              splitBurst
                ? {
                    scale: [1, 1.12, 1],
                    x: [0, -8, 8, -4, 0],
                  }
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
      )}
    </div>
  );
}
