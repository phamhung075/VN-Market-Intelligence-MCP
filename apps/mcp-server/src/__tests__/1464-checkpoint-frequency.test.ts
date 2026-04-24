/**
 * Task 1464 — WAL checkpoint every 6h + CRITICAL alert when stuck >40MB
 *
 * RED assertions:
 *   1. CRONS.walCheckpoint default cron is every-6h pattern
 *   2. runWalCheckpoint calls log.error (not log.warn) when remaining > 10000
 */

import { describe, it, expect, mock } from "bun:test";

// ── 1. Cron schedule assertion ─────────────────────────────────────────────

describe("CRONS.walCheckpoint", () => {
  it("defaults to every-6h cron pattern '0 */6 * * *'", async () => {
    // Import after env is clean (no override set)
    const { CRONS } = await import("../scheduler/jobs.js");
    expect(CRONS.walCheckpoint).toBe("0 */6 * * *");
  });
});

// ── 2. Alert severity assertion ────────────────────────────────────────────

describe("runWalCheckpoint", () => {
  it("calls log.error (not log.warn) when remaining frames exceed 10000", () => {
    const { runWalCheckpoint } = require("../infrastructure/db/checkpoint.js");

    const warnSpy = mock(() => {});
    const errorSpy = mock(() => {});

    const fakeDeps = {
      getDb: () => ({
        query: () => ({
          get: () => ({ busy: 1, log: 12000, checkpointed: 100 }),
        }),
      }),
      log: {
        info: mock(() => {}),
        warn: warnSpy,
        error: errorSpy,
        debug: mock(() => {}),
      },
    };

    runWalCheckpoint(fakeDeps);

    // Must NOT use warn for the stuck-WAL case
    expect(warnSpy).not.toHaveBeenCalled();

    // Must call error with the >40MB message
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [msg] = (errorSpy.mock.calls[0] as unknown) as [string, ...unknown[]];
    expect(msg).toContain("WAL stuck >40MB");
  });

  it("does NOT call log.error for remaining <= 10000 frames", () => {
    const { runWalCheckpoint } = require("../infrastructure/db/checkpoint.js");

    const errorSpy = mock(() => {});

    const fakeDeps = {
      getDb: () => ({
        query: () => ({
          get: () => ({ busy: 0, log: 10500, checkpointed: 10000 }),
        }),
      }),
      log: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: errorSpy,
        debug: mock(() => {}),
      },
    };

    runWalCheckpoint(fakeDeps);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
