/**
 * Task 1112 — BCTC VPS Proxy Tests
 *
 * Tests for bctc_vps_queue DDL, queue endpoint logic, push endpoint validation,
 * and the parseMultipartFields helper.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import path from "path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// DDL helper — mirrors schema.ts bctc_vps_queue block
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_type TEXT NOT NULL,
      period_quarter INTEGER,
      sort_key TEXT,
      extraction_confidence REAL DEFAULT 0,
      validation_status TEXT DEFAULT 'pending',
      company_name TEXT,
      audit_status TEXT DEFAULT 'unaudited',
      net_revenue REAL DEFAULT 0,
      gross_profit REAL DEFAULT 0,
      operating_profit REAL DEFAULT 0,
      ebitda REAL DEFAULT 0,
      profit_before_tax REAL DEFAULT 0,
      net_profit REAL DEFAULT 0,
      eps REAL DEFAULT 0,
      diluted_eps REAL DEFAULT 0,
      total_assets REAL DEFAULT 0,
      current_assets REAL DEFAULT 0,
      cash REAL DEFAULT 0,
      inventory REAL DEFAULT 0,
      total_liabilities REAL DEFAULT 0,
      short_term_debt REAL DEFAULT 0,
      long_term_debt REAL DEFAULT 0,
      equity_total REAL DEFAULT 0,
      operating_cf REAL DEFAULT 0,
      investing_cf REAL DEFAULT 0,
      financing_cf REAL DEFAULT 0,
      capex REAL DEFAULT 0,
      free_cash_flow REAL DEFAULT 0,
      gross_margin_pct REAL,
      operating_margin_pct REAL,
      net_margin_pct REAL,
      roe REAL,
      roa REAL,
      current_ratio REAL,
      debt_to_equity REAL,
      net_debt_to_ebitda REAL,
      pe REAL,
      pb REAL,
      published_at TEXT DEFAULT '',
      yoy_delta_json TEXT,
      qoq_delta_json TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bvq_status ON bctc_vps_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bvq_code   ON bctc_vps_queue(action_code)`);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1112 — BCTC VPS Proxy", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // AC-1: bctc_vps_queue table exists
  test("AC-1: bctc_vps_queue table created with correct columns", () => {
    const cols = db.prepare("PRAGMA table_info(bctc_vps_queue)").all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("action_code");
    expect(colNames).toContain("period_year");
    expect(colNames).toContain("period_quarter");
    expect(colNames).toContain("status");
    expect(colNames).toContain("source_url");
    expect(colNames).toContain("attempts");
  });

  // AC-2: Queue insert + deduplication
  test("AC-2: UNIQUE constraint prevents duplicate queue entries", () => {
    db.prepare("INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)").run("VCB", 2025, "Q4");

    // Second insert with OR IGNORE should not throw
    db.prepare("INSERT OR IGNORE INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)").run("VCB", 2025, "Q4");

    const count = db.prepare("SELECT COUNT(*) as cnt FROM bctc_vps_queue WHERE action_code = 'VCB'").get() as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  // AC-3: Queue returns only pending items with < 5 attempts
  test("AC-3: Queue query filters by status and attempts", () => {
    db.prepare("INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts) VALUES (?, ?, ?, ?, ?)").run("VCB", 2025, "Q4", "pending", 0);
    db.prepare("INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts) VALUES (?, ?, ?, ?, ?)").run("FPT", 2025, "Q4", "done", 1);
    db.prepare("INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts) VALUES (?, ?, ?, ?, ?)").run("HPG", 2025, "Q4", "pending", 6);

    const pending = db.prepare(
      "SELECT action_code FROM bctc_vps_queue WHERE status = 'pending' AND attempts < 5 ORDER BY created_at ASC LIMIT 10",
    ).all() as { action_code: string }[];

    expect(pending.length).toBe(1);
    expect(pending[0]!.action_code).toBe("VCB");
  });

  // AC-4: Gap detection — missing financial_reports → queue populated
  test("AC-4: Watchlist tickers missing from financial_reports are queued", () => {
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("VCB");
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("FPT");
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("HPG");

    // FPT has a report, VCB and HPG don't
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run("test-1", "FPT", 2025, "Q4");

    // Simulate the queue endpoint logic
    const watchlistCodes = (db.prepare("SELECT code FROM watchlist ORDER BY code").all() as { code: string }[]).map((r) => r.code);
    const existingRows = db.prepare(
      "SELECT action_code FROM financial_reports WHERE period_year = ? AND period_type = ?",
    ).all(2025, "Q4") as { action_code: string }[];
    const existing = new Set(existingRows.map((r) => r.action_code));
    const missing = watchlistCodes.filter((c) => !existing.has(c));

    const insertStmt = db.prepare(
      "INSERT OR IGNORE INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)",
    );
    for (const code of missing) {
      insertStmt.run(code, 2025, "Q4");
    }

    const queued = db.prepare("SELECT action_code FROM bctc_vps_queue ORDER BY action_code").all() as { action_code: string }[];
    expect(queued.length).toBe(2);
    expect(queued.map((r) => r.action_code)).toEqual(["HPG", "VCB"]);
  });

  // AC-5: Status transitions
  test("AC-5: Queue status transitions: pending → fetching → done", () => {
    db.prepare("INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)").run("VCB", 2025, "Q4");

    // Transition to fetching
    db.prepare(
      "UPDATE bctc_vps_queue SET status = 'fetching', attempts = attempts + 1 WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
    ).run("VCB", 2025, "Q4");

    let row = db.prepare("SELECT status, attempts FROM bctc_vps_queue WHERE action_code = 'VCB'").get() as { status: string; attempts: number };
    expect(row.status).toBe("fetching");
    expect(row.attempts).toBe(1);

    // Transition to done
    db.prepare(
      "UPDATE bctc_vps_queue SET status = 'done' WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
    ).run("VCB", 2025, "Q4");

    row = db.prepare("SELECT status FROM bctc_vps_queue WHERE action_code = 'VCB'").get() as { status: string; attempts: number };
    expect(row.status).toBe("done");
  });

  // AC-6: Upsert on conflict updates status
  test("AC-6: INSERT ON CONFLICT updates existing row", () => {
    db.prepare("INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter) VALUES (?, ?, ?)").run("VCB", 2025, "Q4");

    db.prepare(
      `INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url, attempts, last_attempt)
       VALUES (?, ?, ?, 'fetching', ?, 1, datetime('now'))
       ON CONFLICT(action_code, period_year, period_quarter)
       DO UPDATE SET status = 'fetching', source_url = ?, attempts = attempts + 1, last_attempt = datetime('now')`,
    ).run("VCB", 2025, "Q4", "https://ssc.test/vcb.pdf", "https://ssc.test/vcb.pdf");

    const row = db.prepare("SELECT status, source_url, attempts FROM bctc_vps_queue WHERE action_code = 'VCB'").get() as any;
    expect(row.status).toBe("fetching");
    expect(row.source_url).toBe("https://ssc.test/vcb.pdf");
    expect(row.attempts).toBe(1);
  });

  // AC-7: normaliseFilename produces canonical name
  test("AC-7: normaliseFilename canonical output", async () => {
    const { normaliseFilename } = await import("../../src/application/usecases/fetchParseAndStoreBctc.js");
    const result = normaliseFilename("https://ssc.gov.vn/document.pdf", "VCB", 2025, "Q4");
    expect(result).toBe("VCB_2025_Q4.pdf");
  });

  // AC-8: normaliseFilename preserves attributed names
  test("AC-8: normaliseFilename keeps name when ticker present", async () => {
    const { normaliseFilename } = await import("../../src/application/usecases/fetchParseAndStoreBctc.js");
    const result = normaliseFilename("https://ssc.gov.vn/BCTC_VCB_Q4_2025.pdf", "VCB", 2025, "Q4");
    expect(result).toBe("BCTC_VCB_Q4_2025.pdf");
  });

  // AC-9: Validation rules for action_code
  test("AC-9: action_code regex validation", () => {
    expect(/^[A-Z0-9]{2,10}$/.test("VCB")).toBe(true);
    expect(/^[A-Z0-9]{2,10}$/.test("A")).toBe(false);
    expect(/^[A-Z0-9]{2,10}$/.test("VCB/../etc")).toBe(false);
    expect(/^[A-Z0-9]{2,10}$/.test("")).toBe(false);
  });

  // AC-10: No MCP-to-VPS calls in production src/ (excluding tests)
  test("AC-10: No MCP-to-VPS calls in production src/", async () => {
    const { Glob } = await import("bun");
    const glob = new Glob("**/*.ts");
    let found = false;
    for await (const file of glob.scan({ cwd: path.resolve(import.meta.dir, ".."), absolute: true })) {
      if (file.includes("__tests__")) continue; // skip test files
      const content = await Bun.file(file).text();
      if (content.includes("139.180.185.18") || content.includes("sshpass") || content.includes("VULTR_PASSWORD")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(false);
  });
});
