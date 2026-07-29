Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION — data-layer idempotency backstop.
 *
 * RAW-verified LIVE (2026-07-29, named-volume market_data): the 2026-06-25
 * finding's 102 all-time / 43 active-24h identical dup-groups no longer exist
 * in the live table (rows expired via TTL + cleanExpired — total=202, 0
 * dup-groups at scan time). The underlying MECHANISM remains live: cron_job_runs
 * shows 41 distinct job names multi-firing within the same scheduled minute
 * over the trailing 7 days (broader than FIX-SCHEDULER-DOUBLE-REGISTRATION's
 * originally-scoped vnIndexRefreshJob/pollNewsJob), including
 * freshnessSlaMonitorJob (10x) and intelligenceCycleJob (35x) — both of which
 * write agent_signals rows. This is the permanent, emitter-agnostic backstop
 * mandated regardless of the current 0-count: CREATE UNIQUE INDEX (partial,
 * schema-news.ts) + INSERT OR IGNORE (agentSignalStore.ts) — never
 * ALTER TABLE ADD COLUMN ... UNIQUE (silent no-op in SQLite).
 *
 * Dedup key: (from_agent, signal_type, COALESCE(stock_code,''), payload,
 * minute-bucket of created_at). WHERE payload != '{}' deliberately EXCLUDES
 * alertStore.ts's verified_decision correlation stubs (from_agent='alert-engine',
 * payload ALWAYS the literal '{}' by design, RAW-confirmed the exclusive user of
 * payload='{}' live): that payload carries zero differentiating content, so this
 * coarse key would risk silently dropping the correlation stub for two
 * genuinely-different alerts (e.g. one TA + one BB alert) firing on the same
 * stock in the same minute. alertStore.ts already owns a precise, alert_id-scoped
 * guard for that pattern (FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID, done-live-verified) —
 * this index does not duplicate or override that narrower, more accurate guard.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";
import { generateAlerts } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";
import { computeGenericAlertFingerprint } from "../domain/services/alertDedup.js";

/** Isolated in-memory DB carrying the production dedup UNIQUE INDEX. */
function makeDbWithDedupIndex(): Database {
  const db = new Database(":memory:");
  db.exec(`
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
      alert_id TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_signals_dedup_identical
      ON agent_signals(from_agent, signal_type, COALESCE(stock_code, ''), payload, substr(created_at, 1, 16))
      WHERE payload != '{}';
  `);
  return db;
}

describe("FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION — data-layer backstop", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDbWithDedupIndex();
  });

  it("AC-1: a byte-identical second postSignal (same from_agent/type/stock/payload, same minute) is silently suppressed — returns -1, no 2nd row", () => {
    const first = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "DPM",
      payload: { title: "Oil rises", detail: "US-Iran tension", impact_score: 9 },
      ttlMinutes: 120,
    });
    const second = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "DPM",
      payload: { title: "Oil rises", detail: "US-Iran tension", impact_score: 9 },
      ttlMinutes: 120,
    });

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(-1);

    const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("AC-2: a different payload for the same agent/type/stock in the same minute is NOT suppressed", () => {
    const first = postSignal(db, {
      fromAgent: "freshness-sla-monitor",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: null,
      payload: { title: "SLA BREACH: sbv_fx", detail: "Data age: 59 minutes" },
      ttlMinutes: 60,
    });
    const second = postSignal(db, {
      fromAgent: "freshness-sla-monitor",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: null,
      payload: { title: "SLA BREACH: signal_quality_audit", detail: "Data age: 76067 minutes" },
      ttlMinutes: 60,
    });

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    expect(second).not.toBe(first);

    const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
    expect(rows.n).toBe(2);
  });

  it("AC-3: a different stock_code with the same payload is NOT suppressed", () => {
    const first = postSignal(db, {
      fromAgent: "bctc-analyst",
      toAgent: "all",
      signalType: "fundamental_validation",
      stockCode: "FPT",
      payload: { title: "FPT Q1 stable" },
      ttlMinutes: 120,
    });
    const second = postSignal(db, {
      fromAgent: "bctc-analyst",
      toAgent: "all",
      signalType: "fundamental_validation",
      stockCode: "VCB",
      payload: { title: "FPT Q1 stable" }, // same title text, different ticker
      ttlMinutes: 120,
    });

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);

    const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
    expect(rows.n).toBe(2);
  });

  it("AC-4: alert-engine verified_decision correlation stubs (payload='{}') are excluded from this backstop — two inserts with identical constant payload both succeed via raw SQL (mirrors alertStore.ts's own INSERT OR IGNORE, which is keyed on alert_id, not this index)", () => {
    // Mirrors alertStore.ts's own co-write shape directly (postSignal() is not
    // the write path used there — alertStore.ts issues its own prepared INSERT).
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, status, created_at, expires_at, alert_id)
      VALUES ('alert-engine', 'all', 'verified_decision', 'DPM', '{}', 'unread', datetime('now'), datetime('now','+2 hours'), 'alert-DPM-ta_overbought-2026-07-29')
    `);
    // A second, genuinely-different alert (different alert_id) for the SAME
    // stock in the SAME minute — must NOT be silently dropped by this index.
    expect(() => {
      db.exec(`
        INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, status, created_at, expires_at, alert_id)
        VALUES ('alert-engine', 'all', 'verified_decision', 'DPM', '{}', 'unread', datetime('now'), datetime('now','+2 hours'), 'alert-DPM-bb_breakout-2026-07-29')
      `);
    }).not.toThrow();

    const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals WHERE stock_code='DPM'").get() as { n: number };
    expect(rows.n).toBe(2);
  });

  it("AC-5: NULL stock_code duplicates are still caught (COALESCE normalises NULL for the dedup key)", () => {
    const first = postSignal(db, {
      fromAgent: "system-auditor",
      toAgent: "all",
      signalType: "signal_feedback",
      stockCode: null,
      payload: { title: "data_stale: sbv_fx", check_id: "B-02-SBV" },
      ttlMinutes: 120,
    });
    const second = postSignal(db, {
      fromAgent: "system-auditor",
      toAgent: "all",
      signalType: "signal_feedback",
      stockCode: null,
      payload: { title: "data_stale: sbv_fx", check_id: "B-02-SBV" },
      ttlMinutes: 120,
    });

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(-1);

    const rows = db.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("AC-6: without the dedup index present (legacy/minimal test DB), postSignal behaves exactly as before — OR IGNORE is a no-op absent the constraint", () => {
    const legacyDb = new Database(":memory:");
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS agent_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        stock_code TEXT,
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'unread',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
    `);
    const first = postSignal(legacyDb, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "DPM",
      payload: { title: "Oil rises" },
      ttlMinutes: 120,
    });
    const second = postSignal(legacyDb, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "DPM",
      payload: { title: "Oil rises" },
      ttlMinutes: 120,
    });

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0); // no index present — both inserts succeed
    expect(second).not.toBe(first);

    const rows = legacyDb.query("SELECT COUNT(*) AS n FROM agent_signals").get() as { n: number };
    expect(rows.n).toBe(2);
  });
});

// ── Per-emitter root cause: alertGenerator.ts's random-id fallback ─────────────
//
// alert-engine (the largest 24h dup-group contributor in the historical
// finding) is NOT a single cowork agent — it is the `from_agent` tag written
// by 8 different mcp-server scheduler call sites (taAlertScanJob,
// bbAlertScanJob, foreignFlowAlertJob, predictionMarketJob,
// intelligenceCycleJob, checkSscReports, pollNews, scanMarket) via
// alertStore.ts's verified_decision correlation-stub co-write. RAW code
// review confirmed 7/8 already use a deterministic alert id (safe under
// scheduler re-entrancy); only `scanMarket.ts` (via `alertGenerator.ts`'s
// `chooseAlertId` "otherwise" fallback) used a random id with NO fingerprint
// — `computeAlertFingerprint` existed in alertDedup.ts but had zero
// production callers. This is the most plausible root cause of the historical
// DPM 0.9s-apart genuine-duplicate sample. Fixed by wiring
// `computeGenericAlertFingerprint` into `generateAlerts()` unconditionally.
describe("FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION — alertGenerator root-cause (scanMarket.ts path)", () => {
  const watchlist = [{ actionCode: "DPM" }];

  function makeReportSignal(detectedAt: string): Signal {
    return {
      type: "report_new",
      severity: "medium",
      actionCode: "DPM",
      message: "DPM published a new BCTC report (2026-07-29)",
      confidence: 0.8,
      detectedAt,
    };
  }

  it("AC-7: a re-entrant scheduler double-fire (2 independent generateAlerts() calls, identical signal, same minute) now produces the SAME fingerprint", () => {
    const t = "2026-07-29T02:00:04.386Z";
    const alertsRun1 = generateAlerts([makeReportSignal(t)], watchlist);
    const alertsRun2 = generateAlerts([makeReportSignal("2026-07-29T02:00:05.229Z")], watchlist);

    expect(alertsRun1[0]!.id).not.toBe(alertsRun2[0]!.id); // id remains random (unchanged behaviour)
    expect(alertsRun1[0]!.fingerprint).toBeDefined();
    expect(alertsRun1[0]!.fingerprint).toBe(alertsRun2[0]!.fingerprint); // NEW: fingerprint collapses re-fires
  });

  it("AC-8: a genuinely different report (different message) produces a DIFFERENT fingerprint — not over-suppressed", () => {
    const alertsA = generateAlerts(
      [makeReportSignal("2026-07-29T02:00:04.386Z")],
      watchlist,
    );
    const differentSignal: Signal = {
      type: "report_new",
      severity: "medium",
      actionCode: "DPM",
      message: "DPM published a new BCTC report (2026-07-30)", // different content
      confidence: 0.8,
      detectedAt: "2026-07-30T02:00:04.386Z", // different day too
    };
    const alertsB = generateAlerts([differentSignal], watchlist);

    expect(alertsA[0]!.fingerprint).not.toBe(alertsB[0]!.fingerprint);
  });

  it("AC-9: end-to-end via storeAlerts() — a re-entrant double-fire collapses to exactly ONE alerts row and ONE agent_signals correlation stub", async () => {
    const OLD_DB_PATH = Bun.env["DB_PATH"];
    Bun.env["DB_PATH"] = ":memory:";
    const { closeDb, initDatabase, getDb } = await import("../infrastructure/db/schema.js");
    closeDb();
    await initDatabase();
    try {
      const { storeAlerts } = await import("../infrastructure/db/alertStore.js");
      const db = getDb();

      // Two independent generateAlerts() calls simulate two re-entrant executions
      // of scanMarket() detecting the SAME real-world event within the same minute.
      const run1 = generateAlerts([makeReportSignal("2026-07-29T02:00:04.386Z")], watchlist);
      const run2 = generateAlerts([makeReportSignal("2026-07-29T02:00:04.912Z")], watchlist);

      expect(run1[0]!.id).not.toBe(run2[0]!.id); // distinct random ids, as before

      storeAlerts(run1, db);
      storeAlerts(run2, db);

      const alertRows = db.query("SELECT id FROM alerts").all() as { id: string }[];
      // Both alert.id values were attempted; only the FIRST should have persisted
      // (fingerprint UNIQUE collision silently ignores the second).
      const persisted = alertRows.filter((r) => r.id === run1[0]!.id || r.id === run2[0]!.id);
      expect(persisted.length).toBe(1);
      expect(persisted[0]!.id).toBe(run1[0]!.id);

      const signalRows = db
        .query("SELECT alert_id FROM agent_signals WHERE from_agent='alert-engine' AND signal_type='verified_decision'")
        .all() as { alert_id: string }[];
      expect(signalRows.length).toBe(1);
      expect(signalRows[0]!.alert_id).toBe(run1[0]!.id);
    } finally {
      closeDb();
      if (OLD_DB_PATH !== undefined) Bun.env["DB_PATH"] = OLD_DB_PATH;
      else delete Bun.env["DB_PATH"];
    }
  });

  it("AC-10: computeGenericAlertFingerprint is order-independent for signal types and stable for identical inputs", () => {
    const fp1 = computeGenericAlertFingerprint("DPM", ["report_new", "urgent_news"], "msg", "2026-07-29T02:00:00.000Z");
    const fp2 = computeGenericAlertFingerprint("DPM", ["urgent_news", "report_new"], "msg", "2026-07-29T02:00:59.999Z");
    expect(fp1).toBe(fp2); // same minute bucket + same sorted types + same message
  });
});
