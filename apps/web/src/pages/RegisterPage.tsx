import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useToast } from "../lib/toast";

export function RegisterPage() {
  const { register, token, user, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading || (token && !user)) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (token && user) {
    return (
      <Navigate
        to={user.nameChosen ? "/lobby" : "/onboarding"}
        replace
      />
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await register(name, email, password);
      navigate("/lobby");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Registration failed"
      );
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
        <p className="auth-lead">Create your account.</p>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              minLength={1}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
        <p className="auth-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
