import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import type {
  AdminHandHistoryResponse,
  AdminHandOutcome,
  AdminJackpotLedgerEntry,
  AdminJackpotResponse,
  AdminUserRow,
  GoldenHourPublic,
} from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents, formatCountdown } from "../lib/format";

type ResetPeriod = "season" | "alltime" | "custom";

const HANDS_PAGE = 80;

function handTag(h: AdminHandOutcome): { text: string; cls: string } {
  if (h.isInsurance) {
    if (h.resultCents > 0) return { text: "Ins+", cls: "tag-win" };
    if (h.resultCents < 0) return { text: "Ins−", cls: "tag-loss" };
    return { text: "Ins", cls: "tag-push" };
  }
  if (h.isBlackjack && h.resultCents > 0) return { text: "BJ", cls: "tag-bj" };
  if (h.resultCents > 0) return { text: "Win", cls: "tag-win" };
  if (h.resultCents < 0) return { text: "Loss", cls: "tag-loss" };
  return { text: "Push", cls: "tag-push" };
}

function ledgerTag(e: AdminJackpotLedgerEntry): { text: string; cls: string } {
  if (e.kind === "claim") return { text: "Claim", cls: "tag-loss" };
  if (e.kind === "take") return { text: "Take", cls: "tag-win" };
  return { text: "Adj", cls: "tag-push" };
}

function ledgerDetail(e: AdminJackpotLedgerEntry): string {
  if (e.kind === "claim") {
    const who = e.userName ?? "?";
    const tile = e.label ?? "?";
    const table = e.tableName ? ` · ${e.tableName}` : "";
    const before =
      e.potBeforeCents != null ? ` · pot was ${formatCents(e.potBeforeCents)}` : "";
    return `${who} hit ${tile}${table}${before}`;
  }
  if (e.kind === "take") {
    const who = e.userName ?? "player";
    const loss =
      e.lossCents != null ? ` from ${formatCents(e.lossCents)} loss` : "";
    return `${who}${loss}`;
  }
  return e.note?.trim() || "admin adjustment";
}

function formatHandTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

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
  const [removeJackpotTake, setRemoveJackpotTake] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [jackpot, setJackpot] = useState<AdminJackpotResponse | null>(null);
  const [jackpotDollars, setJackpotDollars] = useState("");
  const [settingJackpot, setSettingJackpot] = useState(false);
  const [loadingJackpot, setLoadingJackpot] = useState(false);
  const [goldenHour, setGoldenHour] = useState<GoldenHourPublic | null>(null);
  const [loadingGolden, setLoadingGolden] = useState(false);
  const [goldenBusy, setGoldenBusy] = useState(false);
  const [ghCooldownMin, setGhCooldownMin] = useState("4");
  const [ghCooldownMax, setGhCooldownMax] = useState("12");
  const [ghHandsPerGolden, setGhHandsPerGolden] = useState("15");
  const [ghBjPerVoucher, setGhBjPerVoucher] = useState("3");
  const [ghRescheduleNext, setGhRescheduleNext] = useState(true);
  const [ghNow, setGhNow] = useState(() => Date.now());
  const [granting, setGranting] = useState(false);
  const [openVouchers, setOpenVouchers] = useState(0);
  const [goldenHands, setGoldenHands] = useState(0);
  const [hands, setHands] = useState<AdminHandOutcome[]>([]);
  const [handsTotal, setHandsTotal] = useState(0);
  const [loadingHands, setLoadingHands] = useState(false);
  const [loadingMoreHands, setLoadingMoreHands] = useState(false);

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

  const loadJackpot = useCallback(async () => {
    if (!token) return;
    setLoadingJackpot(true);
    try {
      const res = await api.adminJackpot(token);
      setJackpot(res);
      setJackpotDollars((res.takeCents / 100).toFixed(2));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to load jackpot"
      );
    } finally {
      setLoadingJackpot(false);
    }
  }, [token, toast]);

  const loadGoldenHour = useCallback(async () => {
    if (!token) return;
    setLoadingGolden(true);
    try {
      const gh = await api.adminGoldenHour(token);
      setGoldenHour(gh);
      setGhCooldownMin(String(gh.cooldownMinHours ?? 4));
      setGhCooldownMax(String(gh.cooldownMaxHours ?? 12));
      setGhHandsPerGolden(String(gh.goldenHandsPerHands ?? 15));
      setGhBjPerVoucher(String(gh.spinBjPerVoucher ?? 3));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to load Golden Hour"
      );
    } finally {
      setLoadingGolden(false);
    }
  }, [token, toast]);

  const applyHandHistory = useCallback((res: AdminHandHistoryResponse) => {
    setOpenVouchers(res.openVouchers);
    setGoldenHands(res.goldenHands);
    setHands(res.hands);
    setHandsTotal(res.total);
    setSelected((prev) =>
      prev && prev.id === res.userId
        ? {
            ...prev,
            balanceCents: res.balanceCents,
            openVouchers: res.openVouchers,
            goldenHands: res.goldenHands,
          }
        : prev
    );
  }, []);

  const loadHands = useCallback(
    async (userId: string) => {
      if (!token) return;
      setLoadingHands(true);
      setHands([]);
      setHandsTotal(0);
      try {
        const res = await api.adminHandHistory(token, userId, {
          limit: HANDS_PAGE,
          offset: 0,
        });
        applyHandHistory(res);
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load hand history"
        );
      } finally {
        setLoadingHands(false);
      }
    },
    [token, toast, applyHandHistory]
  );

  useEffect(() => {
    if (!user?.isAdmin || !token) return;
    void loadUsers("");
    void loadJackpot();
    void loadGoldenHour();
  }, [user?.isAdmin, token, loadUsers, loadJackpot, loadGoldenHour]);

  useEffect(() => {
    if (!goldenHour) return;
    const id = window.setInterval(() => setGhNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [goldenHour]);

  useEffect(() => {
    if (!selected?.id || !token) {
      setHands([]);
      setHandsTotal(0);
      setOpenVouchers(0);
      return;
    }
    void loadHands(selected.id);
    // Reload only when switching players (loadHands churns with toast).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, token]);

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

  async function onSetJackpot(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const amount = Number(jackpotDollars);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a non-negative dollar amount");
      return;
    }
    setSettingJackpot(true);
    try {
      const res = await api.adminSetJackpot(token, { dollars: amount });
      await loadJackpot();
      toast.success(
        res.previousTakeCents === res.takeCents && res.deltaCents === 0
          ? `Jackpot already ${formatCents(res.takeCents)}`
          : `Jackpot set to ${formatCents(res.takeCents)}`
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to set jackpot"
      );
    } finally {
      setSettingJackpot(false);
    }
  }

  async function onGoldenStart() {
    if (!token || goldenBusy) return;
    setGoldenBusy(true);
    try {
      setGoldenHour(await api.adminStartGoldenHour(token));
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
      setGoldenHour(await api.adminEndGoldenHour(token));
      toast.success("Golden Hour ended");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to end Golden Hour"
      );
    } finally {
      setGoldenBusy(false);
    }
  }

  async function onGoldenDisable(disabled: boolean) {
    if (!token || goldenBusy) return;
    setGoldenBusy(true);
    try {
      setGoldenHour(await api.adminDisableGoldenHour(token, { disabled }));
      toast.success(disabled ? "Golden Hour disabled" : "Golden Hour enabled");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update Golden Hour"
      );
    } finally {
      setGoldenBusy(false);
    }
  }

  async function saveGoldenSettings(opts: {
    rescheduleNext: boolean;
    success: string;
    successReroll?: string;
  }) {
    if (!token || goldenBusy) return;
    const min = Number(ghCooldownMin);
    const max = Number(ghCooldownMax);
    const handsPer = Number(ghHandsPerGolden);
    const bjPer = Number(ghBjPerVoucher);
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 1 ||
      max < 1 ||
      min > 168 ||
      max > 168
    ) {
      toast.error("Cooldown hours must be integers from 1 to 168");
      return;
    }
    if (!Number.isInteger(handsPer) || handsPer < 1 || handsPer > 500) {
      toast.error("Hands per Golden Hand must be an integer from 1 to 500");
      return;
    }
    if (!Number.isInteger(bjPer) || bjPer < 1 || bjPer > 50) {
      toast.error("Blackjacks per voucher must be an integer from 1 to 50");
      return;
    }
    setGoldenBusy(true);
    try {
      const gh = await api.adminGoldenHourSchedule(token, {
        cooldownMinHours: min,
        cooldownMaxHours: max,
        goldenHandsPerHands: handsPer,
        spinBjPerVoucher: bjPer,
        rescheduleNext: opts.rescheduleNext,
      });
      setGoldenHour(gh);
      setGhCooldownMin(String(gh.cooldownMinHours ?? min));
      setGhCooldownMax(String(gh.cooldownMaxHours ?? max));
      setGhHandsPerGolden(String(gh.goldenHandsPerHands ?? handsPer));
      setGhBjPerVoucher(String(gh.spinBjPerVoucher ?? bjPer));
      toast.success(
        opts.rescheduleNext &&
          opts.successReroll &&
          !gh.active &&
          !gh.disabled
          ? opts.successReroll
          : opts.success
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to save settings"
      );
    } finally {
      setGoldenBusy(false);
    }
  }

  async function onGoldenSchedule(e: FormEvent) {
    e.preventDefault();
    await saveGoldenSettings({
      rescheduleNext: ghRescheduleNext,
      success: "Schedule saved",
      successReroll: "Schedule saved — next Golden Hour re-rolled",
    });
  }

  async function onGoldenConsumables(e: FormEvent) {
    e.preventDefault();
    await saveGoldenSettings({
      rescheduleNext: false,
      success: "Consumable rates saved",
    });
  }

  async function onTopUp(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected) return;
    const amount = Number(dollars);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error("Enter a non-zero dollar amount (negative to remove)");
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
        res.creditedCents > 0
          ? `Credited ${formatCents(res.creditedCents)} to ${res.user.name}`
          : `Removed ${formatCents(-res.creditedCents)} from ${res.user.name}`
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Adjust failed");
    } finally {
      setTopping(false);
    }
  }

  async function onGrantVoucher() {
    if (!token || !selected) return;
    setGranting(true);
    try {
      const res = await api.adminGrantVoucher(token, selected.id, { count: 1 });
      setOpenVouchers(res.openVouchers);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selected.id
            ? { ...u, openVouchers: res.openVouchers }
            : u
        )
      );
      toast.success(
        `Granted 1 spin ticket · ${res.openVouchers} open`
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to grant voucher"
      );
    } finally {
      setGranting(false);
    }
  }

  async function onGrantGoldenHands() {
    if (!token || !selected) return;
    setGranting(true);
    try {
      const res = await api.adminGrantGoldenHands(token, selected.id, {
        count: 1,
      });
      setGoldenHands(res.goldenHands);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selected.id ? { ...u, goldenHands: res.goldenHands } : u
        )
      );
      toast.success(
        `Granted 1 Golden Hand · ${res.goldenHands} held`
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to grant Golden Hand"
      );
    } finally {
      setGranting(false);
    }
  }

  async function onLoadMoreHands() {
    if (!token || !selected || loadingMoreHands) return;
    if (hands.length >= handsTotal) return;
    setLoadingMoreHands(true);
    try {
      const res = await api.adminHandHistory(token, selected.id, {
        limit: HANDS_PAGE,
        offset: hands.length,
      });
      setHands((prev) => [...prev, ...res.hands]);
      setHandsTotal(res.total);
      setOpenVouchers(res.openVouchers);
      setGoldenHands(res.goldenHands);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to load more hands"
      );
    } finally {
      setLoadingMoreHands(false);
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
    const potNote = removeJackpotTake
      ? " Their jackpot pot funding from those hands will also be removed."
      : " Jackpot pot is kept (their 5% loss take is preserved).";
    if (
      !window.confirm(
        `Reset stats for ${selected.name} (${label})? This deletes hand history in that window and recomputes lifetime stats. Balance is unchanged.${potNote}`
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
              removeJackpotTake,
            }
          : { period, removeJackpotTake };
      const res = await api.adminResetStats(token, selected.id, body);
      setSelected(res.user);
      setUsers((prev) =>
        prev.map((u) => (u.id === res.user.id ? res.user : u))
      );
      const potMsg =
        res.jackpotTakeCents <= 0
          ? ""
          : res.jackpotTakeRemoved
            ? ` Pot −${formatCents(res.jackpotTakeCents)}.`
            : ` Pot kept (+${formatCents(res.jackpotTakeCents)} adjustment).`;
      toast.success(
        `Removed ${res.deletedOutcomes} hand(s). Stats recomputed.${potMsg}`
      );
      await loadHands(selected.id);
      if (res.jackpotTakeRemoved && res.jackpotTakeCents > 0) {
        void loadJackpot();
      }
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
      <p className="page-sub">Jackpot vault, Golden Hour, wallets, and player stats.</p>

      <section className="settings-block admin-golden-hour">
        <h2 className="admin-section-title">Golden Hour</h2>
        {loadingGolden && !goldenHour ? (
          <p className="muted">Loading…</p>
        ) : goldenHour ? (
          <>
            <p style={{ margin: "0 0 0.35rem" }}>
              {goldenHour.disabled ? (
                <strong>Disabled</strong>
              ) : goldenHour.active ? (
                <>
                  <strong className="golden-hour-live-label">Live</strong>
                  {goldenHour.activeUntil != null && (
                    <>
                      {" "}
                      — ends in{" "}
                      {formatCountdown(
                        Math.max(0, goldenHour.activeUntil - ghNow)
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  Next in{" "}
                  <strong>
                    {goldenHour.nextStartsAt != null
                      ? formatCountdown(
                          Math.max(0, goldenHour.nextStartsAt - ghNow)
                        )
                      : "—"}
                  </strong>
                </>
              )}
            </p>
            <p
              className="muted"
              style={{ margin: "0 0 0.75rem", fontSize: "0.8rem" }}
            >
              Wins ×1.5 / half-loss only via Golden Hands · vault take 10% · 1h
              windows · random{" "}
              {goldenHour.cooldownMinHours ?? 4}–
              {goldenHour.cooldownMaxHours ?? 12}h gap · earn 1 Golden Hand /
              {goldenHour.goldenHandsPerHands ?? 15} GH hands
            </p>
            <div className="admin-golden-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={goldenBusy || goldenHour.disabled || goldenHour.active}
                onClick={() => void onGoldenStart()}
              >
                Start now
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={goldenBusy || !goldenHour.active}
                onClick={() => void onGoldenEnd()}
              >
                End now
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={goldenBusy}
                onClick={() => void onGoldenDisable(!goldenHour.disabled)}
              >
                {goldenHour.disabled ? "Enable" : "Disable"}
              </button>
            </div>
            <p
              className="muted"
              style={{ margin: "0.85rem 0 0.35rem", fontSize: "0.78rem" }}
            >
              Auto-start gap
            </p>
            <form
              className="admin-golden-schedule"
              onSubmit={(e) => void onGoldenSchedule(e)}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.65rem",
                alignItems: "flex-end",
              }}
            >
              <label className="field" style={{ margin: 0, minWidth: "5.5rem" }}>
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  Min hours
                </span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  value={ghCooldownMin}
                  disabled={goldenBusy}
                  onChange={(e) => setGhCooldownMin(e.target.value)}
                />
              </label>
              <label className="field" style={{ margin: 0, minWidth: "5.5rem" }}>
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  Max hours
                </span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  value={ghCooldownMax}
                  disabled={goldenBusy}
                  onChange={(e) => setGhCooldownMax(e.target.value)}
                />
              </label>
              <label
                className="muted"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.8rem",
                  margin: "0 0 0.35rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={ghRescheduleNext}
                  disabled={
                    goldenBusy || goldenHour.active || goldenHour.disabled
                  }
                  onChange={(e) => setGhRescheduleNext(e.target.checked)}
                />
                Re-roll next start
              </label>
              <button
                type="submit"
                className="btn btn-sm"
                disabled={goldenBusy}
                style={{ marginBottom: "0.15rem" }}
              >
                Save schedule
              </button>
            </form>

            <p
              className="muted"
              style={{ margin: "1rem 0 0.35rem", fontSize: "0.78rem" }}
            >
              Consumable rates
            </p>
            <form
              className="admin-golden-consumables"
              onSubmit={(e) => void onGoldenConsumables(e)}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.65rem",
                alignItems: "flex-end",
              }}
            >
              <label className="field" style={{ margin: 0, minWidth: "7rem" }}>
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  Hands / Golden
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={ghHandsPerGolden}
                  disabled={goldenBusy}
                  onChange={(e) => setGhHandsPerGolden(e.target.value)}
                />
              </label>
              <label className="field" style={{ margin: 0, minWidth: "7.5rem" }}>
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  BJs / voucher
                </span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={ghBjPerVoucher}
                  disabled={goldenBusy}
                  onChange={(e) => setGhBjPerVoucher(e.target.value)}
                  title="Changing this reshapes remaining BJ progress (count % N)"
                />
              </label>
              <button
                type="submit"
                className="btn btn-sm"
                disabled={goldenBusy}
                style={{ marginBottom: "0.15rem" }}
              >
                Save rates
              </button>
            </form>
          </>
        ) : (
          <p className="muted">Could not load Golden Hour.</p>
        )}
      </section>

      <section className="settings-block admin-jackpot">
        <h2 className="admin-section-title">Jackpot pool</h2>
        {loadingJackpot && !jackpot ? (
          <p className="muted">Loading vault…</p>
        ) : jackpot ? (
          <>
            <p style={{ margin: "0 0 0.35rem" }}>
              Available <strong>{formatCents(jackpot.takeCents)}</strong>
              {jackpot.rawPotCents < 0 && (
                <span className="muted">
                  {" "}
                  (raw {formatCents(jackpot.rawPotCents)} — claims exceeded
                  funding)
                </span>
              )}
            </p>
            <p
              className="muted"
              style={{ margin: "0 0 0.75rem", fontSize: "0.8rem" }}
            >
              From losses {formatCents(jackpot.grossTakeCents)} · Claims{" "}
              {formatCents(jackpot.claimsSumCents)} · Adjustments{" "}
              {formatCents(jackpot.adjustmentsCents)}
            </p>
            <form className="form admin-jackpot-form" onSubmit={onSetJackpot}>
              <div className="field">
                <label htmlFor="admin-jackpot">Set available (USD)</label>
                <input
                  id="admin-jackpot"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={jackpotDollars}
                  onChange={(e) => setJackpotDollars(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-sm"
                disabled={settingJackpot}
              >
                {settingJackpot ? "Saving…" : "Set pot"}
              </button>
            </form>

            <div className="admin-jackpot-ledger">
              <h3 className="admin-section-title">Vault ledger</h3>
              <p
                className="muted"
                style={{ margin: "0 0 0.65rem", fontSize: "0.8rem" }}
              >
                Take = 5% of each loss · Claim = spin payout · Adj = admin set
              </p>
              {jackpot.ledger.length === 0 ? (
                <p className="muted">No vault activity yet.</p>
              ) : (
                <ul className="admin-hand-list admin-ledger-list">
                  {jackpot.ledger.map((e) => {
                    const tag = ledgerTag(e);
                    const pnlCls =
                      e.deltaCents > 0
                        ? "admin-hand-win"
                        : e.deltaCents < 0
                          ? "admin-hand-loss"
                          : "admin-hand-push";
                    return (
                      <li key={e.id} className="admin-hand-row admin-ledger-row">
                        <span
                          className={`stats-tag admin-hand-tag ${tag.cls}`}
                        >
                          {tag.text}
                        </span>
                        <span className={`admin-hand-pnl ${pnlCls}`}>
                          {e.deltaCents > 0 ? "+" : ""}
                          {formatCents(e.deltaCents)}
                        </span>
                        <span className="muted admin-hand-bet admin-ledger-detail">
                          {ledgerDetail(e)}
                        </span>
                        <span className="muted admin-hand-time">
                          {formatHandTime(e.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p className="muted">Could not load jackpot.</p>
        )}
      </section>

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
                    selected?.id === u.id ? "admin-user active" : "admin-user"
                  }
                  onClick={() => setSelected(u)}
                >
                  <span className="admin-user-name">{u.name}</span>
                  <span className="muted admin-user-email">{u.email}</span>
                  <span className="admin-user-meta">
                    {formatCents(u.balanceCents)} · {u.handsPlayed} hands ·{" "}
                    {u.openVouchers ?? 0} spins · {u.goldenHands ?? 0} golden
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="admin-detail settings-block">
          {!selected && (
            <p className="muted">Select a player to inspect or adjust.</p>
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
                  hands · {openVouchers} spin
                  {openVouchers === 1 ? "" : "s"} · {goldenHands} Golden Hand
                  {goldenHands === 1 ? "" : "s"}
                </p>
              </div>

              <form className="form" onSubmit={onTopUp}>
                <div className="field">
                  <label htmlFor="admin-topup">Adjust balance (USD)</label>
                  <input
                    id="admin-topup"
                    type="number"
                    step="0.01"
                    required
                    value={dollars}
                    onChange={(e) => setDollars(e.target.value)}
                    placeholder="100 or -50"
                  />
                  <p
                    className="muted"
                    style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}
                  >
                    Use a negative amount to remove funds.
                  </p>
                </div>
                <button type="submit" className="btn" disabled={topping}>
                  {topping ? "Updating…" : "Apply"}
                </button>
              </form>

              <button
                type="button"
                className="btn btn-sm"
                disabled={granting}
                onClick={() => void onGrantVoucher()}
              >
                {granting ? "Granting…" : "Grant spin ticket"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={granting}
                onClick={() => void onGrantGoldenHands()}
              >
                {granting ? "Granting…" : "Grant Golden Hand"}
              </button>

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
                <label className="admin-reset-pot-opt">
                  <input
                    type="checkbox"
                    checked={removeJackpotTake}
                    onChange={(e) => setRemoveJackpotTake(e.target.checked)}
                  />
                  <span>
                    Also remove this player&apos;s jackpot funding from those
                    hands
                  </span>
                </label>
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

              <section className="admin-hands">
                <h2 className="admin-section-title">Hand history</h2>
                <p
                  className="muted"
                  style={{ margin: "0 0 0.65rem", fontSize: "0.8rem" }}
                >
                  P/L, bet, and balance after each settle
                  {handsTotal > 0 ? ` · ${handsTotal} total` : ""}
                </p>
                {loadingHands ? (
                  <p className="muted">Loading hands…</p>
                ) : hands.length === 0 ? (
                  <p className="muted">No hands recorded.</p>
                ) : (
                  <>
                    <ul className="admin-hand-list">
                      {hands.map((h) => {
                        const tag = handTag(h);
                        const pnlCls =
                          h.resultCents > 0
                            ? "admin-hand-win"
                            : h.resultCents < 0
                              ? "admin-hand-loss"
                              : "admin-hand-push";
                        return (
                          <li key={h.id} className="admin-hand-row">
                            <span className={`stats-tag admin-hand-tag ${tag.cls}`}>
                              {tag.text}
                            </span>
                            <span className={`admin-hand-pnl ${pnlCls}`}>
                              {h.resultCents > 0 ? "+" : ""}
                              {formatCents(h.resultCents)}
                            </span>
                            <span className="muted admin-hand-bet">
                              bet {formatCents(h.betCents)}
                              {h.doubled ? " · 2×" : ""}
                              {h.bust ? " · bust" : ""}
                            </span>
                            <span className="admin-hand-bal">
                              bal{" "}
                              {h.balanceAfterCents == null
                                ? "—"
                                : formatCents(h.balanceAfterCents)}
                              {h.balanceApproximate ? "~" : ""}
                            </span>
                            <span className="muted admin-hand-time">
                              {formatHandTime(h.createdAt)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {hands.length < handsTotal && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={loadingMoreHands}
                        onClick={() => void onLoadMoreHands()}
                      >
                        {loadingMoreHands
                          ? "Loading…"
                          : `Load more (${handsTotal - hands.length} left)`}
                      </button>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
