import type {
  AdminGrantVoucherBody,
  AdminGrantVoucherResponse,
  AdminHandHistoryResponse,
  AdminJackpotResponse,
  AdminResetStatsBody,
  AdminResetStatsResponse,
  AdminSetJackpotBody,
  AdminSetJackpotResponse,
  AdminTopUpBody,
  AdminTopUpResponse,
  AdminUsersResponse,
  ClaimResponse,
  GameTable,
  LeaderboardResponse,
  LeaderboardScope,
  JackpotResponse,
  LoginBody,
  PublicUser,
  RegisterBody,
  StatsResponse,
  UpdateNameBody,
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

  updateName(token: string, body: UpdateNameBody) {
    return request<{ user: PublicUser }>("/auth/me", {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  googleUrl() {
    return `${API_URL}/auth/google`;
  },

  googleMobileUrl() {
    return `${API_URL}/auth/google/mobile`;
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

  jackpot(token: string) {
    return request<JackpotResponse>("/jackpot", { token });
  },

  adminJackpot(token: string) {
    return request<AdminJackpotResponse>("/admin/jackpot", { token });
  },

  adminSetJackpot(token: string, body: AdminSetJackpotBody) {
    return request<AdminSetJackpotResponse>("/admin/jackpot/set-pot", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  adminUsers(token: string, q = "") {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<AdminUsersResponse>(`/admin/users${qs}`, { token });
  },

  adminHandHistory(
    token: string,
    userId: string,
    opts: { limit?: number; offset?: number } = {}
  ) {
    const params = new URLSearchParams();
    if (opts.limit != null) params.set("limit", String(opts.limit));
    if (opts.offset != null) params.set("offset", String(opts.offset));
    const qs = params.toString() ? `?${params}` : "";
    return request<AdminHandHistoryResponse>(
      `/admin/users/${userId}/hands${qs}`,
      { token }
    );
  },

  adminGrantVoucher(
    token: string,
    userId: string,
    body: AdminGrantVoucherBody = { count: 1 }
  ) {
    return request<AdminGrantVoucherResponse>(
      `/admin/users/${userId}/grant-voucher`,
      {
        method: "POST",
        token,
        body: JSON.stringify(body),
      }
    );
  },

  adminTopUp(token: string, userId: string, body: AdminTopUpBody) {
    return request<AdminTopUpResponse>(`/admin/users/${userId}/topup`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  adminResetStats(token: string, userId: string, body: AdminResetStatsBody) {
    return request<AdminResetStatsResponse>(
      `/admin/users/${userId}/reset-stats`,
      {
        method: "POST",
        token,
        body: JSON.stringify(body),
      }
    );
  },

  adminDeleteUser(token: string, userId: string) {
    return request<{ ok: true; id: string; email: string }>(
      `/admin/users/${userId}`,
      { method: "DELETE", token }
    );
  },
};
