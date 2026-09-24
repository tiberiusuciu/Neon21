import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  GOLDEN_HANDS_PER_HANDS,
  MIN_BET_CENTS,
  chipFaceLabel,
  visibleChipDenominations,
} from "@neon21/shared";
import { formatCents } from "../../lib/format";

type Props = {
  pendingBetCents: number;
  balanceCents: number;
  lastBetCents?: number;
  onAdd: (cents: number) => void;
  onRemove: (cents: number) => void;
  onClear: () => void;
  onReuse: () => void;
  goldenHands?: number;
  goldenHandArmed?: boolean;
  goldenHourHandsToward?: number;
  onToggleGoldenHand?: () => void;
};

const CHIP_KEYS = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O"] as const;

export function ChipTray({
  pendingBetCents,
  balanceCents,
  lastBetCents = 0,
  onAdd,
  onRemove,
  onClear,
  onReuse,
  goldenHands = 0,
  goldenHandArmed = false,
  goldenHourHandsToward = 0,
  onToggleGoldenHand,
}: Props) {
  const [removing, setRemoving] = useState(false);
  const remaining = Math.max(0, balanceCents - pendingBetCents);
  const canBetAnything =
    remaining >= MIN_BET_CENTS ||
    (pendingBetCents > 0 && remaining > 0);
  const canClear = pendingBetCents > 0;
  const canReuse =
    lastBetCents >= MIN_BET_CENTS && lastBetCents <= balanceCents;
  const chips = visibleChipDenominations(balanceCents);
  const showAllIn =
    !removing && canBetAnything && remaining > 0;
  const longTimer = useRef<number | null>(null);
  const longFired = useRef(false);
  const removeConsumed = useRef(false);

  function clearLong() {
    if (longTimer.current != null) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }

  function applyChip(cents: number, remove: boolean) {
    if (remove) {
      if (pendingBetCents <= 0) return;
      onRemove(cents);
      return;
    }
    if (!canBetAnything) return;
    onAdd(cents);
  }

  function removeOnce(cents: number) {
    if (removeConsumed.current) return;
    if (pendingBetCents <= 0) return;
    removeConsumed.current = true;
    longFired.current = true;
    onRemove(cents);
  }

  return (
    <div className="chip-tray">
      <motion.div
        className="chip-pending"
        key={pendingBetCents}
        initial={{ scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
      >
        Bet <strong>{formatCents(pendingBetCents)}</strong>
        <span className="chip-remaining">
          {" "}
          · available {formatCents(remaining)}
        </span>
      </motion.div>
      <div className="chip-row">
        {chips.map((c, i) => {
          const fits = c <= remaining;
          const allIn = !fits && canBetAnything && !removing;
          const canRemove = pendingBetCents > 0;
          const disabled = removing ? !canRemove : !canBetAnything;
          const keyLabel = CHIP_KEYS[i] ?? String(i + 1);
          return (
            <motion.button
              key={c}
              type="button"
              className={[
                "chip-btn",
                disabled ? "chip-btn-disabled" : "",
                allIn ? "chip-btn-allin" : "",
                removing ? "chip-btn-remove" : "",
                c >= 1_000_000 ? "chip-btn-mega" : c >= 50_000 ? "chip-btn-high" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              whileTap={!disabled ? { scale: 0.88 } : undefined}
              whileHover={!disabled ? { y: -2 } : undefined}
              disabled={disabled}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0 || removing) return;
                longFired.current = false;
                removeConsumed.current = false;
                clearLong();
                longTimer.current = window.setTimeout(() => {
                  if (canRemove) removeOnce(c);
                }, 380);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                clearLong();
              }}
              onPointerLeave={clearLong}
              onPointerCancel={clearLong}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (canRemove) removeOnce(c);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (longFired.current || removeConsumed.current) {
                  longFired.current = false;
                  removeConsumed.current = false;
                  return;
                }
                applyChip(c, removing || e.shiftKey);
              }}
              title={
                removing
                  ? `Remove ${formatCents(c)}`
                  : disabled
                    ? `Need at least ${formatCents(MIN_BET_CENTS)}`
                    : allIn
                      ? `All in ${formatCents(remaining)}`
                      : `Add ${formatCents(c)} (${keyLabel})`
              }
            >
              <span>
                {removing ? "−" : ""}
                {chipFaceLabel(c)}
              </span>
              {allIn && <span className="chip-allin-tag">all in</span>}
              {!removing && <kbd className="kbd chip-kbd">{keyLabel}</kbd>}
            </motion.button>
          );
        })}
        {showAllIn && (
          <motion.button
            type="button"
            className="chip-btn chip-btn-allin"
            whileTap={{ scale: 0.88 }}
            whileHover={{ y: -2 }}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(remaining);
            }}
            title={`All in ${formatCents(remaining)} (A)`}
          >
            <span>All</span>
            <span className="chip-allin-tag">max</span>
            <kbd className="kbd chip-kbd">A</kbd>
          </motion.button>
        )}
      </div>
      <div className="chip-actions">
        <span
          className="chip-golden-progress"
          title={`Golden Hour hands toward next Golden Hand (${GOLDEN_HANDS_PER_HANDS} hands = 1 token)`}
        >
          <span className="chip-golden-progress-label">GH</span>
          {goldenHourHandsToward}/{GOLDEN_HANDS_PER_HANDS}
        </span>
        {(goldenHandArmed || goldenHands > 0) && onToggleGoldenHand && (
          <motion.button
            type="button"
            className={`btn btn-sm${
              goldenHandArmed ? " btn-golden-hand is-armed" : " btn-ghost"
            }`}
            whileTap={{ scale: 0.95 }}
            aria-pressed={goldenHandArmed}
            disabled={!goldenHandArmed && goldenHands <= 0}
            title={
              goldenHandArmed
                ? "Cancel Golden Hand (max bet $5,000)"
                : `Arm Golden Hand ×${goldenHands} (1.5× win / half loss, max $5,000)`
            }
            onClick={onToggleGoldenHand}
          >
            {goldenHandArmed ? "Golden ON" : `Golden ×${goldenHands}`}
          </motion.button>
        )}
        <motion.button
          type="button"
          className={`btn btn-sm${removing ? "" : " btn-ghost"}`}
          whileTap={{ scale: 0.95 }}
          aria-pressed={removing}
          disabled={!canClear && !removing}
          onClick={() => setRemoving((v) => !v)}
        >
          {removing ? "Done" : "Remove"}
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-sm btn-ghost"
          whileTap={canClear ? { scale: 0.95 } : undefined}
          disabled={!canClear}
          title={canClear ? undefined : "No bet to clear"}
          onClick={() => {
            if (!canClear) return;
            setRemoving(false);
            onClear();
          }}
        >
          Clear <kbd className="kbd">C</kbd>
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-sm btn-ghost"
          whileTap={canReuse ? { scale: 0.95 } : undefined}
          disabled={!canReuse}
          title={
            canReuse
              ? `Reuse ${formatCents(lastBetCents)}`
              : lastBetCents < MIN_BET_CENTS
                ? "No previous bet"
                : "Not enough chips to reuse last bet"
          }
          onClick={() => {
            if (!canReuse) return;
            setRemoving(false);
            onReuse();
          }}
        >
          Reuse <kbd className="kbd">D</kbd>
        </motion.button>
      </div>
    </div>
  );
}
