import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { GameTable } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";

export function LobbyPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [tables, setTables] = useState<GameTable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.tables(token);
        if (!cancelled) setTables(res.tables);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof ApiError ? err.message : "Failed to load tables"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast once on token change
  }, [token]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">Lobby</h1>
      <p className="page-sub">Open tables. Join a seat when you are ready.</p>

      {loading && <p className="muted">Loading tables…</p>}

      {!loading && tables.length === 0 && (
        <p className="empty">No tables yet.</p>
      )}

      {!loading && tables.length > 0 && (
        <>
          <table className="table-list desktop-only">
            <thead>
              <tr>
                <th>Name</th>
                <th>Players</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    {t.playerCount}/{t.seatCapacity}
                  </td>
                  <td>
                    <span className={`status-pill ${t.status}`}>{t.status}</span>
                  </td>
                  <td>
                    <Link to={`/table/${t.id}`} className="btn btn-sm">
                      Join
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mobile-rows mobile-only">
            {tables.map((t) => (
              <div className="mobile-row" key={t.id}>
                <strong>{t.name}</strong>
                <Link to={`/table/${t.id}`} className="btn btn-sm">
                  Join
                </Link>
                <div className="meta">
                  {t.playerCount}/{t.seatCapacity} ·{" "}
                  <span className={`status-pill ${t.status}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
