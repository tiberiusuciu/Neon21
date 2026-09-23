import { AnimatePresence, motion } from "framer-motion";
import type { PublicCard, Rank, Suit } from "@neon21/shared";
import { formatCents } from "../../lib/format";

const SUIT_GLYPH: Record<string, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export type HistoryCard = {
  suit: Suit;
  rank: Rank;
};

export type RoundHandSummary = {
  resultCents: number;
  betCents: number;
  doubled: boolean;
  isBlackjack: boolean;
  bust: boolean;
  valueLabel: string;
  cards: HistoryCard[];
};

export type RoundHistoryEntry = {
  id: string;
  at: number;
  netCents: number;
  betCents: number;
  insuranceCents?: number;
  insuranceNetCents?: number;
  hands: RoundHandSummary[];
  dealerCards: HistoryCard[];
  dealerValueLabel: string;
};

type Props = {
  open: boolean;
  entries: RoundHistoryEntry[];
  onClose: () => void;
};

export function toHistoryCards(cards: PublicCard[]): HistoryCard[] {
  return cards.flatMap((c) => {
    if ("hidden" in c && c.hidden) return [];
    if (!("suit" in c) || !("rank" in c)) return [];
    return [{ suit: c.suit, rank: c.rank }];
  });
}

function handLabel(h: RoundHandSummary): string {
  if (h.isBlackjack) return "Blackjack";
  if (h.bust) return "Bust";
  if (h.resultCents === 0) return "Push";
  if (h.doubled && h.resultCents > 0) return "Double win";
  if (h.doubled && h.resultCents < 0) return "Double loss";
  if (h.resultCents > 0) return "Win";
  return "Loss";
}

function formatTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(at);
}

function MiniCards({ cards }: { cards: HistoryCard[] }) {
  return (
    <div className="history-cards">
      {cards.map((c, i) => {
        const red = c.suit === "H" || c.suit === "D";
        return (
          <span
            key={`${c.rank}${c.suit}-${i}`}
            className={`history-card${red ? " is-red" : ""}`}
          >
            <span className="history-card-rank">{c.rank}</span>
            <span className="history-card-suit">{SUIT_GLYPH[c.suit]}</span>
          </span>
        );
      })}
    </div>
  );
}

export function RoundHistoryDrawer({ open, entries, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="history-scrim"
            aria-label="Close history"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="history-drawer"
            role="dialog"
            aria-label="Round history"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <div className="history-drawer-head">
              <div>
                <div className="history-drawer-title">Round history</div>
                <div className="history-drawer-sub">
                  Last {entries.length || "—"} · toggle <kbd className="kbd">Z</kbd>
                </div>
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="history-empty muted">No rounds yet this session.</p>
            ) : (
              <ul className="history-list">
                {entries.map((row, i) => (
                  <li key={row.id} className="history-row">
                    <div className="history-row-top">
                      <span className="history-round">#{entries.length - i}</span>
                      <span className="history-time">{formatTime(row.at)}</span>
                      <span
                        className={`history-net${
                          row.netCents > 0
                            ? " is-pos"
                            : row.netCents < 0
                              ? " is-neg"
                              : " is-push"
                        }`}
                      >
                        {row.netCents > 0 ? "+" : ""}
                        {formatCents(row.netCents)}
                      </span>
                    </div>

                    <div className="history-hands">
                      {row.hands.map((h, hi) => (
                        <div key={hi} className="history-hand-block">
                          <div className="history-hand-label">
                            You
                            {row.hands.length > 1 ? ` · hand ${hi + 1}` : ""}
                            <span className="history-hand-tag">{handLabel(h)}</span>
                            <span className="history-hand-value">{h.valueLabel}</span>
                          </div>
                          <MiniCards cards={h.cards} />
                        </div>
                      ))}
                      <div className="history-hand-block">
                        <div className="history-hand-label">
                          Dealer
                          <span className="history-hand-value">
                            {row.dealerValueLabel}
                          </span>
                        </div>
                        <MiniCards cards={row.dealerCards} />
                      </div>
                    </div>

                    <div className="history-row-meta">
                      Bet {formatCents(row.betCents)}
                      {row.insuranceCents != null && row.insuranceCents > 0 ? (
                        <>
                          {" · "}
                          Ins {formatCents(row.insuranceCents)}
                          {row.insuranceNetCents != null ? (
                            <span
                              className={
                                row.insuranceNetCents > 0
                                  ? " is-pos"
                                  : row.insuranceNetCents < 0
                                    ? " is-neg"
                                    : ""
                              }
                            >
                              {" "}
                              (
                              {row.insuranceNetCents > 0 ? "+" : ""}
                              {formatCents(row.insuranceNetCents)})
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
