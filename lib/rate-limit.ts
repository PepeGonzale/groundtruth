type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export function rateLimit(key: string, limit = 24, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > windowMs * 5) {
    for (const [entryKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(entryKey);
    }
    lastSweep = now;
  }

  const existing = buckets.get(key);
  if (existing === undefined || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { ok: true };
}
