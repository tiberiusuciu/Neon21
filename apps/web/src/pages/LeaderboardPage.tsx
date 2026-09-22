import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LeaderboardEntry, LeaderboardResponse, LeaderboardScope } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents } from "../lib/format";

function formatWinRate(rate: number): string {
  return `${(rate * 100).toFixed(rate > 0 && rate < 0.1 ? 1 : 0)}%`;
}

function formatWeekStart(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function NetCell({ cents }: { cents: number }) {
  const cls =
    cents > 0 ? "result-pos" : cents < 0 ? "result-neg" : "result-push";
  return (
    <span className={cls}>
      {cents > 0 ? "+" : ""}
      {formatCents(cents)}
    </span>
  );
}

function EntryRow({ e }: { e: LeaderboardEntry }) {
  return (
    <tr className={e.isYou ? "leaderboard-you" : undefined}>
      <td className="lb-rank">{e.rank}</td>
      <td>
        {e.name}
        {e.isYou && <span className="lb-you-tag">you</span>}
      </td>
      <td>
        <NetCell cents={e.netProfitCents} />
      </td>
      <td>{e.handsPlayed}</td>
      <td>{formatWinRate(e.winRate)}</td>
      <td>{e.blackjacks}</td>
      <td>
        {e.biggestWinCents > 0 ? (
          <span className="result-pos">+{formatCents(e.biggestWinCents)}</span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function EntryMobile({ e }: { e: LeaderboardEntry }) {
  return (
    <div className={`mobile-row${e.isYou ? " leaderboard-you" : ""}`}>
      <div>
        <div className="mobile-row-title">
          <span className="lb-rank">#{e.rank}</span> {e.name}
          {e.isYou && <span className="lb-you-tag">you</span>}
        </div>
        <div className="meta">
          {e.handsPlayed} hands · {formatWinRate(e.winRate)} · {e.blackjacks} BJ
        </div>
      </div>
      <NetCell cents={e.netProfitCents} />
    </div>
  );
}

export function LeaderboardPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [scope, setScope] = useState<LeaderboardScope>("season");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.leaderboard(token, scope);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof ApiError ? err.message : "Failed to load leaderboard"
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
  }, [token, scope]);

  const entries = data?.entries ?? [];
  const me = data?.me ?? null;
  const meOutside = me != null && !entries.some((e) => e.userId === me.userId);
  const empty = !loading && entries.length === 0 && !me;

  const seasonLabel = data?.seasonId ?? "Season";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Leaderboard</h1>
      <p className="page-sub">
        Ranked by net profit. Season weeks run Monday–Sunday Eastern Time.
      </p>

      <div className="leaderboard-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scope === "season"}
          className={`leaderboard-tab${scope === "season" ? " is-active" : ""}`}
          onClick={() => setScope("season")}
        >
          Season
          {scope === "season" && data?.seasonId && (
            <span className="leaderboard-tab-sub">{data.seasonId}</span>
          )}
          {scope !== "season" && <span className="leaderboard-tab-sub">week</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "alltime"}
          className={`leaderboard-tab${scope === "alltime" ? " is-active" : ""}`}
          onClick={() => setScope("alltime")}
        >
          All time
        </button>
      </div>

      {scope === "season" && data?.seasonStartsAt && (
        <p className="leaderboard-season-meta muted">
          {seasonLabel} · week starts {formatWeekStart(data.seasonStartsAt)}
        </p>
      )}

      {loading && <p className="muted">Loading leaderboard…</p>}

      {!loading && empty && (
        <p className="empty">
          {scope === "season"
            ? "No hands this season yet."
            : "No all-time stats yet."}
        </p>
      )}

      {!loading && !empty && (
        <>
          <table className="leaderboard-table desktop-only">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Net P/L</th>
                <th>Hands</th>
                <th>Win %</th>
                <th>BJ</th>
                <th>Best win</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <EntryRow key={e.userId} e={e} />
              ))}
            </tbody>
          </table>

          <div className="mobile-rows mobile-only">
            {entries.map((e) => (
              <EntryMobile key={e.userId} e={e} />
            ))}
          </div>

          {meOutside && me && (
            <div className="leaderboard-me-strip">
              <span className="lb-me-label">Your rank</span>
              <table className="leaderboard-table leaderboard-me-table desktop-only">
                <tbody>
                  <EntryRow e={me} />
                </tbody>
              </table>
              <div className="mobile-only">
                <EntryMobile e={me} />
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
