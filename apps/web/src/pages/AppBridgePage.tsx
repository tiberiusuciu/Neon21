import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isNativeApp } from "../lib/native";

function openDeepLink(url: string) {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 2000);
  window.setTimeout(() => {
    window.location.href = url;
  }, 150);
}

/**
 * OAuth landing on the web origin.
 * Cap Browser: deep-link back into the APK.
 * Desktop web: apply the JWT in this document.
 */
export function AppBridgePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setTokenFromUrl } = useAuth();
  const [message, setMessage] = useState("Signing you in…");

  const token = params.get("token");
  const nativeHint = params.get("native") === "1";
  const nextParam = params.get("next") || "/lobby";
  const next = nextParam.startsWith("/") ? nextParam : `/${nextParam}`;

  useEffect(() => {
    if (!token) {
      setMessage("Missing sign-in token.");
      const t = window.setTimeout(
        () => navigate("/login", { replace: true }),
        1500
      );
      return () => window.clearTimeout(t);
    }

    const deep = `com.neon21.app://auth/callback?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
    const mobileUa = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const preferApp = !isNativeApp() && (nativeHint || mobileUa);

    if (preferApp) {
      setMessage("Opening Neon21…");
      openDeepLink(deep);
      // Do not apply JWT in the Custom Tab — that storage is not the APK WebView.
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const user = await setTokenFromUrl(token);
        if (cancelled) return;
        const dest =
          next === "/onboarding" || !user.nameChosen ? "/onboarding" : next;
        navigate(dest, { replace: true });
      } catch (err) {
        console.error("[Auth] App bridge failed:", err);
        if (!cancelled) {
          setMessage("Sign-in failed. Returning to login…");
          window.setTimeout(() => navigate("/login", { replace: true }), 1200);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, next, nativeHint, navigate, setTokenFromUrl]);

  return (
    <div className="auth-page">
      <p className="muted">{message}</p>
      {token && (nativeHint || /Android|iPhone|iPad/i.test(navigator.userAgent)) && (
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
          If the app did not open,{" "}
          <a
            href={`com.neon21.app://auth/callback?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`}
          >
            tap here
          </a>
          .
        </p>
      )}
    </div>
  );
}
