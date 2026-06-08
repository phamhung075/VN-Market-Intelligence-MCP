/**
 * Task 1416c — HPG BCTC disk-scan ticker resolution
 *
 * Root cause: HPG was absent from WATCHLIST_SEED in seedWatchlist.ts.
 * scanDiskForStrandedPdfs() iterates watchlist codes only — a PDF whose
 * ticker does not appear in the watchlist produces ticker=NONE (the
 * codes.find() returns undefined and the file is silently skipped).
 *
 * Fix: add HPG (Hoa Phat Group — VN's largest steel producer) to
 * WATCHLIST_SEED under the "steel" domain.
 *
 * Tests:
 *   1. WATCHLIST_SEED contains HPG
 *   2. scanDiskForStrandedPdfs() finds an HPG PDF when HPG is in watchlist
 *   3. scanDiskForStrandedPdfs() skips an HPG PDF when HPG is absent from watchlist
 *      (regression guard — confirms the silent-skip symptom reported in #2682)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: WATCHLIST_SEED contains HPG
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1416c — WATCHLIST_SEED includes HPG", () => {
  it("WATCHLIST_SEED contains HPG with exchange HOSE and domain steel", async () => {
    const { WATCHLIST_SEED } = await import(
      "../infrastructure/db/seedWatchlist.js"
    );

    const hpg = WATCHLIST_SEED.find((e) => e.code === "HPG");
    expect(hpg).toBeDefined();
    expect(hpg!.exchange).toBe("HOSE");
    expect(hpg!.domain).toBe("steel");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 & 3: scanDiskForStrandedPdfs — HPG filename resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1416c — scanDiskForStrandedPdfs HPG filename resolution", () => {
  let tmpDir: string;
  let pdfDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bctc-1416c-${Date.now()}`);
    pdfDir = join(tmpDir, "data", "pdfs");
    mkdirSync(pdfDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function makeDb(includeHpg: boolean): Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        code TEXT PRIMARY KEY,
        exchange TEXT,
        domain TEXT
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_reports (
        id TEXT PRIMARY KEY,
        action_code TEXT NOT NULL,
        period_year INTEGER NOT NULL,
        period_type TEXT NOT NULL
      )
    `);
    if (includeHpg) {
      db.prepare("INSERT INTO watchlist (code, exchange, domain) VALUES (?, ?, ?)").run(
        "HPG",
        "HOSE",
        "steel",
      );
    }
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    return db;
  }

  it("finds HPG PDF as stranded when HPG is in watchlist and no financial_reports row exists", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb(true);

    // Write a realistic HPG BCTC filename (date-based: 31.12.2025 → Q4 2025)
    const pdfFilename = "BCTC HPG 31.12.2025 - HOP NHAT - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(1);
    expect(stranded[0]!.ticker).toBe("HPG");
    expect(stranded[0]!.filename).toBe(pdfFilename);
  });

  it("returns HPG PDF as stranded when watchlist is empty (task 1915-fix-part1: empty-watchlist fallback)", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb(false); // HPG not in watchlist → watchlist is empty

    const pdfFilename = "BCTC HPG 31.12.2025 - HOP NHAT - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    // Empty watchlist triggers the filename-based fallback (task 1915-fix-part1):
    // HPG is extracted from "BCTC HPG ..." and the file is returned as stranded.
    expect(stranded.length).toBe(1);
    expect(stranded[0]!.ticker).toBe("HPG");
  });

  it("returns HPG PDF via filename fallback when watchlist is populated but does not contain HPG", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    // task 1915-fix-part2: when codes.find() misses (HPG not in watchlist),
    // the fix falls through to tickerFromFilename() — HPG is now picked up regardless.
    // The WATCHLIST_SEED fix (adding HPG) remains the canonical solution for #2682;
    // this test now documents the additional safety-net behavior.
    const db = makeDb(false);
    db.prepare("INSERT INTO watchlist (code, exchange, domain) VALUES (?, ?, ?)").run(
      "VNM", "HOSE", "consumer",
    );

    const pdfFilename = "BCTC HPG 31.12.2025 - HOP NHAT - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    // Watchlist is populated (VNM present) but HPG is absent — filename fallback picks up HPG.
    expect(stranded.length).toBe(1);
    expect(stranded[0]!.ticker).toBe("HPG");
  });

  it("finds HPG PDF with underscore-separated filename (FPT-style pattern)", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb(true);

    // Alternative filename format: HPG_30.09.2025_Q3.pdf
    const pdfFilename = "HPG_30.09.2025_Q3.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(1);
    expect(stranded[0]!.ticker).toBe("HPG");
  });

  it("excludes HPG PDF that already has a matching financial_reports row", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb(true);

    const pdfFilename = "BCTC HPG 31.12.2025 - HOP NHAT - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    // Insert matching row — Q4 2025
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run("hpg-q4-2025", "HPG", 2025, "Q4");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);
    expect(stranded.length).toBe(0);
  });
});
