/**
 * Task 1922d — reputationComputeJob daily writer
 *
 * Tests for the reputation score compute job that iterates the watchlist,
 * aggregates 7-day mention_velocity + agent_signals data, and persists
 * reputation_scores via saveReputation().
 *
 * AC-1: computeReputationForTicker returns score=50 (base) for ticker with
 *       zero mentions and zero signal hits
 * AC-2: negative mentions reduce score (negative_mention_ratio × 30)
 * AC-3: signal hits increase score (capped at +20)
 * AC-4: risk_level maps correctly: <30 → "danger", 30-60 → "warning"/"watch",
 *       >60 → "safe"
 * AC-5: trend is "improving" when prior week score is lower,
 *       "deteriorating" when prior is higher, "stable" when equal ±1
 * AC-6: runReputationComputeJob() writes rows to reputation_scores for each
 *       watchlist ticker (end-to-end with in-memory DB)
 * AC-7: individual ticker failures do not abort the full job (non-fatal isolation)
 * AC-8: job returns correct tickersProcessed + tickersFailed counts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  computeReputationForTicker,
  runReputationComputeJob,
  type ReputationComputeOptions,
} from "../scheduler/news/reputationComputeJob.js";
import { getReputation } from "../infrastructure/db/reputationStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── DDL helper ────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'banking',
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3,
      alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS mention_velocity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      hour TEXT NOT NULL,
      mention_count INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      source_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(code, hour)
    );

    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL DEFAULT '',
      to_agent TEXT NOT NULL DEFAULT '',
      signal_type TEXT NOT NULL DEFAULT 'urgent_news',
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      outcome TEXT,
      causal_ref INTEGER,
      cycle_id TEXT
    );

    CREATE TABLE IF NOT EXISTS reputation_scores (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      score REAL NOT NULL,
      trend TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/** Insert watchlist tickers */
function seedWatchlist(db: Database, codes: string[]): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
     VALUES (?, 'HOSE', 'banking', datetime('now'))`
  );
  for (const code of codes) {
    stmt.run(code);
  }
}

/** Insert mention_velocity rows for last 7 days */
function seedMentions(
  db: Database,
  code: string,
  mentionCount: number,
  negativeCount: number,
): void {
  // Use a recent hour within the 7-day window
  const hour = new Date().toISOString().slice(0, 13) + ":00:00.000Z";
  db.prepare(
    `INSERT INTO mention_velocity (code, hour, mention_count, negative_count, source_count)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(code, hour) DO UPDATE SET
       mention_count = mention_count + excluded.mention_count,
       negative_count = negative_count + excluded.negative_count`
  ).run(code, hour, mentionCount, negativeCount);
}

/** Insert agent_signals rows with ticker in payload */
function seedSignals(db: Database, code: string, count: number): void {
  const stmt = db.prepare(
    `INSERT INTO agent_signals (from_agent, to_agent, signal_type, payload, created_at)
     VALUES ('news-scout', 'alert-commander', 'urgent_news', ?, datetime('now'))`
  );
  for (let i = 0; i < count; i++) {
    stmt.run(JSON.stringify({ title: `Signal for ${code}`, code }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: base score = 50 when no data
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — computeReputationForTicker: base score", () => {
  it("AC-1: returns score=50 when no mentions and no signals", () => {
    const db = buildDb();
    const result = computeReputationForTicker(db, "VCB");
    expect(result.score).toBe(50);
    db.close();
  });

  it("AC-1: risk_level is 'watch' for base score=50", () => {
    const db = buildDb();
    const result = computeReputationForTicker(db, "VCB");
    // 50 is in 30-60 watch range
    expect(result.riskLevel).toBe("watch");
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: negative mentions reduce score
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — computeReputationForTicker: negative mention penalty", () => {
  it("AC-2: 50% negative ratio → score = 50 - 0.5 * 30 = 35", () => {
    const db = buildDb();
    seedMentions(db, "HPG", 4, 2); // 2 negative out of 4 total = 50% ratio
    const result = computeReputationForTicker(db, "HPG");
    // score = 50 - (2/4)*30 = 50 - 15 = 35
    expect(result.score).toBeCloseTo(35, 1);
    db.close();
  });

  it("AC-2: 100% negative ratio → score = 50 - 30 = 20, risk_level='danger'", () => {
    const db = buildDb();
    seedMentions(db, "VNM", 5, 5); // all negative
    const result = computeReputationForTicker(db, "VNM");
    // score = 50 - (5/5)*30 = 50 - 30 = 20
    expect(result.score).toBeCloseTo(20, 1);
    expect(result.riskLevel).toBe("danger");
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: signal hits boost score (capped at +20)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — computeReputationForTicker: signal hits boost", () => {
  it("AC-3: 5 signal hits → score = 50 + 5*2 = 60", () => {
    const db = buildDb();
    seedSignals(db, "FPT", 5);
    const result = computeReputationForTicker(db, "FPT");
    expect(result.score).toBeCloseTo(60, 1);
    db.close();
  });

  it("AC-3: 15 signal hits → capped at +20, score = 50 + 20 = 70", () => {
    const db = buildDb();
    seedSignals(db, "TCB", 15);
    const result = computeReputationForTicker(db, "TCB");
    // 15*2=30, capped at 20 → score = 70
    expect(result.score).toBe(70);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: risk_level classification
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — computeReputationForTicker: risk_level mapping", () => {
  it("AC-4: score > 60 → riskLevel='safe'", () => {
    const db = buildDb();
    // 10 signals → score = 50 + 20 (cap) = 70
    seedSignals(db, "VCB", 10);
    const result = computeReputationForTicker(db, "VCB");
    expect(result.riskLevel).toBe("safe");
    db.close();
  });

  it("AC-4: score < 30 → riskLevel='danger'", () => {
    const db = buildDb();
    // 100% negative mentions → score = 20
    seedMentions(db, "GAS", 10, 10);
    const result = computeReputationForTicker(db, "GAS");
    expect(result.riskLevel).toBe("danger");
    db.close();
  });

  it("AC-4: score 30-60 → riskLevel='warning' or 'watch'", () => {
    const db = buildDb();
    // 50% negative → score = 35
    seedMentions(db, "MWG", 2, 1);
    const result = computeReputationForTicker(db, "MWG");
    expect(["warning", "watch"]).toContain(result.riskLevel);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: trend detection
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — computeReputationForTicker: trend detection", () => {
  it("AC-5: improving when current > prior + 1", () => {
    const db = buildDb();
    // No mentions → score=50; prior=40 → delta=10 → improving
    const result = computeReputationForTicker(db, "BID", 40);
    expect(result.trend).toBe("improving");
    db.close();
  });

  it("AC-5: deteriorating when current < prior - 1", () => {
    const db = buildDb();
    // 100% negative → score=20; prior=50 → delta=-30 → deteriorating
    seedMentions(db, "BID", 3, 3);
    const result = computeReputationForTicker(db, "BID", 50);
    expect(result.trend).toBe("deteriorating");
    db.close();
  });

  it("AC-5: stable when no prior score available", () => {
    const db = buildDb();
    const result = computeReputationForTicker(db, "ACB");
    expect(result.trend).toBe("stable");
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: end-to-end DB write via runReputationComputeJob
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — runReputationComputeJob: writes to reputation_scores", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
  });

  it("AC-6: writes a reputation_scores row for each watchlist ticker", async () => {
    seedWatchlist(db, ["VCB", "HPG", "FPT"]);

    const opts: ReputationComputeOptions = {
      _db: db,
      _sendWorkFn: async () => undefined,
    };
    const result = await runReputationComputeJob(opts);

    expect(result.tickersProcessed).toBe(3);
    expect(result.tickersFailed).toBe(0);

    const today = new Date().toISOString().slice(0, 10);
    const vcb = getReputation(db, "VCB", today);
    const hpg = getReputation(db, "HPG", today);
    const fpt = getReputation(db, "FPT", today);

    expect(vcb).not.toBeNull();
    expect(hpg).not.toBeNull();
    expect(fpt).not.toBeNull();
  });

  it("AC-6: empty watchlist → 0 rows written, no error", async () => {
    const opts: ReputationComputeOptions = {
      _db: db,
      _sendWorkFn: async () => undefined,
    };
    const result = await runReputationComputeJob(opts);
    expect(result.tickersProcessed).toBe(0);
    expect(result.tickersFailed).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: per-ticker failure isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — runReputationComputeJob: fault isolation", () => {
  it("AC-7: one ticker throwing does not abort other tickers", async () => {
    const db = buildDb();
    seedWatchlist(db, ["VCB", "HPG"]);

    let callCount = 0;
    const opts: ReputationComputeOptions = {
      _db: db,
      _sendWorkFn: async () => undefined,
      _computeFn: (innerDb, code) => {
        callCount++;
        if (code === "VCB") throw new Error("forced failure");
        return computeReputationForTicker(innerDb, code);
      },
    };

    const result = await runReputationComputeJob(opts);

    // Both tickers attempted; VCB failed, HPG succeeded
    expect(callCount).toBe(2);
    expect(result.tickersFailed).toBe(1);
    expect(result.tickersProcessed).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const hpg = getReputation(db, "HPG", today);
    expect(hpg).not.toBeNull();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: result shape
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1922d — runReputationComputeJob: result shape", () => {
  it("AC-8: returns tickersProcessed and tickersFailed counts", async () => {
    const db = buildDb();
    seedWatchlist(db, ["GAS", "VHM", "VIC"]);
    seedMentions(db, "GAS", 4, 2); // some data

    const opts: ReputationComputeOptions = {
      _db: db,
      _sendWorkFn: async () => undefined,
    };

    const result = await runReputationComputeJob(opts);

    expect(typeof result.tickersProcessed).toBe("number");
    expect(typeof result.tickersFailed).toBe("number");
    expect(result.tickersProcessed + result.tickersFailed).toBe(3);

    db.close();
  });
});
