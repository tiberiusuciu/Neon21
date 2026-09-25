import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { SPIN_BJ_PER_VOUCHER } from "@neon21/shared";

const POP_MS = 720;
const BETWEEN_FILLS_MS = 90;
const WAVE_MS = 520;
const CELEBRATE_MS = 980;
const CLEAR_MS = 560;
const VOUCHER_BUMP_MS = 520;

type Props = {
  bjTowardSpin: number;
  spinVouchers: number;
  /** Naturals needed for a voucher (admin-tunable). */
  bjPerVoucher?: number;
  /** Reset animation tracking when the seated player changes. */
  seatKey: string;
};

type PipFx = "idle" | "pop" | "wave" | "celebrate" | "clear";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
}

function clampPipCount(n: number | undefined): number {
  const v = Math.floor(n ?? SPIN_BJ_PER_VOUCHER);
  if (!Number.isFinite(v)) return SPIN_BJ_PER_VOUCHER;
  return Math.min(50, Math.max(1, v));
}

/**
 * Visual BJ→voucher meter. Server snaps (N-1)→0 on the completing BJ; we
 * stage fill → celebrate → clear locally so the last pip and ticket bump
 * still play. Join/hydration voucher jumps snap silently (no celebrate).
 */
export function SeatBjMeter({
  bjTowardSpin,
  spinVouchers,
  bjPerVoucher,
  seatKey,
}: Props) {
  const pipCount = clampPipCount(bjPerVoucher);
  const targetBj = Math.max(
    0,
    Math.min(pipCount - 1, Math.floor(bjTowardSpin) % pipCount)
  );
  const targetVouchers = Math.max(0, Math.floor(spinVouchers));

  const [lit, setLit] = useState(targetBj);
  const [vouchers, setVouchers] = useState(targetVouchers);
  const [pipFx, setPipFx] = useState<PipFx[]>(() =>
    Array.from({ length: pipCount }, () => "idle" as PipFx)
  );
  const [burst, setBurst] = useState(false);
  const [voucherBump, setVoucherBump] = useState(false);

  const seatKeyRef = useRef(seatKey);
  const pipCountRef = useRef(pipCount);
  const litRef = useRef(lit);
  const vouchersRef = useRef(vouchers);
  const prevTargetBj = useRef(targetBj);
  const prevTargetV = useRef(targetVouchers);
  const ready = useRef(false);
  const timers = useRef<number[]>([]);
  const running = useRef(false);
  const queue = useRef<Array<() => Promise<void>>>([]);

  litRef.current = lit;
  vouchersRef.current = vouchers;

  function clearTimers() {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = window.setTimeout(resolve, ms);
      timers.current.push(t);
    });
  }

  function setPip(i: number, fx: PipFx) {
    setPipFx((prev) => {
      const next = prev.slice() as PipFx[];
      next[i] = fx;
      return next;
    });
  }

  function setAllPip(fx: PipFx, count = pipCountRef.current) {
    setPipFx(Array.from({ length: count }, () => fx));
  }

  function snap(bj: number, v: number, count = pipCountRef.current) {
    clearTimers();
    queue.current = [];
    running.current = false;
    setLit(bj);
    setVouchers(v);
    litRef.current = bj;
    vouchersRef.current = v;
    setAllPip("idle", count);
    setBurst(false);
    setVoucherBump(false);
  }

  async function playWave(through: number) {
    const n = Math.max(0, through);
    const count = pipCountRef.current;
    setPipFx((prev) => {
      const next = prev.slice() as PipFx[];
      for (let i = 0; i < count; i++) {
        next[i] = i < n ? "wave" : "idle";
      }
      return next;
    });
    await wait(WAVE_MS);
    setPipFx((prev) => {
      const next = prev.slice() as PipFx[];
      for (let i = 0; i < count; i++) {
        if (next[i] === "wave") next[i] = "idle";
      }
      return next;
    });
  }

  async function animFillTo(toLit: number) {
    let cur = litRef.current;
    while (cur < toLit) {
      const i = cur;
      setLit(i + 1);
      litRef.current = i + 1;
      setPip(i, "pop");
      await wait(POP_MS);
      setPip(i, "idle");
      await playWave(i + 1);
      cur = i + 1;
      if (cur < toLit) await wait(BETWEEN_FILLS_MS);
    }
  }

  async function animComplete(finalBj: number, finalVouchers: number) {
    const count = pipCountRef.current;
    await animFillTo(count);
    setBurst(true);
    setAllPip("celebrate", count);
    await wait(280);
    setVouchers(finalVouchers);
    vouchersRef.current = finalVouchers;
    setVoucherBump(true);
    await wait(CELEBRATE_MS - 280);
    setBurst(false);
    setAllPip("clear", count);
    await wait(CLEAR_MS);
    setLit(finalBj);
    litRef.current = finalBj;
    setAllPip("idle", count);
    const t = window.setTimeout(() => setVoucherBump(false), VOUCHER_BUMP_MS);
    timers.current.push(t);
  }

  async function drain() {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const job = queue.current.shift();
      if (job) await job();
    }
    running.current = false;
  }

  function enqueue(job: () => Promise<void>) {
    queue.current.push(job);
    void drain();
  }

  useEffect(() => {
    if (pipCountRef.current !== pipCount) {
      pipCountRef.current = pipCount;
      snap(targetBj, targetVouchers, pipCount);
      prevTargetBj.current = targetBj;
      prevTargetV.current = targetVouchers;
      ready.current = true;
      return;
    }

    if (seatKeyRef.current !== seatKey) {
      seatKeyRef.current = seatKey;
      snap(targetBj, targetVouchers);
      prevTargetBj.current = targetBj;
      prevTargetV.current = targetVouchers;
      ready.current = true;
      return;
    }

    if (!ready.current) {
      snap(targetBj, targetVouchers);
      prevTargetBj.current = targetBj;
      prevTargetV.current = targetVouchers;
      ready.current = true;
      return;
    }

    const prevBj = prevTargetBj.current;
    const prevV = prevTargetV.current;
    prevTargetBj.current = targetBj;
    prevTargetV.current = targetVouchers;

    if (targetBj === prevBj && targetVouchers === prevV) return;

    if (prefersReducedMotion()) {
      snap(targetBj, targetVouchers);
      return;
    }

    const gained = Math.max(0, targetVouchers - prevV);
    // Cycle complete: progress wrapped ((N-1)→0). Skip celebrate on join/admin hydrate.
    const completedCycle = gained > 0 && targetBj < prevBj;

    if (completedCycle) {
      enqueue(() => animComplete(targetBj, targetVouchers));
      return;
    }

    if (gained > 0) {
      snap(targetBj, targetVouchers);
      return;
    }

    if (targetBj > prevBj) {
      enqueue(async () => {
        await animFillTo(targetBj);
      });
      return;
    }

    snap(targetBj, targetVouchers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on server props only
  }, [seatKey, targetBj, targetVouchers, pipCount]);

  useEffect(() => () => clearTimers(), []);

  const heat = Math.min(pipCount, Math.max(0, lit));

  return (
    <div
      className={`seat-bj-meter${burst ? " is-burst" : ""}`}
      data-heat={heat}
      title="Blackjacks toward next jackpot spin"
      aria-label={`${targetBj} of ${pipCount} blackjacks toward next spin`}
    >
      {Array.from({ length: pipCount }, (_, i) => {
        const on = i < lit;
        const fx = pipFx[i] ?? "idle";
        const celebrating = fx === "celebrate" || burst;
        const cls = [
          "seat-bj-pip",
          on || fx === "clear" || fx === "celebrate" || fx === "wave"
            ? "is-lit"
            : "",
          fx === "pop" ? "is-pop" : "",
          fx === "wave" ? "is-wave" : "",
          fx === "celebrate" ? "is-celebrate" : "",
          fx === "clear" ? "is-clear" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <span
            key={i}
            className={cls}
            style={{ ["--wave-i" as string]: i } as CSSProperties}
          >
            {celebrating && (
              <span className="seat-bj-pip-spark" aria-hidden>
                {Array.from({ length: 7 }, (_, j) => (
                  <i
                    key={j}
                    style={
                      {
                        ["--i"]: j,
                        ["--a"]: `${(j / 7) * 360 + i * 17 + (j % 3) * 9}deg`,
                        ["--d"]: `${6 + (j % 4) * 3.5}px`,
                        ["--s"]: `${1.2 + (j % 3) * 0.45}px`,
                        ["--del"]: `${j * 28 + i * 12}ms`,
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
            )}
          </span>
        );
      })}
      {vouchers > 0 && (
        <span
          className={`seat-bj-voucher${voucherBump ? " is-bump" : ""}`}
        >
          ×{vouchers}
        </span>
      )}
    </div>
  );
}
