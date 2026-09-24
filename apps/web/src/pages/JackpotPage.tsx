import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import type { JackpotClaimEntry } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents } from "../lib/format";
import { useGameSocket } from "../lib/SocketProvider";
import { onEvent } from "../lib/socket";
import { useAnimatedCents } from "../lib/useAnimatedCents";
import {
  JACKPOT_TIERS_CENTS,
  jackpotFillRatio,
  jackpotGlowColor,
  jackpotParticleCount,
  jackpotTierCrossed,
  jackpotTierReached,
  type JackpotTier,
} from "../lib/jackpotTiers";

const PREVIEW_PRESETS: { label: string; cents: number }[] = [
  { label: "Hole", cents: -5_000_000 },
  { label: "$0", cents: 0 },
  ...JACKPOT_TIERS_CENTS.map((c, i) => ({
    label: `T${i + 1}`,
    cents: c,
  })),
  { label: "Mid T4", cents: 1_750_000 },
];

function formatClaimWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function JackpotParticles({
  tier,
  color,
}: {
  tier: JackpotTier;
  color: string;
}) {
  const count = jackpotParticleCount(tier);
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const ring = 1 + (i % 3);
      const shimmer = tier >= 4 && i % (tier >= 7 ? 1 : 2) === 0;
      return {
        i,
        angle: (360 / Math.max(count, 1)) * i + (i % 7) * 4.5,
        delay: ((i * 0.11) % 2.8).toFixed(2),
        travel: 16 + ring * 20 + (i % 5) * 8 + (tier >= 7 ? 10 : 0),
        size: 2 + (i % 4) + (tier >= 7 ? 1 : 0) + (shimmer && tier >= 8 ? 1 : 0),
        dur: (1.9 + (i % 6) * 0.35 - tier * 0.05).toFixed(2),
        shimmer,
        twinkle: (0.35 + (i % 5) * 0.08).toFixed(2),
      };
    });
  }, [count, tier]);

  if (count === 0) return null;

  return (
    <div className="jackpot-particles" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.i}
          className={`jackpot-particle${p.shimmer ? " is-shimmer" : ""}`}
          style={{
            ["--a" as string]: `${p.angle}deg`,
            ["--travel" as string]: `${p.travel}px`,
            ["--delay" as string]: `${p.delay}s`,
            ["--dur" as string]: `${p.dur}s`,
            ["--sz" as string]: `${p.size}px`,
            ["--pc" as string]: color,
            ["--twinkle" as string]: `${p.twinkle}s`,
          }}
        />
      ))}
    </div>
  );
}

export function JackpotPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { socket, subscribeJackpot, unsubscribeJackpot } = useGameSocket();
  const [takeCents, setTakeCents] = useState(0);
  const [claims, setClaims] = useState<JackpotClaimEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deltaFlash, setDeltaFlash] = useState<"up" | "down" | null>(null);
  const [celebrateTier, setCelebrateTier] = useState<JackpotTier>(0);
  const [previewCents, setPreviewCents] = useState<number | null>(null);
  const celebrated = useRef<JackpotTier>(0);
  const takeRef = useRef(0);
  const seeded = useRef(false);
  const amountRef = useRef<HTMLSpanElement>(null);
  const celebrateTimer = useRef<number | null>(null);

  const liveTake = takeCents;
  const displayTake = previewCents ?? liveTake;
  const inHole = displayTake < 0;
  const fill = jackpotFillRatio(displayTake);
  const tier = jackpotTierReached(displayTake);
  const glow = inHole ? "#8a9bb0" : jackpotGlowColor(tier);
  const pulseStrength = inHole ? 0.15 : 0.22 + fill * 0.78;

  useAnimatedCents(displayTake, amountRef, {
    durationMs: 900,
    format: formatCents,
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    seeded.current = false;
    (async () => {
      try {
        const res = await api.jackpot(token);
        if (cancelled) return;
        const take = res.takeCents;
        setTakeCents(take);
        takeRef.current = take;
        setClaims(res.claims);
        celebrated.current = jackpotTierReached(take);
        seeded.current = true;
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof ApiError ? err.message : "Failed to load jackpot"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    subscribeJackpot();
    return () => unsubscribeJackpot();
  }, [subscribeJackpot, unsubscribeJackpot]);

  useEffect(() => {
    if (!socket) return;
    const offDelta = onEvent(socket, "jackpot:delta", ({ deltaCents }) => {
      if (!seeded.current || deltaCents === 0) return;

      const prev = takeRef.current;
      const next = Math.max(0, prev + deltaCents);
      takeRef.current = next;
      setTakeCents(next);

      const crossed = jackpotTierCrossed(prev, next);
      let celebrate: JackpotTier = 0;
      if (crossed > celebrated.current) {
        celebrated.current = crossed;
        celebrate = crossed;
      } else if (next < prev) {
        celebrated.current = jackpotTierReached(next);
      }

      if (previewCents != null) return;

      if (celebrate > 0) {
        if (celebrateTimer.current != null) {
          window.clearTimeout(celebrateTimer.current);
        }
        setCelebrateTier(celebrate);
        celebrateTimer.current = window.setTimeout(() => {
          setCelebrateTier(0);
          celebrateTimer.current = null;
        }, 1400 + celebrate * 120);
      }

      setDeltaFlash(deltaCents > 0 ? "up" : "down");
      window.setTimeout(() => setDeltaFlash(null), 700);
    });

    const offClaim = onEvent(socket, "jackpot:claim", (claim) => {
      if (!seeded.current) return;
      const prev = takeRef.current;
      const next = Math.max(0, prev - claim.payoutCents);
      takeRef.current = next;
      setTakeCents(next);
      celebrated.current = jackpotTierReached(next);
      setClaims((c) => [claim, ...c].slice(0, 50));
      if (previewCents == null) {
        setDeltaFlash("down");
        window.setTimeout(() => setDeltaFlash(null), 700);
      }
    });

    return () => {
      offDelta();
      offClaim();
    };
  }, [socket, previewCents]);

  useEffect(() => {
    return () => {
      if (celebrateTimer.current != null) {
        window.clearTimeout(celebrateTimer.current);
      }
    };
  }, []);

  const showDebug =
    import.meta.env.DEV || import.meta.env.VITE_STAGING === "true";

  return (
    <motion.div
      className="jackpot-page"
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <h1 className="page-title">Jackpot</h1>
      <p className="page-sub">
        House jackpot — 5% of player losses. Spin with 5 blackjacks in 24
        hours.
      </p>

      {loading ? (
        <p className="muted">Loading jackpot…</p>
      ) : (
        <>
          <div
            className={[
              "jackpot-vault",
              inHole ? "is-hole" : "",
              deltaFlash === "up" ? "is-flash-up" : "",
              deltaFlash === "down" ? "is-flash-down" : "",
              celebrateTier > 0 ? `is-celebrate is-tier-${celebrateTier}` : "",
              `is-glow-tier-${tier}`,
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                ["--fill"]: String(fill),
                ["--glow"]: glow,
                ["--pulse"]: String(pulseStrength),
                ["--tier"]: String(tier),
              } as CSSProperties
            }
          >
            <div className="jackpot-glow" aria-hidden />

            <div className="jackpot-orb-wrap">
              {!inHole && tier >= 3 && (
                <div className="jackpot-rings" aria-hidden>
                  <span className="jackpot-ring" style={{ ["--r" as string]: 0 }} />
                  {tier >= 5 && (
                    <span className="jackpot-ring" style={{ ["--r" as string]: 1 }} />
                  )}
                  {tier >= 7 && (
                    <span className="jackpot-ring" style={{ ["--r" as string]: 2 }} />
                  )}
                  {tier >= 9 && (
                    <span className="jackpot-ring" style={{ ["--r" as string]: 3 }} />
                  )}
                </div>
              )}
              <div
                className="jackpot-orb"
                role="img"
                aria-label="House jackpot vault"
              >
                <JackpotParticles tier={tier} color={glow} />
                <div className="jackpot-orb-fill" aria-hidden>
                  <div className="jackpot-orb-liquid">
                    <div className="jackpot-orb-liquid-body">
                      <div className="jackpot-orb-wave jackpot-orb-wave-a" />
                      <div className="jackpot-orb-wave jackpot-orb-wave-b" />
                      <div className="jackpot-orb-surface" />
                    </div>
                  </div>
                </div>
                <div className="jackpot-orb-glass" aria-hidden />
                <div className="jackpot-orb-rim" aria-hidden />
                <div className="jackpot-orb-shine" aria-hidden />
                {celebrateTier > 0 && (
                  <div className="jackpot-burst" aria-hidden>
                    {Array.from({ length: 8 + celebrateTier }, (_, i) => (
                      <span
                        key={i}
                        style={{
                          ["--i" as string]: i,
                          ["--pc" as string]: glow,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="jackpot-readout">
              <div className="jackpot-hero-label">
                House jackpot
                {previewCents != null && (
                  <span className="jackpot-preview-tag"> preview</span>
                )}
              </div>
              <div className="jackpot-hero-amount">
                <span ref={amountRef} className="jackpot-hero-value" />
              </div>
              <p className="jackpot-hero-hint">
                {inHole
                  ? "The vault is empty"
                  : "Fills with 5% of losses · shrinks only when someone spins"}
              </p>
            </div>
          </div>

          <section className="jackpot-claims">
            <h2 className="jackpot-claims-title">Recent claims</h2>
            {claims.length === 0 ? (
              <p className="muted">No spins claimed yet.</p>
            ) : (
              <ul className="jackpot-claims-list">
                {claims.map((c) => (
                  <li key={c.id} className="jackpot-claim-row">
                    <div>
                      <strong>{c.userName}</strong>
                      <span className="muted">
                        {" "}
                        · {c.tableName} · {c.label}
                      </span>
                    </div>
                    <div className="jackpot-claim-amt">
                      {formatCents(c.payoutCents)}
                    </div>
                    <div className="jackpot-claim-when muted">
                      {formatClaimWhen(c.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {showDebug && (
            <details className="jackpot-debug">
              <summary>Preview take (debug)</summary>
              <div className="jackpot-debug-body">
                <div className="jackpot-debug-presets">
                  {PREVIEW_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={`btn btn-ghost jackpot-debug-btn${
                        previewCents === p.cents ? " is-active" : ""
                      }`}
                      onClick={() => setPreviewCents(p.cents)}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-ghost jackpot-debug-btn"
                    onClick={() => setPreviewCents(null)}
                  >
                    Live
                  </button>
                </div>
                <label className="jackpot-debug-slider">
                  <span className="muted">
                    Slider · {formatCents(previewCents ?? liveTake)}
                    {tier > 0 ? ` · T${tier}` : ""}
                  </span>
                  <input
                    type="range"
                    min={-5_000_000}
                    max={100_000_000}
                    step={50_000}
                    value={Math.min(
                      100_000_000,
                      Math.max(-5_000_000, previewCents ?? liveTake)
                    )}
                    onChange={(e) => setPreviewCents(Number(e.target.value))}
                  />
                </label>
              </div>
            </details>
          )}
        </>
      )}
    </motion.div>
  );
}
