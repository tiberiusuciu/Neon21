import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents, formatCountdown } from "../lib/format";

export function AppHeader() {
  const { user, wallet, claim, logout, refresh } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();

  const canClaim = wallet?.canClaim === true;
  const balance = wallet?.balanceCents ?? user?.balanceCents ?? 0;
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

  function onLogout() {
    logout();
    navigate("/login");
  }

  const links = (
    <>
      <NavLink to="/lobby" onClick={() => setOpen(false)}>
        Lobby
      </NavLink>
      <NavLink to="/stats" onClick={() => setOpen(false)}>
        Stats
      </NavLink>
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
            Neon<span>21</span>
          </Link>
          <nav className="nav-desktop">{links}</nav>
          <div className="header-meta">
            <span className="balance">{formatCents(balance)}</span>
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
              className="btn btn-ghost btn-sm header-logout"
              onClick={onLogout}
            >
              Log out
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
      {open && (
        <nav className="nav-drawer">
          {links}
        </nav>
      )}
    </>
  );
}
