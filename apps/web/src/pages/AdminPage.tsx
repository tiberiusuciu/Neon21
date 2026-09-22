import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { AdminUserRow } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents } from "../lib/format";

type ResetPeriod = "season" | "alltime" | "custom";

export function AdminPage() {
  const { user, token, loading } = useAuth();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [dollars, setDollars] = useState("100");
  const [topping, setTopping] = useState(false);
  const [period, setPeriod] = useState<ResetPeriod>("season");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    if (!user?.isAdmin || !token) return;
    void loadUsers("");
  }, [user?.isAdmin, token, loadUsers]);

  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  if (!user?.isAdmin) {
    return <Navigate to="/lobby" replace />;
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    await loadUsers(query);
  }

  async function onTopUp(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected) return;
    const amount = Number(dollars);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive dollar amount");
      return;
    }
    setTopping(true);
    try {
      const res = await api.adminTopUp(token, selected.id, { dollars: amount });
      setSelected(res.user);
      setUsers((prev) =>
        prev.map((u) => (u.id === res.user.id ? res.user : u))
      );
      toast.success(
        `Credited ${formatCents(res.creditedCents)} to ${res.user.name}`
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Top-up failed");
    } finally {
      setTopping(false);
    }
  }

  async function onResetStats(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected) return;

    const label =
      period === "season"
        ? "current season"
        : period === "alltime"
          ? "all time"
          : "the selected range";
    if (
      !window.confirm(
        `Reset stats for ${selected.name} (${label})? This deletes hand history in that window and recomputes lifetime stats. Balance is unchanged.`
      )
    ) {
      return;
    }

    setResetting(true);
    try {
      const body =
        period === "custom"
          ? {
              period: "custom" as const,
              from: new Date(from).toISOString(),
              to: new Date(to).toISOString(),
            }
          : { period };
      const res = await api.adminResetStats(token, selected.id, body);
      setSelected(res.user);
      setUsers((prev) =>
        prev.map((u) => (u.id === res.user.id ? res.user : u))
      );
      toast.success(
        `Removed ${res.deletedOutcomes} hand(s). Stats recomputed.`
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function onDeleteUser() {
    if (!token || !selected) return;
    if (selected.id === user?.id) {
      toast.error("Cannot delete your own account");
      return;
    }
    if (
      !window.confirm(
        `Permanently delete ${selected.name} (${selected.email})? Hand history is removed. This cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await api.adminDeleteUser(token, selected.id);
      setUsers((prev) => prev.filter((u) => u.id !== selected.id));
      setSelected(null);
      toast.success(`Deleted ${selected.email}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <h1 className="page-title">Admin</h1>
      <p className="page-sub">Top up wallets and reset player stats.</p>

      <form className="form admin-search" onSubmit={onSearch}>
        <div className="field">
          <label htmlFor="admin-q">Find player</label>
          <input
            id="admin-q"
            type="search"
            placeholder="Name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-sm" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      <div className="admin-layout">
        <div className="admin-list">
          {users.length === 0 && !searching && (
            <p className="muted">No players found.</p>
          )}
          <ul className="admin-user-list">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className={
                    selected?.id === u.id
                      ? "admin-user active"
                      : "admin-user"
                  }
                  onClick={() => setSelected(u)}
                >
                  <span className="admin-user-name">{u.name}</span>
                  <span className="muted admin-user-email">{u.email}</span>
                  <span className="admin-user-meta">
                    {formatCents(u.balanceCents)} · {u.handsPlayed} hands
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="admin-detail settings-block">
          {!selected && (
            <p className="muted">Select a player to top up or reset stats.</p>
          )}
          {selected && (
            <>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{selected.name}</p>
                <p className="muted" style={{ margin: "0.15rem 0 0" }}>
                  {selected.email}
                </p>
                <p style={{ margin: "0.5rem 0 0" }}>
                  Balance {formatCents(selected.balanceCents)} · Net{" "}
                  {formatCents(selected.netProfitCents)} · {selected.handsPlayed}{" "}
                  hands
                </p>
              </div>

              <form className="form" onSubmit={onTopUp}>
                <div className="field">
                  <label htmlFor="admin-topup">Top up (USD)</label>
                  <input
                    id="admin-topup"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={dollars}
                    onChange={(e) => setDollars(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn" disabled={topping}>
                  {topping ? "Crediting…" : "Add funds"}
                </button>
              </form>

              <form className="form" onSubmit={onResetStats}>
                <p
                  className="muted"
                  style={{ margin: 0, fontSize: "0.85rem" }}
                >
                  Reset stats
                </p>
                <div className="segmented" role="group" aria-label="Period">
                  {(
                    [
                      ["season", "Season"],
                      ["alltime", "All time"],
                      ["custom", "Custom"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={period === value ? "active" : ""}
                      onClick={() => setPeriod(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {period === "custom" && (
                  <>
                    <div className="field">
                      <label htmlFor="admin-from">From</label>
                      <input
                        id="admin-from"
                        type="datetime-local"
                        required
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="admin-to">To</label>
                      <input
                        id="admin-to"
                        type="datetime-local"
                        required
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <button
                  type="submit"
                  className="btn btn-ghost"
                  disabled={resetting}
                >
                  {resetting ? "Resetting…" : "Reset stats"}
                </button>
              </form>

              <button
                type="button"
                className="btn btn-ghost admin-delete"
                disabled={deleting || selected.id === user.id}
                onClick={() => void onDeleteUser()}
              >
                {deleting ? "Deleting…" : "Delete user"}
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
