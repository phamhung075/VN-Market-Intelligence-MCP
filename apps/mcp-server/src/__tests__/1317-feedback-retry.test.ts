// apps/mcp-server/src/__tests__/1317-feedback-retry.test.ts
// Bug 1317 — sendTelegramBug failure in submit_feedback silently swallowed.
// Fix: add retryOnTransient helper with 1 retry + 2s delay.
//
// RED phase: retryOnTransient is not yet exported — tests fail at import.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";

// We test retryOnTransient directly by importing it from feedbackTools.
// After the fix, feedbackTools.ts must export this helper for testability.
import { retryOnTransient } from "../interface/mcp/tools/system/feedbackTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

describe("Bug 1317 — retryOnTransient helper", () => {

  it("passes through on first-attempt success (no retry needed)", async () => {
    let calls = 0;
    const result = await retryOnTransient(async () => {
      calls++;
      return 42;
    }, 1, 10);
    expect(result).toBe(42);
    expect(calls).toBe(1);
  });

  it("retries once on transient ECONNRESET and succeeds on second attempt", async () => {
    let calls = 0;
    const result = await retryOnTransient(async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return 99;
    }, 1, 10); // 10ms delay so test runs fast
    expect(result).toBe(99);
    expect(calls).toBe(2);
  });

  it("retries once on transient 429 and succeeds on second attempt", async () => {
    let calls = 0;
    const result = await retryOnTransient(async () => {
      calls++;
      if (calls === 1) throw new Error("429 Too Many Requests");
      return 77;
    }, 1, 10);
    expect(result).toBe(77);
    expect(calls).toBe(2);
  });

  it("retries once on transient 503 and succeeds on second attempt", async () => {
    let calls = 0;
    const result = await retryOnTransient(async () => {
      calls++;
      if (calls === 1) throw new Error("503 Service Unavailable");
      return 55;
    }, 1, 10);
    expect(result).toBe(55);
    expect(calls).toBe(2);
  });

  it("retries once on ETIMEDOUT and succeeds on second attempt", async () => {
    let calls = 0;
    const result = await retryOnTransient(async () => {
      calls++;
      if (calls === 1) throw new Error("ETIMEDOUT");
      return 33;
    }, 1, 10);
    expect(result).toBe(33);
    expect(calls).toBe(2);
  });

  it("throws after exhausting all retries on persistent transient error", async () => {
    let calls = 0;
    let caught: Error | null = null;
    try {
      await retryOnTransient(async () => {
        calls++;
        throw new Error("503 Service Unavailable");
      }, 1, 10);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("503");
    // maxRetries=1 means: attempt 0 + attempt 1 = 2 total calls
    expect(calls).toBe(2);
  });

  it("does NOT retry on non-transient error (fails immediately after 1 call)", async () => {
    let calls = 0;
    let caught: Error | null = null;
    try {
      await retryOnTransient(async () => {
        calls++;
        throw new Error("Invalid token");
      }, 1, 10);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("Invalid token");
    // Non-transient: no retry, only 1 call
    expect(calls).toBe(1);
  });

  it("does NOT retry on unauthorized error (non-transient)", async () => {
    let calls = 0;
    let caught: Error | null = null;
    try {
      await retryOnTransient(async () => {
        calls++;
        throw new Error("401 Unauthorized");
      }, 1, 10);
    } catch (e) {
      caught = e as Error;
    }
    expect(calls).toBe(1);
    expect(caught!.message).toContain("401");
  });

  it("supports maxRetries=0 (no retry at all — always throws on first failure)", async () => {
    let calls = 0;
    let caught: Error | null = null;
    try {
      await retryOnTransient(async () => {
        calls++;
        throw new Error("ECONNRESET");
      }, 0, 10);
    } catch (e) {
      caught = e as Error;
    }
    expect(calls).toBe(1);
    expect(caught).not.toBeNull();
  });
});
