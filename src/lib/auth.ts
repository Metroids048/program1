import { useEffect, useState } from "react";

export interface AuthSession {
  userId: string;
  phone: string | null;
  displayName: string;
}

interface AuthTokens {
  accessToken: string;
  expiresAt: string;
}

const TOKENS_KEY = "ai-job:tokens:v1";
const SESSION_KEY = "ai-job:session:v1";

function readTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: AuthTokens | null) {
  if (tokens) {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } else {
    localStorage.removeItem(TOKENS_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
}

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

async function fetchSession(token: string): Promise<AuthSession | null> {
  try {
    const response = await fetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthSession;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => readSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const tokens = readTokens();
      if (tokens && new Date(tokens.expiresAt) > new Date()) {
        const sess = await fetchSession(tokens.accessToken);
        if (sess) {
          setSession(sess);
          writeSession(sess);
        } else {
          writeTokens(null);
        }
      } else {
        writeTokens(null);
      }
      setLoading(false);
    };
    void init();
  }, []);

  const getToken = (): string | null => {
    const tokens = readTokens();
    if (!tokens || new Date(tokens.expiresAt) <= new Date()) {
      writeTokens(null);
      setSession(null);
      return null;
    }
    return tokens.accessToken;
  };

  return {
    session,
    loading,
    isLoggedIn: !!session,
    getToken,
    setAuth: (sess: AuthSession, tokens: AuthTokens) => {
      writeTokens(tokens);
      writeSession(sess);
      setSession(sess);
    },
    clearAuth: () => {
      writeTokens(null);
      writeSession(null);
      setSession(null);
    },
  };
}
