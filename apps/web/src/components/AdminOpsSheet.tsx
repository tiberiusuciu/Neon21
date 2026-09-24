import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { AdminUserRow } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents, formatCountdown } from "../lib/format";
import { useGameSocket } from "../lib/SocketProvider";

const PRESETS = [100, 500, 1000] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AdminOpsSheet({ open, onClose }: Props) {
  const { token } = useAuth();
  const { goldenHour } = useGameSocket();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [dollars, setDollars] = useState("100");
  const [busy, setBusy] = useState(false);
  const [goldenBusy, setGoldenBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadUsers = useCallback(
    async (q: string) => {
      if (!token) return;
      setSearching(true);
      try {
        const res = await api.adminUsers(token, q);
        setUsers(res.users);
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load users"
        );
      } finally {
        setSearching(false);
      }
    },
    [token, toast]
  );

  useEffect(() => {
    if (!open || !token) return;
    void loadUsers("");
  }, [open, token, loadUsers]);

  useEffect(() => {
    if (!open || !goldenHour) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, goldenHour]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await loadUsers(query);
  }

  async function credit(amount: number) {
    if (!token || !selected || busy) return;
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error("Enter a non-zero dollar amount");
      return;
    }
    setBusy(true);
    try {
      const res = await api.adminTopUp(token, selected.id, { dollars: amount });
      setSelected(res.user);
      setUsers((prev) =>
        prev.map((u) => (u.id === res.user.id ? res.user : u))
      );
      toast.success(
        res.creditedCents > 0
          ? `Credited ${formatCents(res.creditedCents)} to ${res.user.name}`
          : `Removed ${formatCents(-res.creditedCents)} from ${res.user.name}`
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Adjust failed");
    } finally {
      setBusy(false);
    }
  }

  async function onTopUp(e: FormEvent) {
    e.preventDefault();
    await credit(Number(dollars));
  }

  async function onGrantVoucher() {
    if (!token || !selected || busy) return;
    setBusy(true);
    try {
      const res = await api.adminGrantVoucher(token, selected.id, { count: 1 });
      toast.success(`Granted 1 spin · ${res.openVouchers} open`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selected.id
            ? { ...u, openVouchers: res.openVouchers }
            : u
        )
      );
      setSelected((s) =>
        s && s.id === selected.id
          ? { ...s, openVouchers: res.openVouchers }
          : s
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to grant voucher"
      );
    } finally {
      setBusy(false);
    }
  }

  async function onGrantGoldenHands() {
    if (!token || !selected || busy) return;
    setBusy(true);
    try {
      const res = await api.adminGrantGoldenHands(token, selected.id, {
        count: 1,
      });
      toast.success(`Granted 1 Golden Hand · ${res.goldenHands} held`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selected.id ? { ...u, goldenHands: res.goldenHands } : u
        )
      );
      setSelected((s) =>
        s && s.id === selected.id
          ? { ...s, goldenHands: res.goldenHands }
          : s
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to grant Golden Hand"
      );
    } finally {
      setBusy(false);
    }
  }

  async function onGoldenStart() {
    if (!token || goldenBusy) return;
    setGoldenBusy(true);
    try {
      await api.adminStartGoldenHour(token);
      toast.success("Golden Hour started");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to start Golden Hour"
      );
    } finally {
      setGoldenBusy(false);
    }
  }

  async function onGoldenEnd() {
    if (!token || goldenBusy) return;
    setGoldenBusy(true);
    try {
      await api.adminEndGoldenHour(token);
      toast.success("Golden Hour ended");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to end Golden Hour"
      );
    } finally {
      setGoldenBusy(false);
    }
  }

  const ghLabel = !goldenHour
    ? "…"
    : goldenHour.disabled
      ? "Disabled"
      : goldenHour.active
        ? `Live · ${formatCountdown(
            Math.max(0, (goldenHour.activeUntil ?? now) - now)
          )}`
        : `Next · ${
            goldenHour.nextStartsAt != null
              ? formatCountdown(Math.max(0, goldenHour.nextStartsAt - now))
              : "—"
          }`;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="admin-ops-scrim"
            aria-label="Close quick admin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="admin-ops-sheet"
            role="dialog"
            aria-label="Quick admin"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <div className="admin-ops-head">
              <div>
                <div className="admin-ops-title">Quick admin</div>
                <div className="admin-ops-sub">Top-up, spins, Golden Hour</div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="admin-ops-body">
              <section className="admin-ops-section">
                <h3 className="admin-ops-section-title">Add money</h3>
                <form className="admin-ops-search" onSubmit={onSearch}>
                  <input
                    type="search"
                    placeholder="Name or email"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Find player"
                  />
                  <button
                    type="submit"
                    className="btn btn-sm"
                    disabled={searching}
                  >
                    {searching ? "…" : "Find"}
                  </button>
                </form>

                <ul className="admin-ops-users">
                  {users.length === 0 && !searching && (
                    <li className="muted admin-ops-empty">No players found.</li>
                  )}
                  {users.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className={
                          selected?.id === u.id
                            ? "admin-ops-user is-active"
                            : "admin-ops-user"
                        }
                        onClick={() => setSelected(u)}
                      >
                        <span className="admin-ops-user-name">{u.name}</span>
                        <span className="muted">
                          {formatCents(u.balanceCents)}
                          {" · "}
                          {u.openVouchers ?? 0}s / {u.goldenHands ?? 0}g
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {selected && (
                  <div className="admin-ops-selected">
                    <p className="admin-ops-selected-meta">
                      <strong>{selected.name}</strong>
                      <span className="muted">{selected.email}</span>
                      <span>{formatCents(selected.balanceCents)}</span>
                      <span className="muted">
                        {selected.openVouchers ?? 0} spins ·{" "}
                        {selected.goldenHands ?? 0} golden
                      </span>
                    </p>

                    <div className="admin-ops-presets">
                      {PRESETS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => void credit(n)}
                        >
                          +${n.toLocaleString()}
                        </button>
                      ))}
                    </div>

                    <form className="admin-ops-topup" onSubmit={onTopUp}>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={dollars}
                        onChange={(e) => setDollars(e.target.value)}
                        aria-label="Amount USD"
                        placeholder="100"
                      />
                      <button type="submit" className="btn btn-sm" disabled={busy}>
                        {busy ? "…" : "Apply"}
                      </button>
                    </form>

                    <button
                      type="button"
                      className="btn btn-sm btn-ghost admin-ops-grant"
                      disabled={busy}
                      onClick={() => void onGrantVoucher()}
                    >
                      Grant spin ticket
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost admin-ops-grant"
                      disabled={busy}
                      onClick={() => void onGrantGoldenHands()}
                    >
                      Grant Golden Hand
                    </button>
                  </div>
                )}
              </section>

              <section className="admin-ops-section">
                <h3 className="admin-ops-section-title">Golden Hour</h3>
                <p className="admin-ops-gh-status">{ghLabel}</p>
                <div className="admin-ops-gh-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={
                      goldenBusy ||
                      !goldenHour ||
                      goldenHour.disabled ||
                      goldenHour.active
                    }
                    onClick={() => void onGoldenStart()}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={goldenBusy || !goldenHour?.active}
                    onClick={() => void onGoldenEnd()}
                  >
                    End
                  </button>
                </div>
              </section>

              <Link
                to="/admin"
                className="admin-ops-full"
                onClick={onClose}
              >
                Full Admin →
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
