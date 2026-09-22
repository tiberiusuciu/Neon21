import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Parse `com.neon21.app://auth/callback?token=…&next=/lobby` */
export function parseAppAuthUrl(
  url: string
): { token: string; next: string } | null {
  try {
    const normalized = url.replace(/^com\.neon21\.app:\/*/i, "https://app.local/");
    const parsed = new URL(normalized);
    const token = parsed.searchParams.get("token");
    if (!token) return null;
    const next = parsed.searchParams.get("next") || "/lobby";
    return { token, next: next.startsWith("/") ? next : `/${next}` };
  } catch {
    return null;
  }
}
