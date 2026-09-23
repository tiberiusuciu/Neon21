import { useLayoutEffect, useRef, type RefObject } from "react";

function reduceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type Opts = {
  durationMs?: number;
  format?: (cents: number) => string;
};

/**
 * Tweens label text via DOM writes only — no per-frame React state (that was
 * re-rendering the fixed header and blanking it during wins).
 */
export function useAnimatedCents(
  target: number,
  amountRef: RefObject<HTMLElement | null>,
  opts: Opts = {}
) {
  const durationMs = opts.durationMs ?? 700;
  const format = opts.format;
  const shown = useRef(target);
  const formatRef = useRef(format);
  formatRef.current = format;
  const raf = useRef<number | null>(null);

  function write(cents: number) {
    const el = amountRef.current;
    if (!el) return;
    const fmt = formatRef.current;
    el.textContent = fmt ? fmt(cents) : String(cents);
  }

  function clearDir() {
    amountRef.current?.classList.remove("balance-lerp-up", "balance-lerp-down");
  }

  function setDir(next: "up" | "down") {
    const el = amountRef.current;
    if (!el) return;
    el.classList.remove("balance-lerp-up", "balance-lerp-down");
    el.classList.add(next === "up" ? "balance-lerp-up" : "balance-lerp-down");
  }

  // Restore text after React re-renders (empty <span /> would otherwise clear it).
  useLayoutEffect(() => {
    write(shown.current);
  });

  useLayoutEffect(() => {
    const from = shown.current;
    if (from === target) {
      write(target);
      return;
    }

    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }

    if (reduceMotion()) {
      shown.current = target;
      write(target);
      clearDir();
      return;
    }

    setDir(target > from ? "up" : "down");
    const delta = target - from;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = Math.round(from + delta * easeOutCubic(t));
      shown.current = next;
      write(next);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        shown.current = target;
        write(target);
        clearDir();
        raf.current = null;
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
    };
  }, [target, durationMs, amountRef]);
}
