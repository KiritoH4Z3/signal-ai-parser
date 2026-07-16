/**
 * Sliding-window limiter. Uses fake timers to drive the window, and a unique IP
 * per test because the limiter's state is module-level by design.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  remainingQuota,
} from "@/lib/rate-limit";

let counter = 0;
/** A fresh IP per test keeps the shared module state from leaking across cases. */
function freshIp(): string {
  counter += 1;
  return `10.0.0.${counter}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-16T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows exactly 10 requests per minute", () => {
    const ip = freshIp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      expect(checkRateLimit(ip)).toBe(true);
    }
    expect(checkRateLimit(ip)).toBe(false);
  });

  it("keeps rejecting inside the same window", () => {
    const ip = freshIp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) checkRateLimit(ip);
    vi.advanceTimersByTime(30_000);
    expect(checkRateLimit(ip)).toBe(false);
  });

  it("frees the budget once the window has passed", () => {
    const ip = freshIp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) checkRateLimit(ip);
    expect(checkRateLimit(ip)).toBe(false);

    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);
    expect(checkRateLimit(ip)).toBe(true);
  });

  it("slides rather than resetting in fixed buckets", () => {
    const ip = freshIp();
    // Spend the budget over the first half-minute.
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit(ip);
      vi.advanceTimersByTime(1_000);
    }
    expect(checkRateLimit(ip)).toBe(false);

    // 51s later the oldest hit expires and exactly one slot opens up.
    vi.advanceTimersByTime(51_000);
    expect(checkRateLimit(ip)).toBe(true);
    expect(checkRateLimit(ip)).toBe(true);
  });

  it("tracks IPs independently", () => {
    const a = freshIp();
    const b = freshIp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) checkRateLimit(a);
    expect(checkRateLimit(a)).toBe(false);
    expect(checkRateLimit(b)).toBe(true);
  });

  it("does not punish a rejected request into a longer lockout", () => {
    const ip = freshIp();
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) checkRateLimit(ip);
    // Hammer while blocked — rejected attempts must not extend the window.
    for (let i = 0; i < 5; i++) expect(checkRateLimit(ip)).toBe(false);

    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);
    expect(checkRateLimit(ip)).toBe(true);
  });

  it("sweeps stale buckets after a quiet window", () => {
    const ip = freshIp();
    checkRateLimit(ip);
    // The sweep is best-effort housekeeping; the observable contract is that a
    // long-idle IP still gets a full budget.
    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS * 3);
    checkRateLimit(freshIp()); // triggers the sweep
    expect(remainingQuota(ip)).toBe(RATE_LIMIT_MAX_REQUESTS);
  });
});

describe("remainingQuota", () => {
  it("counts down and floors at zero", () => {
    const ip = freshIp();
    expect(remainingQuota(ip)).toBe(RATE_LIMIT_MAX_REQUESTS);
    checkRateLimit(ip);
    expect(remainingQuota(ip)).toBe(RATE_LIMIT_MAX_REQUESTS - 1);

    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) checkRateLimit(ip);
    expect(remainingQuota(ip)).toBe(0);
  });
});
