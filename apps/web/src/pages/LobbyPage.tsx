import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { LobbyTable } from "@neon21/shared";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { useGameSocket } from "../lib/SocketProvider";

export function LobbyPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { lobbyTables, subscribeLobby, connected } = useGameSocket();
  const [fallback, setFallback] = useState<LobbyTable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) return;
    subscribeLobby();
  }, [connected, subscribeLobby]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.tables(token);
        if (!cancelled) setFallback(res.tables);
      } catch (err) {
        if (!cancelled && lobbyTables.length === 0) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (lobbyTables.length > 0) setLoading(false);
  }, [lobbyTables]);

  const tables = lobbyTables.length > 0 ? lobbyTables : fallback;

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
