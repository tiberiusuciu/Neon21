import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { AppHeader } from "./AppHeader";
import { CashFxProvider, useCashFx } from "../lib/cashFx";

function BootScreen() {
  return (
    <div className="auth-page">
      <p className="muted">Loading…</p>
    </div>
  );
}

export function ProtectedRoute() {
  const { token, user, loading } = useAuth();

  if (loading || (token && !user)) return <BootScreen />;

  if (!token) return <Navigate to="/login" replace />;

  return <Outlet />;
}

function AppShell() {
  const { shakeClass } = useCashFx();
  return (
    <>
      <AppHeader />
      <div className={`cash-fx-body${shakeClass ? ` ${shakeClass}` : ""}`}>
        <div className="page-wrap">
          <Outlet />
        </div>
      </div>
    </>
  );
}

/** Requires display name before the rest of the app. */
export function NamedRoute() {
  const { token, user, loading } = useAuth();
  const location = useLocation();

  if (loading || (token && !user)) return <BootScreen />;

  if (!user) return <Navigate to="/login" replace />;

  if (!user.nameChosen && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <CashFxProvider>
      <AppShell />
    </CashFxProvider>
  );
}
