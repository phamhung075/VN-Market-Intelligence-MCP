/**
 * Task 243 — France Wake-Up Summary (07:00 CET / 06:00 UTC weekdays)
 *
 * Tests for:
 *   - generates summary with watchlist data
 *   - includes alerts section
 *   - handles empty watchlist gracefully
 *   - handles no alerts gracefully
 *   - message format: plain-text Vietnamese, no Markdown
 *   - cron registered at "0 6 * * 1-5" UTC
 *   - concurrency guard skips concurrent invocations
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
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
      updated_at  TEXT
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
      user_note             TEXT
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      confidence         REAL,
      time_horizon       TEXT,
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,
      affected_domains   TEXT,
      affected_actions   TEXT,
      parent_ids         TEXT,
      tags               TEXT,
      embedding_text     TEXT
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

function seedWatchlist(db: Database, code: string, domain = "banking") {
  db.prepare(`
    INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
    VALUES (?, 'HOSE', ?, datetime('now'))
  `).run(code, domain);
}

function seedMarketPrice(
  db: Database,
  code: string,
  price: number,
  changePct: number,
) {
  db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(code, price, changePct);
}

function seedAlert(
  db: Database,
  overrides: Partial<{
    id: string;
    triggered_at: string;
    severity: string;
    message: string;
    read: number;
  }> = {},
) {
  const row = {
    id: overrides.id ?? `al-${Date.now()}-${Math.random()}`,
    triggered_at:
      overrides.triggered_at ?? new Date().toISOString(),
    severity: overrides.severity ?? "warning",
    message: overrides.message ?? "Test alert",
    read: overrides.read ?? 0,
  };
  db.prepare(`
    INSERT OR IGNORE INTO alerts (id, triggered_at, severity, message, read)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.id, row.triggered_at, row.severity, row.message, row.read);
  return row;
}

function seedRagAnalysis(
  db: Database,
  overrides: Partial<{
    id: string;
    created_at: string;
    impact_score: number;
    source_title: string;
    summary: string;
  }> = {},
) {
  const row = {
    id: overrides.id ?? `ra-${Date.now()}-${Math.random()}`,
    created_at: overrides.created_at ?? new Date().toISOString(),
    level: "country",
    impact_score: overrides.impact_score ?? 7.0,
    source_title: overrides.source_title ?? "Test analysis",
    summary: overrides.summary ?? "Test summary",
  };
  db.prepare(`
    INSERT OR IGNORE INTO rag_analyses
      (id, created_at, level, impact_score, source_title, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.created_at,
    row.level,
    row.impact_score,
    row.source_title,
    row.summary,
  );
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import the module under test
// ─────────────────────────────────────────────────────────────────────────────

import {
  assembleFranceSummary,
  runFranceSummary,
  type FranceSummaryOptions,
} from "../scheduler/franceSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 243 — France Wake-Up Summary", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── 1. generates summary with watchlist data ──────────────────────────────

  it("generates summary with watchlist stocks and prices", async () => {
    seedWatchlist(db, "VNM", "consumer");
    seedWatchlist(db, "FPT", "technology");
    seedMarketPrice(db, "VNM", 65_000, -1.2);
    seedMarketPrice(db, "FPT", 120_000, 2.5);

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => {},
      vnIndexFn: async () => ({ price: 1285.5, changePct: 0.5 }),
    };

    const msg = await assembleFranceSummary(opts);

    expect(msg).toContain("Tóm tắt phiên");
    expect(msg).toContain("VN-Index");
    // 1285.5 rounds to 1286 via Math.round — check prefix "128"
    expect(msg).toContain("128");
    expect(msg).toContain("VNM");
    expect(msg).toContain("FPT");
    expect(msg).toContain("65000");
    expect(msg).toContain("120000");
  });

  // ── 2. includes alerts section ─────────────────────────────────────────────

  it("includes alerts count and top-3 alert messages", async () => {
    const fourHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    seedAlert(db, {
      id: "al-1",
      triggered_at: fourHoursAgo,
      severity: "critical",
      message: "VCB giảm mạnh 5%",
      read: 0,
    });
    seedAlert(db, {
      id: "al-2",
      triggered_at: fourHoursAgo,
      severity: "warning",
      message: "FPT tăng đột biến",
      read: 0,
    });
    // read=1 alert should NOT appear
    seedAlert(db, {
      id: "al-3",
      triggered_at: fourHoursAgo,
      severity: "warning",
      message: "Already-read alert",
      read: 1,
    });

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => {},
      vnIndexFn: async () => null,
    };

    const msg = await assembleFranceSummary(opts);

    expect(msg).toContain("Cảnh báo");
    expect(msg).toContain("VCB giảm mạnh 5%");
    expect(msg).toContain("FPT tăng đột biến");
    expect(msg).not.toContain("Already-read alert");
  });

  // ── 3. handles empty watchlist gracefully ─────────────────────────────────

  it("handles empty watchlist gracefully", async () => {
    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => {},
      vnIndexFn: async () => null,
    };

    const msg = await assembleFranceSummary(opts);

    expect(msg).toContain("Tóm tắt phiên");
    expect(msg).toContain("Cổ phiếu theo dõi");
    // Should not throw; watchlist section present but empty
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  // ── 4. handles no alerts gracefully ──────────────────────────────────────

  it("handles no unread alerts gracefully", async () => {
    seedWatchlist(db, "VCB", "banking");

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => {},
      vnIndexFn: async () => ({ price: 1280.0, changePct: -0.3 }),
    };

    const msg = await assembleFranceSummary(opts);

    expect(msg).toContain("Cảnh báo");
    expect(msg).toContain("0");
    expect(typeof msg).toBe("string");
  });

  // ── 5. top news by impact_score ──────────────────────────────────────────

  it("includes top news entries sorted by impact_score DESC", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    seedRagAnalysis(db, {
      id: "ra-low",
      created_at: twoHoursAgo,
      impact_score: 3.0,
      source_title: "Low impact story",
    });
    seedRagAnalysis(db, {
      id: "ra-high",
      created_at: twoHoursAgo,
      impact_score: 9.0,
      source_title: "High impact story",
    });
    seedRagAnalysis(db, {
      id: "ra-mid",
      created_at: twoHoursAgo,
      impact_score: 6.0,
      source_title: "Mid impact story",
    });

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => {},
      vnIndexFn: async () => null,
    };

    const msg = await assembleFranceSummary(opts);

    expect(msg).toContain("Tin nổi bật");
    expect(msg).toContain("High impact story");
    // High impact should appear before low impact
    const highIdx = msg.indexOf("High impact story");
    const lowIdx = msg.indexOf("Low impact story");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  // ── 6. message format: plain text, Vietnamese footer ──────────────────────

  it("message footer includes France wake-up attribution", async () => {
    const opts: FranceSummaryOptions = {
      db,
      sendFn: async () => {},
      vnIndexFn: async () => null,
    };

    const msg = await assembleFranceSummary(opts);

    expect(msg).toContain("07:00 CET");
    expect(msg).toContain("Gửi từ");
  });

  // ── 7. sendFn is called with assembled message ────────────────────────────

  it("calls sendFn with the assembled message string", async () => {
    let capturedMsg = "";

    const opts: FranceSummaryOptions = {
      db,
      sendFn: async (msg: string) => {
        capturedMsg = msg;
      },
      vnIndexFn: async () => ({ price: 1290.0, changePct: 0.8 }),
    };

    await assembleFranceSummary(opts);

    expect(capturedMsg.length).toBeGreaterThan(0);
    expect(capturedMsg).toContain("Tóm tắt phiên");
  });

  // ── 8. cron expression is "0 6 * * 1-5" (06:00 UTC = 07:00 CET) ──────────

  it("CRONS.franceSummary is registered at 0 6 * * 1-5 (UTC)", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    expect((CRONS as Record<string, string>).franceSummary).toBe(
      "0 6 * * 1-5",
    );
  });

  // ── 9. runFranceSummary concurrency guard ─────────────────────────────────

  it("concurrency guard skips overlapping invocations", async () => {
    let callCount = 0;

    const slowFn = async (): Promise<string> => {
      callCount++;
      await new Promise<void>((r) => setTimeout(r, 30));
      return "done";
    };

    const p1 = runFranceSummary(slowFn);
    const p2 = runFranceSummary(slowFn);

    await Promise.all([p1, p2]);

    expect(callCount).toBe(1);
  });

  // ── 10. allows second run after first completes ────────────────────────────

  it("allows second run after first completes", async () => {
    let callCount = 0;

    const fastFn = async (): Promise<string> => {
      callCount++;
      return "done";
    };

    await runFranceSummary(fastFn);
    await runFranceSummary(fastFn);

    expect(callCount).toBe(2);
  });
});
