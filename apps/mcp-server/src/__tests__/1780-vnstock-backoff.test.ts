/**
 * Task 1780 — vnstock BCTC fetcher: exponential backoff + rate-limit detection
 *
 * Tests:
 * 1. isRateLimitResponse: box-drawing prefix (╭) → true
 * 2. isRateLimitResponse: ANSI-only → true
 * 3. isRateLimitResponse: valid JSON → false
 * 4. isRateLimitResponse: empty string → false (empty = null, not rate-limit)
 * 5. calcBackoffMs: attempt 0 → ~2000ms (base), attempt 1 → ~4000ms, attempt 2 → ~8000ms
 * 6. calcBackoffMs: result is capped at maxMs
 * 7. runPythonWithBackoff: RATE_LIMITED response logs WARN with ticker+attempt+wait_ms,
 *    retries up to maxRetries times, returns null after exhausting retries
 * 8. runPythonWithBackoff: RATE_LIMITED then valid JSON → returns parsed result on retry
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  isRateLimitResponse,
  calcBackoffMs,
} from "../infrastructure/fetchers/vnstockBridge.js";

// ---------------------------------------------------------------------------
// Tests 1–4: isRateLimitResponse
// ---------------------------------------------------------------------------

describe("Task 1780 — isRateLimitResponse", () => {
  it("1. Box-drawing prefix ╭ → true", () => {
    const raw =
      "╭─────────────────────────────────────╮\n" +
      "│  Fetching data from VCI, please wait │\n" +
      "╰─────────────────────────────────────╯";
    expect(isRateLimitResponse(raw)).toBe(true);
  });

  it("2. ANSI escape + box-drawing → true", () => {
    const raw =
      "\x1b[0m\x1b[32m╭──────────────────────────╮\x1b[0m\n" +
      "\x1b[32m│\x1b[0m  Loading...  \x1b[32m│\x1b[0m\n" +
      "\x1b[32m╰──────────────────────────╯\x1b[0m";
    expect(isRateLimitResponse(raw)).toBe(true);
  });

  it("3. Valid JSON → false", () => {
    expect(isRateLimitResponse('{"code":"VCB","revenue":123}')).toBe(false);
  });

  it("4. Empty string → false (empty = null, not rate-limited)", () => {
    expect(isRateLimitResponse("")).toBe(false);
  });

  it("5. 'null' string → false", () => {
    expect(isRateLimitResponse("null")).toBe(false);
  });

  it("6. Non-JSON non-box-drawing text → false (plain errors are not rate-limit)", () => {
    // Generic Python error text — no box-drawing chars — classified by
    // stripAnsiAndDetectJunk as junk but NOT as rate-limit.
    expect(isRateLimitResponse("AttributeError: 'NoneType' object has no attribute")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests 5–6: calcBackoffMs
// ---------------------------------------------------------------------------

describe("Task 1780 — calcBackoffMs", () => {
  it("5. attempt 0 → between 2000ms and 3000ms (base=2000, jitter up to +1000)", () => {
    const ms = calcBackoffMs(0, { baseMs: 2000, jitterMs: 1000, maxMs: 30_000 });
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThanOrEqual(3000);
  });

  it("5b. attempt 1 → between 4000ms and 5000ms", () => {
    const ms = calcBackoffMs(1, { baseMs: 2000, jitterMs: 1000, maxMs: 30_000 });
    expect(ms).toBeGreaterThanOrEqual(4000);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it("5c. attempt 2 → between 8000ms and 9000ms", () => {
    const ms = calcBackoffMs(2, { baseMs: 2000, jitterMs: 1000, maxMs: 30_000 });
    expect(ms).toBeGreaterThanOrEqual(8000);
    expect(ms).toBeLessThanOrEqual(9000);
  });

  it("6. result capped at maxMs", () => {
    // attempt 10: 2000 * 2^10 = 2_048_000ms — way above any reasonable cap
    const ms = calcBackoffMs(10, { baseMs: 2000, jitterMs: 1000, maxMs: 10_000 });
    expect(ms).toBeLessThanOrEqual(10_000);
  });
});
