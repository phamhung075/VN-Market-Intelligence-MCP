// scripts/migrations/__tests__/backfill-monthly-signal-quality-audit.test.ts
//
// FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-RECOVER-GUARD — unit tests for the
// one-shot historical backfill script's pure functions. All DB ops use :memory:
// via the exported API — no live/named-volume DB touched, no Telegram sent
// (sendWork is exercised only through its missing-env no-op path).

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  nextMonth,
  monthLabel,
  markerJobName,
  computeMonthStats,
  buildMessage,
  alreadyAudited,
  writeMarker,
} from "../backfill-monthly-signal-quality-audit.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error')),
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_rejections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    ,
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+1 hour')))
  `);
  return db;
}

function seedRejection(db: Database, yearMonth: string, agent: string, type: string, stock: string | null, reason: string): void {
  db.prepare(
    `INSERT INTO signal_rejections (from_agent, signal_type, stock_code, reason, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(agent, type, stock, reason, `${yearMonth}-15T10:00:00Z`);
}

function seedSignal(db: Database, yearMonth: string): void {
  db.prepare(
    `INSERT INTO agent_signals (created_at) VALUES (?)`,
  ).run(`${yearMonth}-10T09:00:00Z`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("backfill-monthly-signal-quality-audit — date helpers", () => {
  it("nextMonth: 2026-06 → 2026-07", () => {
    expect(nextMonth("2026-06")).toBe("2026-07");
  });
  it("nextMonth: 2026-12 rolls to next year", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
  it("monthLabel: 2026-06 → 'June 2026'", () => {
    expect(monthLabel("2026-06")).toBe("June 2026");
  });
  it("markerJobName carries the target month", () => {
    expect(markerJobName("2026-06")).toBe("monthlySignalQualityAuditJob:backfill-2026-06");
  });
});

describe("backfill-monthly-signal-quality-audit — computeMonthStats", () => {
  let db: Database;
  beforeEach(() => {
    db = openTestDb();
  });

  it("aggregates ONLY the target month's rejections (month-filtered, honest history)", () => {
    seedRejection(db, "2026-06", "news-scout", "chain_catalyst", null, "root: Required");
    seedRejection(db, "2026-06", "news-scout", "chain_catalyst", null, "root: Required");
    seedRejection(db, "2026-06", "system-auditor", "urgent_news", "VIC", "bad field");
    seedRejection(db, "2026-07", "other-agent", "other", null, "outside window"); // must NOT leak in
    seedSignal(db, "2026-06");

    const stats = computeMonthStats(db, "2026-06");
    expect(stats.total).toBe(3);
    expect(stats.by_agent["news-scout"]).toBe(2);
    expect(stats.by_agent["system-auditor"]).toBe(1);
    expect(stats.by_agent["other-agent"]).toBeUndefined(); // July row excluded
    expect(stats.by_stock["VIC"]).toBe(1);
    expect(stats.by_stock["NULL"]).toBe(2);
    expect(stats.signalCount).toBe(1);
    expect(stats.by_reason[0]?.reason).toBe("root: Required");
  });

  it("zero-data month is honest (total 0, signalCount 0)", () => {
    const stats = computeMonthStats(db, "2026-05");
    expect(stats.total).toBe(0);
    expect(stats.signalCount).toBe(0);
  });
});

describe("backfill-monthly-signal-quality-audit — buildMessage", () => {
  it("OK branch: rate within threshold → ✓ footer, no ALERT", () => {
    const msg = buildMessage({
      yearMonth: "2026-06",
      total: 1,
      by_agent: { news: 1 },
      by_type: {},
      by_stock: {},
      by_reason: [],
      signalCount: 100,
    });
    expect(msg).toContain("Signal Quality Audit — June 2026");
    expect(msg).toContain("Total Rejections: 1");
    expect(msg).toContain("Rejection Rate: 1.00%");
    expect(msg).not.toContain("⚠️ **ALERT**");
    expect(msg).toContain("✓ Rejection rate within acceptable threshold.");
  });

  it("ALERT branch: rate over threshold → ALERT + month-filtered breakdown", () => {
    const msg = buildMessage({
      yearMonth: "2026-06",
      total: 69,
      by_agent: { "news-scout": 59, "system-auditor": 8, ops: 1, "zz-fourth": 1 },
      by_type: { chain_catalyst: 54, urgent_news: 11, cross_validate: 2, "zz-type-4": 2 },
      by_stock: { NULL: 60, VIC: 3, GVR: 1 },
      by_reason: [{ reason: "root: Required", count: 10 }],
      signalCount: 52,
    });
    expect(msg).toContain("⚠️ **ALERT**");
    expect(msg).toContain("132.69%");
    expect(msg).toContain("**June 2026 breakdown (month-filtered):**");
    // top-3 agent slice — the 4th agent must NOT appear
    expect(msg).toContain("| news-scout | 59 |");
    expect(msg).toContain("| ops | 1 |");
    expect(msg).not.toContain("zz-fourth");
    // top-3 type slice — the 4th type must NOT appear
    expect(msg).not.toContain("zz-type-4");
  });

  it("zero-data note present when both counts are 0", () => {
    const msg = buildMessage({
      yearMonth: "2026-06",
      total: 0,
      by_agent: {},
      by_type: {},
      by_stock: {},
      by_reason: [],
      signalCount: 0,
    });
    expect(msg).toContain("(no data: zero signals and zero rejections recorded for June 2026)");
    expect(msg).toContain("✓ Rejection rate within acceptable threshold.");
  });
});

describe("backfill-monthly-signal-quality-audit — dedup guard + marker", () => {
  let db: Database;
  beforeEach(() => {
    db = openTestDb();
  });

  it("natural-fire row in month M+1 blocks apply for M", () => {
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES (?, ?, 'success')`,
    ).run("monthlySignalQualityAuditJob", "2026-07-01 00:00:00");
    expect(alreadyAudited(db, "2026-06")).toBe(true);
  });

  it("marker row for the exact target blocks re-apply (idempotency)", () => {
    writeMarker(db, "2026-06", 69);
    expect(alreadyAudited(db, "2026-06")).toBe(true);
  });

  it("no rows → not audited", () => {
    expect(alreadyAudited(db, "2026-06")).toBe(false);
  });

  it("marker for a DIFFERENT target does not block", () => {
    writeMarker(db, "2026-07", 12);
    expect(alreadyAudited(db, "2026-06")).toBe(false);
  });

  it("marker records an honest row with rows_written", () => {
    writeMarker(db, "2026-06", 69);
    const row = db.prepare(
      `SELECT job_name, status, rows_written FROM cron_job_runs WHERE job_name = ?`,
    ).get("monthlySignalQualityAuditJob:backfill-2026-06") as { job_name: string; status: string; rows_written: number };
    expect(row.status).toBe("success");
    expect(row.rows_written).toBe(69);
  });
});
