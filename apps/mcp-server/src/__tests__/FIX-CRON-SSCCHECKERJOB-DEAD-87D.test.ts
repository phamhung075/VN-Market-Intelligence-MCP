/**
 * FIX-CRON-SSCCHECKERJOB-DEAD-87D — Root-cause + restore-to-live
 *
 * ROOT CAUSE (RAW-verified live 2026-07-23 against the production named-volume
 * DB): task 1281-fix (2026-04-25, "VPS-only architecture") added a
 * `mcpConfig.features.enableLocalBctcFetch` guard at the TOP of
 * `runSscCheck()` that returned BEFORE `recordJobRun()` was ever called. The
 * flag defaults to `false` and IS unset (confirmed via `docker exec ... env`)
 * in the live production container, so the daily 20:00 ICT cron fired every
 * day but wrote ZERO `cron_job_runs` rows — indistinguishable from "crashed /
 * never registered" to any freshness or watchdog check. Last live row:
 * 2026-04-26 (one day after the guard shipped) — ~88 days stale at discovery.
 *
 * The guard itself is CORRECT and must be preserved verbatim: the France-
 * hosted local server cannot reach the geo-blocked SSC portal directly (the
 * original defect the guard fixed was "x5 Network timeout errors" on every
 * server startup). Flipping ENABLE_LOCAL_BCTC_FETCH=true would reintroduce
 * that exact regression. checkSscReports()'s functional role (discover new
 * BCTC filings for watchlist tickers, fetch/parse/store, alert on new report)
 * has also since been fully superseded by the queue-based VPS-driven
 * architecture that shipped alongside/after 1281-fix: `GET
 * /api/bctc-fetch-queue` (calendar-based gap-fill vs `financial_reports`),
 * `bctcQueueEnricherJob` (multi-source URL discovery every 15 min), VPS `POST
 * /api/push-bctc-pdf` (fetch+store), and `signalDetector.ts`'s generic
 * `report_new` signal (fired every 15 min via intelligenceCycleJob for ANY
 * watchlist ticker with a fresh `financial_reports` row, independent of
 * discovery source) — so re-enabling the network path is neither safe nor
 * necessary.
 *
 * FIX: move the guard check INSIDE the `recordJobRun()` callback so the daily
 * cron always writes an honest row (status='success', rows_written=0) when it
 * legitimately no-ops — closing the "silently indistinguishable from dead"
 * gap without changing the guard's network-safety property one bit.
 *
 * ACs:
 *   AC-1: guard fires (enableLocalBctcFetch=false, the live default) →
 *         cron_job_runs gets a 'success' row for 'sscCheckerJob' with
 *         rows_written=0 (this is the literal defect: previously ZERO rows).
 *   AC-2: guard fires → checkSscReports() is never invoked (no network
 *         attempt is reintroduced by the telemetry fix).
 *   AC-3: guard open (enableLocalBctcFetch=true) → checkSscReports() IS
 *         invoked and its newReports count is recorded as rows_written
 *         (existing behavior preserved, not a regression).
 */

import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Spy on checkSscReports via mock.module (Bun idiom — see 1397c precedent).
// Called ONCE at top level; per-test behavior controlled via mutable state.
// afterAll below restores the real module (BATCH2-CI-C-ML-MOCK-STUB-LEAK-GUARD
// — every module-scope mock.module() must have a matching afterAll restore so
// the stub does not bleed into sibling test files via the Bun ESM cache).
// ─────────────────────────────────────────────────────────────────────────────

let _checkSscReportsCalls = 0;
let _checkSscReportsResult = { checked: 0, newReports: 0, alerts: 0, errors: 0 };

mock.module("../application/usecases/checkSscReports.js", () => ({
  checkSscReports: async () => {
    _checkSscReportsCalls++;
    return _checkSscReportsResult;
  },
}));

afterAll(() => {
  mock.restore();
});

import { runSscCheck } from "../scheduler/news-analysis/sscCheckerJob.js";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { mcpConfig } from "../infrastructure/config.js";

/** Opens a fresh in-memory DB with all schema migrations applied (1352c pattern). */
async function openFreshDb(): Promise<Database> {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  return getDb();
}

function lastSscCheckerRun(
  db: Database,
): { status: string; rows_written: number | null } | null {
  return db
    .prepare(
      `SELECT status, rows_written FROM cron_job_runs
       WHERE job_name = 'sscCheckerJob' ORDER BY started_at DESC, id DESC LIMIT 1`,
    )
    .get() as { status: string; rows_written: number | null } | null;
}

describe("FIX-CRON-SSCCHECKERJOB-DEAD-87D — honest telemetry even when VPS-only guard no-ops", () => {
  beforeEach(() => {
    _checkSscReportsCalls = 0;
    _checkSscReportsResult = { checked: 0, newReports: 0, alerts: 0, errors: 0 };
  });

  it("AC-1: guard fires (enableLocalBctcFetch=false, live default) — cron_job_runs records success/rows_written=0", async () => {
    const db = await openFreshDb();
    expect(mcpConfig.features.enableLocalBctcFetch).toBe(false); // live production default

    await runSscCheck();

    const row = lastSscCheckerRun(db);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("success");
    expect(row!.rows_written).toBe(0);
  });

  it("AC-2: guard fires — checkSscReports() is never invoked (telemetry fix does not reintroduce network calls)", async () => {
    await openFreshDb();
    expect(mcpConfig.features.enableLocalBctcFetch).toBe(false);

    await runSscCheck();

    expect(_checkSscReportsCalls).toBe(0);
  });

  it("AC-3: guard open (enableLocalBctcFetch=true) — checkSscReports() runs and newReports is recorded as rows_written", async () => {
    const db = await openFreshDb();
    _checkSscReportsResult = { checked: 5, newReports: 2, alerts: 1, errors: 0 };

    // mcpConfig.features is a plain (non-readonly-at-runtime) object — flip for
    // this test only, restore in finally. No precedent test toggles env vars for
    // this singleton (FIX-1281-bctc-vps-only.test.ts AC-4 comment: config is
    // frozen at module-init time), so direct mutation + restore is the only way
    // to exercise the "guard open" branch without a second test process.
    const orig = mcpConfig.features.enableLocalBctcFetch;
    mcpConfig.features.enableLocalBctcFetch = true;
    try {
      await runSscCheck();
    } finally {
      mcpConfig.features.enableLocalBctcFetch = orig;
    }

    expect(_checkSscReportsCalls).toBe(1);
    const row = lastSscCheckerRun(db);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("success");
    expect(row!.rows_written).toBe(2);
  });
});
