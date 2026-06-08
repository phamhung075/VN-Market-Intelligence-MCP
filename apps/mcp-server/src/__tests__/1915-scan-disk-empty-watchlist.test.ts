/**
 * Task 1915-fix-part1 — scanDiskForStrandedPdfs processes 0 PDFs when watchlist table is empty
 *
 * Root cause: scanDiskForStrandedPdfs() queries SELECT code FROM watchlist then matches
 * each PDF filename against the returned codes. When codes = [], the find() always returns
 * undefined, so every PDF is silently skipped.
 *
 * Fix: when watchlist is empty, fall back to extracting the ticker directly from the
 * filename (tickerFromFilename helper), bypassing the watchlist match requirement.
 *
 * Also covers the startScheduler.ts code smell: startup catch-up at L238 calls
 * runBctcReparseJob() directly (no db injection) instead of runBctcReparseWithDb(db).
 *
 * Tests:
 *   DSE-01: empty watchlist + VEA PDF on disk → scanDiskForStrandedPdfs returns VEA
 *   DSE-02: empty watchlist + VNM PDF on disk → scanDiskForStrandedPdfs returns VNM
 *   DSE-03: empty watchlist + both VEA+VNM PDFs → returns both (examined=2)
 *   DSE-04: empty watchlist + PDF whose ticker cannot be extracted → skipped gracefully
 *   DSE-05: empty watchlist + PDF that already has a financial_reports row → skipped
 *   DSE-06: populated watchlist (VNM only) + VNM+VEA PDFs → only VNM returned (no regression)
 *   DSE-07: populated watchlist (VNM) + PDF already extracted → 0 returned (no regression)
 *   DSE-08: startScheduler.ts startup catch-up does NOT call runBctcReparseJob() directly
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(codes: string[] = []): Database {
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
  for (const code of codes) {
    db.prepare("INSERT OR IGNORE INTO watchlist (code, exchange, domain) VALUES (?, ?, ?)").run(
      code,
      "HOSE",
      "test",
    );
  }
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// DSE-01 — DSE-05: empty watchlist fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("1915 — scanDiskForStrandedPdfs: empty watchlist fallback", () => {
  let tmpDir: string;
  let pdfDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bctc-1915-${Date.now()}`);
    pdfDir = join(tmpDir, "pdfs");
    mkdirSync(pdfDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("DSE-01: returns VEA PDF as stranded when watchlist is empty", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb([]); // empty watchlist
    const pdfFilename = "BCTC VEA 31.12.2025 - RIENG - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(1);
    expect(stranded[0]!.ticker).toBe("VEA");
    expect(stranded[0]!.filename).toBe(pdfFilename);
  });

  it("DSE-02: returns VNM PDF as stranded when watchlist is empty", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb([]); // empty watchlist
    const pdfFilename = "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(1);
    expect(stranded[0]!.ticker).toBe("VNM");
    expect(stranded[0]!.filename).toBe(pdfFilename);
  });

  it("DSE-03: returns both VEA and VNM PDFs when watchlist is empty", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb([]); // empty watchlist
    writeFileSync(join(pdfDir, "BCTC VEA 31.12.2025 - RIENG - VN.pdf"), "fake");
    writeFileSync(join(pdfDir, "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf"), "fake");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(2);
    const tickers = stranded.map((s) => s.ticker).sort();
    expect(tickers).toEqual(["VEA", "VNM"]);
  });

  it("DSE-04: skips PDF when ticker cannot be extracted from filename", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb([]); // empty watchlist
    // Filename with no parseable ticker and no parseable date
    writeFileSync(join(pdfDir, "unknown-document-no-ticker.pdf"), "fake");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(0);
  });

  it("DSE-05: skips VNM PDF when financial_reports row already exists (empty watchlist)", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb([]); // empty watchlist
    const pdfFilename = "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    // Insert matching financial_reports row (Q4 2025)
    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run("vnm-q4-2025", "VNM", 2025, "Q4");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DSE-06 — DSE-07: populated watchlist — regression guard
// ─────────────────────────────────────────────────────────────────────────────

describe("1915 — scanDiskForStrandedPdfs: populated watchlist unchanged (regression)", () => {
  let tmpDir: string;
  let pdfDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bctc-1915-reg-${Date.now()}`);
    pdfDir = join(tmpDir, "pdfs");
    mkdirSync(pdfDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("DSE-06: populated watchlist with VNM only — returns both VNM (watchlist match) and VEA (filename fallback)", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    // task 1915-fix-part2: VEA is not in watchlist but has a PDF on disk.
    // The fix falls through to tickerFromFilename() for the miss — VEA is now returned.
    const db = makeDb(["VNM"]); // only VNM in watchlist
    writeFileSync(join(pdfDir, "BCTC VEA 31.12.2025 - RIENG - VN.pdf"), "fake");
    writeFileSync(join(pdfDir, "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf"), "fake");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(2);
    const tickers = stranded.map((s) => s.ticker).sort();
    expect(tickers).toEqual(["VEA", "VNM"]);
  });

  it("DSE-07: populated watchlist with VNM + matching financial_reports row → 0 returned", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = makeDb(["VNM"]);
    const pdfFilename = "BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake");

    db.prepare(
      "INSERT INTO financial_reports (id, action_code, period_year, period_type) VALUES (?, ?, ?, ?)",
    ).run("vnm-q4-2025", "VNM", 2025, "Q4");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    expect(stranded.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DSE-09: populated watchlist — ticker NOT in watchlist falls back to filename
// (task 1915-fix-part2)
// ─────────────────────────────────────────────────────────────────────────────

describe("1915 — scanDiskForStrandedPdfs: populated watchlist filename fallback (part2)", () => {
  let tmpDir: string;
  let pdfDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bctc-1915-p2-${Date.now()}`);
    pdfDir = join(tmpDir, "pdfs");
    mkdirSync(pdfDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("DSE-09: populated watchlist [HPG,VCB] + VNM_Q4_2025.pdf → VNM picked up via filename fallback", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    // Watchlist has HPG and VCB — VNM is NOT in the watchlist
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
    db.prepare("INSERT INTO watchlist (code, exchange, domain) VALUES (?, ?, ?)").run("HPG", "HOSE", "steel");
    db.prepare("INSERT INTO watchlist (code, exchange, domain) VALUES (?, ?, ?)").run("VCB", "HOSE", "banking");

    // VNM Q4 2025 PDF on disk — not in watchlist
    const pdfFilename = "VNM_Q4_2025.pdf";
    writeFileSync(join(pdfDir, pdfFilename), "fake pdf content");

    const stranded = await scanDiskForStrandedPdfs(db, pdfDir);

    // With the fix: codes.find() misses VNM → tickerFromFilename fallback → VNM returned
    expect(stranded.length).toBe(1);
    expect(stranded[0]!.ticker).toBe("VNM");
    expect(stranded[0]!.filename).toBe(pdfFilename);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DSE-08: startScheduler.ts startup catch-up code smell fix
// ─────────────────────────────────────────────────────────────────────────────

describe("1915 — startScheduler.ts: startup catch-up uses runBctcReparseWithDb (no direct call)", () => {
  it("DSE-08: setTimeout block calls runBctcReparseWithDb(db) not runBctcReparseJob()", () => {
    // Static code check: the startup catch-up setTimeout in startScheduler.ts must NOT
    // call runBctcReparseJob() directly (which bypasses db injection and produces a
    // fire-and-forget recordJobRun no-op).
    const startSchedulerPath = join(
      import.meta.dir,
      "..",
      "scheduler",
      "startScheduler.ts",
    );
    const src = readFileSync(startSchedulerPath, "utf8");

    // The catch-up setTimeout must call runBctcReparseWithDb
    expect(src).toContain("runBctcReparseWithDb(db)");

    // The startup catch-up setTimeout must NOT call runBctcReparseJob() directly
    // (a direct call without db injection is the code smell identified in SPIKE 1915)
    // We search only inside the setTimeout block (line containing runBctcReparseJob is
    // not inside a cron.schedule call).
    // The scheduled cron at L229-231 may still call runBctcReparseWithDb — that's correct.
    // The setTimeout must also call runBctcReparseWithDb, not runBctcReparseJob().

    // Detect direct bare call: "await runBctcReparseJob()" NOT inside a cron.schedule wrapper
    // Approach: the setTimeout callback must not contain "await runBctcReparseJob()"
    const setTimeoutMatch = src.match(/setTimeout\(async[^)]*\)[\s\S]*?\},\s*30_000\)/);
    if (setTimeoutMatch) {
      const block = setTimeoutMatch[0];
      expect(block).not.toContain("await runBctcReparseJob()");
      expect(block).toContain("runBctcReparseWithDb");
    } else {
      // If regex didn't capture the block, ensure the raw source contains the fix
      expect(src).toContain("runBctcReparseWithDb(db)");
    }
  });
});
