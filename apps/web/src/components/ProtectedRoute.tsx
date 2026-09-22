import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { AppHeader } from "./AppHeader";
import { CashFxProvider } from "../lib/cashFx";

export function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!token) return <Navigate to="/login" replace />;

  return <Outlet />;
}

/** Requires display name before the rest of the app. */
export function NamedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!user.nameChosen && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <CashFxProvider>
      <AppHeader />
      <div className="page-wrap">
        <Outlet />
      </div>
    </CashFxProvider>
  );
}
