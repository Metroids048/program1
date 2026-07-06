import type { AppDb } from "../../db";
import { makeId, nowIso } from "../../utils";

// Hardcoded quotas for beta testing (no payment yet)
const GUEST_DAILY_LIMIT = 3;
const USER_DAILY_LIMIT = 10;
const GUEST_POSITION_LIMIT = 1;
const USER_POSITION_LIMIT = 3;
const FEATURE_LIMITS = {
  guest: {
    cueCard: 5,
    mock: 5,
    resume: 3,
    positionAnalyze: 3,
  },
  user: {
    cueCard: 30,
    mock: 30,
    resume: 20,
    positionAnalyze: 10,
  },
} as const;

type QuotaFeature = keyof typeof FEATURE_LIMITS.user;

const FEATURE_ENDPOINTS: Record<QuotaFeature, string[]> = {
  cueCard: ["cue-card", "cue-card-reconstruct"],
  mock: ["mock-session", "mock-answer", "follow-up"],
  resume: ["resume-ai", "profile-highlights"],
  positionAnalyze: ["position-analyze"],
};

const ENDPOINT_FEATURES: Record<string, QuotaFeature> = Object.fromEntries(
  Object.entries(FEATURE_ENDPOINTS).flatMap(([feature, endpoints]) => endpoints.map((endpoint) => [endpoint, feature])),
) as Record<string, QuotaFeature>;

export interface QuotaInfo {
  dailyUsed: number;
  dailyLimit: number;
  positionsUsed: number;
  positionLimit: number;
  remaining: number;
  isGuest: boolean;
  resetAt: string; // ISO date when daily quota resets
  features: Record<QuotaFeature, { used: number; limit: number; remaining: number }>;
}

export function createQuotaService(db: AppDb) {
  const memoryLedger: Array<{ userId: string; endpoint: string; createdAt: string }> = [];

  function isGuestOwner(userId: string | undefined): boolean {
    return !userId || userId.startsWith("guest_");
  }

  function getDailyResetAt(): string {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString();
  }

  function countDailyUsage(userId: string, endpoints?: string[]): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    if (db.db) {
      const row = endpoints?.length
        ? db.db.prepare(
          `select count(*) as cnt from quota_ledger where user_id = ? and created_at >= ? and endpoint in (${endpoints.map(() => "?").join(",")})`,
        ).get(userId, todayStr, ...endpoints) as { cnt: number } | undefined
        : db.db.prepare(
          "select count(*) as cnt from quota_ledger where user_id = ? and created_at >= ?",
        ).get(userId, todayStr) as { cnt: number } | undefined;
      return row?.cnt ?? 0;
    }
    return memoryLedger.filter((item) => (
      item.userId === userId
      && item.createdAt >= todayStr
      && (!endpoints?.length || endpoints.includes(item.endpoint))
    )).length;
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
      return;
    }
    memoryLedger.push({ userId, endpoint, createdAt: now });
  }

  function getQuotaInfo(userId: string | undefined, positionsCount?: number): QuotaInfo {
    const isGuest = isGuestOwner(userId);
    const dailyLimit = isGuest ? GUEST_DAILY_LIMIT : USER_DAILY_LIMIT;
    const positionLimit = isGuest ? GUEST_POSITION_LIMIT : USER_POSITION_LIMIT;
    const dailyUsed = userId ? countDailyUsage(userId) : 0;
    const positionsUsed = positionsCount ?? (userId ? countUserPositions(userId) : 0);
    const featureLimits = isGuest ? FEATURE_LIMITS.guest : FEATURE_LIMITS.user;
    const features = Object.fromEntries(
      (Object.keys(FEATURE_ENDPOINTS) as QuotaFeature[]).map((feature) => {
        const used = userId ? countDailyUsage(userId, FEATURE_ENDPOINTS[feature]) : 0;
        const limit = featureLimits[feature];
        return [feature, { used, limit, remaining: Math.max(0, limit - used) }];
      }),
    ) as QuotaInfo["features"];

    return {
      dailyUsed,
      dailyLimit,
      positionsUsed,
      positionLimit,
      remaining: Math.max(0, dailyLimit - dailyUsed),
      isGuest,
      resetAt: getDailyResetAt(),
      features,
    };
  }

  return {
    getQuotaInfo,
    recordUsage,
    checkAndRecord(userId: string | undefined, endpoint: string, positionsCount?: number): QuotaInfo {
      const info = getQuotaInfo(userId, positionsCount);
      const feature = ENDPOINT_FEATURES[endpoint];
      const featureQuota = feature ? info.features[feature] : null;
      if (featureQuota && featureQuota.remaining <= 0) {
        throw Object.assign(new Error("QUOTA_EXCEEDED"), {
          statusCode: 429,
          quotaInfo: info,
          quotaFeature: feature,
          quotaFeatureInfo: featureQuota,
        });
      }
      if (userId) {
        recordUsage(userId, endpoint);
      }
      if (!feature || !featureQuota) {
        return { ...info, dailyUsed: info.dailyUsed + 1, remaining: Math.max(0, info.remaining - 1) };
      }
      return {
        ...info,
        dailyUsed: info.dailyUsed + 1,
        remaining: Math.max(0, info.remaining - 1),
        features: {
          ...info.features,
          [feature]: {
            ...featureQuota,
            used: featureQuota.used + 1,
            remaining: Math.max(0, featureQuota.remaining - 1),
          },
        },
      };
    },
  };
}

export type QuotaService = ReturnType<typeof createQuotaService>;
