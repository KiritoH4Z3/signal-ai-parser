/**
 * Best-effort in-memory sliding-window rate limiter (10 requests / minute / IP).
 *
 * CAVEAT — per-instance only: the window lives in this process's memory, so each
 * serverless instance / region keeps its own counter and a cold start resets it.
 * That is acceptable here and deliberate: this app is BYOK, so a visitor burning
 * requests spends their *own* Gemini quota, not ours. The limiter exists to blunt
 * accidental hammering and trivial abuse, not as a billing or security control.
 * A shared store (Upstash/Redis) would be required for a real guarantee.
 */

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 10;

/** ip -> timestamps (ms) of requests still inside the window. */
const hits = new Map<string, number[]>();

/** Drop buckets nobody has touched for a full window, so the map cannot grow. */
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < RATE_LIMIT_WINDOW_MS) return;
  lastSweep = now;
  // `forEach` rather than `for...of` over the Map: the project tsconfig targets
  // ES5 by default, where Map iteration needs --downlevelIteration.
  const stale: string[] = [];
  hits.forEach((times, ip) => {
    const fresh = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) stale.push(ip);
    else hits.set(ip, fresh);
  });
  stale.forEach((ip) => hits.delete(ip));
}

/**
 * Record a request for `ip` and report whether it is allowed.
 *
 * @returns `true` if the request is within the window budget, `false` if the
 *   caller has already made {@link RATE_LIMIT_MAX_REQUESTS} in the last minute.
 *   A rejected request is NOT counted, so a blocked caller is not punished into
 *   a permanent lockout.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  sweep(now);

  const times = hits.get(ip) ?? [];
  const fresh = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    hits.set(ip, fresh);
    return false;
  }

  fresh.push(now);
  hits.set(ip, fresh);
  return true;
}

/** Requests still available to `ip` in the current window (0-10). */
export function remainingQuota(ip: string): number {
  const now = Date.now();
  const fresh = (hits.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  return Math.max(0, RATE_LIMIT_MAX_REQUESTS - fresh.length);
}
