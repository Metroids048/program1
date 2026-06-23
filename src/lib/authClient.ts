import { navigateTo } from "./router";

const TOKENS_KEY = "ai-job:tokens:v1";

type StoredTokens = {
  accessToken: string;
  expiresAt: string;
};

function readTokens(): StoredTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function getStoredAccessToken(): string | null {
  const tokens = readTokens();
  if (!tokens) return null;
  if (new Date(tokens.expiresAt) <= new Date()) return null;
  return tokens.accessToken;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const token = getStoredAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

export function buildAuthReturnPath(path: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(path)}`;
}

export function redirectToLogin(path: string) {
  navigateTo(buildAuthReturnPath(path));
}
