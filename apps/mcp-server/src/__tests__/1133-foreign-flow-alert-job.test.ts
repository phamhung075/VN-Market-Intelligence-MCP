/**
 * Task 1133 — foreignFlowAlertJob tests
 *
 * TDD: all tests written before implementation.
 * Tests use an in-memory SQLite database with minimal schema.
 *
 * AC coverage:
 *   AC-1: VNM=5 days HIGH, FPT=1 row → { stocksScanned:2, stocksSkipped:1, highSignals:1, alertsInserted:1, evidenceFragmentsWritten:1 }
 *   AC-2: alert row id = "foreign-flow-VNM-<today>", severity="high", sent_by="server"
 *   AC-3: evidence fragment exists for VNM, evidence_type="foreign_flow_institutional", direction="bullish"
 *   AC-4: second run same day → alertsInserted:0 (INSERT OR IGNORE dedup)
 *   AC-5: all foreignVolume=0 for a stock → stock skipped (not counted as HIGH signal)
 *   AC-6: sendTelegramWork called exactly once, sendTelegramMarket never called
 *   AC-7: CRONS.foreignFlowAlert = '30 9 * * 1-5' or env override
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runForeignFlowAlertJob,
  type ForeignFlowAlertResult,
  type TelegramOverridesFF,
} from "../scheduler/market-data/foreignFlowAlertJob.js";
import { CRONS } from "../scheduler/jobs.js";
// TASK_2003 (SUBTASK-DAILY-FF-4): production code now reads foreign-flow via the
// daily_ohlcv_with_flow compat view. Reuse the real schema init/migration
// functions (no duplicated DDL) to upgrade this ad-hoc fixture so the view resolves.
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { migrateForeignFlowColumns } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB setup
// ─────────────────────────────────────────────────────────────────────────────

async function makeDb(): Promise<Database> {
  const db = new Database(":memory:");

  // watchlist table
  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code         TEXT PRIMARY KEY,
      company_name TEXT,
      exchange     TEXT NOT NULL DEFAULT 'HOSE',
      domain       TEXT NOT NULL DEFAULT 'other',
      notes        TEXT,
      added_at     TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct   REAL,
      alert_rise_pct   REAL,
      alert_impact_min REAL,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    )
  `);

  // daily_ohlcv table (foreign flow source since sprint 1517b)
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL,
      high             REAL,
      low              REAL,
      close            REAL,
      volume           REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    )
  `);

  // alerts table
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      confidence_score      REAL,
      validated_at          TEXT,
      fingerprint           TEXT UNIQUE,
      resolved_at           TEXT,
      resolution_notes      TEXT
    )
  `);

  // FU-ALERT-COWRITE-SCHEDULER-JOBS: agent_signals table required for storeAlerts co-write.
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      alert_id TEXT,
      is_correlation_stub INTEGER DEFAULT 0
    )
  `);

  // evidence_fragments table
  db.run(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      stock        TEXT    NOT NULL,
      evidence_type TEXT   NOT NULL,
      direction    TEXT    NOT NULL,
      magnitude    REAL    NOT NULL,
      confidence   REAL    NOT NULL,
      timestamp    TEXT    NOT NULL,
      source_agent TEXT    NOT NULL,
      ttl_days     INTEGER NOT NULL DEFAULT 30,
      expires_at   TEXT    NOT NULL
    )
  `);

  // cron_job_runs table (for recordJobRun)
  db.run(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name    TEXT    NOT NULL,
      started_at  TEXT    NOT NULL,
      finished_at TEXT,
      status      TEXT    NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg   TEXT
    )
  `);

  // TASK_2003: this ad-hoc fixture predates daily_ohlcv_with_flow and lacks
  // updated_at — add it (idempotent guard) then create daily_foreign_flow +
  // the compat view via the real init path so the view resolves.
  const cols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
    .all()
    .map((r) => r.name);
  if (!cols.includes("updated_at")) {
    db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);
  }
  initMarketDataTables(db);
  await migrateForeignFlowColumns(db);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for seeding test data
// ─────────────────────────────────────────────────────────────────────────────

function seedWatchlist(db: Database, codes: string[]): void {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO watchlist (code, exchange, domain) VALUES (?, 'HOSE', 'banking')`
  );
  for (const code of codes) ins.run(code);
}

/**
 * Seed N days of foreign net flow for a stock in daily_ohlcv.
 * netVolPerDay: direct net_vol value per row (not cumulative).
 * Production COALESCE query sums these as running total in app layer.
 * index 0 = most recent day.
 */
function seedForeignFlow(
  db: Database,
  code: string,
  netVolPerDay: number[],
): void {
  const ins = db.prepare(`
    INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol)
    VALUES (?, ?, ?)
  `);
  const today = new Date();
  for (let i = 0; i < netVolPerDay.length; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    ins.run(code, dateStr, netVolPerDay[i] ?? 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// No-op Telegram overrides (avoids real HTTP calls)
// ─────────────────────────────────────────────────────────────────────────────

function makeNoopTelegram(): { overrides: TelegramOverridesFF; workCalls: string[]; marketCalls: string[] } {
  const workCalls: string[] = [];
  const marketCalls: string[] = [];
  return {
    overrides: {
      sendWork: async (msg: string) => { workCalls.push(msg); return true; },
      sendMarket: async (msg: string) => { marketCalls.push(msg); return true; },
    },
    workCalls,
    marketCalls,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1133 — foreignFlowAlertJob", () => {

  describe("AC-7: CRONS key", () => {
    it("CRONS.foreignFlowAlert = '13 8 * * 1-5' (08:13 UTC = 15:13 VN weekdays — Sprint 1949-T6)", () => {
      // Env override or default (rescheduled from 09:30 UTC → 08:13 UTC by Sprint 1949-T6)
      const expected = Bun.env.CRON_FOREIGN_FLOW_ALERT ?? "13 8 * * 1-5";
      expect(CRONS.foreignFlowAlert).toBe(expected);
    });
  });

  describe("AC-1: basic scan — VNM=HIGH, FPT=1 row skipped", () => {
    let db: Database;
    let result: ForeignFlowAlertResult;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM", "FPT"]);

      // VNM: 4 consecutive net_buy days of 150k each → cumsum ascending → deltas +150k → HIGH
      // Per-day net_vol (index 0 = most recent): [150k, 150k, 150k, 150k, 0]
      // cumsum ASC: 0→150k→300k→450k→600k; reversed DESC deltas: 150k×4 consecutive → HIGH
      seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);

      // FPT: only 1 row → insufficient for delta calc → skipped
      seedForeignFlow(db, "FPT", [10_000]);

      const { overrides } = makeNoopTelegram();
      result = await runForeignFlowAlertJob(db, overrides);
    });

    it("returns correct summary counts", () => {
      expect(result.stocksScanned).toBe(2);
      expect(result.stocksSkipped).toBe(1);
      expect(result.highSignals).toBe(1);
      expect(result.alertsInserted).toBe(1);
      expect(result.evidenceFragmentsWritten).toBe(1);
    });
  });

  describe("AC-2: alert row shape", () => {
    let db: Database;
    const today = new Date().toISOString().slice(0, 10);

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);
      const { overrides } = makeNoopTelegram();
      await runForeignFlowAlertJob(db, overrides);
    });

    it("alert id = 'foreign-flow-VNM-<today>'", () => {
      const row = db
        .query<{ id: string; severity: string; sent_by: string }, []>(
          "SELECT id, severity, sent_by FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'"
        )
        .get();
      expect(row).not.toBeNull();
      expect(row!.id).toBe(`foreign-flow-VNM-${today}`);
    });

    it("alert severity = 'high'", () => {
      const row = db
        .query<{ severity: string }, []>(
          "SELECT severity FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'"
        )
        .get();
      expect(row!.severity).toBe("high");
    });

    it("alert sent_by = 'server'", () => {
      const row = db
        .query<{ sent_by: string }, []>(
          "SELECT sent_by FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'"
        )
        .get();
      expect(row!.sent_by).toBe("server");
    });
  });

  describe("AC-3: evidence fragment shape", () => {
    let db: Database;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);
      const { overrides } = makeNoopTelegram();
      await runForeignFlowAlertJob(db, overrides);
    });

    it("evidence fragment exists for VNM with correct type and direction", () => {
      const row = db
        .query<{ stock: string; evidence_type: string; direction: string }, []>(
          "SELECT stock, evidence_type, direction FROM evidence_fragments WHERE stock = 'VNM'"
        )
        .get();
      expect(row).not.toBeNull();
      expect(row!.stock).toBe("VNM");
      expect(row!.evidence_type).toBe("foreign_flow_institutional");
      // VNM is net_buy → bullish
      expect(row!.direction).toBe("bullish");
    });
  });

  describe("AC-4: idempotency — second run same day inserts 0 alerts", () => {
    let db: Database;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);
      const { overrides } = makeNoopTelegram();
      await runForeignFlowAlertJob(db, overrides); // first run
    });

    it("second run same day → alertsInserted:0", async () => {
      const { overrides } = makeNoopTelegram();
      const result2 = await runForeignFlowAlertJob(db, overrides);
      expect(result2.alertsInserted).toBe(0);
    });
  });

  describe("AC-5: zero-data guard — all foreignVolume=0 skips the stock", () => {
    let db: Database;
    let result: ForeignFlowAlertResult;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      // All zeros → zero-data guard fires
      seedForeignFlow(db, "VNM", [0, 0, 0, 0, 0]);
      const { overrides } = makeNoopTelegram();
      result = await runForeignFlowAlertJob(db, overrides);
    });

    it("stock with all-zero foreignVolume is skipped and not counted as HIGH", () => {
      expect(result.highSignals).toBe(0);
      expect(result.alertsInserted).toBe(0);
      expect(result.stocksSkipped).toBe(1);
    });
  });

  describe("AC-6: Telegram routing — WORK only, never MARKET", () => {
    let db: Database;
    let workCalls: string[];
    let marketCalls: string[];

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);
      const t = makeNoopTelegram();
      workCalls = t.workCalls;
      marketCalls = t.marketCalls;
      await runForeignFlowAlertJob(db, t.overrides);
    });

    it("sendTelegramWork called exactly once", () => {
      expect(workCalls.length).toBe(1);
    });

    it("sendTelegramMarket never called", () => {
      expect(marketCalls.length).toBe(0);
    });
  });

  describe("AC-net_sell: net_sell direction → bearish evidence fragment", () => {
    let db: Database;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      // Negative per-day net_vol → cumsum decreasing → deltas negative → net_sell → bearish
      seedForeignFlow(db, "VNM", [-150_000, -150_000, -150_000, -150_000, 0]);
      const { overrides } = makeNoopTelegram();
      await runForeignFlowAlertJob(db, overrides);
    });

    it("net_sell direction produces bearish evidence fragment", () => {
      const row = db
        .query<{ direction: string }, []>(
          "SELECT direction FROM evidence_fragments WHERE stock = 'VNM'"
        )
        .get();
      expect(row).not.toBeNull();
      expect(row!.direction).toBe("bearish");
    });
  });

  describe("AC-neutral: neutral signal → no alert, no evidence fragment", () => {
    let db: Database;
    let result: ForeignFlowAlertResult;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      // Alternating per-day net_vol → no consistent streak → neutral/low severity
      seedForeignFlow(db, "VNM", [10_000, -10_000, 10_000, -10_000, 0]);
      const { overrides } = makeNoopTelegram();
      result = await runForeignFlowAlertJob(db, overrides);
    });

    it("non-HIGH signals do not insert alerts", () => {
      expect(result.alertsInserted).toBe(0);
      expect(result.highSignals).toBe(0);
    });

    it("non-HIGH signals do not write evidence fragments", () => {
      expect(result.evidenceFragmentsWritten).toBe(0);
    });
  });

  // ── FACTORY-SCHEDULER-alert-confidence-literals ─────────────────────────────
  // Confidence must be derived from the real 3-day net-flow magnitude, not a
  // frozen literal — two HIGH signals of different magnitude must produce
  // different confidence values on both the alert signal and the evidence
  // fragment (same formula, deriveConfidenceFromStrength, base=0.55 ceiling=0.95).

  describe("FACTORY-SCHEDULER-alert-confidence-literals: confidence varies with flow magnitude", () => {
    it("a borderline HIGH signal (~120k shares/3d) yields lower confidence than a maxed-out one (600k shares/3d)", async () => {
      // Weak: 3 consecutive net-buy days of 40k each → totalNetVolume3d=120k
      // (magnitude = 120_000/500_000 = 0.24 → confidence = 0.55 + 0.24*0.40 = 0.646)
      const weakDb = await makeDb();
      seedWatchlist(weakDb, ["VNM"]);
      seedForeignFlow(weakDb, "VNM", [40_000, 40_000, 40_000, 0, 0]);
      await runForeignFlowAlertJob(weakDb, makeNoopTelegram().overrides);

      // Strong: 3 consecutive net-buy days of 200k each → totalNetVolume3d=600k,
      // clamped magnitude=1.0 → confidence = 0.55 + 1.0*0.40 = 0.95
      const strongDb = await makeDb();
      seedWatchlist(strongDb, ["VNM"]);
      seedForeignFlow(strongDb, "VNM", [200_000, 200_000, 200_000, 0, 0]);
      await runForeignFlowAlertJob(strongDb, makeNoopTelegram().overrides);

      const weakAlert = weakDb
        .query<{ signals_json: string }, []>(
          "SELECT signals_json FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'"
        )
        .get();
      const strongAlert = strongDb
        .query<{ signals_json: string }, []>(
          "SELECT signals_json FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'"
        )
        .get();
      expect(weakAlert).not.toBeNull();
      expect(strongAlert).not.toBeNull();

      const weakConfidence = (JSON.parse(weakAlert!.signals_json) as Array<{ confidence: number }>)[0]!.confidence;
      const strongConfidence = (JSON.parse(strongAlert!.signals_json) as Array<{ confidence: number }>)[0]!.confidence;

      expect(weakConfidence).toBeCloseTo(0.646, 5);
      expect(strongConfidence).toBeCloseTo(0.95, 5);
      expect(strongConfidence).toBeGreaterThan(weakConfidence);

      // Evidence fragment confidence must match the same derived value (not a literal)
      const weakFrag = weakDb
        .query<{ confidence: number }, []>("SELECT confidence FROM evidence_fragments WHERE stock = 'VNM'")
        .get();
      const strongFrag = strongDb
        .query<{ confidence: number }, []>("SELECT confidence FROM evidence_fragments WHERE stock = 'VNM'")
        .get();
      expect(weakFrag!.confidence).toBeCloseTo(0.646, 5);
      expect(strongFrag!.confidence).toBeCloseTo(0.95, 5);
    });
  });

  // ── FU-ALERT-COWRITE-SCHEDULER-JOBS: co-write tests ─────────────────────────
  // DoD requires: every fired alert must have a matching agent_signals row
  // (no orphan alert — JOIN alerts a LEFT JOIN agent_signals s ON a.id = s.alert_id WHERE s.alert_id IS NULL = 0).

  describe("CW-1: HIGH foreign-flow alert has a matching agent_signals row (no orphan)", () => {
    let db: Database;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);
      const { overrides } = makeNoopTelegram();
      await runForeignFlowAlertJob(db, overrides);
    });

    it("alert row exists after HIGH signal", () => {
      const cnt = db
        .query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts")
        .get()?.cnt ?? 0;
      expect(cnt).toBe(1);
    });

    it("no orphan alerts — all alert rows have a matching agent_signals row via alert_id", () => {
      const orphanCount = db
        .query<{ cnt: number }, []>(
          `SELECT COUNT(*) AS cnt
           FROM alerts a
           LEFT JOIN agent_signals s ON a.id = s.alert_id
           WHERE s.alert_id IS NULL`
        )
        .get()?.cnt ?? 0;
      expect(orphanCount).toBe(0);
    });

    it("agent_signals row has correct from_agent and stock_code", () => {
      const signal = db
        .query<{ from_agent: string; signal_type: string; stock_code: string }, []>(
          "SELECT from_agent, signal_type, stock_code FROM agent_signals LIMIT 1"
        )
        .get();
      expect(signal).not.toBeNull();
      expect(signal!.from_agent).toBe("alert-engine");
      expect(signal!.stock_code).toBe("VNM");
    });
  });

  describe("CW-2: second run same day — still 0 orphans (idempotent co-write)", () => {
    let db: Database;

    beforeEach(async () => {
      db = await makeDb();
      seedWatchlist(db, ["VNM"]);
      seedForeignFlow(db, "VNM", [150_000, 150_000, 150_000, 150_000, 0]);
      const { overrides } = makeNoopTelegram();
      await runForeignFlowAlertJob(db, overrides); // first run
      await runForeignFlowAlertJob(db, makeNoopTelegram().overrides); // second run same day
    });

    it("still exactly 1 alert row after 2 runs (INSERT OR IGNORE dedup)", () => {
      const cnt = db
        .query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts")
        .get()?.cnt ?? 0;
      expect(cnt).toBe(1);
    });

    it("still 0 orphan alerts after 2 runs", () => {
      const orphanCount = db
        .query<{ cnt: number }, []>(
          `SELECT COUNT(*) AS cnt
           FROM alerts a
           LEFT JOIN agent_signals s ON a.id = s.alert_id
           WHERE s.alert_id IS NULL`
        )
        .get()?.cnt ?? 0;
      expect(orphanCount).toBe(0);
    });
  });
});
