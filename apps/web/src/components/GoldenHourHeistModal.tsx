import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameSocket } from "../lib/SocketProvider";

const SEEN_KEY = "neon21:heist-seen";

function seenKey(activeUntil: number) {
  return `${SEEN_KEY}:${activeUntil}`;
}

export function GoldenHourHeistModal() {
  const { goldenHour } = useGameSocket();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!goldenHour?.active || goldenHour.activeUntil == null) {
      setOpen(false);
      return;
    }
    try {
      if (sessionStorage.getItem(seenKey(goldenHour.activeUntil))) return;
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [goldenHour?.active, goldenHour?.activeUntil]);

  function dismiss() {
    if (goldenHour?.activeUntil != null) {
      try {
        sessionStorage.setItem(seenKey(goldenHour.activeUntil), "1");
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="heist-modal-root">
          <motion.button
            type="button"
            className="heist-modal-scrim"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
          />
          <motion.div
            className="heist-modal"
            role="dialog"
            aria-labelledby="heist-modal-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <p className="heist-modal-eyebrow">Golden Hour</p>
            <h2 id="heist-modal-title" className="heist-modal-title">
              The Heist is on
            </h2>
            <p className="heist-modal-body">
              The house treasury is vulnerable! The jackpot grows twice as
              fast, you bank 10% of every lost bet as a rebate (wins never
              take it back), and special hand bonuses are live!
            </p>
            <button type="button" className="btn" onClick={dismiss}>
              Understood
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
