import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents, formatCountdown, formatHeaderCents } from "../lib/format";
import { useCashFx } from "../lib/cashFx";
import { useAnimatedCents } from "../lib/useAnimatedCents";
import { BrandMark } from "./BrandMark";

export function AppHeader() {
  const { user, wallet, claim, refresh } = useAuth();
  const { walletRef, walletPulse, walletSpend, walletPush } = useCashFx();
  const amountRef = useRef<HTMLSpanElement>(null);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const canClaim = wallet?.canClaim === true;
  const balance = wallet?.balanceCents ?? user?.balanceCents ?? 0;
  useAnimatedCents(balance, amountRef, {
    format: formatHeaderCents,
  });
  const nextClaimAt = wallet?.nextClaimAt
    ? Date.parse(wallet.nextClaimAt)
    : NaN;
  const remainingMs =
    !canClaim && Number.isFinite(nextClaimAt) ? nextClaimAt - now : 0;

  useEffect(() => {
    if (canClaim || !Number.isFinite(nextClaimAt)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [canClaim, nextClaimAt]);

  useEffect(() => {
    if (canClaim || !Number.isFinite(nextClaimAt)) return;
    if (remainingMs > 0) return;
    void refresh();
  }, [canClaim, nextClaimAt, remainingMs, refresh]);

  async function onClaim() {
    if (claiming) return;
    if (!canClaim) {
      const label =
        remainingMs > 0
          ? `Next claim at midnight (${formatCountdown(remainingMs)} left)`
          : "Already claimed today — available again at midnight";
      toast.info(label);
      return;
    }
    setClaiming(true);
    try {
      await claim();
      toast.success("Claimed $100");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  const links = (
    <>
      <NavLink to="/lobby" onClick={() => setOpen(false)}>
        Lobby
      </NavLink>
      <NavLink to="/stats" onClick={() => setOpen(false)}>
        Stats
      </NavLink>
      <NavLink to="/jackpot" onClick={() => setOpen(false)}>
        Jackpot
      </NavLink>
      <NavLink to="/leaderboard" onClick={() => setOpen(false)}>
        Leaderboard
      </NavLink>
      {user?.isAdmin && (
        <NavLink to="/admin" onClick={() => setOpen(false)}>
          Admin
        </NavLink>
      )}
      <NavLink to="/settings" onClick={() => setOpen(false)}>
        Settings
      </NavLink>
    </>
  );

  const claimLabel = claiming
    ? "Claiming…"
    : canClaim
      ? "Claim $100"
      : remainingMs > 0
        ? formatCountdown(remainingMs)
        : "…";

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/lobby" className="brand">
            <BrandMark />
            <span className="brand-text">
              Neon<span className="brand-accent">21</span>
            </span>
          </Link>
          <nav className="nav-desktop">{links}</nav>
          <div className="header-meta">
            <motion.span
              ref={walletRef}
              className={[
                "balance",
                walletPulse ? `balance-pulse balance-pulse-${walletPulse}` : "",
                walletSpend ? "balance-spend" : "",
                walletPush ? "balance-push" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={formatCents(balance)}
              animate={
                walletPulse
                  ? { scale: [1, 1.18, 1], y: [0, -2, 0] }
                  : walletPush
                    ? { scale: [1, 1.06, 1] }
                    : walletSpend
                      ? { scale: [1, 0.94, 1] }
                      : { scale: 1 }
              }
              transition={{
                duration:
                  walletPulse === "jackpot" || walletPulse === "mega"
                    ? 0.5
                    : walletPush
                      ? 0.55
                      : walletSpend
                        ? 0.35
                        : 0.4,
              }}
            >
              <span ref={amountRef} />
            </motion.span>
            <button
              type="button"
              className={`btn btn-sm${!canClaim || claiming ? " is-disabled" : ""}`}
              aria-disabled={!canClaim || claiming}
              onClick={onClaim}
              title={
                canClaim
                  ? "Claim your daily $100"
                  : remainingMs > 0
                    ? `Next claim in ${formatCountdown(remainingMs)}`
                    : "Already claimed today"
              }
            >
              {claimLabel}
            </button>
            <button
              type="button"
              className="menu-btn"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span className="menu-icon" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      {open && <nav className="nav-drawer">{links}</nav>}
    </>
  );
}
