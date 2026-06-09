/**
 * FIX-PDF-VOLUME-SBV-TABLE.test.ts
 *
 * Regression tests for two post-restart bugs:
 *
 *   Bug 1: data/pdfs/ directory not created on startup — causes the background
 *          OCR scan in index.ts to throw ENOENT before any PDF arrives.
 *          Fix: mkdirSync(pdfDir, { recursive: true }) in index.ts startup path.
 *
 *   Bug 2: freshnessSlaMonitorJob.querySignalAges references two non-existent
 *          tables:
 *            - macro_sbv_rates  → correct: sbv_rates (column: fetched_at)
 *            - foreign_flow     → correct: daily_ohlcv WHERE foreign_buy_vol IS NOT NULL (column: updated_at)
 *          Fix: update the SQL in querySignalAges to use the correct table names.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "../infrastructure/db/schema.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

// ─── suite: Bug 1 — data/pdfs dir creation ───────────────────────────────────

describe("Bug 1 — data/pdfs/ directory is created on startup", () => {
  it("index.ts startup path mkdirSync covers pdfDir", async () => {
    // Fix was implemented in composition-root.ts (L110), not index.ts.
    // Read composition-root.ts where bootstrapMcpServer creates the pdf dir.
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("../composition-root.ts", import.meta.url).pathname,
      "utf8",
    );

    // The OCR background task must create the pdf dir before reading it.
    // mkdirSync must appear BEFORE readdirSync in the pdfDir block.
    const mkdirIdx = src.indexOf("mkdirSync(pdfDir");
    const readdirIdx = src.indexOf("readdirSync(pdfDir");

    expect(mkdirIdx).toBeGreaterThan(-1);
    expect(readdirIdx).toBeGreaterThan(-1);
    expect(mkdirIdx).toBeLessThan(readdirIdx);
  });

  it("index.ts uses mkdirSync with { recursive: true } for pdfDir", async () => {
    const fs = await import("fs");
    // Fix is in composition-root.ts (bootstrapMcpServer), not index.ts.
    const src = fs.readFileSync(
      new URL("../composition-root.ts", import.meta.url).pathname,
      "utf8",
    );

    // Must use recursive so it does not throw when the dir already exists.
    expect(src).toContain("mkdirSync(pdfDir, { recursive: true })");
  });
});

// ─── suite: Bug 2 — freshnessSlaMonitorJob table names ───────────────────────

describe("Bug 2 — freshnessSlaMonitorJob uses correct table names", () => {
  it("freshnessSlaMonitorJob does NOT reference macro_sbv_rates", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL(
        "../scheduler/system/freshnessSlaMonitorJob.ts",
        import.meta.url,
      ).pathname,
      "utf8",
    );

    expect(src).not.toContain("macro_sbv_rates");
  });

  it("freshnessSlaMonitorJob references sbv_rates for sbv_fx signal", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL(
        "../scheduler/system/freshnessSlaMonitorJob.ts",
        import.meta.url,
      ).pathname,
      "utf8",
    );

    expect(src).toContain("sbv_rates");
  });

  it("freshnessSlaMonitorJob does NOT reference non-existent foreign_flow table", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL(
        "../scheduler/system/freshnessSlaMonitorJob.ts",
        import.meta.url,
      ).pathname,
      "utf8",
    );

    // "FROM foreign_flow" would target a non-existent table.
    // The correct source is daily_ohlcv WHERE foreign_buy_vol IS NOT NULL.
    expect(src).not.toContain("FROM foreign_flow");
  });

  it("freshnessSlaMonitorJob references daily_ohlcv for foreign_flow signal", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL(
        "../scheduler/system/freshnessSlaMonitorJob.ts",
        import.meta.url,
      ).pathname,
      "utf8",
    );

    expect(src).toContain("daily_ohlcv");
  });

  it("sbv_fx SQL fragment executes without error against in-memory DB with sbv_rates", async () => {
    // Test only the fixed SQL fragments (sbv_rates + daily_ohlcv) in isolation.
    // querySignalAges unions 5 tables including 'news' which is not in the in-memory
    // schema — we test the two corrected sub-queries directly instead.
    const db = new Database(":memory:");
    await initDatabase(db);

    // sbv_rates.fetched_at stores Unix epoch strings (not ISO)
    const epochStr = String(Math.floor(Date.now() / 1000) - 20 * 60);
    db.prepare(
      `INSERT INTO sbv_rates (source, fetched_at) VALUES (?, ?)`,
    ).run("sbv", epochStr);

    const now = Math.floor(Date.now() / 1000);
    let threw = false;
    let rows: Array<{ signal_type: string; age_minutes: number }> = [];
    try {
      rows = db.query<{ signal_type: string; age_minutes: number }, [number]>(
        `SELECT 'sbv_fx' as signal_type,
           CAST((? - CAST((SELECT MAX(fetched_at) FROM sbv_rates) as INTEGER)) / 60 AS INTEGER) as age_minutes`,
      ).all(now);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(rows[0]!.signal_type).toBe("sbv_fx");
    // 20-min-old row → age should be ~20 min (±3 tolerance)
    expect(rows[0]!.age_minutes).toBeGreaterThanOrEqual(17);
    expect(rows[0]!.age_minutes).toBeLessThanOrEqual(23);
  });

  it("foreign_flow SQL fragment executes without error against in-memory DB with daily_ohlcv", async () => {
    const db = new Database(":memory:");
    await initDatabase(db);

    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("VNM", "2026-04-27", 80000, minutesAgoIso(5), 500_000);

    const now = Math.floor(Date.now() / 1000);
    let threw = false;
    let rows: Array<{ signal_type: string; age_minutes: number | null }> = [];
    try {
      rows = db.query<{ signal_type: string; age_minutes: number | null }, [number]>(
        `SELECT 'foreign_flow' as signal_type,
           CAST((? - CAST((SELECT MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL) as INTEGER)) / 60 AS INTEGER) as age_minutes`,
      ).all(now);
    } catch {
      threw = true;
    }

    // Key assertion: the query targets daily_ohlcv (not foreign_flow table) so it does not throw.
    expect(threw).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.signal_type).toBe("foreign_flow");
  });

  it("both corrected SQL fragments run cleanly on empty tables (no-throw)", async () => {
    const db = new Database(":memory:");
    await initDatabase(db);

    const now = Math.floor(Date.now() / 1000);

    let threw = false;
    try {
      // sbv_rates empty → MAX(fetched_at) = NULL → CAST returns NULL (no throw)
      db.query<{ age_minutes: number | null }, [number]>(
        `SELECT CAST((? - CAST((SELECT MAX(fetched_at) FROM sbv_rates) as INTEGER)) / 60 AS INTEGER) as age_minutes`,
      ).all(now);
      // daily_ohlcv empty → MAX(updated_at) = NULL → same (no throw)
      db.query<{ age_minutes: number | null }, [number]>(
        `SELECT CAST((? - CAST((SELECT MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL) as INTEGER)) / 60 AS INTEGER) as age_minutes`,
      ).all(now);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});
