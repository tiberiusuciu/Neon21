import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { useTheme, type ThemeMode } from "../lib/theme";
import { useToast } from "../lib/toast";

const MODES: ThemeMode[] = ["light", "dark", "system"];

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, logout, updateName } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);

  async function onSaveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a display name");
      return;
    }
    if (trimmed === user?.name) return;
    setBusy(true);
    try {
      await updateName(trimmed);
      toast.success("Display name updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save name");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="settings-page"
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <header className="settings-page-head">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Appearance and account.</p>
      </header>

      <div className="settings-card">
        <section className="settings-section">
          <h2 className="settings-section-title">Appearance</h2>
          <p className="settings-section-hint">
            Choose how Neon21 looks on this device.
          </p>
          <div className="segmented settings-theme" role="group" aria-label="Theme">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={theme === mode ? "active" : ""}
                onClick={() => setTheme(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>

        {user && (
          <section className="settings-section">
            <h2 className="settings-section-title">Account</h2>
            <p className="settings-section-hint">{user.email}</p>
            <form className="form settings-name-form" onSubmit={onSaveName}>
              <div className="field">
                <label htmlFor="settings-name">Display name</label>
                <input
                  id="settings-name"
                  type="text"
                  autoComplete="nickname"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn"
                  disabled={busy || name.trim() === user.name}
                >
                  {busy ? "Saving…" : "Save name"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="settings-section settings-section-danger">
          <button
            type="button"
            className="btn btn-ghost settings-sign-out"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </section>
      </div>
    </motion.div>
  );
}
