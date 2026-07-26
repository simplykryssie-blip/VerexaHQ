// Best-effort, in-memory rate limiting for public intake endpoints.
//
// Known limitation (documented, not hidden): this only limits requests
// within a single serverless instance's lifetime/memory. It is not a
// substitute for a shared store (e.g. Redis) under real abuse traffic, but
// it does raise the cost of casual token-guessing / resend spam today, and
// the database-side limits (60s resend cooldown, 5 verification attempts,
// per-token re-validation on every call) hold regardless of this layer.
const buckets = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  return false;
}

export function requestIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}
