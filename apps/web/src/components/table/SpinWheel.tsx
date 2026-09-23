import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  JACKPOT_WHEEL,
  type TableSpinState,
  type WheelTile,
} from "@neon21/shared";
import { formatCents } from "../../lib/format";

type Props = {
  spin: TableSpinState;
  isSpinner: boolean;
  onSpin: () => void;
  onCancel?: () => void;
  onReveal?: (spin: TableSpinState) => void;
  onAnimDone?: () => void;
};

const SEG = 360 / JACKPOT_WHEEL.length;
const SPIN_MS = 5800;
const SPIN_DONE_FALLBACK_MS = 6400;
const OFFER_URGENT_MS = 5_000;
const CX = 50;
const CY = 50;
const R = 48;
const EDGE_PARTICLES = 18;
const TIMER_R = 56;
const TIMER_C = 2 * Math.PI * TIMER_R;

/** Pearlescent opal stripes — every land feels precious. */
const PEARL = [
  "url(#seat-spin-pearl-a)",
  "url(#seat-spin-pearl-b)",
  "url(#seat-spin-pearl-c)",
  "url(#seat-spin-pearl-d)",
] as const;

function tileFill(t: WheelTile, index: number): string {
  if (index === 0 || (t.kind === "percent" && t.pctBps >= 10_000)) {
    return "url(#seat-spin-jackpot-grad)";
  }
  if (t.kind === "flat") return "url(#seat-spin-pearl-dud)";
  if (t.pctBps >= 2_000) return "url(#seat-spin-pearl-rare)";
  if (t.pctBps >= 1_000) return "url(#seat-spin-pearl-high)";
  if (t.pctBps >= 200) return "url(#seat-spin-pearl-mid)";
  if (t.pctBps >= 100) return "url(#seat-spin-pearl-one)";
  return PEARL[Math.floor(index / 2) % PEARL.length]!;
}

function isOnePercent(t: WheelTile): boolean {
  return t.kind === "percent" && t.pctBps === 100;
}

/** Merge consecutive same-fill tiles into readable bands (odds stay 100 tiles). */
function buildBands() {
  const bands: {
    start: number;
    end: number;
    fill: string;
    jackpot: boolean;
    onePct: boolean;
  }[] = [];
  for (let i = 0; i < JACKPOT_WHEEL.length; i++) {
    const t = JACKPOT_WHEEL[i]!;
    const fill = tileFill(t, i);
    const last = bands[bands.length - 1];
    if (last && last.fill === fill) {
      last.end = i + 1;
    } else {
      bands.push({
        start: i,
        end: i + 1,
        fill,
        jackpot: i === 0,
        onePct: isOnePercent(t),
      });
    }
  }
  return bands;
}

function bandPath(start: number, end: number): string {
  const span = end - start;
  const a0 = ((-90 + start * SEG) * Math.PI) / 180;
  const a1 = ((-90 + end * SEG) * Math.PI) / 180;
  const x0 = CX + R * Math.cos(a0);
  const y0 = CY + R * Math.sin(a0);
  const x1 = CX + R * Math.cos(a1);
  const y1 = CY + R * Math.sin(a1);
  const large = span * SEG > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
}

export function SpinWheel({
  spin,
  isSpinner,
  onSpin,
  onCancel,
  onReveal,
  onAnimDone,
}: Props) {
  const [rot, setRot] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [offerLeftMs, setOfferLeftMs] = useState<number | null>(null);
  const spun = useRef(false);
  const doneEmitted = useRef(false);
  const discRef = useRef<HTMLDivElement>(null);
  const revealKey = useRef<string | null>(null);
  const offerSpanRef = useRef<number | null>(null);
  const onAnimDoneRef = useRef(onAnimDone);
  const onRevealRef = useRef(onReveal);
  onAnimDoneRef.current = onAnimDone;
  onRevealRef.current = onReveal;

  useEffect(() => {
    if (spin.phase !== "offer" || spin.offerEndsAt == null) {
      setOfferLeftMs(null);
      offerSpanRef.current = null;
      return;
    }
    if (offerSpanRef.current == null) {
      offerSpanRef.current = Math.max(1, spin.offerEndsAt - Date.now());
    }
    const tick = () => {
      setOfferLeftMs(Math.max(0, spin.offerEndsAt! - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [spin.phase, spin.offerEndsAt, spin.userId]);

  const finishAnim = () => {
    if (doneEmitted.current) return;
    doneEmitted.current = true;
    setAnimDone(true);
    setIntensity(0);
    onAnimDoneRef.current?.();
  };

  useEffect(() => {
    if (spin.phase !== "result" || spin.tileIndex == null) return;
    if (spun.current) return;
    spun.current = true;
    doneEmitted.current = false;
    setAnimDone(false);
    const target = spin.tileIndex;
    const final = 360 * 8 + (270 - (target * SEG + SEG / 2));
    requestAnimationFrame(() => setRot(final));

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SPIN_MS);
      const peak =
        t < 0.7
          ? Math.sin((t / 0.7) * Math.PI)
          : Math.max(0, 1 - (t - 0.7) / 0.3);
      setIntensity(0.35 + peak * 0.65);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setIntensity(0.2);
    };
    raf = requestAnimationFrame(tick);

    const fallback = window.setTimeout(finishAnim, SPIN_DONE_FALLBACK_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [spin.phase, spin.tileIndex, spin.userId]);

  useEffect(() => {
    const el = discRef.current;
    if (!el || spin.phase !== "result" || spin.tileIndex == null) return;
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (e.propertyName !== "transform") return;
      finishAnim();
    };
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, [spin.phase, spin.tileIndex, spin.userId, rot]);

  useEffect(() => {
    if (!animDone || spin.payoutCents == null) return;
    const key = `${spin.tileIndex}-${spin.payoutCents}-${spin.potBeforeCents}`;
    if (revealKey.current === key) return;
    revealKey.current = key;
    onRevealRef.current?.(spin);
  }, [animDone, spin]);

  useEffect(() => {
    if (spin.phase === "offer") {
      spun.current = false;
      doneEmitted.current = false;
      revealKey.current = null;
      setRot(0);
      setAnimDone(false);
      setIntensity(0.15);
    }
  }, [spin.phase, spin.userId]);

  const wedges = useMemo(() => {
    const bands = buildBands();
    return bands.map((b) => {
      const span = b.end - b.start;
      const stroke =
        span >= 3 ? "rgba(200, 220, 255, 0.22)" : "rgba(160, 180, 220, 0.1)";
      const strokeWidth = span >= 3 ? 0.22 : 0.07;
      const wedgeClass = b.jackpot
        ? "seat-spin-wedge-jackpot"
        : b.onePct
          ? "seat-spin-wedge-one"
          : "seat-spin-wedge";
      return (
        <path
          key={`${b.start}-${b.end}`}
          d={bandPath(b.start, b.end)}
          fill={b.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          className={wedgeClass}
        />
      );
    });
  }, []);

  const spinning = spin.phase === "result" && !animDone;
  const showResult =
    spin.phase === "result" && animDone && spin.payoutCents != null;
  const emitHot = spinning || spin.phase === "offer";
  const offerUrgent =
    spin.phase === "offer" &&
    offerLeftMs != null &&
    offerLeftMs <= OFFER_URGENT_MS;
  const offerProgress =
    offerLeftMs != null && offerSpanRef.current
      ? Math.min(1, Math.max(0, offerLeftMs / offerSpanRef.current))
      : 1;
  const offerSeconds =
    offerLeftMs != null ? Math.ceil(offerLeftMs / 1000) : null;

  return (
    <div
      className={[
        "seat-spin-wheel",
        spinning ? "is-spinning" : "",
        showResult ? "is-revealed" : "",
        spin.phase === "offer" ? "is-offer" : "",
        offerUrgent ? "is-offer-urgent" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--spin-i" as string]: String(intensity) } as CSSProperties}
    >
      <div className="seat-spin-bloom" aria-hidden />
      <div className="seat-spin-stage">
        {spin.phase === "offer" && (
          <svg
            className="seat-spin-timer"
            viewBox="0 0 120 120"
            aria-hidden
          >
            <circle
              className="seat-spin-timer-track"
              cx="60"
              cy="60"
              r={TIMER_R}
              fill="none"
            />
            <circle
              className="seat-spin-timer-fill"
              cx="60"
              cy="60"
              r={TIMER_R}
              fill="none"
              strokeDasharray={TIMER_C}
              strokeDashoffset={TIMER_C * (1 - offerProgress)}
              transform="rotate(-90 60 60)"
            />
          </svg>
        )}
        <div className="seat-spin-pointer" aria-hidden />
        <div
          className={`seat-spin-edge-particles${emitHot ? " is-hot" : ""}`}
          aria-hidden
        >
          {Array.from({ length: EDGE_PARTICLES }, (_, i) => (
            <i
              key={i}
              style={
                {
                  ["--a"]: `${(i / EDGE_PARTICLES) * 360}deg`,
                  ["--d"]: `${18 + (i % 4) * 7}px`,
                  ["--s"]: `${1.4 + (i % 3) * 0.7}px`,
                  ["--dur"]: `${1.4 + (i % 5) * 0.28}s`,
                  ["--del"]: `${(i * 0.11) % 1.6}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div
          ref={discRef}
          className="seat-spin-disc"
          style={{
            transform: `rotate(${rot}deg)`,
            transitionDuration: spinning || rot > 0 ? `${SPIN_MS}ms` : "0ms",
            transitionTimingFunction: "cubic-bezier(0.08, 0.82, 0.12, 1)",
          }}
        >
          <svg className="seat-spin-svg" viewBox="0 0 100 100" aria-hidden>
            <defs>
              <radialGradient
                id="seat-spin-jackpot-grad"
                cx="38%"
                cy="32%"
                r="78%"
              >
                <stop offset="0%" stopColor="#a8ffe8" />
                <stop offset="28%" stopColor="#3ec9a8" />
                <stop offset="58%" stopColor="#2a8fc4" />
                <stop offset="100%" stopColor="#1a4a7a" />
              </radialGradient>
              <linearGradient id="seat-spin-pearl-a" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6a6280" />
                <stop offset="45%" stopColor="#3a3450" />
                <stop offset="100%" stopColor="#1e2438" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-b" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#7a5a68" />
                <stop offset="50%" stopColor="#4a3040" />
                <stop offset="100%" stopColor="#2a2038" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-c" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4a7068" />
                <stop offset="48%" stopColor="#2a4848" />
                <stop offset="100%" stopColor="#1e3048" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-d" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#6a6050" />
                <stop offset="55%" stopColor="#403828" />
                <stop offset="100%" stopColor="#2a2438" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-one" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e8d090" />
                <stop offset="40%" stopColor="#a88840" />
                <stop offset="100%" stopColor="#5a4820" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-mid" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6a9888" />
                <stop offset="50%" stopColor="#2a5848" />
                <stop offset="100%" stopColor="#1a3850" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-high" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a08098" />
                <stop offset="45%" stopColor="#583850" />
                <stop offset="100%" stopColor="#302048" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-rare" x1="20%" y1="0%" x2="80%" y2="100%">
                <stop offset="0%" stopColor="#d0b878" />
                <stop offset="35%" stopColor="#886848" />
                <stop offset="70%" stopColor="#684060" />
                <stop offset="100%" stopColor="#283858" />
              </linearGradient>
              <linearGradient id="seat-spin-pearl-dud" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#586070" />
                <stop offset="55%" stopColor="#303848" />
                <stop offset="100%" stopColor="#1a202c" />
              </linearGradient>
            </defs>
            <circle cx={CX} cy={CY} r={R} fill="#16141f" />
            {wedges}
          </svg>
          <div className="seat-spin-jackpot-fx" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ ["--i" as string]: i }} />
            ))}
          </div>
          <div className="seat-spin-disc-sheen" aria-hidden />
        </div>
        <div className="seat-spin-hub" aria-hidden />
      </div>
      {spin.phase === "offer" && (
        <div
          className={`seat-spin-offer-meter${offerUrgent ? " is-urgent" : ""}`}
          style={
            {
              ["--offer-p"]: String(offerProgress),
            } as CSSProperties
          }
          aria-hidden
        >
          <div className="seat-spin-offer-meter-fill" />
        </div>
      )}
      {spin.phase === "offer" && isSpinner && (
        <div className="seat-spin-offer-actions">
          <button
            type="button"
            className="btn btn-sm seat-spin-go"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSpin();
            }}
          >
            Spin
            {offerSeconds != null && (
              <span className="seat-spin-go-countdown">{offerSeconds}s</span>
            )}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn btn-sm seat-spin-cancel"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
              }}
              title="Cancel and return to betting"
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {spin.phase === "offer" && !isSpinner && (
        <p className="seat-spin-wait muted">
          Waiting…
          {offerSeconds != null ? ` ${offerSeconds}s` : ""}
        </p>
      )}
      {showResult && spin.payoutCents != null && (
        <div className="seat-spin-payout">{formatCents(spin.payoutCents)}</div>
      )}
      {showResult && spin.label && (
        <div className="seat-spin-label">{spin.label}</div>
      )}
    </div>
  );
}
