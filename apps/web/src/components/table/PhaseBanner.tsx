import { AnimatePresence, motion } from "framer-motion";
import type { TablePhase } from "@neon21/shared";
import { getPhaseBannerCopy } from "./phaseCopy";

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
  const { title, hint } = getPhaseBannerCopy({
    phase,
    isYourTurn,
    isHolding,
    needsInsurance,
  });

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
