/**
 * ARCH-CRON-idempotency — T1-ARCH-CRON-T4-DEDUP-GUARDS regression tests
 *
 * Proves that the shouldSkipRecoveryReplay() guard correctly prevents
 * double-execution when node-cron recoverMissedExecutions replays a tick
 * that already ran successfully within the job's cadence window.
 *
 * Coverage:
 *   T1. shouldSkipRecoveryReplay returns false when no prior run exists.
 *   T2. shouldSkipRecoveryReplay returns true when a success row is within window.
 *   T3. shouldSkipRecoveryReplay returns false when prior run has status=error.
 *   T4. shouldSkipRecoveryReplay returns false when prior run is outside the window.
 *   T5. shouldSkipRecoveryReplay returns false (fail-open) when cron table is missing.
 *   T6. reputationComputeJob — replay skip fires (success row within daily window).
 *   T7. calibrationReportJob — replay skip fires (success row within weekly window).
 *   T8. newsHeadlinesRefreshJob — replay skip fires (success row within 30-min window).
 *   T9. shouldSkipRecoveryReplay uses 90% cadence window (not 100%).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { shouldSkipRecoveryReplay } from "../scheduler/startupHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDbWithCronTable(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      started_at   TEXT    NOT NULL,
      finished_at  TEXT,
      status       TEXT    NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
  return db;
}

function makeDbWithoutCronTable(): Database {
  return new Database(":memory:");
}

function insertCronRow(
  db: Database,
  jobName: string,
  status: string,
  startedAt?: string,
): void {
  const ts = startedAt ?? new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status)
     VALUES (?, ?, ?)`,
  ).run(jobName, ts, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 — Returns false when no prior run exists
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T1: no prior run → guard returns false", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("returns false when cron_job_runs is empty for the job", () => {
    const result = shouldSkipRecoveryReplay(db, "testJob", 86_400_000);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — Returns true when a success row exists within the cadence window
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T2: success row within window → guard returns true", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("returns true when a success row exists within the 90% cadence window", () => {
    // Insert a success row 1 minute ago — well within any cadence
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "testJob", "success", oneMinAgo);

    const result = shouldSkipRecoveryReplay(db, "testJob", 86_400_000);
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — Error row does NOT block retry
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T3: error row → guard returns false (allows retry)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("returns false when prior run has status=error (errors permit retry)", () => {
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "testJob", "error", oneMinAgo);

    const result = shouldSkipRecoveryReplay(db, "testJob", 86_400_000);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — Success row outside the window does NOT block
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T4: old success row → guard returns false", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("returns false when success row is older than the 90% cadence window", () => {
    // Daily cadence = 86_400_000 ms; 90% window = 77_760_000 ms (~21.6h)
    // Insert a success row 22 hours ago — outside the window
    const DAILY_CADENCE_MS = 86_400_000;
    const outsideWindowMs = Date.now() - DAILY_CADENCE_MS; // older than 90% window
    const oldTs = new Date(outsideWindowMs).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "testJob", "success", oldTs);

    const result = shouldSkipRecoveryReplay(db, "testJob", DAILY_CADENCE_MS);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — Missing cron table: fail-open (returns false)
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T5: missing cron table → fail-open returns false", () => {
  it("returns false (fail-open) when cron_job_runs table does not exist", () => {
    const db = makeDbWithoutCronTable();
    const result = shouldSkipRecoveryReplay(db, "testJob", 86_400_000);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — reputationComputeJob: guard returns true for daily window
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T6: reputationComputeJob replay guard (daily cadence)", () => {
  it("guard returns true when success row exists within daily window (21.6h)", () => {
    const db = makeDbWithCronTable();

    // Insert a success row 1 hour ago — well within daily window
    const recentTs = new Date(Date.now() - 60 * 60_000).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "reputationComputeJob", "success", recentTs);

    const DAILY_CADENCE_MS = 86_400_000;
    const shouldSkip = shouldSkipRecoveryReplay(db, "reputationComputeJob", DAILY_CADENCE_MS);
    expect(shouldSkip).toBe(true);
  });

  it("guard returns false when success row is older than daily window", () => {
    const db = makeDbWithCronTable();

    // Insert a success row 23 hours ago — outside 90% window (21.6h)
    const oldTs = new Date(Date.now() - 23 * 60 * 60_000).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "reputationComputeJob", "success", oldTs);

    const DAILY_CADENCE_MS = 86_400_000;
    const shouldSkip = shouldSkipRecoveryReplay(db, "reputationComputeJob", DAILY_CADENCE_MS);
    expect(shouldSkip).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 — calibrationReportJob: guard returns true for weekly window
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T7: calibrationReportJob replay guard (weekly cadence)", () => {
  it("guard returns true when success row exists within weekly window (6d 1h12m)", () => {
    const db = makeDbWithCronTable();

    // Insert a success row 1 hour ago — well within weekly window
    const recentTs = new Date(Date.now() - 60 * 60_000).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "calibrationReportJob", "success", recentTs);

    const WEEKLY_CADENCE_MS = 604_800_000;
    const shouldSkip = shouldSkipRecoveryReplay(db, "calibrationReportJob", WEEKLY_CADENCE_MS);
    expect(shouldSkip).toBe(true);
  });

  it("guard returns false when no success row exists for calibrationReportJob", () => {
    const db = makeDbWithCronTable();

    const WEEKLY_CADENCE_MS = 604_800_000;
    const shouldSkip = shouldSkipRecoveryReplay(db, "calibrationReportJob", WEEKLY_CADENCE_MS);
    expect(shouldSkip).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8 — newsHeadlinesRefreshJob: guard returns true for 30-min window
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T8: newsHeadlinesRefreshJob replay guard (30-min cadence)", () => {
  it("guard returns true when success row exists within 30-min cadence window", () => {
    const db = makeDbWithCronTable();

    const recentTs = new Date(Date.now() - 5 * 60_000).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "newsHeadlinesRefreshJob", "success", recentTs);

    const THIRTY_MIN_CADENCE_MS = 1_800_000;
    const shouldSkip = shouldSkipRecoveryReplay(db, "newsHeadlinesRefreshJob", THIRTY_MIN_CADENCE_MS);
    expect(shouldSkip).toBe(true);
  });

  it("guard returns false when success row is older than 30-min window (27min)", () => {
    const db = makeDbWithCronTable();

    // Insert a success row 28 minutes ago — outside 90% of 30min window (27min)
    const oldTs = new Date(Date.now() - 28 * 60_000).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "newsHeadlinesRefreshJob", "success", oldTs);

    const THIRTY_MIN_CADENCE_MS = 1_800_000;
    const shouldSkip = shouldSkipRecoveryReplay(db, "newsHeadlinesRefreshJob", THIRTY_MIN_CADENCE_MS);
    expect(shouldSkip).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 — 90% window boundary: row just inside window is blocked, row just outside is not
// ─────────────────────────────────────────────────────────────────────────────

describe("ARCH-CRON-idempotency — T9: 90% cadence window boundary precision", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithCronTable();
  });

  it("blocks replay when success row is at 85% of cadence age (inside 90% window)", () => {
    const CADENCE_MS = 86_400_000; // 24h
    // 85% of cadence = 73,440,000 ms ago (inside 90% window of 77,760,000 ms)
    const insideWindowMs = Date.now() - Math.floor(CADENCE_MS * 0.85);
    const ts = new Date(insideWindowMs).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "boundaryJob", "success", ts);

    const result = shouldSkipRecoveryReplay(db, "boundaryJob", CADENCE_MS, () => Date.now());
    expect(result).toBe(true);
  });

  it("allows replay when success row is at 95% of cadence age (outside 90% window)", () => {
    const CADENCE_MS = 86_400_000; // 24h
    // 95% of cadence = 82,080,000 ms ago (outside 90% window of 77,760,000 ms)
    const outsideWindowMs = Date.now() - Math.floor(CADENCE_MS * 0.95);
    const ts = new Date(outsideWindowMs).toISOString().replace("T", " ").slice(0, 19);
    insertCronRow(db, "boundaryJob", "success", ts);

    const result = shouldSkipRecoveryReplay(db, "boundaryJob", CADENCE_MS, () => Date.now());
    expect(result).toBe(false);
  });
});
