import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";
import { SocketProvider } from "./lib/SocketProvider";
import { AmbientCanvas } from "./components/AmbientCanvas";
import { GoldenHourFx } from "./components/GoldenHourFx";
import { NamedRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OnboardingNamePage } from "./pages/OnboardingNamePage";
import { LobbyPage } from "./pages/LobbyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { JackpotPage } from "./pages/JackpotPage";
import { TablePage } from "./pages/TablePage";
import { AdminPage } from "./pages/AdminPage";
import { AppBridgePage } from "./pages/AppBridgePage";

function AppRoutes() {
  const location = useLocation();
  const showAmbient =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/onboarding" ||
    location.pathname === "/auth/app-bridge";

  return (
    <>
      {showAmbient && <AmbientCanvas />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/app-bridge" element={<AppBridgePage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingNamePage />} />
          <Route element={<NamedRoute />}>
            <Route path="/lobby" element={<LobbyPage />} />
            <Route path="/stats" element={<Navigate to="/lobby" replace />} />
            <Route path="/jackpot" element={<JackpotPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
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
              <GoldenHourFx />
              <AppRoutes />
            </div>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
