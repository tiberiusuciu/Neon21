import { Navigate, Route, Routes, useLocation, Outlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";
import { SocketProvider } from "./lib/SocketProvider";
import { AmbientCanvas } from "./components/AmbientCanvas";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { LobbyPage } from "./pages/LobbyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { TablePage } from "./pages/TablePage";

function AnimatedOutlet() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const showAmbient =
    location.pathname === "/login" || location.pathname === "/register";

  return (
    <>
      {showAmbient && <AmbientCanvas />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AnimatedOutlet />}>
            <Route path="/lobby" element={<LobbyPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/table/:tableId" element={<TablePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <div className="app-shell">
              <AnimatedRoutes />
            </div>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
