import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicSeat } from "@neon21/shared";
import { formatCents } from "../../lib/format";
import { PlayingCard } from "./PlayingCard";
import { HandValueBadge } from "./HandValueBadge";
import {
  SeatBetAura,
  betAuraTier,
  seatStakeCents,
} from "./SeatBetAura";

type Props = {
  seat: PublicSeat;
  isYou: boolean;
  isActive: boolean;
  activeHandIndex: number | null;
  settle: boolean;
  onSit: () => void;
};

export function SeatView({
  seat,
  isYou,
  isActive,
  activeHandIndex,
  settle,
  onSit,
}: Props) {
  const empty = !seat.userId;
  const split = seat.hands.length > 1;
  const prevCount = useRef(seat.hands.length);
  const [peeling, setPeeling] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const auraTier =
    !empty ? betAuraTier(seatStakeCents(seat)) : 0;

  useEffect(() => {
    const prev = prevCount.current;
    const next = seat.hands.length;
    prevCount.current = next;
    if (next > 1 && prev === 1) {
      setPeeling(true);
      setShowBurst(true);
      const a = window.setTimeout(() => setPeeling(false), 700);
      const b = window.setTimeout(() => setShowBurst(false), 900);
      return () => {
        window.clearTimeout(a);
        window.clearTimeout(b);
      };
    }
    if (next <= 1) {
      setPeeling(false);
      setShowBurst(false);
    }
  }, [seat.hands.length]);

  return (
    <motion.div
      layout
      transition={{
        layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      }}
      className={[
        "seat",
        empty ? "seat-empty" : "",
        isYou ? "seat-you" : "",
        isActive ? "seat-active" : "",
        split ? "seat-split" : "",
        !seat.connected && seat.userId ? "seat-away" : "",
        auraTier > 0 ? `seat-aura-t${auraTier}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {auraTier > 0 && <SeatBetAura tier={auraTier} />}
      {empty ? (
        <button type="button" className="btn btn-sm btn-ghost seat-sit" onClick={onSit}>
          Sit
        </button>
      ) : (
        <>
          <div className="seat-name">
            {seat.name ?? "Player"}
            {isYou && <span className="seat-you-tag">(You)</span>}
            {!seat.connected && <span className="seat-away-tag">away</span>}
          </div>
          {seat.pendingBetCents > 0 && (
            <div className="seat-bet">{formatCents(seat.pendingBetCents)}</div>
          )}

          <AnimatePresence>
            {showBurst && (
              <motion.div
                className="split-burst"
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.55, 1.2, 1.08, 1.25] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, times: [0, 0.18, 0.55, 1] }}
                aria-hidden
              >
                SPLIT
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`seat-hands${split ? " seat-hands-split" : ""}`}>
            {seat.hands.map((hand, hi) => {
              const playing =
                isActive && activeHandIndex === hi && !settle;
              const waiting =
                split &&
                isActive &&
                activeHandIndex != null &&
                activeHandIndex !== hi &&
                !hand.stood &&
                !hand.value.bust &&
                !settle;
              const done =
                split &&
                !settle &&
                (hand.stood || hand.value.bust) &&
                !playing;

              return (
                <motion.div
                  key={`hand-${hi}`}
                  className={[
                    "seat-hand",
                    split ? "seat-hand-split" : "",
                    hand.doubled ? "hand-doubled" : "",
                    hand.stood && !hand.value.bust && !settle
                      ? "hand-holding"
                      : "",
                    playing ? "hand-playing" : "",
                    waiting ? "hand-waiting" : "",
                    done ? "hand-done" : "",
                    settle && hand.resultCents != null
                      ? hand.resultCents > 0
                        ? "hand-win"
                        : hand.resultCents < 0
                          ? "hand-lose"
                          : "hand-push"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  initial={false}
                  animate={
                    peeling
                      ? {
                          opacity: 1,
                          x: hi === 0 ? [-32, 0] : [32, 0],
                          scale: [0.9, 1],
                          y: 0,
                        }
                      : {
                          opacity: waiting || done ? (done ? 0.55 : 0.38) : 1,
                          x: 0,
                          scale: playing ? 1.07 : waiting || done ? 0.9 : 1,
                          y: playing ? -3 : 0,
                        }
                  }
                  transition={{
                    duration: peeling ? 0.55 : undefined,
                    type: peeling ? "tween" : "spring",
                    ease: peeling ? [0.22, 1, 0.36, 1] : undefined,
                    stiffness: peeling ? undefined : 400,
                    damping: peeling ? undefined : 22,
                    delay: peeling ? hi * 0.04 : 0,
                  }}
                  layout
                >
                  {split && (
                    <span
                      className={`hand-slot-tag${playing ? " is-playing" : ""}`}
                    >
                      {playing ? "Playing" : `Hand ${hi + 1}`}
                    </span>
                  )}
                  {hand.doubled && (
                    <motion.span
                      className="hand-double-tag"
                      initial={{ opacity: 0, scale: 0.6, y: 6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 18,
                      }}
                    >
                      ×2
                    </motion.span>
                  )}
                  <div className="card-row">
                    {hand.cards.map((c, ci) => (
                      <PlayingCard
                        key={`${"rank" in c ? c.rank + c.suit : "h"}-${ci}`}
                        card={c}
                        index={ci}
                      />
                    ))}
                  </div>
                  <div className="hand-meta">
                    <HandValueBadge value={hand.value} />
                    {hand.betCents > 0 && (
                      <motion.span
                        className={`hand-bet${hand.doubled ? " hand-bet-doubled" : ""}`}
                        key={hand.betCents}
                        initial={
                          hand.doubled ? { scale: 1.35, color: "#7cffb2" } : false
                        }
                        animate={{ scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 16,
                        }}
                      >
                        {formatCents(hand.betCents)}
                      </motion.span>
                    )}
                    {settle && hand.resultCents != null && (
                      <span
                        className={`hand-result${
                          hand.resultCents > 0
                            ? " result-pos"
                            : hand.resultCents < 0
                              ? " result-neg"
                              : " result-push"
                        }`}
                      >
                        {hand.resultCents === 0
                          ? "Push"
                          : `${hand.resultCents > 0 ? "+" : ""}${formatCents(hand.resultCents)}`}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
      <div className="seat-index">#{seat.index + 1}</div>
    </motion.div>
  );
}
