import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { nowIso } from "./utils";
import type { SessionInfo } from "./domains/auth/types";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function createOneTimeToken(): { plainToken: string; tokenHash: string } {
  const plainToken = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(plainToken).digest("hex");
  return { plainToken, tokenHash };
}

export function hashOpaqueToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function requireAuth(request: FastifyRequest): SessionInfo {
  if (!request.session) {
    throw Object.assign(new Error("UNAUTHORIZED"), { statusCode: 401 });
  }
  return request.session;
}

export function requireVerifiedEmail(request: FastifyRequest): SessionInfo {
  const session = requireAuth(request);
  if (!session.email || !session.emailVerifiedAt) {
    throw Object.assign(new Error("EMAIL_VERIFICATION_REQUIRED"), { statusCode: 403 });
  }
  return session;
}

export function applyRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw Object.assign(new Error("RATE_LIMITED"), { statusCode: 429 });
  }
  current.count += 1;
  rateLimitStore.set(key, current);
}

export function resetRateLimits(): void {
  rateLimitStore.clear();
}

export function clientIp(request: FastifyRequest): string {
  return request.ip || request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || "unknown";
}

export function setCorsHeaders(reply: FastifyReply): void {
  const allowedOrigin = process.env.APP_CORS_ORIGIN ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:5173";
  reply.header("Access-Control-Allow-Origin", allowedOrigin);
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function auditDetail(detail: Record<string, unknown>): string {
  return JSON.stringify({ ...detail, recordedAt: nowIso() });
}
