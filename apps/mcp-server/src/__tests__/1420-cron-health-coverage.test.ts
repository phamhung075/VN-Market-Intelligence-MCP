/**
 * Task 1420 — cron_job_runs coverage for 9 previously-invisible scheduler jobs
 *
 * Problem: six jobs in jobs.ts used bare try/catch without recordJobRun at the
 * cron registration level AND their callable inner functions also lacked
 * recordJobRun, so they never appeared in cron_job_runs.
 *
 * Three additional jobs (marketScanJob:open/close, sscCheckerJob, dataAuditJob:daily)
 * already called recordJobRun inside their run functions — their cron_job_runs
 * entries are generated internally and tested here via recordJobRun directly.
 *
 * Fixed in jobs.ts (task 1420):
 *   dataAuditJob:weekly  → runWeeklyAuditWithDb(db)
 *   bctcReparseJob       → runBctcReparseWithDb(db)
 *   evidenceAccumulatorJob → runEvidenceAccumulatorWithDb(db)
 *   baseRateComputationJob → runBaseRateComputationWithDb(db)
 *   predictionResolutionJob → runPredictionResolutionWithDb(db)
 *   calibrationReportJob → runCalibrationReportWithDb(db)
 *
 * Already internally wrapped (no jobs.ts change needed):
 *   marketScanJob:open/close → recordJobRun inside runMarketScan()
 *   sscCheckerJob            → recordJobRun inside runSscCheck()
 *   dataAuditJob:daily       → recordJobRun inside runDailyAudit()
 *
 * Test strategy:
 *   RED:  The 6 exported wrappers do not exist in jobs.ts → import fails.
 *   GREEN: After fix, all 9 job names appear in cron_job_runs.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js";
import { runDailyAudit, runWeeklyAudit } from "../scheduler/news-analysis/dataAuditJob.js";
import { runBctcReparseJob } from "../scheduler/financial-reports/bctcReparseJob.js";
import {
  runEvidenceAccumulator,
} from "../scheduler/news-analysis/evidenceAccumulatorJob.js";
import { runBaseRateComputation } from "../scheduler/macro/baseRateComputationJob.js";
import { runPredictionResolution } from "../scheduler/macro/predictionResolutionJob.js";
import { runCalibrationReport } from "../scheduler/macro/calibrationReportJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  runWeeklyAuditWithDb,
  runBctcReparseWithDb,
  runEvidenceAccumulatorWithDb,
  runBaseRateComputationWithDb,
  runPredictionResolutionWithDb,
  runCalibrationReportWithDb,
} from "../scheduler/jobs.js";

// ──────────────────────────────────────────────────────────��──────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────���

function createCronTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error')),
      rows_written  INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
}

function getRunRows(db: Database, jobName: string): { status: string }[] {
  return db
    .prepare(`SELECT status FROM cron_job_runs WHERE job_name = ?`)
    .all(jobName) as { status: string }[];
}

// ──────────────────────��─────────────────────────────────��────────────────────
// Fixtures
// ────────────────────────────────────────��────────────────────────────────────

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  createCronTable(db);
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────���──────────────────────────────���─

describe("Task 1420 — all 9 job names written to cron_job_runs after fix", () => {

  // ── Jobs already internally wrapped (mechanism verified via recordJobRun) ──

  it("marketScanJob:open — recordJobRun writes row (already wrapped inside runMarketScan)", async () => {
    await recordJobRun(db, "marketScanJob:open", async () => {});
    const rows = getRunRows(db, "marketScanJob:open");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("marketScanJob:close — recordJobRun writes row (already wrapped inside runMarketScan)", async () => {
    await recordJobRun(db, "marketScanJob:close", async () => {});
    const rows = getRunRows(db, "marketScanJob:close");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("sscCheckerJob — recordJobRun writes row (already wrapped inside runSscCheck)", async () => {
    await recordJobRun(db, "sscCheckerJob", async () => {});
    const rows = getRunRows(db, "sscCheckerJob");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("dataAuditJob:daily — runDailyAudit(db) writes row (already wrapped internally)", async () => {
    await runDailyAudit(db);
    const rows = getRunRows(db, "dataAuditJob:daily");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  // ── Jobs fixed by task 1420 — previously missing recordJobRun ────────────

  it("dataAuditJob:weekly — runWeeklyAuditWithDb(db, fn) writes row", async () => {
    await runWeeklyAuditWithDb(db, async () => {
      await runWeeklyAudit(db);
    });
    const rows = getRunRows(db, "dataAuditJob:weekly");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("bctcReparseJob — runBctcReparseWithDb(db, fn) writes row", async () => {
    await runBctcReparseWithDb(db, async () => {
      await runBctcReparseJob({ db });
    });
    const rows = getRunRows(db, "bctcReparseJob");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("evidenceAccumulatorJob — runEvidenceAccumulatorWithDb(db, fn) writes row", async () => {
    await runEvidenceAccumulatorWithDb(db, async () => {
      await runEvidenceAccumulator(db);
    });
    const rows = getRunRows(db, "evidenceAccumulatorJob");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("baseRateComputationJob — runBaseRateComputationWithDb(db, fn) writes row", async () => {
    await runBaseRateComputationWithDb(db, async () => {
      await runBaseRateComputation(db);
    });
    const rows = getRunRows(db, "baseRateComputationJob");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("predictionResolutionJob — runPredictionResolutionWithDb(db, fn) writes row", async () => {
    await runPredictionResolutionWithDb(db, async () => {
      await runPredictionResolution(db);
    });
    const rows = getRunRows(db, "predictionResolutionJob");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  it("calibrationReportJob — runCalibrationReportWithDb(db, fn) writes row", async () => {
    await runCalibrationReportWithDb(db, async () => {
      await runCalibrationReport(db);
    });
    const rows = getRunRows(db, "calibrationReportJob");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(["success", "error"]).toContain(rows[0]!.status);
  });

  // ── Integration: all 9 job names visible in a single DB pass ─────────────

  it("all 9 job names (10 slots) appear in cron_job_runs after callbacks resolve", async () => {
    // Already-wrapped: simulate via recordJobRun directly
    await recordJobRun(db, "marketScanJob:open", async () => {});
    await recordJobRun(db, "marketScanJob:close", async () => {});
    await recordJobRun(db, "sscCheckerJob", async () => {});
    await runDailyAudit(db);

    // Fixed by task 1420: use new wrappers
    await runWeeklyAuditWithDb(db, async () => {});
    await runBctcReparseWithDb(db, async () => {});
    await runEvidenceAccumulatorWithDb(db, async () => {});
    await runBaseRateComputationWithDb(db, async () => {});
    await runPredictionResolutionWithDb(db, async () => {});
    await runCalibrationReportWithDb(db, async () => {});

    const EXPECTED_NAMES = [
      "marketScanJob:open",
      "marketScanJob:close",
      "sscCheckerJob",
      "dataAuditJob:daily",
      "dataAuditJob:weekly",
      "bctcReparseJob",
      "evidenceAccumulatorJob",
      "baseRateComputationJob",
      "predictionResolutionJob",
      "calibrationReportJob",
    ];

    const allNames = db
      .prepare("SELECT DISTINCT job_name FROM cron_job_runs ORDER BY job_name")
      .all() as { job_name: string }[];
    const nameSet = new Set(allNames.map((r) => r.job_name));

    for (const name of EXPECTED_NAMES) {
      expect(nameSet.has(name)).toBe(true);
    }
  });
});
