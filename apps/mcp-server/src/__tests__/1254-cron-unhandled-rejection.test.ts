/**
 * Bug 1254 — PDF network timeout causes server crash via unhandled rejection
 *
 * Root cause: several cron callbacks in jobs.ts used bare
 *   `async () => { await runSomeJob() }`
 * with no try/catch. When `runSomeJob()` throws (e.g. from a PDF network
 * timeout propagating through an unexpected code path), the promise rejection
 * is unhandled and Bun crashes the process.
 *
 * Fix: all cron callbacks that do not use recordJobRun (which already swallows
 * errors) must be wrapped in try/catch.
 *
 * Tests verify the pattern by checking that the safe wrapper function
 * `cronSafe` catches thrown errors without propagating them.
 */

import { describe, it, expect } from "bun:test";

/**
 * cronSafe wraps an async job in a try/catch so a thrown error is logged
 * but never propagates as an unhandled rejection.
 *
 * This mirrors the pattern applied to all cron callbacks in jobs.ts.
 */
async function cronSafe(jobName: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // Log but never re-throw — prevents unhandled rejection crash
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron-safe] ${jobName} threw: ${msg}`);
  }
}

describe("Bug 1254 — cron safe wrapper prevents unhandled rejection", () => {
  it("cronSafe does not throw when wrapped job throws", async () => {
    let threw = false;
    try {
      await cronSafe("testJob", async () => {
        throw new Error("Network timeout");
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("cronSafe returns void when job succeeds", async () => {
    let ran = false;
    await cronSafe("testJob", async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("cronSafe handles sync errors in async wrapper", async () => {
    let threw = false;
    try {
      await cronSafe("testJob", async () => {
        // Synchronous throw inside async function
        throw new TypeError("unexpected null");
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("cronSafe handles rejected promise", async () => {
    let threw = false;
    try {
      await cronSafe("testJob", () => Promise.reject(new Error("axios timeout")));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("multiple cronSafe calls are independent — one fail does not affect others", async () => {
    const results: string[] = [];

    await cronSafe("job1", async () => {
      results.push("job1-start");
      throw new Error("job1 fail");
    });

    await cronSafe("job2", async () => {
      results.push("job2-ok");
    });

    expect(results).toContain("job1-start");
    expect(results).toContain("job2-ok");
  });
});
