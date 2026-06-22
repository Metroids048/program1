import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

interface QuotaInfo {
  dailyUsed: number;
  dailyLimit: number;
  remaining: number;
  resetAt: string;
}

export function QuotaBadge() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/quota")
      .then((res) => (res.ok ? res.json() as Promise<QuotaInfo> : null))
      .then((data) => { if (active && data) setQuota(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!quota) return null;

  const pct = quota.dailyLimit > 0 ? quota.remaining / quota.dailyLimit : 0;
  const tone = pct > 0.4 ? "ok" : pct > 0.15 ? "warn" : "low";

  return (
    <span className={`quota-badge quota-${tone}`} title={`今日已用 ${quota.dailyUsed}/${quota.dailyLimit} 次`}>
      <Zap size={12} />
      <span>{quota.remaining}</span>
    </span>
  );
}
