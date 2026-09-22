import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useToast } from "../lib/toast";

export function OnboardingNamePage() {
  const { user, loading, updateName } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  if (loading || (token && !user)) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.nameChosen) return <Navigate to="/lobby" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a display name");
      return;
    }
    setBusy(true);
    try {
      await updateName(trimmed);
      navigate("/lobby", { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save name");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <motion.div
        className="auth-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="brand">
          Neon<span className="brand-accent">21</span>
        </div>
        <p className="auth-lead">Choose your display name.</p>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              type="text"
              autoComplete="nickname"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
