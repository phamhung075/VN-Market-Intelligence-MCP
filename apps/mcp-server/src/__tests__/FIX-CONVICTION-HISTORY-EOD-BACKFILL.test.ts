Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-CONVICTION-HISTORY-EOD-BACKFILL
 *
 * Covers:
 *   AC-1: scanMarket Step 5c persists conviction_history even when zero
 *         signals are detected across the whole watchlist (root-cause fix —
 *         conviction scoring was previously coupled to an early
 *         "no signals -> return" guard).
 *   AC-2: scanMarket emits a same-day agent_feedback observability signal
 *         when every conviction_history upsert fails (real DB write
 *         failure), and does NOT emit it when upserts succeed normally.
 *   AC-3: checkConvictionHistoryGap (dataAuditJob D-NEW3) finds a trading
 *         day present in daily_ohlcv with 0 conviction_history rows,
 *         backfills it from daily_ohlcv alone, and files an agent_feedback
 *         finding — idempotent on a second run once caught up.
 *   AC-4: the "confirmed trading day" floor rejects sparse/partial dates
 *         (avoids a false-positive gap on a date daily_ohlcv barely covers).
 *   AC-5: "today" (VN calendar) is never flagged as a gap day.
 *   AC-6: dataAuditJob.runDailyChecks composes the new check.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, closeDb } from "../infrastructure/db/schema.js";
import { scanMarket } from "../application/usecases/scanMarket.js";
import type { MarketPrice } from "../infrastructure/fetchers/hose.js";
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../infrastructure/db/repositories/SqliteMarketPriceRepository.js";
import {
  checkConvictionHistoryGap,
  findConvictionHistoryGapDays,
  backfillConvictionForDate,
} from "../scheduler/news-analysis/audit-checks/checkConvictionHistoryGap.js";

// ── VN "today" (matches scanMarket / checkConvictionHistoryGap's own clock) ──

const VN_OFFSET_MS = 7 * 3600_000;
function vnTodayStr(): string {
  const d = new Date(Date.now() + VN_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ── Schema (mirrors 103-job-market-scan.test.ts + real conviction_history /
//    agent_feedback / daily_ohlcv shapes) ────────────────────────────────────

function seedSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL,
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL,
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
    );
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
      resolved_at           TEXT,
      resolution_notes      TEXT,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      confidence_score      REAL,
      validated_at          TEXT,
      fingerprint           TEXT
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS conviction_history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol           TEXT NOT NULL,
      date             TEXT NOT NULL,
      peak_score       REAL NOT NULL,
      dominant_signal  TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, date)
    );
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent       TEXT NOT NULL,
      category    TEXT NOT NULL,
      title       TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      priority    TEXT NOT NULL DEFAULT 'medium',
      status      TEXT NOT NULL DEFAULT 'new',
      created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL NOT NULL DEFAULT 0,
      high             REAL NOT NULL DEFAULT 0,
      low              REAL NOT NULL DEFAULT 0,
      close            REAL NOT NULL,
      volume           REAL NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
  `);
}

function wipeTables(db: Database) {
  for (const t of [
    "market_prices_history",
    "market_prices",
    "watchlist",
    "alerts",
    "conviction_history",
    "agent_feedback",
    "daily_ohlcv",
  ]) {
    try { db.exec(`DELETE FROM ${t}`); } catch { /* table may not exist yet on first call */ }
  }
}

function setupTestDb(): Database {
  (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
  closeDb();
  const db = getDb();
  seedSchema(db);
  return db;
}

function addWatchlistEntry(db: Database, code: string, domain = "banking") {
  db.exec(
    `INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at)
     VALUES ('${code}', 'HOSE', '${domain}', '${new Date().toISOString()}')`,
  );
}

function makeDeps(fetchPrices: (codes: string[]) => Promise<MarketPrice[]>) {
  const db = getDb();
  return {
    watchlistRepo: new SqliteWatchlistRepository(db),
    marketPriceRepo: new SqliteMarketPriceRepository(db),
    fetchPrices,
  };
}

/** A repo that always fails the conviction_history write (simulates a real DB failure). */
class AlwaysFailConvictionRepo extends SqliteMarketPriceRepository {
  override upsertConvictionHistory(): boolean {
    return false;
  }
}

const NORMAL_PRICE_MOCK: MarketPrice = {
  code: "FPT",
  exchange: "HOSE",
  price: 120_000,
  previousPrice: 119_500,
  changePct: 0.42, // below signal thresholds -> 0 signals detected
  volume: 200_000,
  avgVolume: 0,
  fetchedAt: new Date().toISOString(),
};

setupTestDb();

beforeEach(() => {
  wipeTables(getDb());
});

// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CONVICTION-HISTORY-EOD-BACKFILL — scanMarket root-cause fix", () => {
  it("AC-1: persists conviction_history even when zero signals are detected", async () => {
    const db = getDb();
    addWatchlistEntry(db, "FPT", "tech");

    const result = await scanMarket(makeDeps(async () => [NORMAL_PRICE_MOCK]));
    expect(result.signals).toBe(0); // confirms this really is the zero-signal path

    const row = db
      .query<{ symbol: string; date: string }, []>("SELECT symbol, date FROM conviction_history WHERE symbol = 'FPT'")
      .get();
    expect(row).toBeDefined();
    expect(row!.symbol).toBe("FPT");
  });

  it("AC-2a: emits a same-day agent_feedback signal when every conviction upsert fails", async () => {
    const db = getDb();
    addWatchlistEntry(db, "FPT", "tech");

    const deps = {
      watchlistRepo: new SqliteWatchlistRepository(db),
      marketPriceRepo: new AlwaysFailConvictionRepo(db),
      fetchPrices: async () => [NORMAL_PRICE_MOCK],
    };
    await scanMarket(deps);

    const fb = db
      .query<{ agent: string; category: string; title: string; priority: string }, []>(
        "SELECT agent, category, title, priority FROM agent_feedback WHERE agent = 'scanMarket'",
      )
      .get();
    expect(fb).toBeDefined();
    expect(fb!.category).toBe("data_extraction_error");
    expect(fb!.title).toContain("conviction_history zero-row write");
    expect(fb!.priority).toBe("high");
  });

  it("AC-2b: does NOT emit the same-day signal when conviction upserts succeed", async () => {
    const db = getDb();
    addWatchlistEntry(db, "FPT", "tech");

    await scanMarket(makeDeps(async () => [NORMAL_PRICE_MOCK]));

    const fb = db
      .query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM agent_feedback WHERE agent = 'scanMarket'")
      .get();
    expect(fb!.cnt).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CONVICTION-HISTORY-EOD-BACKFILL — checkConvictionHistoryGap (EOD reconciliation)", () => {
  const GAP_DATE = "2026-06-22";

  // Each code's prior-day baseline lives on its OWN date (2026-06-17 for VCB,
  // 2026-06-18 for FPT) — staggered on purpose so neither prior date alone
  // reaches the watchlist-size floor (2 codes) and gets mistaken for its own
  // "confirmed trading day" gap. Only GAP_DATE has BOTH codes' daily_ohlcv
  // rows, so it is the single, cleanly isolated gap day in this fixture.
  function seedGapDayFixture(db: Database) {
    addWatchlistEntry(db, "VCB", "banking");
    addWatchlistEntry(db, "FPT", "tech");

    // Pre-existing conviction_history history (sets MIN(date) well before
    // GAP_DATE so the lookback window covers it — mirrors a live DB that
    // already has months of conviction_history rows).
    db.exec(
      `INSERT INTO conviction_history (symbol, date, peak_score, dominant_signal, created_at)
       VALUES ('VNM', '2026-04-01', 0.5, 'neutral', '2026-04-01T00:00:00Z')`,
    );

    for (const [code, priorDate, priorClose, gapClose] of [
      ["VCB", "2026-06-17", 80000, 88000], // +10%
      ["FPT", "2026-06-18", 120000, 114000], // -5%
    ] as const) {
      db.exec(
        `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
         VALUES ('${code}', '${priorDate}', ${priorClose}, ${priorClose}, ${priorClose}, ${priorClose}, 500000, datetime('now'))`,
      );
      db.exec(
        `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
         VALUES ('${code}', '${GAP_DATE}', ${gapClose}, ${gapClose}, ${gapClose}, ${gapClose}, 600000, datetime('now'))`,
      );
    }
  }

  it("AC-3: finds the gap day, backfills conviction_history, and files a feedback finding", () => {
    const db = getDb();
    seedGapDayFixture(db);

    const gaps = findConvictionHistoryGapDays(db, vnTodayStr());
    expect(gaps).toContain(GAP_DATE);

    const findings = checkConvictionHistoryGap(db);
    expect(findings.length).toBe(1);
    expect(findings[0]!.check).toBe("conviction_history_gap");
    expect(findings[0]!.action).toBe("flagged");
    expect(findings[0]!.rowsAffected).toBe(2); // VCB + FPT

    const rows = db
      .query<{ symbol: string; dominant_signal: string }, [string]>(
        "SELECT symbol, dominant_signal FROM conviction_history WHERE date = ? ORDER BY symbol",
      )
      .all(GAP_DATE);
    expect(rows.length).toBe(2);
    const vcbRow = rows.find((r) => r.symbol === "VCB");
    const fptRow = rows.find((r) => r.symbol === "FPT");
    expect(vcbRow!.dominant_signal).toBe("bullish"); // +10% move
    expect(fptRow!.dominant_signal).toBe("bearish"); // -5% move

    const fb = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM agent_feedback WHERE title LIKE '%conviction_history_gap%'",
      )
      .get();
    expect(fb!.cnt).toBe(1);
  });

  it("AC-3b: idempotent — a second run finds 0 gap days and does not re-file feedback", () => {
    const db = getDb();
    seedGapDayFixture(db);
    checkConvictionHistoryGap(db); // first run backfills

    const secondFindings = checkConvictionHistoryGap(db);
    expect(secondFindings[0]!.action).toBe("none");
    expect(secondFindings[0]!.rowsAffected).toBe(0);

    const fb = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM agent_feedback WHERE title LIKE '%conviction_history_gap%'",
      )
      .get();
    expect(fb!.cnt).toBe(1); // still exactly one — not re-inserted
  });

  it("AC-3c: a confirmed gap day with NO prior-day baseline is reported as action=none (never fabricated, never spammed)", () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB", "banking");
    addWatchlistEntry(db, "FPT", "tech");
    db.exec(
      `INSERT INTO conviction_history (symbol, date, peak_score, dominant_signal, created_at)
       VALUES ('VNM', '2026-04-01', 0.5, 'neutral', '2026-04-01T00:00:00Z')`,
    );
    // Both codes' FIRST-EVER daily_ohlcv row is on this date — confirmed
    // trading day (both codes present) but no prior row exists to compute
    // changePct from, so it can never be honestly backfilled.
    const FIRST_EVER_DATE = "2026-06-20";
    for (const code of ["VCB", "FPT"]) {
      db.exec(
        `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
         VALUES ('${code}', '${FIRST_EVER_DATE}', 80000, 80000, 80000, 80000, 500000, datetime('now'))`,
      );
    }

    const gaps = findConvictionHistoryGapDays(db, vnTodayStr());
    expect(gaps).toContain(FIRST_EVER_DATE);

    const findings = checkConvictionHistoryGap(db);
    expect(findings[0]!.action).toBe("none");
    expect(findings[0]!.rowsAffected).toBe(0);

    const convictionRows = db
      .query<{ cnt: number }, [string]>("SELECT COUNT(*) as cnt FROM conviction_history WHERE date = ?")
      .get(FIRST_EVER_DATE);
    expect(convictionRows!.cnt).toBe(0); // never fabricated

    const fb = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM agent_feedback WHERE title LIKE '%conviction_history_gap%'",
      )
      .get();
    expect(fb!.cnt).toBe(0); // action=none never files feedback — avoids nightly spam for an unfixable date
  });

  it("AC-4: a sparse/partial date (below watchlist-size floor) is never flagged as a gap", () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB", "banking");
    addWatchlistEntry(db, "FPT", "tech");
    addWatchlistEntry(db, "HPG", "steel");
    db.exec(
      `INSERT INTO conviction_history (symbol, date, peak_score, dominant_signal, created_at)
       VALUES ('VNM', '2026-04-01', 0.5, 'neutral', '2026-04-01T00:00:00Z')`,
    );
    // Only 1 of 3 watchlist codes has daily_ohlcv on this date -> below the
    // watchlist-size floor (3) -> must NOT be treated as a confirmed trading day.
    db.exec(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('VCB', '2026-06-10', 80000, 80000, 80000, 80000, 500000, datetime('now'))`,
    );

    const gaps = findConvictionHistoryGapDays(db, vnTodayStr());
    expect(gaps).not.toContain("2026-06-10");
  });

  it("AC-5: today's VN calendar date is never flagged as a gap (partial/in-progress session)", () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB", "banking");
    db.exec(
      `INSERT INTO conviction_history (symbol, date, peak_score, dominant_signal, created_at)
       VALUES ('VNM', '2026-04-01', 0.5, 'neutral', '2026-04-01T00:00:00Z')`,
    );
    const today = vnTodayStr();
    db.exec(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('VCB', '${today}', 80000, 80000, 80000, 80000, 500000, datetime('now'))`,
    );

    const gaps = findConvictionHistoryGapDays(db, today);
    expect(gaps).not.toContain(today);
  });

  it("backfillConvictionForDate() returns 0 for a date with no daily_ohlcv coverage", () => {
    const db = getDb();
    addWatchlistEntry(db, "VCB", "banking");
    const written = backfillConvictionForDate(db, "2099-01-01");
    expect(written).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-CONVICTION-HISTORY-EOD-BACKFILL — dataAuditJob wiring", () => {
  it("AC-6: runDailyChecks composes checkConvictionHistoryGap (D-NEW3)", async () => {
    const db = getDb();
    // Minimal extra tables runDailyAudit's other D-checks touch but this
    // suite does not otherwise seed — created IF NOT EXISTS, safe no-ops.
    db.exec(`
      CREATE TABLE IF NOT EXISTS rag_analyses (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, level TEXT NOT NULL,
        source_url TEXT, source_title TEXT, sentiment TEXT, impact_score REAL,
        impact_direction TEXT, data_env TEXT
      );
      CREATE TABLE IF NOT EXISTS financial_reports (
        id TEXT PRIMARY KEY, code TEXT NOT NULL, created_at TEXT NOT NULL,
        validation_status TEXT DEFAULT 'pending', validation_notes TEXT
      );
      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL,
        details_json TEXT, resolved INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS audit_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), last_daily_audit_at TEXT,
        last_weekly_audit_at TEXT, last_daily_findings TEXT, last_weekly_findings TEXT
      );
    `);

    const { runDailyAudit } = await import("../scheduler/news-analysis/dataAuditJob.js");
    const findings = await runDailyAudit(db, async () => { /* no-op telegram */ });

    const f = findings.find((x) => x.check === "conviction_history_gap");
    expect(f).toBeDefined();
  });
});
