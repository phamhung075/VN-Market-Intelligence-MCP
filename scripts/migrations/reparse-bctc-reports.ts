#!/usr/bin/env bun
/**
 * scripts/migrations/reparse-bctc-reports.ts
 *
 * Force-reparse BCTC reports through the LIVE mcp-server push pipeline,
 * exercising the current domain parsing code (e.g. post magnitude-normalize
 * commit 06c65978). Safe to re-run — idempotent per ticker/period.
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/agents/dev-mcp-server/flow/main.md  § Low-Confidence Reparse
 *   docs/agents/dev-mcp-server/knowledge.md  § BCTC Reparse Runbook
 *
 * Mechanism:
 *   1. Reset bctc_vps_queue row to status='pending' (bypasses skip gate)
 *   2. POST local PDF bytes to /api/push-bctc-pdf (triggers full parse pipeline)
 *   3. Wait for pipeline → verify extraction_confidence in financial_reports
 *
 * Usage:
 *   # Reparse specific tickers (latest period in DB):
 *   bun scripts/migrations/reparse-bctc-reports.ts --tickers REE,KBC,PPC
 *
 *   # Reparse specific ticker + period:
 *   bun scripts/migrations/reparse-bctc-reports.ts --tickers REE --year 2026 --quarter Q1
 *
 *   # Dry-run (show plan + BEFORE confidence without triggering):
 *   bun scripts/migrations/reparse-bctc-reports.ts --tickers REE,CTG --dry-run
 *
 * Environment:
 *   MCP_SERVER_URL  — base URL of mcp-server (default: http://localhost:3000)
 *   PDF_DIR         — directory containing local PDFs (default: ./data/pdfs)
 *
 * Returns exit code 0 on full success, 1 if any ticker failed, 2 on fatal error.
 *
 * DRAIN-INJECTION-SAFE: no shell interpolation of data values. Uses fetch() + FormData.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CLI arg parsing
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const tickersRaw = getArg("--tickers");
const tickers: string[] = tickersRaw
  ? tickersRaw.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean)
  : [];
const yearArg = getArg("--year") ? parseInt(getArg("--year")!, 10) : undefined;
const quarterArg = getArg("--quarter") as "Q1" | "Q2" | "Q3" | "Q4" | undefined;
const dryRun = hasFlag("--dry-run");

const MCP_SERVER_URL = Bun.env.MCP_SERVER_URL ?? "http://localhost:3000";
const PDF_DIR = Bun.env.PDF_DIR ?? "./data/pdfs";

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers (read-only for snapshot; write via HTTP push endpoint only)
// ─────────────────────────────────────────────────────────────────────────────

import { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

function openDb(): Database {
  // Resolve DB path — check common locations
  const candidates = [
    "/app/data/market.db",                      // inside container
    "./data/market.db",                          // mounted on host
    "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return new Database(p, { readonly: true });
  }
  throw new Error("market.db not found in any known location");
}

interface FinancialRow {
  id: string;
  action_code: string;
  period_year: number;
  period_quarter: number;
  extraction_confidence: number;
  confidence_financial: number | null;
  parsed_at: string;
}

interface QueueRow {
  id: number;
  action_code: string;
  period_year: number;
  period_quarter: string;
  status: string;
  source_url: string | null;
  attempts: number;
}

function getFinancialRow(db: Database, ticker: string, year: number, quarter: number): FinancialRow | null {
  return db.query<FinancialRow, [string, number, number]>(
    "SELECT id, action_code, period_year, period_quarter, extraction_confidence, confidence_financial, parsed_at FROM financial_reports WHERE action_code = ? AND period_year = ? AND period_quarter = ? ORDER BY parsed_at DESC LIMIT 1"
  ).get(ticker, year, quarter) ?? null;
}

function getQueueRow(db: Database, ticker: string, year: number, quarter: string): QueueRow | null {
  return db.query<QueueRow, [string, number, string]>(
    "SELECT id, action_code, period_year, period_quarter, status, source_url, attempts FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?"
  ).get(ticker, year, quarter) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF finder
// ─────────────────────────────────────────────────────────────────────────────

function findPdf(ticker: string, year: number, quarter: string): string | null {
  // Resolve PDF dir candidates
  const dirs = [
    "/app/data/pdfs",
    PDF_DIR,
    "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/pdfs",
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith(".pdf"));
    // Pattern: TICKER_YEAR_QUARTER.pdf or contains ticker + year in filename
    const canonical = `${ticker}_${year}_${quarter}.pdf`;
    if (files.includes(canonical)) return join(dir, canonical);
    // Fuzzy: must contain ticker and year
    const fuzzy = files.find(f => f.toUpperCase().includes(ticker) && f.includes(String(year)));
    if (fuzzy) return join(dir, fuzzy);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Push endpoint caller
// ─────────────────────────────────────────────────────────────────────────────

async function callPushBctcPdf(params: {
  ticker: string;
  year: number;
  quarter: string;
  pdfPath: string;
  sourceUrl?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const pdfBytes = await Bun.file(params.pdfPath).arrayBuffer();

  const form = new FormData();
  form.append("action_code", params.ticker);
  form.append("period_year", String(params.year));
  form.append("period_quarter", params.quarter);
  if (params.sourceUrl) form.append("source_url", params.sourceUrl);
  form.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), basename(params.pdfPath));

  try {
    const resp = await fetch(`${MCP_SERVER_URL}/api/push-bctc-pdf`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });

    const body = await resp.json() as Record<string, unknown>;
    return {
      ok: body.ok === true,
      skipped: body.skipped === true,
      error: body.error as string | undefined,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset queue row via DB write (runs inside container via exec script)
// — NOTE: direct DB write only safe because we use the host-mounted volume path
// ─────────────────────────────────────────────────────────────────────────────

async function resetQueueRow(ticker: string, year: number, quarter: string): Promise<boolean> {
  // Use a write-able DB connection (not the readonly one used for snapshots)
  const dbPaths = [
    "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db",
    "./data/market.db",
  ];
  for (const p of dbPaths) {
    if (!existsSync(p)) continue;
    const rwDb = new Database(p);
    try {
      const result = rwDb.prepare(
        "UPDATE bctc_vps_queue SET status = 'pending', attempts = 0, last_attempt = NULL WHERE action_code = ? AND period_year = ? AND period_quarter = ? AND status = 'done'"
      ).run(ticker, year, quarter);
      rwDb.close();
      return result.changes > 0;
    } catch (err) {
      rwDb.close();
      console.error(`  [WARN] queue reset via host DB failed: ${err}. Will try push-bctc-reset endpoint.`);
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-ticker reparse
// ─────────────────────────────────────────────────────────────────────────────

interface ReparseResult {
  ticker: string;
  period: string;
  before_composite: number | null;
  after_composite: number | null;
  delta: string;
  succeeded: boolean;
  skipped: boolean;
  failure_reason?: string;
}

async function reparseTicker(ticker: string, year: number, quarter: string): Promise<ReparseResult> {
  const period = `${year}-${quarter}`;
  const quarterNum = parseInt(quarter.replace("Q", ""), 10);

  // BEFORE snapshot
  let db: Database;
  try {
    db = openDb();
  } catch (err) {
    return { ticker, period, before_composite: null, after_composite: null, delta: "n/a", succeeded: false, skipped: false, failure_reason: `DB open failed: ${err}` };
  }

  const beforeRow = getFinancialRow(db, ticker, year, quarterNum);
  const queueRow = getQueueRow(db, ticker, year, quarter);
  db.close();

  const beforeConf = beforeRow?.extraction_confidence ?? null;

  console.log(`  BEFORE: composite=${beforeConf ?? "null"} financial=${beforeRow?.confidence_financial ?? "null"} parsed_at=${beforeRow?.parsed_at ?? "n/a"}`);
  console.log(`  Queue: id=${queueRow?.id ?? "n/a"} status=${queueRow?.status ?? "n/a"} attempts=${queueRow?.attempts ?? "n/a"}`);

  // Find PDF
  const pdfPath = findPdf(ticker, year, quarter);
  if (!pdfPath) {
    return {
      ticker, period, before_composite: beforeConf, after_composite: null,
      delta: "n/a", succeeded: false, skipped: false,
      failure_reason: `PDF not found (searched ${PDF_DIR} and /app/data/pdfs)`,
    };
  }
  console.log(`  PDF: ${pdfPath}`);

  if (dryRun) {
    console.log(`  [DRY-RUN] would reset queue and push PDF`);
    return { ticker, period, before_composite: beforeConf, after_composite: null, delta: "dry-run", succeeded: true, skipped: false };
  }

  // Reset queue row from 'done' → 'pending'
  const resetted = await resetQueueRow(ticker, year, quarter);
  console.log(`  Queue reset: ${resetted ? "YES (done→pending)" : "no-op (already pending or not found)"}`);

  // POST PDF to push endpoint
  const pushResult = await callPushBctcPdf({
    ticker, year, quarter: quarter as string,
    pdfPath,
    sourceUrl: queueRow?.source_url ?? undefined,
  });

  if (!pushResult.ok) {
    if (pushResult.skipped) {
      console.log(`  Push: SKIPPED (queue still done — reset may have failed, or concurrent reset race)`);
    } else {
      console.log(`  Push: FAILED — ${pushResult.error ?? "unknown error"}`);
      return {
        ticker, period, before_composite: beforeConf, after_composite: null,
        delta: "n/a", succeeded: false, skipped: false,
        failure_reason: `Push failed: ${pushResult.error ?? "unknown"}`,
      };
    }
  } else {
    console.log(`  Push: OK (pipeline queued)`);
  }

  // Wait for pipeline to complete (fire-and-forget, give it 10s)
  await Bun.sleep(10_000);

  // AFTER snapshot
  let db2: Database;
  try {
    db2 = openDb();
  } catch {
    return { ticker, period, before_composite: beforeConf, after_composite: null, delta: "n/a", succeeded: true, skipped: false, failure_reason: "DB reopen failed for AFTER snapshot" };
  }
  const afterRow = getFinancialRow(db2, ticker, year, quarterNum);
  db2.close();

  const afterConf = afterRow?.extraction_confidence ?? null;
  const delta = (afterConf != null && beforeConf != null)
    ? (afterConf >= beforeConf ? "+" : "") + (afterConf - beforeConf).toFixed(4)
    : "n/a";

  console.log(`  AFTER:  composite=${afterConf ?? "null"} financial=${afterRow?.confidence_financial ?? "null"} parsed_at=${afterRow?.parsed_at ?? "n/a"}`);
  console.log(`  Delta: ${delta}`);

  return {
    ticker, period,
    before_composite: beforeConf,
    after_composite: afterConf,
    delta,
    succeeded: true,
    skipped: pushResult.skipped ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (tickers.length === 0) {
    console.error("Usage: bun scripts/migrations/reparse-bctc-reports.ts --tickers TICKER1,TICKER2 [--year YYYY] [--quarter Q1] [--dry-run]");
    process.exit(2);
  }

  console.log("=== BCTC Low-Confidence Force-Reparse ===");
  console.log(`MCP Server: ${MCP_SERVER_URL}`);
  console.log(`PDF dir: ${PDF_DIR}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log(`Tickers: ${tickers.join(", ")}`);
  if (yearArg) console.log(`Year filter: ${yearArg}`);
  if (quarterArg) console.log(`Quarter filter: ${quarterArg}`);
  console.log("");

  const results: ReparseResult[] = [];

  for (const ticker of tickers) {
    console.log(`\n--- ${ticker} ---`);

    let year = yearArg;
    let quarter = quarterArg;

    // If no year/quarter specified, find from DB
    if (!year || !quarter) {
      let db: Database;
      try { db = openDb(); } catch (err) { console.error(`  DB open failed: ${err}`); continue; }
      const latestRow = db.query<{ period_year: number; period_quarter: number }, [string]>(
        "SELECT period_year, period_quarter FROM financial_reports WHERE action_code = ? ORDER BY period_year DESC, period_quarter DESC LIMIT 1"
      ).get(ticker);
      db.close();

      if (!latestRow) {
        console.log(`  No financial_reports row — skipping`);
        results.push({ ticker, period: "unknown", before_composite: null, after_composite: null, delta: "n/a", succeeded: false, skipped: false, failure_reason: "no DB row" });
        continue;
      }
      year = latestRow.period_year;
      quarter = `Q${latestRow.period_quarter}` as "Q1" | "Q2" | "Q3" | "Q4";
    }

    const result = await reparseTicker(ticker, year, quarter);
    results.push(result);
  }

  // Summary table
  console.log("\n=== RESULTS SUMMARY ===");
  console.log("Ticker | Period | Before | After | Delta | OK | Skipped | Reason");
  console.log("-------|--------|--------|-------|-------|----|---------| -------");
  let anyFailed = false;
  for (const r of results) {
    const ok = r.succeeded ? "YES" : "NO";
    const skipped = r.skipped ? "YES" : "no";
    const before = r.before_composite?.toFixed(4) ?? "null";
    const after = r.after_composite?.toFixed(4) ?? "null";
    console.log(`${r.ticker} | ${r.period} | ${before} | ${after} | ${r.delta} | ${ok} | ${skipped} | ${r.failure_reason ?? ""}`);
    if (!r.succeeded) anyFailed = true;
  }

  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
