import { AnimatePresence, motion } from "framer-motion";
import type { TablePhase } from "@neon21/shared";

const COPY: Record<TablePhase, { title: string; hint: string }> = {
  betting: { title: "Place your bets", hint: "Chips lock when the timer ends" },
  dealing: { title: "Dealing", hint: "Cards are coming out" },
  insurance: {
    title: "Insurance?",
    hint: "Dealer shows an Ace — pays 2:1 if blackjack",
  },
  playerTurns: { title: "Players act", hint: "Hit · Hold · Double · Split" },
  dealer: { title: "Dealer plays", hint: "Watch the house hand" },
  settle: { title: "Round results", hint: "Wins and losses locked in" },
};

type Props = {
  phase: TablePhase;
  isYourTurn: boolean;
  isHolding?: boolean;
  needsInsurance?: boolean;
};

export function PhaseBanner({
  phase,
  isYourTurn,
  isHolding,
  needsInsurance,
}: Props) {
  const base = COPY[phase];
  let title = base.title;
  let hint = base.hint;
  if (phase === "insurance" && needsInsurance) {
    title = "Insurance offered";
    hint = "Dealer’s upcard is an Ace — decide below";
  } else if (phase === "insurance") {
    title = "Insurance round";
    hint = "Waiting on players — dealer shows an Ace";
  } else if (phase === "playerTurns" && isHolding) {
    title = "Holding";
    hint = "Hand locked — next soon";
  } else if (phase === "playerTurns" && isYourTurn) {
    title = "Your turn";
    hint = "Choose Hit, Hold, Double, or Split";
  }

  return (
    <div className="phase-banner-slot" aria-live="polite">
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={`${phase}-${isYourTurn}-${isHolding}-${needsInsurance}`}
          className={[
            "phase-banner",
            `phase-${phase}`,
            isYourTurn ? "phase-your-turn" : "",
            isHolding ? "phase-holding" : "",
            needsInsurance ? "phase-insurance-yours" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          initial={{ opacity: 0, y: phase === "insurance" ? -6 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {phase === "insurance" && (
            <span className="phase-banner-badge" aria-hidden>
              Ace up
            </span>
          )}
          <div className="phase-banner-title">{title}</div>
          <div className="phase-banner-hint">{hint}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
