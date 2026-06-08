/**
 * FIX-SBV-REFRESH-SILENT-SWALLOW — test suite
 *
 * Validates the fix for the green-while-stale silent-swallow bug in the SBV
 * rates refresh job (mirrors FIX-MACRO-REFRESH-DEAD pattern, commit b7ce338f).
 *
 * Root cause fixed:
 *   runSbvRatesRefreshJob() catch block logged the error and RETURNED
 *   {success:false, rowsWritten:0} instead of re-throwing.
 *   startScheduler.ts wraps the job in wrapRun('sbvRatesRefreshJob', ...) which
 *   calls recordJobRun() — that records status='error' only when the inner fn
 *   THROWS. Because the job swallowed the error and returned a value, wrapRun
 *   saw a resolved promise and recorded status='success' even on total SBV
 *   fetch failure → SBV FX data 21h stale while cron reported green.
 *
 * Fix: add `throw err` after the WORK-channel alert so wrapRun/recordJobRun
 * sees the throw and records status='error'.
 *
 * Tests:
 *   SBV-SS-01: runSbvRatesRefreshJob re-throws after fetchFn failure (fail-loud)
 *   SBV-SS-02: WORK Telegram alert sent before re-throwing on fetchFn failure
 *   SBV-SS-03: runSbvRatesRefreshJob re-throws after storeFn failure (fail-loud)
 *   SBV-SS-04: WORK Telegram alert sent before re-throwing on storeFn failure
 *   SBV-SS-05: wrapRun records status='error' when job re-throws (integration contract)
 *   SBV-SS-06: runSbvRatesRefreshJob does NOT re-throw on success (happy path unchanged)
 *
 * @module __tests__/FIX-SBV-REFRESH-SILENT-SWALLOW
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  runSbvRatesRefreshJob,
  type SbvRatesRefreshOptions,
} from "../scheduler/macro/sbvRatesJob.js";
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";
import type { SbvMacroSnapshot } from "../infrastructure/fetchers/sbv.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_SNAPSHOT: SbvMacroSnapshot = {
  overnightRatePct:    3.0,
  refinancingRatePct:  4.5,
  usdVndOfficial:      25800,
  discountRatePct:     1.5,
  maxDepositRatePct:   5.0,
  maxLendingRatePct:   12.0,
  interbankOvernightPct: 4.0,
  fetchedAt:           "2026-06-08T06:00:00.000Z",
};

function makeOpts(overrides: Partial<SbvRatesRefreshOptions> = {}): SbvRatesRefreshOptions {
  return {
    fetchFn:    async () => MOCK_SNAPSHOT,
    storeFn:    () => {},
    sendWorkFn: async (_msg: string) => {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SBV-SS-01 / SBV-SS-02: fetchFn failure path
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-SBV-REFRESH-SILENT-SWALLOW — fetchFn failure re-throw contract", () => {
  it("SBV-SS-01: runSbvRatesRefreshJob re-throws after fetchFn failure (fail-loud)", async () => {
    await expect(
      runSbvRatesRefreshJob(makeOpts({
        fetchFn: async () => { throw new Error("VCB portal connection refused"); },
      })),
    ).rejects.toThrow("VCB portal connection refused");
  });

  it("SBV-SS-02: WORK Telegram alert sent before re-throwing on fetchFn failure", async () => {
    const workMessages: string[] = [];

    try {
      await runSbvRatesRefreshJob(makeOpts({
        fetchFn: async () => { throw new Error("HTTP 503 — SBV site down"); },
        sendWorkFn: async (msg) => { workMessages.push(msg); },
      }));
    } catch {
      // expected throw
    }

    expect(workMessages.length).toBe(1);
    expect(workMessages[0]).toContain("sbvRatesRefresh");
    expect(workMessages[0]).toContain("503");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SBV-SS-03 / SBV-SS-04: storeFn failure path
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-SBV-REFRESH-SILENT-SWALLOW — storeFn failure re-throw contract", () => {
  it("SBV-SS-03: runSbvRatesRefreshJob re-throws after storeFn failure (fail-loud)", async () => {
    await expect(
      runSbvRatesRefreshJob(makeOpts({
        storeFn: () => { throw new Error("SQLite disk I/O error"); },
      })),
    ).rejects.toThrow("SQLite disk I/O error");
  });

  it("SBV-SS-04: WORK Telegram alert sent before re-throwing on storeFn failure", async () => {
    const workMessages: string[] = [];

    try {
      await runSbvRatesRefreshJob(makeOpts({
        storeFn: () => { throw new Error("database is locked"); },
        sendWorkFn: async (msg) => { workMessages.push(msg); },
      }));
    } catch {
      // expected throw
    }

    expect(workMessages.length).toBe(1);
    expect(workMessages[0]).toContain("sbvRatesRefresh");
    expect(workMessages[0]).toContain("database is locked");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SBV-SS-05: wrapRun records status='error' when job re-throws
//
// This is the AC-1 integration test: simulates the actual startScheduler.ts
// pattern — wrapRun('sbvRatesRefreshJob', async () => { result = await
// runSbvRatesRefreshJob(); return { rowsWritten: result.rowsWritten } }).
// When the job re-throws, recordJobRun catches the throw and writes status='error'.
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-SBV-REFRESH-SILENT-SWALLOW — wrapRun records status='error' on fetch failure (AC-1)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  it("SBV-SS-05: simulate fetch-fail → cron_job_runs row = status='error'", async () => {
    const db = getDb();

    // Mirror the startScheduler.ts wrapRun invocation pattern exactly:
    //   wrapRun('sbvRatesRefreshJob', async () => {
    //     const result = await runSbvRatesRefreshJob()
    //     return { rowsWritten: result.rowsWritten }
    //   })
    await recordJobRun(db, "sbvRatesRefreshJob", async () => {
      const result = await runSbvRatesRefreshJob(makeOpts({
        fetchFn: async () => { throw new Error("ECONNREFUSED sbv.org.vn:443"); },
        sendWorkFn: async (_msg) => {},
      }));
      return { rowsWritten: result.rowsWritten };
    });

    // Verify the DB row recorded status='error' (not 'success')
    type Row = { status: string; error_msg: string | null };
    const rows = db
      .query<Row, [string]>(
        `SELECT status, error_msg FROM cron_job_runs
         WHERE job_name = ? ORDER BY started_at DESC LIMIT 1`,
      )
      .all("sbvRatesRefreshJob");

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row!.status).toBe("error");
    expect(row!.error_msg).toContain("ECONNREFUSED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SBV-SS-06: success path unchanged — no throw on normal operation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-SBV-REFRESH-SILENT-SWALLOW — success path unchanged", () => {
  it("SBV-SS-06: runSbvRatesRefreshJob does NOT throw on success (happy path unchanged)", async () => {
    const workMessages: string[] = [];

    const result = await runSbvRatesRefreshJob(makeOpts({
      sendWorkFn: async (msg) => { workMessages.push(msg); },
    }));

    expect(result.success).toBe(true);
    expect(result.rowsWritten).toBe(1);
    // Success path sends no WORK alert (noise-free)
    expect(workMessages.length).toBe(0);
  });
});
