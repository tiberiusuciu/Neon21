import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatCents } from "./format";

export type WinTier = "small" | "medium" | "big" | "mega" | "jackpot";
export type WinKind = "normal" | "double" | "blackjack";

type Particle = {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  delay: number;
  rotate: number;
};

type ConfettiBit = {
  id: string;
  x: number;
  y: number;
  color: string;
  delay: number;
  drift: number;
  size: number;
};

type Firework = {
  id: string;
  x: number;
  y: number;
  color: string;
  delay: number;
  sparks: { angle: number; dist: number }[];
};

type Burst = {
  id: number;
  amountCents: number;
  tier: WinTier;
  kind: WinKind;
  particles: Particle[];
  confetti: ConfettiBit[];
  fireworks: Firework[];
  labelX: number;
  labelY: number;
};

type SpendFloat = {
  id: number;
  amountCents: number;
  x: number;
  y: number;
};

type PlayWinOpts = {
  kind?: WinKind;
  fromEl?: HTMLElement | null;
};

type CashFxApi = {
  playWin: (amountCents: number, opts?: PlayWinOpts | HTMLElement | null) => void;
  playSpend: (amountCents: number) => void;
  /** Soft yellow flash when a push returns the stake. */
  playPush: () => void;
  walletRef: RefObject<HTMLSpanElement>;
  walletPulse: WinTier | null;
  walletSpend: boolean;
  walletPush: boolean;
  /** Applied to the content plane under the header — never the header itself. */
  shakeClass: string;
};

const CashFxContext = createContext<CashFxApi | null>(null);

const CONFETTI_COLORS = ["#f0c674", "#ffe9a8", "#e8c76a", "#fff6c8", "#d4a84a", "#7cffb2"];
const FIREWORK_COLORS = ["#f0c674", "#ffe9a8", "#ff4d6d", "#7cffb2", "#fff", "#e8c76a"];

export function winTierFor(cents: number): WinTier {
  if (cents >= 50_000) return "mega";
  if (cents >= 15_000) return "big";
  if (cents >= 5_000) return "medium";
  return "small";
}

function bumpTier(tier: WinTier): WinTier {
  if (tier === "small") return "medium";
  if (tier === "medium") return "big";
  if (tier === "big") return "mega";
  return tier;
}

function resolveTier(cents: number, kind: WinKind): WinTier {
  if (kind === "blackjack") return "jackpot";
  const base = winTierFor(cents);
  if (kind === "double") {
    const bumped = bumpTier(base);
    return bumped === "small" || bumped === "medium" ? "big" : bumped;
  }
  return base;
}

function particleCount(tier: WinTier): number {
  if (tier === "jackpot") return 22;
  if (tier === "mega") return 26;
  if (tier === "big") return 18;
  if (tier === "medium") return 12;
  return 7;
}

function confettiCount(tier: WinTier): number {
  if (tier === "jackpot") return 36;
  if (tier === "mega") return 48;
  if (tier === "big") return 28;
  if (tier === "medium") return 14;
  return 0;
}

function reduceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function normalizeOpts(
  opts?: PlayWinOpts | HTMLElement | null
): PlayWinOpts {
  if (opts == null) return {};
  if (opts instanceof HTMLElement) return { fromEl: opts };
  return opts;
}

export function CashFxProvider({ children }: { children: ReactNode }) {
  const walletRef = useRef<HTMLSpanElement>(null);
  const [burst, setBurst] = useState<Burst | null>(null);
  const [spend, setSpend] = useState<SpendFloat | null>(null);
  const [walletPulse, setWalletPulse] = useState<WinTier | null>(null);
  const [walletSpend, setWalletSpend] = useState(false);
  const [walletPush, setWalletPush] = useState(false);
  const [shake, setShake] = useState<"big" | "mega" | "jackpot" | null>(null);
  const seq = useRef(0);
  const clearTimers = useRef<number[]>([]);

  const clearLater = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    clearTimers.current.push(id);
  }, []);

  const playSpend = useCallback(
    (amountCents: number) => {
      if (amountCents <= 0) return;
      const target = walletRef.current?.getBoundingClientRect();
      const x = target
        ? target.left + target.width / 2
        : window.innerWidth - 96;
      const y = target ? target.bottom + 2 : 48;

      seq.current += 1;
      setSpend({ id: seq.current, amountCents, x, y });
      setWalletSpend(true);
      clearLater(() => setWalletSpend(false), 650);
      clearLater(() => setSpend(null), 900);
    },
    [clearLater]
  );

  const playPush = useCallback(() => {
    setWalletPush(true);
    clearLater(() => setWalletPush(false), 1100);
  }, [clearLater]);

  const playWin = useCallback(
    (amountCents: number, opts?: PlayWinOpts | HTMLElement | null) => {
      if (amountCents <= 0) return;

      for (const id of clearTimers.current) window.clearTimeout(id);
      clearTimers.current = [];

      const { kind = "normal", fromEl } = normalizeOpts(opts);
      const tier = resolveTier(amountCents, kind);
      const reduced = reduceMotion();
      const quick = kind === "blackjack" || kind === "double";

      const origin = (
        fromEl ?? document.querySelector(".seat-you")
      )?.getBoundingClientRect();
      const target = walletRef.current?.getBoundingClientRect();

      const ox = origin
        ? origin.left + origin.width / 2
        : window.innerWidth / 2;
      const oy = origin
        ? origin.top + origin.height * 0.35
        : window.innerHeight * 0.55;
      const tx = target
        ? target.left + target.width / 2
        : window.innerWidth - 96;
      const ty = target
        ? target.top + target.height / 2
        : 28;

      const n = reduced ? 3 : particleCount(tier);
      const particles: Particle[] = Array.from({ length: n }, (_, i) => {
        const scatter = reduced ? 8 : 28 + Math.random() * 36;
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        return {
          id: `p-${seq.current}-${i}`,
          x: ox + Math.cos(angle) * scatter * 0.35,
          y: oy + Math.sin(angle) * scatter * 0.25,
          tx: tx + (Math.random() - 0.5) * 10,
          ty: ty + (Math.random() - 0.5) * 6,
          delay: i * (quick ? 0.016 : 0.028),
          rotate: (Math.random() - 0.5) * 220,
        };
      });

      const cn = reduced ? 0 : confettiCount(tier);
      const confetti: ConfettiBit[] = Array.from({ length: cn }, (_, i) => ({
        id: `c-${seq.current}-${i}`,
        x: ox + (Math.random() - 0.5) * (tier === "jackpot" ? 220 : 160),
        y: oy - 20 - Math.random() * 50,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        delay: Math.random() * (quick ? 0.12 : 0.25),
        drift: (Math.random() - 0.5) * 140,
        size: 5 + Math.random() * 7,
      }));

      const fireworks: Firework[] =
        reduced || (tier !== "jackpot" && kind !== "double")
          ? []
          : Array.from(
              { length: tier === "jackpot" ? 5 : 3 },
              (_, i) => {
                const fx =
                  window.innerWidth * (0.18 + Math.random() * 0.64);
                const fy =
                  window.innerHeight * (0.18 + Math.random() * 0.35);
                const sparks = Array.from({ length: 10 }, (__, s) => ({
                  angle: (Math.PI * 2 * s) / 10 + Math.random() * 0.3,
                  dist: 36 + Math.random() * 48,
                }));
                return {
                  id: `fw-${seq.current}-${i}`,
                  x: fx,
                  y: fy,
                  color: FIREWORK_COLORS[i % FIREWORK_COLORS.length]!,
                  delay: i * 0.06,
                  sparks,
                };
              }
            );

      seq.current += 1;
      setBurst({
        id: seq.current,
        amountCents,
        tier,
        kind,
        particles,
        confetti,
        fireworks,
        labelX: ox,
        labelY: oy,
      });

      const shakeTier: WinTier | null =
        tier === "jackpot" || tier === "mega" || tier === "big"
          ? tier
          : null;
      if (shakeTier && !reduced) {
        const shakeKey =
          shakeTier === "jackpot"
            ? "jackpot"
            : shakeTier === "mega"
              ? "mega"
              : "big";
        setShake(shakeKey);
        const shakeMs =
          shakeKey === "jackpot" ? 480 : shakeKey === "mega" ? 560 : 380;
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate(
            shakeKey === "jackpot"
              ? [28, 36, 28, 36, 55]
              : shakeKey === "mega"
                ? [22, 30, 22, 30, 22]
                : [18, 28, 18]
          );
        }
        clearLater(() => setShake(null), shakeMs);
      }

      const flightMs = reduced ? 360 : quick ? 520 : 720;
      clearLater(() => {
        setWalletPulse(tier);
        clearLater(
          () => setWalletPulse(null),
          tier === "jackpot" ? 700 : tier === "mega" ? 1100 : 800
        );
      }, flightMs);

      clearLater(() => setBurst(null), flightMs + (quick ? 280 : 480));
    },
    [clearLater]
  );

  const api = useMemo(
    () => ({
      playWin,
      playSpend,
      playPush,
      walletRef,
      walletPulse,
      walletSpend,
      walletPush,
      shakeClass: shake ? `cash-fx-shake-${shake}` : "",
    }),
    [playWin, playSpend, playPush, walletPulse, walletSpend, walletPush, shake]
  );

  return (
    <CashFxContext.Provider value={api}>
      <div className="cash-fx-root">{children}</div>
      <CashFxOverlay burst={burst} spend={spend} />
    </CashFxContext.Provider>
  );
}

export function useCashFx(): CashFxApi {
  const ctx = useContext(CashFxContext);
  if (!ctx) throw new Error("useCashFx requires CashFxProvider");
  return ctx;
}

function CashFxOverlay({
  burst,
  spend,
}: {
  burst: Burst | null;
  spend: SpendFloat | null;
}) {
  return (
    <>
      <AnimatePresence>
        {spend && (
          <motion.div
            key={`spend-${spend.id}`}
            className="cash-fx-spend"
            style={{ left: spend.x, top: spend.y }}
            initial={{ opacity: 0, y: -4, scale: 0.92 }}
            animate={{ opacity: 1, y: 18, scale: 1 }}
            exit={{ opacity: 0, y: 32 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden
          >
            −{formatCents(spend.amountCents)}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {burst && (
          <div
            className={`cash-fx-layer cash-fx-${burst.tier} cash-fx-kind-${burst.kind}`}
            aria-hidden
          >
            <motion.div
              className="cash-fx-label"
              style={{ left: burst.labelX, top: burst.labelY }}
              initial={{ opacity: 0, y: 8, scale: 0.85 }}
              animate={{
                opacity: 1,
                y: -40,
                scale:
                  burst.tier === "jackpot"
                    ? 1.4
                    : burst.kind === "double"
                      ? 1.25
                      : burst.tier === "mega"
                        ? 1.3
                        : 1.1,
              }}
              exit={{ opacity: 0, y: -56 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              {burst.kind === "blackjack" && (
                <span className="cash-fx-badge">BLACKJACK</span>
              )}
              {burst.kind === "double" && (
                <span className="cash-fx-badge cash-fx-badge-double">
                  DOUBLE
                </span>
              )}
              <span>+{formatCents(burst.amountCents)}</span>
            </motion.div>

            {burst.fireworks.map((fw) => (
              <span
                key={fw.id}
                className="cash-fx-firework"
                style={{
                  left: fw.x,
                  top: fw.y,
                  ["--fw-delay" as string]: `${fw.delay}s`,
                  ["--fw-color" as string]: fw.color,
                }}
              >
                {fw.sparks.map((s, i) => (
                  <i
                    key={i}
                    className="cash-fx-spark"
                    style={{
                      ["--spark-x" as string]: `${Math.cos(s.angle) * s.dist}px`,
                      ["--spark-y" as string]: `${Math.sin(s.angle) * s.dist}px`,
                    }}
                  />
                ))}
              </span>
            ))}

            {burst.confetti.map((c) => (
              <motion.span
                key={c.id}
                className="cash-fx-confetti"
                style={{
                  left: c.x,
                  top: c.y,
                  width: c.size,
                  height: c.size * 0.55,
                  background: c.color,
                }}
                initial={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
                animate={{
                  opacity: 0,
                  y: 100 + Math.random() * 120,
                  x: c.drift,
                  rotate: 180 + Math.random() * 240,
                }}
                transition={{
                  duration: 0.55 + Math.random() * 0.25,
                  delay: c.delay,
                  ease: "easeOut",
                }}
              />
            ))}

            {burst.particles.map((p) => (
              <motion.span
                key={p.id}
                className="cash-fx-chip"
                style={{ left: p.x, top: p.y }}
                initial={{ opacity: 1, scale: 0.7, x: 0, y: 0, rotate: 0 }}
                animate={{
                  opacity: [1, 1, 0],
                  scale: [0.7, 1.05, 0.55],
                  x: p.tx - p.x,
                  y: p.ty - p.y,
                  rotate: p.rotate,
                }}
                transition={{
                  duration: 0.55,
                  delay: p.delay,
                  ease: [0.4, 0.05, 0.2, 1],
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
