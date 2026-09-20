import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { AppHeader } from "./AppHeader";

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

  return (
    <>
      <AppHeader />
      <div className="page-wrap">
        <Outlet />
      </div>
    </>
  );
}
