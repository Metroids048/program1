import type { AppDb } from "../../db";
import { makeId, nowIso } from "../../utils";

// Hardcoded quotas for beta testing (no payment yet)
const GUEST_DAILY_LIMIT = 3;
const USER_DAILY_LIMIT = 10;
const GUEST_POSITION_LIMIT = 1;
const USER_POSITION_LIMIT = 3;

export interface QuotaInfo {
  dailyUsed: number;
  dailyLimit: number;
  positionsUsed: number;
  positionLimit: number;
  remaining: number;
  isGuest: boolean;
  resetAt: string; // ISO date when daily quota resets
}

export function createQuotaService(db: AppDb) {
  function getDailyResetAt(): string {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString();
  }

  function countDailyUsage(userId: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    if (db.db) {
      const row = db.db.prepare(
        "select count(*) as cnt from quota_ledger where user_id = ? and created_at >= ?",
      ).get(userId, todayStr) as { cnt: number } | undefined;
      return row?.cnt ?? 0;
    }
    // File fallback: count from in-memory store (approximate)
    return 0;
  }

  function countUserPositions(userId: string): number {
    const state = db.getState(userId);
    return state.positions.length;
  }

  function recordUsage(userId: string, endpoint: string): void {
    const id = makeId("quota");
    const now = nowIso();
    if (db.db) {
      db.db.prepare(
        "insert into quota_ledger(id, user_id, endpoint, created_at) values (?, ?, ?, ?)",
      ).run(id, userId, endpoint, now);
    }
    // File fallback: quota tracking is best-effort
  }

  function getQuotaInfo(userId: string | undefined, positionsCount?: number): QuotaInfo {
    const isGuest = !userId;
    const dailyLimit = isGuest ? GUEST_DAILY_LIMIT : USER_DAILY_LIMIT;
    const positionLimit = isGuest ? GUEST_POSITION_LIMIT : USER_POSITION_LIMIT;
    const dailyUsed = userId ? countDailyUsage(userId) : 0;
    const positionsUsed = positionsCount ?? (userId ? countUserPositions(userId) : 0);

    return {
      dailyUsed,
      dailyLimit,
      positionsUsed,
      positionLimit,
      remaining: Math.max(0, dailyLimit - dailyUsed),
      isGuest,
      resetAt: getDailyResetAt(),
    };
  }

  return {
    getQuotaInfo,
    recordUsage,
    checkAndRecord(userId: string | undefined, endpoint: string, positionsCount?: number): QuotaInfo {
      const info = getQuotaInfo(userId, positionsCount);
      if (info.remaining <= 0) {
        throw Object.assign(new Error("QUOTA_EXCEEDED"), { statusCode: 429, quotaInfo: info });
      }
      if (userId) {
        recordUsage(userId, endpoint);
      }
      return { ...info, dailyUsed: info.dailyUsed + 1, remaining: info.remaining - 1 };
    },
  };
}

export type QuotaService = ReturnType<typeof createQuotaService>;
