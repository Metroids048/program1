export interface User {
  id: string;
  phone: string | null;
  displayName: string;
  passwordHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthIdentity {
  id: string;
  userId: string;
  provider: "phone" | "password" | "wechat";
  identifier: string;
  createdAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenJti: string;
  expiresAt: string;
  createdAt: string;
}

export interface JwtPayload {
  sub: string; // userId
  jti: string; // token id
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  expiresAt: string;
}

export interface RegisterInput {
  phone: string;
  smsCode: string;
  displayName?: string;
}

export interface LoginInput {
  phone: string;
  smsCode?: string;
  password?: string;
}

export interface SessionInfo {
  userId: string;
  phone: string | null;
  displayName: string;
}
