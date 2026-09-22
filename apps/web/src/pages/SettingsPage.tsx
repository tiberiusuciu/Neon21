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
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Appearance and account.</p>

      <div className="settings-block">
        <div>
          <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
            Theme
          </p>
          <div className="segmented" role="group" aria-label="Theme">
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
        </div>

        {user && (
          <form className="form" onSubmit={onSaveName}>
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
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {user.email}
            </p>
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-ghost"
                disabled={busy || name.trim() === user.name}
              >
                {busy ? "Saving…" : "Save name"}
              </button>
            </div>
          </form>
        )}

        <button
          type="button"
          className="btn btn-ghost"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </motion.div>
  );
}
