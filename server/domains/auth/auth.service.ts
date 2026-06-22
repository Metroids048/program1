import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AppDb } from "../../db";
import type { AuthTokens, JwtPayload, LoginInput, RegisterInput, SessionInfo, User } from "./types";
import { makeId, nowIso } from "../../utils";

const JWT_SECRET = process.env.JWT_SECRET ?? "ai-job-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "24h";
const SMS_CODE_LENGTH = 6;
const SMS_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

// In-memory SMS code store for MVP (replace with Redis in production)
const smsCodes = new Map<string, { code: string; expiresAt: number }>();

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

function generateSmsCode(): string {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test" || !process.env.SMS_API_KEY) {
    return "666666"; // Mock code for development/testing
  }
  return Array.from({ length: SMS_CODE_LENGTH }, () => Math.floor(Math.random() * 10)).join("");
}

function signToken(userId: string, jti: string): string {
  const payload: Omit<JwtPayload, "iat" | "exp"> = { sub: userId, jti };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, issuer: "ai-job-platform" });
}

function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET, { issuer: "ai-job-platform" }) as JwtPayload;
}

export function createAuthService(db: AppDb) {
  function toUser(row: { id: string; phone: string | null; displayName: string; passwordHash: string | null; createdAt: string; updatedAt: string }): User {
    return {
      id: row.id,
      phone: row.phone,
      displayName: row.displayName,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  function internalGetUserByPhone(phone: string): User | undefined {
    const row = db.getUserByPhone(phone);
    return row ? toUser(row) : undefined;
  }

  function internalGetUserById(userId: string): User | undefined {
    const row = db.getUserById(userId);
    return row ? toUser(row) : undefined;
  }

  function internalCreateUser(phone: string, displayName?: string, password?: string): User {
    const now = nowIso();
    const passwordHash = password ? hashPassword(password) : null;
    const user = {
      id: makeId("user"),
      phone,
      displayName: displayName?.trim() || "",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    db.insertUser(user);
    return user;
  }

  function internalCreateSession(userId: string): AuthTokens {
    const jti = makeId("jti");
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.insertSession({
      id: makeId("sess"),
      userId,
      tokenJti: jti,
      expiresAt,
      createdAt: now,
    });
    const accessToken = signToken(userId, jti);
    return { accessToken, expiresAt };
  }

  function sendSms(phone: string): { success: boolean; mockCode?: string } {
    const code = generateSmsCode();
    smsCodes.set(phone, { code, expiresAt: Date.now() + SMS_CODE_TTL_MS });
    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    if (isDev || !process.env.SMS_API_KEY) {
      console.log(`[SMS Mock] code for ${phone}: ${code}`);
      return { success: true, mockCode: isDev ? code : undefined };
    }
    return { success: true };
  }

  function verifySmsCode(phone: string, code: string): boolean {
    const record = smsCodes.get(phone);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      smsCodes.delete(phone);
      return false;
    }
    const valid = record.code === code;
    if (valid) smsCodes.delete(phone);
    return valid;
  }

  return {
    sendSms,

    async register(input: RegisterInput): Promise<{ user: User; tokens: AuthTokens }> {
      if (!verifySmsCode(input.phone, input.smsCode)) {
        throw Object.assign(new Error("SMS_CODE_INVALID"), { statusCode: 400 });
      }

      const existing = internalGetUserByPhone(input.phone);
      if (existing) {
        throw Object.assign(new Error("PHONE_ALREADY_REGISTERED"), { statusCode: 409 });
      }

      const user = internalCreateUser(input.phone, input.displayName);
      db.insertAuthIdentity({
        id: makeId("authid"),
        userId: user.id,
        provider: "phone",
        identifier: input.phone,
        createdAt: nowIso(),
      });

      const tokens = internalCreateSession(user.id);
      return { user, tokens };
    },

    async login(input: LoginInput): Promise<{ user: User; tokens: AuthTokens }> {
      const user = internalGetUserByPhone(input.phone);
      if (!user) {
        throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
      }

      if (input.smsCode) {
        if (!verifySmsCode(input.phone, input.smsCode)) {
          throw Object.assign(new Error("SMS_CODE_INVALID"), { statusCode: 401 });
        }
      } else if (input.password) {
        if (!user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
          throw Object.assign(new Error("INVALID_CREDENTIALS"), { statusCode: 401 });
        }
      } else {
        throw Object.assign(new Error("MISSING_CREDENTIALS"), { statusCode: 400 });
      }

      const tokens = internalCreateSession(user.id);
      return { user, tokens };
    },

    async logout(token: string): Promise<void> {
      try {
        const payload = verifyToken(token);
        db.deleteSessionByJti(payload.jti);
      } catch {
        // Token already invalid, nothing to do
      }
    },

    validateSession(token: string): SessionInfo {
      let payload: JwtPayload;
      try {
        payload = verifyToken(token);
      } catch {
        throw Object.assign(new Error("INVALID_TOKEN"), { statusCode: 401 });
      }
      const session = db.getSessionByJti(payload.jti, nowIso());
      if (!session) {
        throw Object.assign(new Error("SESSION_EXPIRED"), { statusCode: 401 });
      }
      const user = internalGetUserById(payload.sub);
      if (!user) {
        throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 401 });
      }
      return { userId: user.id, phone: user.phone, displayName: user.displayName };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
