import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme, type ThemeMode } from "../lib/theme";

const MODES: ThemeMode[] = ["light", "dark", "system"];

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
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
          <div>
            <p className="muted" style={{ margin: "0 0 0.25rem", fontSize: "0.85rem" }}>
              Account
            </p>
            <p style={{ margin: 0, fontWeight: 600 }}>{user.name}</p>
            <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.9rem" }}>
              {user.email}
            </p>
          </div>
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
