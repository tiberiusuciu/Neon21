import type {
  ClaimResponse,
  GameTable,
  LeaderboardResponse,
  LeaderboardScope,
  LoginBody,
  PublicUser,
  RegisterBody,
  StatsResponse,
  Wallet,
} from "@neon21/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(extractErrorMessage(status, body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function extractErrorMessage(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    if (typeof o.message === "string") return o.message;
    if (o.error && typeof o.error === "object") {
      return `Bad request (${status})`;
    }
  }
  if (status === 400) return "Bad request";
  if (status === 401) return "Unauthorized";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not found";
  if (status === 409) return "Conflict";
  if (status === 429) return "Too many requests";
  return `Request failed (${status})`;
}

function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function authHeaders(
  token: string | null,
  hasBody: boolean
): HeadersInit {
  const headers: Record<string, string> = {
    "X-Timezone": clientTimeZone(),
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token = null, ...init } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders(token, init.body != null),
      ...(init.headers ?? {}),
    },
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const api = {
  url: API_URL,

  register(body: RegisterBody) {
    return request<{ token: string; user: PublicUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  login(body: LoginBody) {
    return request<{ token: string; user: PublicUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  me(token: string) {
    return request<{ user: PublicUser }>("/auth/me", { token });
  },

  googleUrl() {
    return `${API_URL}/auth/google`;
  },

  wallet(token: string) {
    return request<Wallet>("/wallet", { token });
  },

  claim(token: string) {
    return request<ClaimResponse & { user?: PublicUser }>("/wallet/claim", {
      method: "POST",
      token,
    });
  },

  tables(token: string) {
    return request<{ tables: GameTable[] }>("/tables", { token });
  },

  stats(token: string) {
    return request<StatsResponse>("/stats", { token });
  },

  leaderboard(token: string, scope: LeaderboardScope = "season") {
    return request<LeaderboardResponse>(
      `/leaderboard?scope=${encodeURIComponent(scope)}`,
      { token }
    );
  },
};
