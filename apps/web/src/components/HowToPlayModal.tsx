import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  GOLDEN_HANDS_PER_HANDS,
  GOLDEN_HOUR_REBATE_CAP_CENTS,
  GOLDEN_HAND_MAX_BET_CENTS,
  MIN_BET_CENTS,
  type Rank,
  type Suit,
} from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useGameSocket } from "../lib/SocketProvider";
import { formatCents } from "../lib/format";
import { WheelFace } from "./table/SpinWheel";

export type HowToPlayTab = "basics" | "heist" | "golden" | "jackpot";

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab?: HowToPlayTab;
};

const TABS: { id: HowToPlayTab; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "heist", label: "Heist" },
  { id: "golden", label: "Golden" },
  { id: "jackpot", label: "Jackpot" },
];

const SUIT_GLYPH: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

const DEMO_BET = 10_000;
const DEMO_INS = DEMO_BET / 2;

function GuideCard({
  rank,
  suit,
  faceDown,
}: {
  rank?: Rank;
  suit?: Suit;
  faceDown?: boolean;
}) {
  if (faceDown) {
    return <div className="card card-back guide-card" aria-hidden />;
  }
  const red = suit === "H" || suit === "D";
  return (
    <div
      className={`card card-face guide-card${red ? " card-red" : ""}`}
      aria-hidden
    >
      <span className="card-rank">{rank}</span>
      <span className="card-suit">{SUIT_GLYPH[suit!]}</span>
    </div>
  );
}

function CardRow({
  cards,
  badge,
}: {
  cards: ({ rank: Rank; suit: Suit } | { faceDown: true })[];
  badge?: string;
}) {
  return (
    <div className="howto-card-row">
      <div
        className="howto-card-fan"
        style={{ ["--n" as string]: cards.length }}
      >
        {cards.map((c, i) => (
          <div
            key={"faceDown" in c ? `back-${i}` : `${c.rank}${c.suit}${i}`}
            className="howto-card-slot"
            style={{ ["--i" as string]: i }}
          >
            {"faceDown" in c ? (
              <GuideCard faceDown />
            ) : (
              <GuideCard rank={c.rank} suit={c.suit} />
            )}
          </div>
        ))}
      </div>
      {badge && <span className="howto-combo-badge">{badge}</span>}
    </div>
  );
}

function PipDemo({ lit }: { lit: number }) {
  return (
    <div className="howto-pip-row" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`seat-bj-pip${i < lit ? " is-lit" : ""}`}
        />
      ))}
      <span className="howto-pip-caption">{lit} / 5</span>
    </div>
  );
}

function MiniWheelDemo({ potCents }: { potCents: number | null }) {
  return (
    <div className="howto-wheel-demo" aria-hidden>
      <div className="howto-pot-pill">
        <span className="howto-pot-label">Pot</span>
        <span className="howto-pot-value">
          {potCents != null ? formatCents(potCents) : "—"}
        </span>
      </div>
      <div className="howto-wheel-mini">
        <div className="howto-wheel-pointer" />
        <div className="howto-wheel-disc">
          <WheelFace prefix="howto-wheel" />
          <div className="seat-spin-disc-sheen" />
        </div>
        <div className="howto-wheel-hub" />
      </div>
      <p className="howto-visual-sub howto-wheel-caption">
        Spins land on a tile for a % or flat slice of this pot
      </p>
    </div>
  );
}

export function HowToPlayModal({ open, onClose, initialTab = "basics" }: Props) {
  const { token } = useAuth();
  const { goldenHour } = useGameSocket();
  const [tab, setTab] = useState<HowToPlayTab>(initialTab);
  const [potCents, setPotCents] = useState<number | null>(null);
  const handsPer =
    goldenHour?.goldenHandsPerHands ?? GOLDEN_HANDS_PER_HANDS;

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    api
      .jackpot(token)
      .then((res) => {
        if (!cancelled) setPotCents(res.takeCents);
      })
      .catch(() => {
        if (!cancelled) setPotCents(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  const content = useMemo(() => {
    if (tab === "basics") {
      return (
        <>
          <p className="howto-lead">
            Classic blackjack with a house jackpot, timed Golden Hour
            heists, and a few Neon21 twists.
          </p>
          <ul className="howto-list">
            <li>
              Min bet <strong>{formatCents(MIN_BET_CENTS)}</strong> · dealer
              hits soft 17 · blackjack pays <strong>3:2</strong>
            </li>
            <li>
              Hit, hold, double, or split from the action bar — or queue a
              move before your turn
            </li>
          </ul>
          <div className="howto-visual-block">
            <p className="howto-visual-label">Natural blackjack</p>
            <CardRow
              cards={[
                { rank: "A", suit: "S" },
                { rank: "K", suit: "S" },
              ]}
              badge="3:2"
            />
          </div>

          <div className="howto-visual-block">
            <p className="howto-visual-label">Insurance</p>
            <p className="howto-visual-sub">
              Offered only when the dealer&apos;s upcard is an Ace. It is a{" "}
              <strong>side bet</strong> — separate from your main hand.
            </p>
            <div className="howto-ins-setup">
              <div>
                <p className="howto-ins-role">Dealer</p>
                <CardRow
                  cards={[{ rank: "A", suit: "H" }, { faceDown: true }]}
                />
              </div>
              <div className="howto-ins-stakes">
                <div className="howto-ins-chip">
                  <span>Main bet</span>
                  <strong>{formatCents(DEMO_BET)}</strong>
                </div>
                <div className="howto-ins-chip is-ins">
                  <span>Insurance</span>
                  <strong>{formatCents(DEMO_INS)}</strong>
                </div>
              </div>
            </div>
            <p className="howto-visual-sub">
              Cost is always <strong>half</strong> your main bet. Pays{" "}
              <strong>2:1</strong> only if the hole card makes dealer
              blackjack.
            </p>

            <div className="howto-ins-outcomes">
              <div className="howto-ins-outcome is-win">
                <p className="howto-ins-outcome-title">Dealer has blackjack</p>
                <CardRow
                  cards={[
                    { rank: "A", suit: "H" },
                    { rank: "K", suit: "S" },
                  ]}
                  badge="BJ"
                />
                <ul className="howto-ins-math">
                  <li>
                    Insurance pays{" "}
                    <strong>{formatCents(DEMO_INS * 3)}</strong> back
                    (stake + 2:1)
                  </li>
                  <li>
                    Main bet loses{" "}
                    <strong>{formatCents(DEMO_BET)}</strong>
                  </li>
                  <li className="howto-ins-net">
                    Net ≈ <strong>even</strong> — insurance offsets the main
                    loss
                  </li>
                </ul>
              </div>
              <div className="howto-ins-outcome is-lose">
                <p className="howto-ins-outcome-title">No dealer blackjack</p>
                <CardRow
                  cards={[
                    { rank: "A", suit: "H" },
                    { rank: "9", suit: "C" },
                  ]}
                  badge="No BJ"
                />
                <ul className="howto-ins-math">
                  <li>
                    Insurance lost —{" "}
                    <strong>−{formatCents(DEMO_INS)}</strong>
                  </li>
                  <li>Main hand continues as normal</li>
                  <li className="howto-ins-net">
                    Insurance does <strong>not</strong> pay on a strong
                    player hand — only on dealer BJ
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      );
    }
    if (tab === "heist") {
      return (
        <>
          <p className="howto-lead">
            Golden Hour is the heist — a live one-hour window when the
            vault is vulnerable and special hand bonuses turn on for
            everyone. Armed Golden Hands unlock the same combos anytime.
          </p>
          <ul className="howto-list">
            <li>
              Jackpot take on losses jumps from <strong>5%</strong> to{" "}
              <strong>10%</strong> (grows twice as fast)
            </li>
            <li>
              You bank <strong>10%</strong> of every lost bet as a rebate —
              wins never take it back, capped at{" "}
              <strong>{formatCents(GOLDEN_HOUR_REBATE_CAP_CENTS)}</strong>,
              paid when the heist ends
            </li>
            <li>
              Watch the toolbar countdown for the next heist or the live
              timer while it&apos;s on
            </li>
          </ul>

          <div className="howto-visual-block">
            <p className="howto-visual-label">Suited pair · win multiplier</p>
            <p className="howto-visual-sub">
              Same rank + same suit on the deal. Hit or double clears it.
            </p>
            <div className="howto-combo-grid">
              <CardRow
                cards={[
                  { rank: "A", suit: "S" },
                  { rank: "A", suit: "S" },
                ]}
                badge="♠ 3×"
              />
              <CardRow
                cards={[
                  { rank: "Q", suit: "H" },
                  { rank: "Q", suit: "H" },
                ]}
                badge="♥ 2.5×"
              />
              <CardRow
                cards={[
                  { rank: "9", suit: "C" },
                  { rank: "9", suit: "C" },
                ]}
                badge="♣ 2×"
              />
              <CardRow
                cards={[
                  { rank: "7", suit: "D" },
                  { rank: "7", suit: "D" },
                ]}
                badge="♦ 1.5×"
              />
            </div>
          </div>

          <div className="howto-visual-block">
            <p className="howto-visual-label">Triple card · instant bonus</p>
            <p className="howto-visual-sub">
              Three of a kind on hit/double (ranks 2–7, not from a split).
              Pays <strong>$1,000 × rank</strong>.
            </p>
            <CardRow
              cards={[
                { rank: "7", suit: "H" },
                { rank: "7", suit: "S" },
                { rank: "7", suit: "D" },
              ]}
              badge="+$7,000"
            />
          </div>

          <div className="howto-visual-block">
            <p className="howto-visual-label">5-Card Charlie</p>
            <p className="howto-visual-sub">
              Five cards without busting auto-wins 1:1 and awards a spin
              voucher.
            </p>
            <CardRow
              cards={[
                { rank: "2", suit: "C" },
                { rank: "3", suit: "H" },
                { rank: "4", suit: "S" },
                { rank: "5", suit: "D" },
                { rank: "A", suit: "C" },
              ]}
              badge="Win + ticket"
            />
          </div>
        </>
      );
    }
    if (tab === "golden") {
      return (
        <>
          <p className="howto-lead">
            Golden Hands are spendable tokens — earned during the heist,
            usable any time you&apos;re betting. Outside the heist they
            unlock the same special combos as Golden Hour.
          </p>
          <ul className="howto-list">
            <li>
              Earn <strong>1 Golden Hand</strong> every{" "}
              <strong>{handsPer}</strong> hands you play during Golden Hour
              (toolbar shows <strong>GH X/{handsPer}</strong>)
            </li>
            <li>
              Arm before the deal: wins take <strong>1.5× profit</strong>,
              losses refund half — max bet{" "}
              <strong>{formatCents(GOLDEN_HAND_MAX_BET_CENTS)}</strong>
            </li>
            <li>
              Suited-pair, triple-card, and 5-Card Charlie bonuses apply —
              even outside the heist. Losses still send{" "}
              <strong>10%</strong> to the pot
            </li>
            <li>Stacks with suited-pair multipliers on wins</li>
          </ul>
          <div className="howto-visual-block howto-golden-callout">
            <span className="howto-golden-pill">Golden ON</span>
            <p>
              Your seat lights up while a Golden Hand is armed or in play —
              everyone at the table can see it.
            </p>
          </div>
        </>
      );
    }
    return (
      <>
        <p className="howto-lead">
          Natural blackjacks fill your seat dots. Fill the meter to earn
          spin vouchers for the house jackpot wheel.
        </p>
        <ul className="howto-list">
          <li>
            <strong>5 blackjacks in 24 hours</strong> → 1 spin voucher
            (tickets stack)
          </li>
          <li>
            During betting with no bet down, spend a voucher to spin —
            payouts are a slice or flat amount of the live pot
          </li>
          <li>
            Landing the <strong>100%</strong> tile pays the entire available
            pot; the <strong>3 GH</strong> tile grants three Golden Hands
            (1% chance, does not drain the pot)
          </li>
        </ul>

        <div className="howto-visual-block">
          <p className="howto-visual-label">House pot &amp; wheel</p>
          <p className="howto-visual-sub">
            A share of every loss feeds the pot. Spin vouchers claim a tile
            from that pool.
          </p>
          <MiniWheelDemo potCents={potCents} />
        </div>

        <div className="howto-visual-block">
          <p className="howto-visual-label">Blackjack dots</p>
          <PipDemo lit={3} />
          <p className="howto-visual-sub">
            Three lit means two more naturals unlock a voucher.
          </p>
        </div>
        <div className="howto-visual-block">
          <p className="howto-visual-label">Natural</p>
          <CardRow
            cards={[
              { rank: "A", suit: "H" },
              { rank: "J", suit: "D" },
            ]}
            badge="+1 pip"
          />
        </div>
      </>
    );
  }, [tab, handsPer, potCents]);

  return (
    <AnimatePresence>
      {open && (
        <div className="howto-modal-root">
          <motion.button
            type="button"
            className="howto-modal-scrim"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="howto-modal"
            role="dialog"
            aria-labelledby="howto-modal-title"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22 }}
          >
            <header className="howto-modal-header">
              <div>
                <p className="howto-modal-eyebrow">Neon21</p>
                <h2 id="howto-modal-title" className="howto-modal-title">
                  How to play
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost howto-modal-close"
                onClick={onClose}
              >
                Close
              </button>
            </header>

            <div className="segmented howto-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? "active" : undefined}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="howto-modal-body" key={tab}>
              {content}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
