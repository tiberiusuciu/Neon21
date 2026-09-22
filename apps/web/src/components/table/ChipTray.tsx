import { motion } from "framer-motion";
import { CHIP_DENOMINATIONS_CENTS, MIN_BET_CENTS } from "@neon21/shared";
import { formatCents } from "../../lib/format";

type Props = {
  pendingBetCents: number;
  balanceCents: number;
  onAdd: (cents: number) => void;
  onClear: () => void;
  onReuse: () => void;
};

const CHIP_KEYS = ["Q", "W", "E", "R", "T"] as const;

export function ChipTray({
  pendingBetCents,
  balanceCents,
  onAdd,
  onClear,
  onReuse,
}: Props) {
  const remaining = Math.max(0, balanceCents - pendingBetCents);
  const canBetAnything =
    remaining >= MIN_BET_CENTS ||
    (pendingBetCents > 0 && remaining > 0);

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
        {CHIP_DENOMINATIONS_CENTS.map((c, i) => {
          const fits = c <= remaining;
          const allIn = !fits && canBetAnything;
          const disabled = !canBetAnything;
          const keyLabel = CHIP_KEYS[i] ?? String(i + 1);
          return (
            <motion.button
              key={c}
              type="button"
              className={[
                "chip-btn",
                disabled ? "chip-btn-disabled" : "",
                allIn ? "chip-btn-allin" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              whileTap={!disabled ? { scale: 0.88 } : undefined}
              whileHover={!disabled ? { y: -2 } : undefined}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onAdd(c);
              }}
              title={
                disabled
                  ? `Need at least ${formatCents(MIN_BET_CENTS)}`
                  : allIn
                    ? `All in ${formatCents(remaining)}`
                    : `Key ${keyLabel}`
              }
            >
              <span>{c / 100}</span>
              {allIn && <span className="chip-allin-tag">all in</span>}
              <kbd className="kbd chip-kbd">{keyLabel}</kbd>
            </motion.button>
          );
        })}
      </div>
      <div className="chip-actions">
        <motion.button
          type="button"
          className="btn btn-sm btn-ghost"
          whileTap={{ scale: 0.95 }}
          onClick={onClear}
        >
          Clear <kbd className="kbd">C</kbd>
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-sm btn-ghost"
          whileTap={{ scale: 0.95 }}
          onClick={onReuse}
        >
          Reuse <kbd className="kbd">D</kbd>
        </motion.button>
      </div>
    </div>
  );
}
