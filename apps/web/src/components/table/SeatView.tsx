import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicSeat, TableSpinState, TableStraightBonusEvent } from "@neon21/shared";
import { GOLDEN_HANDS_PER_HANDS } from "@neon21/shared";
import { formatCents } from "../../lib/format";
import { PlayingCard } from "./PlayingCard";
import { HandValueBadge } from "./HandValueBadge";
import {
  SeatBetAura,
  betAuraTier,
  seatStakeCents,
} from "./SeatBetAura";
import { SpinWheel } from "./SpinWheel";
import { SeatBjMeter } from "./SeatBjMeter";
import { StraightNeonTrace } from "./StraightNeonTrace";

type Props = {
  seat: PublicSeat;
  isYou: boolean;
  isActive: boolean;
  activeHandIndex: number | null;
  settle: boolean;
  canSit?: boolean;
  waitTimerProgress?: number | null;
  waitTimerUrgent?: boolean;
  showSpinCta?: boolean;
  spinCtaDisabled?: boolean;
  spin?: TableSpinState | null;
  straightFx?: TableStraightBonusEvent | null;
  onSit: () => void;
  onClaimSpin?: () => void;
  onSpinGo?: () => void;
  onSpinCancel?: () => void;
  onSpinDone?: () => void;
  onSpinReveal?: (spin: TableSpinState) => void;
  showGoldenHourProgress?: boolean;
  goldenHandsPerHands?: number;
};

export function SeatView({
  seat,
  isYou,
  isActive,
  activeHandIndex,
  settle,
  canSit = true,
  waitTimerProgress = null,
  waitTimerUrgent = false,
  showSpinCta = false,
  spinCtaDisabled = false,
  spin = null,
  straightFx = null,
  onSit,
  onClaimSpin,
  onSpinGo,
  onSpinCancel,
  onSpinDone,
  onSpinReveal,
  showGoldenHourProgress = false,
  goldenHandsPerHands = GOLDEN_HANDS_PER_HANDS,
}: Props) {
  const empty = !seat.userId;
  const split = seat.hands.length > 1;
  const [nowTick, setNowTick] = useState(() => Date.now());
  const charlieActive =
    seat.charlieFxUntil != null && seat.charlieFxUntil > nowTick;
  const tripleActive =
    seat.tripleBonusFxUntil != null && seat.tripleBonusFxUntil > nowTick;
  const straightActive =
    (straightFx != null && straightFx.until > nowTick) ||
    (seat.straightBonusFxUntil != null && seat.straightBonusFxUntil > nowTick);
  const straightLen =
    straightFx?.length ?? seat.straightBonusLength ?? null;
  const straightAmt =
    straightFx?.bonusCents ?? seat.straightBonusCents ?? 0;

  useEffect(() => {
    const until = Math.max(
      seat.charlieFxUntil ?? 0,
      seat.tripleBonusFxUntil ?? 0,
      seat.straightBonusFxUntil ?? 0,
      straightFx?.until ?? 0
    );
    if (until <= 0) return;
    const remaining = until - Date.now();
    if (remaining <= 0) {
      setNowTick(Date.now());
      return;
    }
    const t = window.setTimeout(() => setNowTick(Date.now()), remaining + 30);
    return () => window.clearTimeout(t);
  }, [
    seat.charlieFxUntil,
    seat.tripleBonusFxUntil,
    seat.straightBonusFxUntil,
    straightFx?.until,
  ]);

  const prevCount = useRef(seat.hands.length);
  const prevAuraTier = useRef<number | null>(null);
  const [peeling, setPeeling] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const [auraCelebrate, setAuraCelebrate] = useState(false);
  const auraTier = !empty ? betAuraTier(seatStakeCents(seat)) : 0;
  const anyDoubled = seat.hands.some((h) => h.doubled);

  useEffect(() => {
    const prev = prevAuraTier.current;
    prevAuraTier.current = auraTier;
    if (prev == null) return;
    if (auraTier > prev && auraTier > 0) {
      setAuraCelebrate(true);
      const t = window.setTimeout(() => setAuraCelebrate(false), 950);
      return () => window.clearTimeout(t);
    }
  }, [auraTier]);

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
      layout="position"
      transition={{
        layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      }}
      className={[
        "seat",
        empty ? "seat-empty" : "",
        isYou ? "seat-you" : "",
        isActive ? "seat-active" : "",
        split ? "seat-split" : "",
        seat.goldenHandActive ? "seat-golden-hand" : "",
        !seat.connected && seat.userId ? "seat-away" : "",
        auraTier > 0 ? `seat-aura-t${auraTier}` : "",
        spin ? "seat-has-spin" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-seat-index={seat.index}
    >
      {auraTier > 0 ? (
        <SeatBetAura
          tier={auraTier}
          celebrate={auraCelebrate}
          doubled={anyDoubled}
          split={split}
        />
      ) : null}
      {waitTimerProgress != null && (
        <div
          className={`seat-wait-timer${waitTimerUrgent ? " is-urgent" : ""}`}
          aria-hidden
        >
          <motion.div
            className="seat-wait-timer-fill"
            animate={{ scaleX: waitTimerProgress }}
            transition={{ duration: 0.2, ease: "linear" }}
            style={{ transformOrigin: "left center" }}
          />
        </div>
      )}
      {empty ? (
        <button
          type="button"
          className="btn btn-sm btn-ghost seat-sit"
          disabled={!canSit}
          title={canSit ? undefined : "Need chips to sit"}
          onClick={onSit}
        >
          Sit
        </button>
      ) : (
        <>
          <div className="seat-name">
            {seat.name ?? "Player"}
            {isYou && <span className="seat-you-tag">(You)</span>}
            {!seat.connected && <span className="seat-away-tag">away</span>}
          </div>
          {seat.goldenHandActive && (
            <div className="seat-golden-hand-banner" aria-live="polite">
              GOLDEN HAND ACTIVATED
            </div>
          )}
          {tripleActive && (
            <div className="seat-triple-banner" aria-live="polite">
              TRIPLE CARD
              {(seat.tripleBonusCents ?? 0) > 0 && (
                <span className="seat-triple-banner-amt">
                  +{formatCents(seat.tripleBonusCents!)}
                </span>
              )}
            </div>
          )}
          {straightActive && straightLen != null && (
            <div className="seat-straight-banner" aria-live="polite">
              ⚡ {straightLen}-CARD STRAIGHT!
              {straightAmt > 0 && (
                <span className="seat-straight-banner-amt">
                  +{formatCents(straightAmt)}
                </span>
              )}
            </div>
          )}
          {charlieActive && (
            <div className="seat-charlie-banner" aria-live="polite">
              <span className="seat-charlie-dots" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} style={{ ["--i" as string]: i }} />
                ))}
              </span>
              5-CARD CHARLIE
              <span className="seat-charlie-banner-sub">SPIN VOUCHER</span>
            </div>
          )}
          {(seat.bjTowardSpin != null || (seat.spinVouchers ?? 0) > 0) && (
            <SeatBjMeter
              seatKey={seat.userId ?? `seat-${seat.index}`}
              bjTowardSpin={seat.bjTowardSpin ?? 0}
              spinVouchers={seat.spinVouchers ?? 0}
            />
          )}
          {showGoldenHourProgress && seat.goldenHourHandsToward != null && (
            <div
              className="seat-golden-hands-meter"
              title={`${seat.goldenHourHandsToward} of ${goldenHandsPerHands} Golden Hour hands toward next Golden Hand`}
            >
              <span className="seat-golden-hands-meter-label">GH</span>
              <span className="seat-golden-hands-meter-value">
                {seat.goldenHourHandsToward}/{goldenHandsPerHands}
              </span>
              {(seat.goldenHands ?? 0) > 0 && (
                <span className="seat-golden-hands-meter-inv">
                  ×{seat.goldenHands}
                </span>
              )}
            </div>
          )}
          {showSpinCta && onClaimSpin && (
            <button
              type="button"
              className={`btn btn-sm seat-spin-cta${spinCtaDisabled ? " is-disabled" : ""}`}
              disabled={spinCtaDisabled}
              title={
                spinCtaDisabled
                  ? "Jackpot pot is empty"
                  : "Spend a voucher to spin the house jackpot"
              }
              onClick={onClaimSpin}
            >
              <span className="seat-spin-cta-clip" aria-hidden>
                <span className="seat-spin-cta-glow" />
                <span className="seat-spin-cta-shine" />
              </span>
              <span className="seat-spin-cta-particles" aria-hidden>
                {Array.from({ length: 14 }, (_, i) => (
                  <i
                    key={i}
                    style={
                      {
                        ["--i"]: i,
                        ["--a"]: `${(i / 14) * 360 + (i % 3) * 17}deg`,
                        ["--d"]: `${10 + (i % 5) * 5}px`,
                        ["--s"]: `${1.2 + (i % 4) * 0.55}px`,
                        ["--dur"]: `${1.6 + (i % 5) * 0.35}s`,
                        ["--del"]: `${(i * 0.13) % 1.8}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
              <span className="seat-spin-cta-label">Spin jackpot</span>
            </button>
          )}
          {spin && onSpinGo && (
            <SpinWheel
              spin={spin}
              isSpinner={isYou}
              onSpin={onSpinGo}
              onCancel={isYou ? onSpinCancel : undefined}
              onReveal={onSpinReveal}
              onAnimDone={isYou ? onSpinDone : undefined}
            />
          )}
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
                          scale: waiting || done ? 0.9 : 1,
                          y: 0,
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
                  {hand.suitedPairSuit && (
                    <span
                      className={`hand-suited-pair-tag suit-${hand.suitedPairSuit}`}
                    >
                      {hand.suitedPairSuit === "S"
                        ? "3×♠"
                        : hand.suitedPairSuit === "H"
                          ? "2.5×♥"
                          : hand.suitedPairSuit === "C"
                            ? "2×♣"
                            : "1.5×♦"}
                    </span>
                  )}
                  <div className="card-row">
                    {hand.cards.map((c, ci) => (
                      <PlayingCard
                        key={`${"rank" in c ? c.rank + c.suit : "h"}-${ci}`}
                        card={c}
                        index={ci}
                      />
                    ))}
                    {straightFx &&
                      straightFx.handIndex === hi &&
                      straightFx.until > nowTick &&
                      straightFx.cardIndices.length >= 2 && (
                        <StraightNeonTrace
                          cardIndices={straightFx.cardIndices}
                          until={straightFx.until}
                        />
                      )}
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
