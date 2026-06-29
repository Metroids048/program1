import { navigateTo } from "./router";

const TOKENS_KEY = "ai-job:tokens:v1";
const GUEST_ID_KEY = "ai-job:guest-id:v1";

// 为未登录访客生成并持久化一个会话级匿名 id，确保不同访客的数据在服务端互相隔离。
export function getGuestSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

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
  // 未登录时附带访客会话 id，让服务端按访客隔离数据与 RAG 召回。
  if (!token && !headers.has("x-guest-id")) {
    const guestId = getGuestSessionId();
    if (guestId) headers.set("x-guest-id", guestId);
  }
  return fetch(input, { ...init, headers });
}

export function buildAuthReturnPath(path: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(path)}`;
}

export function redirectToLogin(path: string) {
  navigateTo(buildAuthReturnPath(path));
}
