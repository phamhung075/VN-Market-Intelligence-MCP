/**
 * Task 1833i — VnstockRateLimiter unit tests
 *
 * Uses a small window (rpm=5, windowMs=200) so tests stay fast.
 */
import { describe, it, expect } from "bun:test";
import { VnstockRateLimiter, GLOBAL_RATE_LIMIT_RPM } from "../infrastructure/fetchers/vnstockBridge.js";

describe("Task 1833i — VnstockRateLimiter", () => {
  it("exports GLOBAL_RATE_LIMIT_RPM = 80 (Task 1862a: increased from 50 to handle 30-ticker scans)", () => {
    expect(GLOBAL_RATE_LIMIT_RPM).toBe(80);
  });

  it("resolves up to rpm calls immediately (within budget)", async () => {
    const limiter = new VnstockRateLimiter(5, 200);
    const start = Date.now();
    await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
    ]);
    const elapsed = Date.now() - start;
    // All 5 should fit in the window without waiting
    expect(elapsed).toBeLessThan(80);
  });

  it("blocks additional calls beyond rpm until window slides", async () => {
    const rpm = 5;
    const windowMs = 200;
    const limiter = new VnstockRateLimiter(rpm, windowMs);

    // Record per-call resolve times
    const times: number[] = [];
    const start = Date.now();

    const acquireAndRecord = async () => {
      await limiter.acquire();
      times.push(Date.now() - start);
    };

    // Fire 8 concurrent acquires
    await Promise.all(Array.from({ length: 8 }, () => acquireAndRecord()));

    // Sort to classify first-5 vs remainder
    times.sort((a, b) => a - b);

    const firstFive = times.slice(0, 5);
    const remaining = times.slice(5);

    // First 5 should resolve immediately (well under windowMs / 2)
    for (const t of firstFive) {
      expect(t).toBeLessThan(windowMs / 2);
    }

    // Remaining 3 must wait until window slides (at least windowMs - small buffer)
    for (const t of remaining) {
      expect(t).toBeGreaterThanOrEqual(windowMs - 30);
    }
  });

  it("refills slots after full window elapses", async () => {
    const rpm = 2;
    const windowMs = 150;
    const limiter = new VnstockRateLimiter(rpm, windowMs);

    // Use up the 2 slots
    await limiter.acquire();
    await limiter.acquire();

    // Wait for window to pass
    await new Promise((r) => setTimeout(r, windowMs + 20));

    // Should get 2 more slots immediately
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("single acquire resolves immediately on fresh limiter", async () => {
    const limiter = new VnstockRateLimiter(10, 60_000);
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(30);
  });
});
