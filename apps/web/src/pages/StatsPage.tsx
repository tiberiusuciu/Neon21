import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { HandOutcome, PlayerStats, StatsResponse } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { formatCents } from "../lib/format";

function formatWinRate(rate: number): string {
  return `${(rate * 100).toFixed(rate > 0 && rate < 0.1 ? 1 : 0)}%`;
}

function outcomeLabel(h: HandOutcome): { text: string; cls: string } {
  if (h.isInsurance) {
    if (h.resultCents > 0) return { text: "Ins", cls: "tag-win" };
    if (h.resultCents < 0) return { text: "Ins", cls: "tag-loss" };
    return { text: "Ins", cls: "tag-push" };
  }
  if (h.isBlackjack && h.resultCents > 0) return { text: "BJ", cls: "tag-bj" };
  if (h.resultCents > 0) return { text: "Win", cls: "tag-win" };
  if (h.resultCents < 0) return { text: "Loss", cls: "tag-loss" };
  return { text: "Push", cls: "tag-push" };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function OutcomeBar({ stats }: { stats: PlayerStats }) {
  const total = stats.wins + stats.losses + stats.pushes;
  if (total === 0) return null;
  const w = (stats.wins / total) * 100;
  const l = (stats.losses / total) * 100;
  const p = (stats.pushes / total) * 100;
  return (
    <div className="stats-section">
      <h2 className="stats-section-title">Outcomes</h2>
      <div className="stats-bar" role="img" aria-label="Win loss push breakdown">
        {w > 0 && (
          <div className="stats-bar-seg win" style={{ width: `${w}%` }} title={`Wins ${stats.wins}`} />
        )}
        {l > 0 && (
          <div className="stats-bar-seg loss" style={{ width: `${l}%` }} title={`Losses ${stats.losses}`} />
        )}
        {p > 0 && (
          <div className="stats-bar-seg push" style={{ width: `${p}%` }} title={`Pushes ${stats.pushes}`} />
        )}
      </div>
      <div className="stats-bar-legend">
        <span>
          <i className="dot win" /> Wins {stats.wins}
        </span>
        <span>
          <i className="dot loss" /> Losses {stats.losses}
        </span>
        <span>
          <i className="dot push" /> Pushes {stats.pushes}
        </span>
      </div>
    </div>
  );
}

function RecentSpark({ recent }: { recent: HandOutcome[] }) {
  const points = [...recent].reverse();
  if (points.length < 2) return null;

  const values = points.map((h) => h.resultCents);
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const w = 320;
  const h = 72;
  const pad = 4;
  const barW = (w - pad * 2) / points.length;
  const mid = h / 2;

  return (
    <div className="stats-section">
      <h2 className="stats-section-title">Recent form</h2>
      <svg
        className="stats-chart"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Recent hand results"
      >
        <line
          x1={0}
          y1={mid}
          x2={w}
          y2={mid}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const mag = (Math.abs(p.resultCents) / maxAbs) * (mid - pad);
          const x = pad + i * barW + barW * 0.15;
          const bw = barW * 0.7;
          const positive = p.resultCents >= 0;
          const y = positive ? mid - mag : mid;
          const bh = Math.max(mag, 1);
          return (
            <rect
              key={p.id}
              x={x}
              y={y}
              width={bw}
              height={bh}
              rx={1.5}
              fill={positive ? "var(--accent)" : "var(--danger)"}
              opacity={p.resultCents === 0 ? 0.35 : 0.9}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function StatsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.stats(token);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : "Failed to load stats");
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

  const stats = data?.stats;
  const recent = data?.recent ?? [];
  const empty = stats != null && stats.handsPlayed === 0;

  return (
    <motion.div
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <h1 className="page-title">Stats</h1>
      <p className="page-sub">Lifetime results across every hand you finish.</p>

      {loading && <p className="muted">Loading stats…</p>}

      {!loading && empty && (
        <p className="empty">Play a few hands — stats show up here.</p>
      )}

      {!loading && stats && !empty && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Hands</span>
              <span className="stat-value">{stats.handsPlayed}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Win rate</span>
              <span className="stat-value">{formatWinRate(stats.winRate)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Blackjacks</span>
              <span className="stat-value">{stats.blackjacks}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Net P/L</span>
              <span
                className={`stat-value ${
                  stats.netProfitCents > 0
                    ? "result-pos"
                    : stats.netProfitCents < 0
                      ? "result-neg"
                      : ""
                }`}
              >
                {stats.netProfitCents > 0 ? "+" : ""}
                {formatCents(stats.netProfitCents)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Biggest win</span>
              <span className="stat-value result-pos">
                {stats.biggestWinCents > 0
                  ? `+${formatCents(stats.biggestWinCents)}`
                  : formatCents(0)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Biggest loss</span>
              <span className="stat-value result-neg">
                {stats.biggestLossCents > 0
                  ? `−${formatCents(stats.biggestLossCents)}`
                  : formatCents(0)}
              </span>
            </div>
          </div>

          <OutcomeBar stats={stats} />
          <RecentSpark recent={recent} />

          {recent.length > 0 && (
            <div className="stats-section">
              <h2 className="stats-section-title">Recent hands</h2>
              <table className="stats-table desktop-only">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Result</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((h) => {
                    const tag = outcomeLabel(h);
                    return (
                      <tr key={h.id}>
                        <td className="muted">{formatTime(h.createdAt)}</td>
                        <td>
                          <span className={`stats-tag ${tag.cls}`}>{tag.text}</span>
                        </td>
                        <td
                          className={
                            h.resultCents > 0
                              ? "result-pos"
                              : h.resultCents < 0
                                ? "result-neg"
                                : "result-push"
                          }
                        >
                          {h.resultCents > 0 ? "+" : ""}
                          {formatCents(h.resultCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mobile-rows mobile-only">
                {recent.map((h) => {
                  const tag = outcomeLabel(h);
                  return (
                    <div className="mobile-row" key={h.id}>
                      <div>
                        <span className={`stats-tag ${tag.cls}`}>{tag.text}</span>
                        {h.doubled && <span className="stats-meta">×2</span>}
                        {h.bust && <span className="stats-meta">bust</span>}
                      </div>
                      <span
                        className={
                          h.resultCents > 0
                            ? "result-pos"
                            : h.resultCents < 0
                              ? "result-neg"
                              : "result-push"
                        }
                      >
                        {h.resultCents > 0 ? "+" : ""}
                        {formatCents(h.resultCents)}
                      </span>
                      <div className="meta">{formatTime(h.createdAt)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
