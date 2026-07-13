#!/usr/bin/env bun
/**
 * scripts/migrations/discover-consolidated-bctc-pdf.ts
 *
 * HPG-DISCOVER-CONSOLIDATED-PDF — generic "wrong-scope PDF" repair.
 *
 * Background: bctc_vps_queue enrichment prior to FIX-CTG-1 (2026-06-03) did not
 * rank "hop nhat" (consolidated) filenames above "rieng"/"Cong ty me" (parent-only,
 * standalone) filenames for the same quarter — it grabbed whichever hsx.vn
 * mediafiles-API item matched year+quarter first. Rows enriched before that fix
 * shipped (attempts>0, status='done') can be silently stuck serving the WRONG
 * report type even though the correct consolidated PDF was always available on
 * hsx.vn (both files are typically uploaded to the same folder ID on the same day).
 *
 * Concrete case (2026-07-13): HPG 2025-Q4's `bctc_vps_queue` row (id=223,
 * last_attempt 2026-04-27 — BEFORE FIX-CTG-1 shipped 2026-06-03) is stuck on
 * ".../20260130-HPG-Bao-cao-tai-chinh-rieng-Cong-ty-me-va-giai-trinh-Q4.2025.pdf"
 * (report_scope is mislabeled 'consolidated' by the net_revenue/net_profit
 * heuristic in finalizeBctcRefine.ts — HPG's parent-company entity also books
 * nonzero revenue, so the heuristic cannot distinguish it from a real
 * consolidated report). The actual "...Bao cao tai chinh hop nhat va giai trinh
 * Q4.2025.pdf" sibling file exists in the SAME hsx.vn mediafiles folder
 * (confirmed HTTP 200, application/pdf, 7,135,524 bytes, 2026-07-13).
 *
 * This script re-runs discovery via the CURRENT (FIX-CTG-1-ranked) hsx.vn
 * mediafiles API, compares the ranked top candidate against what bctc_vps_queue
 * currently has recorded, and — only on --apply — downloads the correct PDF and
 * re-drives it through the LIVE push-bctc-pdf pipeline (same mechanism as
 * reparse-bctc-reports.ts, minus its wrong-PDF-selection risk: this script
 * downloads the freshly-discovered URL itself instead of fuzzy-matching
 * whatever ticker+year PDF already happens to sit in data/pdfs/).
 *
 * Usage:
 *   # Dry-run (default — discovers + reports mismatch, no writes/downloads):
 *   bun scripts/migrations/discover-consolidated-bctc-pdf.ts --ticker HPG --year 2025 --quarter Q4
 *
 *   # Apply (download PDF, reset queue row done->pending, push through live pipeline):
 *   bun scripts/migrations/discover-consolidated-bctc-pdf.ts --ticker HPG --year 2025 --quarter Q4 --apply
 *
 *   # Against the live named-volume DB + live push endpoint (docker exec — matches
 *   # other CANONICAL scripts; DB is a NAMED VOLUME, host ./data/market.db is NOT
 *   # the live DB — see feedback_live_db_is_named_volume_not_host_data.md. data/pdfs/
 *   # IS bind-mounted so a host-side download also lands in the container, but the
 *   # queue-reset + push-pipeline steps need the live container's DB connection and
 *   # VPS_PUSH_API_KEY env, hence docker exec is the supported invocation):
 *   docker cp scripts/migrations/discover-consolidated-bctc-pdf.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/discover-consolidated-bctc-pdf.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/discover-consolidated-bctc-pdf.ts --ticker HPG --year 2025 --quarter Q4 --apply
 *
 * Environment:
 *   DB_PATH          — override DB path (default: /app/data/market.db if present,
 *                       else <repo-root>/data/market.db)
 *   PDF_DIR           — override PDF dir (default: /app/data/pdfs if present,
 *                       else <repo-root>/data/pdfs)
 *   MCP_SERVER_URL    — base URL of mcp-server (default: http://localhost:3000)
 *   VPS_PUSH_API_KEY  — required for --apply (used as x-api-key header on the push call)
 *
 * NO FAKE DATA: PDF bytes are a real download from hsx.vn (verified HTTP 200 +
 * application/pdf content-type before write); no placeholder/synthetic bytes.
 *
 * Exit codes:
 *   0 — success (dry-run report, already-satisfied no-op, or apply succeeded)
 *   1 — discovery found no consolidated candidate for the given ticker/period
 *   2 — download or push-pipeline failure
 *   3 — VPS_PUSH_API_KEY missing (--apply only)
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const HSX_API_TOKEN = "HJ2HNS3SKICV4FNE";
const HSX_LISTING_API = "https://api.hsx.vn/l/api/v1/1/securities/stock";
const HSX_MEDIAFILES_API = "https://api.hsx.vn/m/api/v1/1/mediafiles/5";
const STATICFILE_BASE = "https://staticfile.hsx.vn";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function buildHsxHeaders(): Record<string, string> {
  return {
    type: HSX_API_TOKEN,
    Origin: "https://www.hsx.vn",
    Referer: "https://www.hsx.vn/",
    "User-Agent": BROWSER_UA,
    Accept: "application/json, */*",
  };
}

function encodeHsxUrl(url: string): string {
  return url
    .replace(/%(?![0-9A-Fa-f]{2})/g, "%25")
    .replace(/ /g, "%20")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

interface HsxMediafileItem {
  fileName?: string;
  fileType?: string;
  filePath?: string;
  time?: string;
  type?: string;
}

function quarterToMonthPrefix(quarter: string): string | undefined {
  const upper = quarter.toUpperCase().replace(/\s/g, "");
  switch (upper) {
    case "Q1": return "01";
    case "Q2": return "02";
    case "Q3": return "03";
    case "Q4": return "04";
    default: return undefined;
  }
}

function isHopNhat(fileName: string | undefined): boolean {
  return typeof fileName === "string" && fileName.toLowerCase().includes("hop nhat");
}

export interface DiscoveredCandidate {
  url: string;
  fileName: string;
  consolidated: boolean;
}

/** Resolve ticker -> hsx.vn numeric securities ID. Returns undefined for non-HOSE tickers/errors. */
async function resolveNumericId(ticker: string, timeoutMs = 10_000): Promise<number | undefined> {
  const url = `${HSX_LISTING_API}?code=${encodeURIComponent(ticker.toUpperCase())}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: buildHsxHeaders() });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: { list?: Array<{ id?: number }> } };
    const item = json?.data?.list?.[0];
    return typeof item?.id === "number" ? item.id : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Discover ranked candidates for ticker/year/quarter: consolidated ("hop nhat") first. */
export async function discoverCandidates(
  ticker: string,
  year: number,
  quarter: string,
  timeoutMs = 15_000,
): Promise<DiscoveredCandidate[]> {
  const numericId = await resolveNumericId(ticker, timeoutMs);
  if (numericId === undefined) return [];

  const monthPrefix = quarterToMonthPrefix(quarter);
  const url = `${HSX_MEDIAFILES_API}/${numericId}?pageIndex=1&pageSize=100&year=${year}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: buildHsxHeaders() });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { list?: HsxMediafileItem[] } };
    const list = json?.data?.list;
    if (!Array.isArray(list)) return [];

    const candidates: HsxMediafileItem[] = [];
    for (const item of list) {
      if (item?.fileType !== ".pdf") continue;
      if (typeof item.filePath !== "string" || item.filePath.length === 0) continue;
      if (monthPrefix !== undefined && !(item.time ?? "").startsWith(`${monthPrefix}.`)) continue;
      candidates.push(item);
    }

    // Rank: type=Quý + "hop nhat" first, then type=Quý, then rest.
    candidates.sort((a, b) => rank(a) - rank(b));

    return candidates.map((item) => ({
      url: encodeHsxUrl((item.filePath as string).replace("~", STATICFILE_BASE)),
      fileName: item.fileName ?? "",
      consolidated: isHopNhat(item.fileName),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function rank(item: HsxMediafileItem): number {
  const typeIsQuy = item.type === "Quý" || item.type === "Quy";
  if (typeIsQuy && isHopNhat(item.fileName)) return 0;
  if (typeIsQuy) return 1;
  return 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

interface QueueRow {
  id: number;
  status: string;
  source_url: string | null;
  attempts: number;
}

interface FinancialRow {
  id: string;
  pdf_path: string | null;
  report_scope: string | null;
  refine_status: string | null;
  confirm_status: string | null;
  text_status: string | null;
  extraction_confidence: number | null;
  parsed_at: string | null;
}

function getQueueRow(db: Database, ticker: string, year: number, quarter: string): QueueRow | null {
  return (
    db
      .query<QueueRow, [string, number, string]>(
        "SELECT id, status, source_url, attempts FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
      )
      .get(ticker, year, quarter) ?? null
  );
}

function getFinancialRow(db: Database, ticker: string, year: number, quarterNum: number): FinancialRow | null {
  return (
    db
      .query<FinancialRow, [string, number, number]>(
        "SELECT id, pdf_path, report_scope, refine_status, confirm_status, text_status, extraction_confidence, parsed_at FROM financial_reports WHERE action_code = ? AND period_year = ? AND period_quarter = ? ORDER BY parsed_at DESC LIMIT 1",
      )
      .get(ticker, year, quarterNum) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx === -1 ? undefined : args[idx + 1];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const ticker = (getArg(args, "--ticker") ?? "").toUpperCase();
  const year = parseInt(getArg(args, "--year") ?? "", 10);
  const quarter = (getArg(args, "--quarter") ?? "").toUpperCase();
  const isApply = args.includes("--apply");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] [DISCOVER-CONSOLIDATED-BCTC] ${msg}`);
  }

  if (!ticker || !year || !quarter) {
    console.error(
      "Usage: bun scripts/migrations/discover-consolidated-bctc-pdf.ts --ticker TICKER --year YYYY --quarter Q1..Q4 [--apply]",
    );
    process.exit(2);
  }

  const quarterNum = parseInt(quarter.replace(/^Q/i, ""), 10);

  const DB_PATH = Bun.env["DB_PATH"] ?? (existsSync("/app/data/market.db")
    ? "/app/data/market.db"
    : resolve(import.meta.dir, "..", "..", "data", "market.db"));
  const PDF_DIR = Bun.env["PDF_DIR"] ?? (existsSync("/app/data/pdfs")
    ? "/app/data/pdfs"
    : resolve(import.meta.dir, "..", "..", "data", "pdfs"));
  const MCP_SERVER_URL = Bun.env["MCP_SERVER_URL"] ?? "http://localhost:3000";

  log(`mode=${isApply ? "APPLY" : "DRY-RUN"} ticker=${ticker} year=${year} quarter=${quarter}`);
  log(`DB_PATH=${DB_PATH}`);
  log(`PDF_DIR=${PDF_DIR}`);

  const candidates = await discoverCandidates(ticker, year, quarter);
  if (candidates.length === 0) {
    log(`No hsx.vn candidates found for ${ticker} ${year} ${quarter} — nothing to discover.`);
    process.exit(1);
  }

  log(`Discovered ${candidates.length} candidate(s) (ranked, consolidated-first):`);
  for (const c of candidates) {
    log(`  consolidated=${c.consolidated} fileName="${c.fileName}"`);
  }

  const top = candidates[0]!;
  if (!top.consolidated) {
    log(`WARNING: top-ranked candidate is NOT a "hop nhat" (consolidated) filename. Proceeding with best available.`);
  }

  if (!existsSync(DB_PATH)) {
    log(`ERROR: DB not found at ${DB_PATH}. Re-run via docker exec against the live named-volume DB.`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const queueRow = getQueueRow(db, ticker, year, quarter);
  const financialBefore = getFinancialRow(db, ticker, year, quarterNum);
  db.close();

  log(`Current queue row: ${queueRow ? JSON.stringify(queueRow) : "none"}`);
  log(`Current financial_reports row (BEFORE): ${financialBefore ? JSON.stringify(financialBefore) : "none"}`);

  const currentFileName = queueRow?.source_url ? basename(decodeURIComponent(queueRow.source_url)) : "";
  const alreadyConsolidated = isHopNhat(currentFileName) || isHopNhat(financialBefore?.pdf_path ?? undefined);

  if (alreadyConsolidated) {
    log(`ALREADY-SATISFIED: currently-recorded source is already a "hop nhat" (consolidated) filename — no-op.`);
    process.exit(0);
  }

  log(
    `MISMATCH: currently-recorded source is "${currentFileName || financialBefore?.pdf_path || "unknown"}" ` +
      `(not consolidated) but hsx.vn's top-ranked candidate is "${top.fileName}" (consolidated=${top.consolidated}).`,
  );

  if (!isApply) {
    log(`DRY-RUN — no writes/downloads. Re-run with --apply to fetch and re-ingest the consolidated PDF.`);
    process.exit(0);
  }

  const apiKey = Bun.env["VPS_PUSH_API_KEY"];
  if (!apiKey) {
    log(`ERROR: VPS_PUSH_API_KEY env var not set — required for --apply (push-bctc-pdf auth).`);
    process.exit(3);
  }

  // ── Download the consolidated PDF (skip if already present with plausible size —
  // hsx.vn's CDN has been observed throttling this specific download to ~12KB/s,
  // so a pre-fetched file — e.g. via a resumable `curl --continue-at -` run — is
  // reused instead of re-downloading from scratch) ──────────────────────────
  mkdirSync(PDF_DIR, { recursive: true });
  const filename = top.fileName || `${ticker}_${year}_${quarter}.pdf`;
  const pdfPath = resolve(PDF_DIR, filename);

  let pdfBytes: Uint8Array;
  if (existsSync(pdfPath) && Bun.file(pdfPath).size >= 10_240) {
    pdfBytes = new Uint8Array(await Bun.file(pdfPath).arrayBuffer());
    log(`Reusing already-downloaded file at ${pdfPath} (${pdfBytes.length} bytes)`);
  } else {
    log(`Downloading: ${top.url}`);
    const pdfRes = await fetch(top.url, { headers: { "User-Agent": BROWSER_UA } });
    if (!pdfRes.ok) {
      log(`ERROR: download failed HTTP ${pdfRes.status}`);
      process.exit(2);
    }
    const contentType = pdfRes.headers.get("content-type") ?? "";
    pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    log(`Downloaded ${pdfBytes.length} bytes, content-type=${contentType}`);
    if (!contentType.includes("pdf") || pdfBytes.length < 10_240) {
      log(`ERROR: response does not look like a real PDF (content-type=${contentType}, bytes=${pdfBytes.length})`);
      process.exit(2);
    }
    writeFileSync(pdfPath, pdfBytes);
    log(`Saved to ${pdfPath}`);
  }

  // ── Reset queue row 'done' -> 'pending' so push-bctc-pdf does not skip it ──
  const rwDb = new Database(DB_PATH);
  try {
    const existing = rwDb
      .query<{ id: number }, [string, number, string]>(
        "SELECT id FROM bctc_vps_queue WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
      )
      .get(ticker, year, quarter);
    if (existing) {
      rwDb
        .prepare(
          "UPDATE bctc_vps_queue SET status = 'pending', attempts = 0, last_attempt = NULL WHERE action_code = ? AND period_year = ? AND period_quarter = ?",
        )
        .run(ticker, year, quarter);
      log(`Queue row reset: done -> pending (id=${existing.id})`);
    } else {
      rwDb
        .prepare(
          "INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts) VALUES (?, ?, ?, 'pending', 0)",
        )
        .run(ticker, year, quarter);
      log(`Queue row created (none existed): pending`);
    }
  } finally {
    rwDb.close();
  }

  // ── Push through the live pipeline ─────────────────────────────────────────
  const form = new FormData();
  form.append("action_code", ticker);
  form.append("period_year", String(year));
  form.append("period_quarter", quarter);
  form.append("source_url", top.url);
  form.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), filename);

  log(`POST ${MCP_SERVER_URL}/api/push-bctc-pdf`);
  const pushRes = await fetch(`${MCP_SERVER_URL}/api/push-bctc-pdf`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const pushBody = (await pushRes.json().catch(() => ({}))) as Record<string, unknown>;
  log(`Push response: HTTP ${pushRes.status} ${JSON.stringify(pushBody)}`);
  if (!pushRes.ok || pushBody.ok !== true) {
    log(`ERROR: push-bctc-pdf did not accept the PDF.`);
    process.exit(2);
  }
  if (pushBody.skipped === true) {
    log(`ERROR: push-bctc-pdf skipped (queue row still 'done' — reset may have raced). Re-run --apply.`);
    process.exit(2);
  }

  // ── Poll for pipeline completion ───────────────────────────────────────────
  const POLL_INTERVAL_MS = 5_000;
  const POLL_MAX_MS = 120_000;
  const startedAt = Date.now();
  let financialAfter: FinancialRow | null = null;
  let queueAfter: QueueRow | null = null;

  while (Date.now() - startedAt < POLL_MAX_MS) {
    await Bun.sleep(POLL_INTERVAL_MS);
    const pollDb = new Database(DB_PATH, { readonly: true });
    queueAfter = getQueueRow(pollDb, ticker, year, quarter);
    financialAfter = getFinancialRow(pollDb, ticker, year, quarterNum);
    pollDb.close();
    log(`  poll: queue.status=${queueAfter?.status ?? "n/a"} financial.parsed_at=${financialAfter?.parsed_at ?? "n/a"}`);
    if (queueAfter?.status === "done" || queueAfter?.status === "failed") break;
  }

  log(`FINAL queue row: ${queueAfter ? JSON.stringify(queueAfter) : "none"}`);
  log(`FINAL financial_reports row (AFTER): ${financialAfter ? JSON.stringify(financialAfter) : "none"}`);

  const pdfPathChanged = financialAfter?.pdf_path !== financialBefore?.pdf_path;
  const isNowConsolidatedPath = isHopNhat(financialAfter?.pdf_path ?? undefined);
  log(`pdf_path changed: ${pdfPathChanged} | new pdf_path is "hop nhat": ${isNowConsolidatedPath}`);

  if (queueAfter?.status === "done" && pdfPathChanged) {
    log(`SUCCESS: consolidated PDF ingested and financial_reports.pdf_path updated.`);
    process.exit(0);
  }

  log(`WARNING: pipeline did not confirm completion within ${POLL_MAX_MS / 1000}s — check container logs.`);
  process.exit(2);
}
