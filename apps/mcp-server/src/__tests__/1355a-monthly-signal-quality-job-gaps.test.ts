/**
 * TASK_1355a — monthlySignalQualityJob gap-fill tests
 *
 * Covers paths not reached by existing 1295c coverage:
 *   MSQ-1: January rollover → audits December of prior year
 *   MSQ-2: Non-January month → month offset -1, correct year
 *   MSQ-3: Rejection rate below 2% → no alert prefix, threshold footer present
 *   MSQ-4: Rejection rate above 2% → alert prefix + full report embedded
 *   MSQ-5: sendFn injection → called exactly once per job run
 *   MSQ-6: queryRejectionStats wiring → receives correct monthName + year
 *   MSQ-7: generateAuditReport wiring → return value embedded in message when threshold exceeded
 *   MSQ-8: Regex extraction fallback → no rate match → defaults to 0%, no alert
 *
 * DI surface: db? and sendFn? optional params on runMonthlySignalQualityJob.
 * No production changes required.
 *
 * Layer: tests — in-memory DB, no real Telegram sends.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, mock, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { runMonthlySignalQualityJob } from "../scheduler/audits/monthlySignalQualityJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Real-module captures — imported BEFORE any mock.module() call so they hold
// the genuine implementations. Used in teardown to repair the module registry.
// ─────────────────────────────────────────────────────────────────────────────
import {
  queryRejectionStats as _realQueryRejectionStats,
  generateAuditReport as _realGenerateAuditReport,
} from "../application/services/signalQualityAudit.js";

// Freeze real implementations immediately (before any mock.module can shadow them)
const _frozenRealQueryRejectionStats = _realQueryRejectionStats;
const _frozenRealGenerateAuditReport = _realGenerateAuditReport;

// ─────────────────────────────────────────────────────────────────────────────
// Top-level mutable mock factories for MSQ-6, MSQ-7, MSQ-8
//
// mock.module() is worker-scoped and permanent. Calling it once at file level
// with a mutable factory variable prevents the mid-test re-registration race.
// Per-test behaviour is controlled by updating the variable, not re-calling
// mock.module(). Tests MSQ-1 through MSQ-5 use the real implementations via
// _frozenReal* defaults.
// ─────────────────────────────────────────────────────────────────────────────
let _queryRejectionStatsImpl: typeof _realQueryRejectionStats = _frozenRealQueryRejectionStats;
let _generateAuditReportImpl: typeof _realGenerateAuditReport = _frozenRealGenerateAuditReport;

mock.module("../application/services/signalQualityAudit.js", () => ({
  queryRejectionStats: async (...args: Parameters<typeof _realQueryRejectionStats>) =>
    _queryRejectionStatsImpl(...args),
  generateAuditReport: async (...args: Parameters<typeof _realGenerateAuditReport>) =>
    _generateAuditReportImpl(...args),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a minimal in-memory SQLite DB with the two tables required by
 * queryRejectionStats and generateAuditReport. Optionally accepts a DDL-only
 * flag to return an empty DB.
 */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS signal_rejections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

/**
 * Create a stub sendFn that captures messages into an array.
 */
function makeSendCapture(): { fn: (text: string) => Promise<boolean>; calls: string[] } {
  const calls: string[] = [];
  return {
    fn: async (text: string) => {
      calls.push(text);
      return true;
    },
    calls,
  };
}

/**
 * Patch globalThis.Date to return a fixed UTC month and year.
 * Returns the original Date for restoration.
 */
function patchDate(utcMonth: number, utcYear: number): typeof Date {
  const OrigDate = globalThis.Date;
  class FakeDate extends OrigDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(utcYear, utcMonth, 1);
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }
    getUTCMonth(): number { return utcMonth; }
    getUTCFullYear(): number { return utcYear; }
  }
  globalThis.Date = FakeDate as unknown as typeof Date;
  return OrigDate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1355a — monthlySignalQualityJob gap tests", () => {

  // ---------------------------------------------------------------------------
  describe("MSQ-1: January rollover — month 0 audits December of prior year", () => {
    it("message contains 'December 2025' when job runs in January 2026", async () => {
      const db = makeDb();
      const send = makeSendCapture();

      // Pin current date to January 2026 (UTC month=0)
      const OrigDate = patchDate(0, 2026);
      try {
        await runMonthlySignalQualityJob(db, send.fn);
      } finally {
        globalThis.Date = OrigDate;
      }

      expect(send.calls.length).toBe(1);
      expect(send.calls[0]).toContain("December 2025");
    });
  });

  // ---------------------------------------------------------------------------
  describe("MSQ-2: Non-January month — month offset -1, correct year", () => {
    it("message contains 'March 2026' when job runs in April 2026", async () => {
      const db = makeDb();
      const send = makeSendCapture();

      // Pin current date to April 2026 (UTC month=3)
      const OrigDate = patchDate(3, 2026);
      try {
        await runMonthlySignalQualityJob(db, send.fn);
      } finally {
        globalThis.Date = OrigDate;
      }

      expect(send.calls.length).toBe(1);
      expect(send.calls[0]).toContain("March 2026");
    });
  });

  // ---------------------------------------------------------------------------
  describe("MSQ-3: Rejection rate below 2% — no alert prefix", () => {
    it("message does NOT contain alert prefix and contains threshold-ok footer", async () => {
      // Empty DB → 0 rejections / 0 signals → 0% rate → no alert
      const db = makeDb();
      const send = makeSendCapture();

      await runMonthlySignalQualityJob(db, send.fn);

      expect(send.calls.length).toBe(1);
      const msg = send.calls[0]!;
      expect(msg).not.toContain("⚠️ **ALERT**");
      expect(msg).toContain("✓ Rejection rate within acceptable threshold.");
    });
  });

  // ---------------------------------------------------------------------------
  describe("MSQ-4: Rejection rate above 2% — alert prefix + full report", () => {
    it("message contains ALERT prefix and the rejection rate when above threshold", async () => {
      // Use mock factory to return a report with 3.00% rate → 3% > 2% → alert
      const sentinelReport = "# Signal Quality Audit Report\n| Rejection Rate | 3.00% |\n";
      _queryRejectionStatsImpl = async () => ({
        total: 3,
        by_agent: { qa: 3 },
        by_type: { SELL: 3 },
        by_stock: {},
      });
      _generateAuditReportImpl = async () => sentinelReport;

      const db = makeDb();
      const send = makeSendCapture();

      try {
        await runMonthlySignalQualityJob(db, send.fn);
      } finally {
        _queryRejectionStatsImpl = _frozenRealQueryRejectionStats;
        _generateAuditReportImpl = _frozenRealGenerateAuditReport;
      }

      expect(send.calls.length).toBe(1);
      const msg = send.calls[0]!;
      expect(msg).toContain("⚠️ **ALERT**");
      expect(msg).toContain("3.00%");
      expect(msg).toContain(sentinelReport);
    });
  });

  // ---------------------------------------------------------------------------
  describe("MSQ-5: sendFn injection — called exactly once per job run", () => {
    it("sendFn is called exactly once regardless of threshold branch", async () => {
      const db = makeDb();
      const send = makeSendCapture();

      await runMonthlySignalQualityJob(db, send.fn);

      expect(send.calls.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe("MSQ-6: queryRejectionStats wiring — receives correct monthName + year", () => {
    it("receives 'April' and 2026 when job runs in May 2026", async () => {
      let capturedMonth: string | undefined;
      let capturedYear: number | undefined;

      _queryRejectionStatsImpl = async (_db, month, year) => {
        capturedMonth = month;
        capturedYear = year;
        return { total: 0, by_agent: {}, by_type: {}, by_stock: {} };
      };
      // generateAuditReport must still return a string with rate pattern (0%) to avoid alert
      _generateAuditReportImpl = async () =>
        "# Report\n| Rejection Rate | 0.00% |\n";

      const db = makeDb();
      const send = makeSendCapture();

      // Pin date to May 2026 (UTC month=4) → prior month = April 2026
      const OrigDate = patchDate(4, 2026);
      try {
        await runMonthlySignalQualityJob(db, send.fn);
      } finally {
        globalThis.Date = OrigDate;
        _queryRejectionStatsImpl = _frozenRealQueryRejectionStats;
        _generateAuditReportImpl = _frozenRealGenerateAuditReport;
      }

      expect(capturedMonth).toBe("April");
      expect(capturedYear).toBe(2026);
    });
  });

  // ---------------------------------------------------------------------------
  describe("MSQ-7: generateAuditReport wiring — return value embedded when threshold exceeded", () => {
    it("sentinel report string appears in the message when rate > 2%", async () => {
      const SENTINEL = "SENTINEL_REPORT_STRING";
      const sentinelReport = `${SENTINEL}\nRejection Rate | 5.00%`;

      _queryRejectionStatsImpl = async () => ({
        total: 5,
        by_agent: { qa: 5 },
        by_type: {},
        by_stock: {},
      });
      _generateAuditReportImpl = async () => sentinelReport;

      const db = makeDb();
      const send = makeSendCapture();

      // Pin to a non-January month to avoid rollover complexity
      const OrigDate = patchDate(4, 2026); // May 2026
      try {
        await runMonthlySignalQualityJob(db, send.fn);
      } finally {
        globalThis.Date = OrigDate;
        _queryRejectionStatsImpl = _frozenRealQueryRejectionStats;
        _generateAuditReportImpl = _frozenRealGenerateAuditReport;
      }

      expect(send.calls.length).toBe(1);
      expect(send.calls[0]).toContain(SENTINEL);
    });
  });

  // ---------------------------------------------------------------------------
  describe("MSQ-8: Regex extraction fallback — no rate match defaults to 0%, no alert", () => {
    it("when report has no Rejection Rate line, rate=0, no alert, sendFn still called", async () => {
      // generateAuditReport returns a string with no 'Rejection Rate | X.XX%' pattern
      _generateAuditReportImpl = async () =>
        "# Report\nNo rate data available";
      _queryRejectionStatsImpl = async () => ({
        total: 0,
        by_agent: {},
        by_type: {},
        by_stock: {},
      });

      const db = makeDb();
      const send = makeSendCapture();

      try {
        await runMonthlySignalQualityJob(db, send.fn);
      } finally {
        _queryRejectionStatsImpl = _frozenRealQueryRejectionStats;
        _generateAuditReportImpl = _frozenRealGenerateAuditReport;
      }

      expect(send.calls.length).toBe(1);
      const msg = send.calls[0]!;
      // Rejection rate defaults to 0 → no alert
      expect(msg).not.toContain("⚠️ **ALERT**");
      // Rate shown as 0.00% in the message body
      expect(msg).toContain("Rejection Rate: 0.00%");
      // sendFn called unconditionally
      expect(send.calls.length).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Teardown — restore mocked modules to real implementations
//
// mock.module() in Bun 1.x is worker-scoped and permanent. Re-register real
// implementations so worker-sibling test files see genuine modules.
// ─────────────────────────────────────────────────────────────────────────────
describe("Task 1355a — teardown: restore module registry for worker-siblings", () => {
  afterAll(() => {
    mock.module("../application/services/signalQualityAudit.js", () => ({
      queryRejectionStats: _frozenRealQueryRejectionStats,
      generateAuditReport: _frozenRealGenerateAuditReport,
    }));
  });

  it("teardown guard: real implementations captured", () => {
    expect(typeof _frozenRealQueryRejectionStats).toBe("function");
    expect(typeof _frozenRealGenerateAuditReport).toBe("function");
  });
});
