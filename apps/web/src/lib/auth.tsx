import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { PublicUser, Wallet } from "@neon21/shared";
import { api } from "./api";
import { isNativeApp, parseAppAuthUrl } from "./native";

const TOKEN_KEY = "neon21_token";

type AuthState = {
  token: string | null;
  user: PublicUser | null;
  wallet: Wallet | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  claim: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  setTokenFromUrl: (token: string) => Promise<void>;
  setBalanceCents: (n: number) => void;
  startGoogleSignIn: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function takeTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (!urlToken) return null;
  localStorage.setItem(TOKEN_KEY, urlToken);
  params.delete("token");
  const clean =
    window.location.pathname +
    (params.toString() ? `?${params}` : "") +
    window.location.hash;
  window.history.replaceState({}, "", clean);
  return urlToken;
}

async function loadSession(token: string) {
  const [{ user }, wallet] = await Promise.all([
    api.me(token),
    api.wallet(token),
  ]);
  return { user, wallet };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => {
    return takeTokenFromUrl() ?? localStorage.getItem(TOKEN_KEY);
  });
  const [user, setUser] = useState<PublicUser | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const applyToken = useCallback(async (next: string) => {
    localStorage.setItem(TOKEN_KEY, next);
    setToken(next);
    const session = await loadSession(next);
    setUser(session.user);
    setWallet(session.wallet);
    return session.user;
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setWallet(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      clear();
      return;
    }
    try {
      const session = await loadSession(token);
      setUser(session.user);
      setWallet(session.wallet);
    } catch {
      clear();
    }
  }, [token, clear]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const session = await loadSession(token);
        if (!cancelled) {
          setUser(session.user);
          setWallet(session.wallet);
        }
      } catch (err: unknown) {
        console.error("[Auth] Session fetch failed:", err);
        const status =
          err && typeof err === "object" && "status" in err
            ? (err as { status?: number }).status
            : undefined;
        if (status === 401 && !cancelled) clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- boot once

  useEffect(() => {
    if (!isNativeApp()) return;

    let handle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;

    (async () => {
      const { App: CapApp } = await import("@capacitor/app");
      const { Browser } = await import("@capacitor/browser");
      if (cancelled) return;

      handle = await CapApp.addListener("appUrlOpen", async ({ url }) => {
        const parsed = parseAppAuthUrl(url);
        if (!parsed) return;
        try {
          await Browser.close();
        } catch {
          /* already closed */
        }
        try {
          const u = await applyToken(parsed.token);
          const next =
            parsed.next === "/onboarding" || !u.nameChosen
              ? "/onboarding"
              : parsed.next || "/lobby";
          navigate(next, { replace: true });
        } catch (err) {
          console.error("[Auth] Native Google callback failed:", err);
          clear();
          navigate("/login", { replace: true });
        }
      });
    })();

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [applyToken, clear, navigate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      await applyToken(res.token);
    },
    [applyToken]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.register({ name, email, password });
      await applyToken(res.token);
    },
    [applyToken]
  );

  const claim = useCallback(async () => {
    if (!token) throw new Error("Not signed in");
    const res = await api.claim(token);
    const walletState = await api.wallet(token);
    setWallet(walletState);
    if (res.user) {
      setUser(res.user);
    } else {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              balanceCents: res.balanceCents,
              lastClaimAt: res.lastClaimAt,
            }
          : prev
      );
    }
  }, [token]);

  const updateName = useCallback(
    async (name: string) => {
      if (!token) throw new Error("Not signed in");
      const res = await api.updateName(token, { name });
      setUser(res.user);
    },
    [token]
  );

  const setTokenFromUrl = useCallback(
    async (t: string) => {
      await applyToken(t);
    },
    [applyToken]
  );

  const startGoogleSignIn = useCallback(async () => {
    if (isNativeApp()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: api.googleMobileUrl() });
      return;
    }
    window.location.href = api.googleUrl();
  }, []);

  const setBalanceCents = useCallback((n: number) => {
    setUser((prev) => (prev ? { ...prev, balanceCents: n } : prev));
    setWallet((prev) => (prev ? { ...prev, balanceCents: n } : prev));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      wallet,
      loading,
      login,
      register,
      logout: clear,
      refresh,
      claim,
      updateName,
      setTokenFromUrl,
      setBalanceCents,
      startGoogleSignIn,
    }),
    [
      token,
      user,
      wallet,
      loading,
      login,
      register,
      clear,
      refresh,
      claim,
      updateName,
      setTokenFromUrl,
      setBalanceCents,
      startGoogleSignIn,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
