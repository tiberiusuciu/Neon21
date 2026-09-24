import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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

const PEARL_KEYS = ["a", "b", "c", "d"] as const;

function tileFill(t: WheelTile, index: number, p: string): string {
  if (index === 0 || (t.kind === "percent" && t.pctBps >= 10_000)) {
    return `url(#${p}-jackpot-grad)`;
  }
  if (t.kind === "flat") return `url(#${p}-pearl-dud)`;
  if (t.pctBps >= 2_000) return `url(#${p}-pearl-rare)`;
  if (t.pctBps >= 1_000) return `url(#${p}-pearl-high)`;
  if (t.pctBps >= 200) return `url(#${p}-pearl-mid)`;
  if (t.pctBps >= 100) return `url(#${p}-pearl-one)`;
  return `url(#${p}-pearl-${PEARL_KEYS[Math.floor(index / 2) % PEARL_KEYS.length]!})`;
}

function isOnePercent(t: WheelTile): boolean {
  return t.kind === "percent" && t.pctBps === 100;
}

/** Merge consecutive same-fill tiles into readable bands (odds stay 100 tiles). */
function buildBands(p: string) {
  const bands: {
    start: number;
    end: number;
    fill: string;
    jackpot: boolean;
    onePct: boolean;
    label: string | null;
  }[] = [];
  for (let i = 0; i < JACKPOT_WHEEL.length; i++) {
    const t = JACKPOT_WHEEL[i]!;
    const fill = tileFill(t, i, p);
    const last = bands[bands.length - 1];
    if (last && last.fill === fill) {
      last.end = i + 1;
      if (last.label != null && last.label !== t.label) last.label = null;
    } else {
      bands.push({
        start: i,
        end: i + 1,
        fill,
        jackpot: i === 0,
        onePct: isOnePercent(t),
        label: t.label,
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

const LABEL_R = 37;
/** Min gap between loupe label centers (tiles). ~9° keeps short strings from colliding. */
const LABEL_MIN_GAP_TILES = 2.5;
/** Repeat labels along wide bands so the loupe always sees one before the band midpoint. */
const LABEL_REPEAT_STEP = 3;

function bandLabelAt(tileMid: number) {
  const midDeg = -90 + tileMid * SEG;
  const a = (midDeg * Math.PI) / 180;
  return {
    x: CX + LABEL_R * Math.cos(a),
    y: CY + LABEL_R * Math.sin(a),
    rot: midDeg + 90,
    tileMid,
  };
}

/** Centers (fractional tile index) for labels along a band. */
function loupeLabelSlots(start: number, end: number): number[] {
  const span = end - start;
  if (span <= 3) return [(start + end) / 2];

  const slots: number[] = [];
  const last = end - 0.5;
  for (let t = start + 0.5; t < end; t += LABEL_REPEAT_STEP) {
    slots.push(Math.min(t, last));
  }
  const prev = slots[slots.length - 1];
  if (prev == null || last - prev > LABEL_REPEAT_STEP * 0.55) {
    slots.push(last);
  }
  return slots;
}

function loupeLabelPriority(b: {
  jackpot: boolean;
  onePct: boolean;
  start: number;
  end: number;
}): number {
  if (b.jackpot) return 100;
  const t = JACKPOT_WHEEL[b.start]!;
  if (t.kind === "percent" && t.pctBps >= 2_500) return 90;
  if (b.onePct) return 75;
  if (t.kind === "flat") return 65;
  if (t.kind === "percent" && t.pctBps >= 500) return 50;
  if (b.end - b.start >= 2) return 40;
  if (t.kind === "percent" && t.pctBps >= 200) return 25;
  return 10;
}

function shouldOfferLoupeLabel(b: {
  label: string | null;
  jackpot: boolean;
  onePct: boolean;
  start: number;
  end: number;
}): boolean {
  if (!b.label) return false;
  if (b.jackpot || b.onePct || b.end - b.start >= 2) return true;
  const t = JACKPOT_WHEEL[b.start]!;
  if (t.kind === "flat") return true;
  return t.kind === "percent" && t.pctBps >= 200;
}

function WheelFace({
  prefix,
  showLabels = false,
}: {
  prefix: string;
  showLabels?: boolean;
}) {
  const { wedges, labels } = useMemo(() => {
    const bands = buildBands(prefix);
    const wedges = bands.map((b) => {
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

    let labels: ReactNode = null;
    if (showLabels) {
      type Cand = {
        key: string;
        label: string;
        tileMid: number;
        fontSize: number;
        priority: number;
      };
      const candidates: Cand[] = [];
      for (const b of bands) {
        if (!shouldOfferLoupeLabel(b) || !b.label) continue;
        const span = b.end - b.start;
        const fontSize = b.jackpot
          ? 3.2
          : span >= 6
            ? 2.6
            : span >= 3
              ? 2.15
              : 1.65;
        const priority = loupeLabelPriority(b);
        for (const tileMid of loupeLabelSlots(b.start, b.end)) {
          candidates.push({
            key: `lbl-${b.start}-${tileMid}`,
            label: b.label,
            tileMid,
            fontSize,
            priority,
          });
        }
      }

      candidates.sort((a, b) => b.priority - a.priority || a.tileMid - b.tileMid);
      const placed: Cand[] = [];
      for (const c of candidates) {
        const clash = placed.some(
          (p) => Math.abs(p.tileMid - c.tileMid) < LABEL_MIN_GAP_TILES
        );
        if (clash) continue;
        placed.push(c);
      }
      placed.sort((a, b) => a.tileMid - b.tileMid);

      labels = placed.map((c) => {
        const { x, y, rot } = bandLabelAt(c.tileMid);
        return (
          <text
            key={c.key}
            x={x}
            y={y}
            fill="#f5ecd8"
            stroke="#0a0812"
            strokeWidth={0.5}
            paintOrder="stroke"
            fontSize={c.fontSize}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${rot} ${x} ${y})`}
            className="seat-spin-wedge-label"
            style={{ pointerEvents: "none" }}
          >
            {c.label}
          </text>
        );
      });
    }

    return { wedges, labels };
  }, [prefix, showLabels]);

  return (
    <svg className="seat-spin-svg" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id={`${prefix}-jackpot-grad`} cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#a8ffe8" />
          <stop offset="28%" stopColor="#3ec9a8" />
          <stop offset="58%" stopColor="#2a8fc4" />
          <stop offset="100%" stopColor="#1a4a7a" />
        </radialGradient>
        <linearGradient id={`${prefix}-pearl-a`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6a6280" />
          <stop offset="45%" stopColor="#3a3450" />
          <stop offset="100%" stopColor="#1e2438" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-b`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7a5a68" />
          <stop offset="50%" stopColor="#4a3040" />
          <stop offset="100%" stopColor="#2a2038" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-c`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4a7068" />
          <stop offset="48%" stopColor="#2a4848" />
          <stop offset="100%" stopColor="#1e3048" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-d`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6a6050" />
          <stop offset="55%" stopColor="#403828" />
          <stop offset="100%" stopColor="#2a2438" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-one`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8d090" />
          <stop offset="40%" stopColor="#a88840" />
          <stop offset="100%" stopColor="#5a4820" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-mid`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6a9888" />
          <stop offset="50%" stopColor="#2a5848" />
          <stop offset="100%" stopColor="#1a3850" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-high`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a08098" />
          <stop offset="45%" stopColor="#583850" />
          <stop offset="100%" stopColor="#302048" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-rare`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#d0b878" />
          <stop offset="35%" stopColor="#886848" />
          <stop offset="70%" stopColor="#684060" />
          <stop offset="100%" stopColor="#283858" />
        </linearGradient>
        <linearGradient id={`${prefix}-pearl-dud`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#586070" />
          <stop offset="55%" stopColor="#303848" />
          <stop offset="100%" stopColor="#1a202c" />
        </linearGradient>
      </defs>
      <circle cx={CX} cy={CY} r={R} fill="#16141f" />
      {wedges}
      {labels}
    </svg>
  );
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
  const discStyle = {
    transform: `rotate(${rot}deg)`,
    transitionDuration: spinning || rot > 0 ? `${SPIN_MS}ms` : "0ms",
    transitionTimingFunction: "cubic-bezier(0.08, 0.82, 0.12, 1)",
  } as CSSProperties;

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
      {spin.potBeforeCents != null && (
        <div className="seat-spin-pot">
          <span className="seat-spin-pot-label">Pot</span>
          <span className="seat-spin-pot-value">
            {formatCents(spin.potBeforeCents)}
          </span>
        </div>
      )}
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
        <div className="seat-spin-loupe" aria-hidden>
          <div className="seat-spin-loupe-zoom">
            <div className="seat-spin-loupe-disc" style={discStyle}>
              <WheelFace prefix="seat-spin-loupe" showLabels />
            </div>
          </div>
          <div className="seat-spin-loupe-hairline" />
          <div className="seat-spin-loupe-glass" />
        </div>
        <div className="seat-spin-pointer" aria-hidden>
          <span className="seat-spin-pointer-glow" />
          <span className="seat-spin-pointer-blade" />
          <span className="seat-spin-pointer-core" />
        </div>
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
        <div ref={discRef} className="seat-spin-disc" style={discStyle}>
          <WheelFace prefix="seat-spin" />
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
