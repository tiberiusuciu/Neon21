import { motion } from "framer-motion";
import type { PublicCard } from "@neon21/shared";

const SUIT_GLYPH: Record<string, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

type Props = {
  card: PublicCard;
  index?: number;
};

export function PlayingCard({ card, index = 0 }: Props) {
  if ("hidden" in card && card.hidden) {
    return (
      <motion.div
        className="card card-back"
        initial={{ opacity: 0, y: -18, rotate: -6 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.28, delay: index * 0.05 }}
        aria-label="Hidden card"
      />
    );
  }

  const suit = "suit" in card ? card.suit : "S";
  const rank = "rank" in card ? card.rank : "?";
  const red = suit === "H" || suit === "D";

  return (
    <motion.div
      className={`card card-face${red ? " card-red" : ""}`}
      initial={{ opacity: 0, y: -18, rotate: -6 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05 }}
      aria-label={`${rank} of ${suit}`}
    >
      <span className="card-rank">{rank}</span>
      <span className="card-suit">{SUIT_GLYPH[suit] ?? suit}</span>
    </motion.div>
  );
}
