#!/usr/bin/env bun
/**
 * scripts/migrations/backfill-ohlcv-gap-2026-07-06.ts
 *
 * DATA-BACKFILL-PRICES-20260706-MONDAY-GAP
 *
 * daily_ohlcv is missing the entire 2026-07-06 (Monday) trading day for every
 * tracked code — last row before the gap was 2026-07-03, next row after was
 * 2026-07-07. Root cause: a 69h Cloudflare Tunnel outage killed VPS→mcp-server
 * push delivery (see INFRA-CLOUDFLARE-TUNNEL-OUTAGE-ROOT-CAUSE, tracked
 * separately) — the VPS-side fetch itself was healthy, the push just never
 * arrived.
 *
 * The standard recovery path (INSERT a trigger row into `ohlcv_backfill_queue`
 * — same pattern as ohlcvHistoryBackfillJob.ts / ohlcvStartupProbe.ts, and the
 * precedent in commit c94b58da4) was attempted first (queue row id=559) but
 * the VPS poller is calling POST /api/ohlcv-backfill-done repeatedly WITHOUT
 * ever calling POST /api/push-ohlcv-history (zero "[push-ohlcv-history]" log
 * lines for the container's entire uptime) — i.e. the VPS-side backfill
 * script is not actually executing right now. That is a VPS/ops-side
 * execution problem, out of apps/mcp-server's zone to fix directly.
 *
 * Diagnostic probe (2026-07-07) found that a DIRECT fetch to VNDirect
 * (https://api-finfo.vndirect.com.vn/v4/stock_prices) from *inside the
 * mcp-server container itself* succeeds and returns real, complete,
 * per-ticker historical data for 2026-07-06 (verified manually for VCB, FPT,
 * HPG, VNM before writing this script). The "geo-blocked from France/Docker"
 * assumption documented in ohlcvHistoryBackfillJob.ts (2026-06-29) no longer
 * holds for this endpoint/query shape — so this one-off backfill can run
 * directly from mcp-server, without any VPS round-trip.
 *
 * This script therefore fetches VNDirect stock_prices directly (narrow date
 * window around the gap, not the full 2yr history) for every code that has
 * data on both the trading day before and after the gap but is missing the
 * gap date, plus VNINDEX (fetched via the dedicated vnmarket_prices endpoint,
 * mirroring vps-scripts/fetch-ohlcv-backfill.sh Step 1.5), and writes through
 * the SSOT path (writeOhlcvBatch, application/usecases/ohlcvWriteService.ts)
 * — reuses the exact same normalization / validateOhlcvUnit / upsert pipeline
 * as every other production writer. Zero duplicated write logic.
 *
 * NO FAKE DATA: every row comes from a live VNDirect response. A code that
 * returns 0 usable rows for the gap date is left as an honest gap (skipped,
 * logged), never zero-filled or interpolated.
 *
 * Idempotent: writeOhlcvBatch's 'backfill' conflictStrategy is an
 * unconditional ON CONFLICT DO UPDATE — safe to re-run.
 *
 * Usage:
 *   # Dry-run (default — lists target codes, no HTTP fetch, no writes):
 *   bun scripts/migrations/backfill-ohlcv-gap-2026-07-06.ts --dry-run
 *
 *   # Apply (fetches + writes for real):
 *   bun scripts/migrations/backfill-ohlcv-gap-2026-07-06.ts --apply
 *
 *   # Against the live named-volume DB (docker exec — required in this repo,
 *   # matches repair-ohlcv-seed-candle-2026-06-16.ts precedent):
 *   docker cp scripts/migrations/backfill-ohlcv-gap-2026-07-06.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/backfill-ohlcv-gap-2026-07-06.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/backfill-ohlcv-gap-2026-07-06.ts --apply
 *
 * Environment:
 *   DB_PATH — override DB path (default: <repo-root>/data/market.db)
 *
 * Exit codes:
 *   0 — success (dry-run or apply, including honest per-code fetch gaps)
 *   1 — DB open failure
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { writeOhlcvBatch as WriteOhlcvBatchFn } from "../../apps/mcp-server/src/application/usecases/ohlcvWriteService.js";

// Resolve ohlcvWriteService at runtime — two supported layouts:
//   1. Repo root (host):      <root>/apps/mcp-server/src/application/usecases/...
//   2. Live container:        /app/src/application/usecases/... (mcp-server root IS /app,
//      script is docker-cp'd directly into /app/ per the repair-ohlcv-seed-candle precedent)
async function loadWriteOhlcvBatch(): Promise<typeof WriteOhlcvBatchFn> {
  const repoRootPath = resolve(import.meta.dir, "../../apps/mcp-server/src/application/usecases/ohlcvWriteService.ts");
  const containerPath = resolve(import.meta.dir, "src/application/usecases/ohlcvWriteService.ts");
  const modPath = existsSync(repoRootPath) ? repoRootPath : containerPath;
  const mod = await import(modPath);
  return mod.writeOhlcvBatch as typeof WriteOhlcvBatchFn;
}

const GAP_DATE = "2026-07-06";
const PRIOR_DATE = "2026-07-03"; // last known-good row before the gap
const NEXT_DATE = "2026-07-07"; // first known-good row after the gap
// Small buffer window around the gap — enough to cover the missing day plus a
// little idempotent-refresh overlap, without re-pulling the full 2yr history.
const FROM_DATE = "2026-07-04";
const TO_DATE = "2026-07-07";
const SLEEP_MS = 350;
const VNDIRECT_STOCK = "https://api-finfo.vndirect.com.vn/v4/stock_prices";
const VNDIRECT_INDEX = "https://api-finfo.vndirect.com.vn/v4/vnmarket_prices";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface VndirectBar {
  code: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  nmVolume?: number | null;
  accumulatedVol?: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Codes with a row on PRIOR_DATE and NEXT_DATE but missing on GAP_DATE. */
export function findGapCodes(db: Database): string[] {
  const rows = db
    .query<{ code: string }, [string, string, string]>(
      `
      SELECT DISTINCT d1.code AS code
      FROM daily_ohlcv d1
      WHERE d1.date = ?
        AND EXISTS (SELECT 1 FROM daily_ohlcv d2 WHERE d2.code = d1.code AND d2.date = ?)
        AND NOT EXISTS (SELECT 1 FROM daily_ohlcv d3 WHERE d3.code = d1.code AND d3.date = ?)
      ORDER BY code
      `,
    )
    .all(PRIOR_DATE, NEXT_DATE, GAP_DATE);
  return rows.map((r) => r.code);
}

async function fetchStock(code: string): Promise<VndirectBar[]> {
  const url = `${VNDIRECT_STOCK}?q=code:${code}~date:gte:${FROM_DATE}~date:lte:${TO_DATE}&sort=date&size=10`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: VndirectBar[] };
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchVnindex(): Promise<VndirectBar[]> {
  const url = `${VNDIRECT_INDEX}?q=code:VNINDEX&size=20&sort=date`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: VndirectBar[] };
  return Array.isArray(json.data) ? json.data.filter((b) => b.date >= FROM_DATE && b.date <= TO_DATE) : [];
}

export interface BackfillSummary {
  codesAttempted: number;
  codesWithData: number;
  codesEmpty: string[];
  totalWritten: number;
  totalSkipped: number;
  totalRejected: number;
  errors: string[];
}

export async function runBackfill(
  db: Database,
  codes: string[],
  opts: { logger?: (msg: string) => void; sleepMs?: number; writeOhlcvBatch?: typeof WriteOhlcvBatchFn } = {},
): Promise<BackfillSummary> {
  const log = opts.logger ?? ((msg: string) => console.log(msg));
  const sleepMs = opts.sleepMs ?? SLEEP_MS;
  const writeOhlcvBatch = opts.writeOhlcvBatch ?? (await loadWriteOhlcvBatch());

  const summary: BackfillSummary = {
    codesAttempted: codes.length,
    codesWithData: 0,
    codesEmpty: [],
    totalWritten: 0,
    totalSkipped: 0,
    totalRejected: 0,
    errors: [],
  };

  // VNINDEX first (dedicated endpoint — mirrors vps-scripts Step 1.5)
  try {
    const idxBars = await fetchVnindex();
    if (idxBars.length > 0) {
      const rows = idxBars
        .filter((b) => b.close != null && b.open != null && b.high != null && b.low != null)
        .map((b) => ({
          code: "VNINDEX",
          date: b.date,
          open: b.open as number,
          high: b.high as number,
          low: b.low as number,
          close: b.close as number,
          volume: b.accumulatedVol ?? b.nmVolume ?? 0,
          type: "index" as const,
        }));
      if (rows.length > 0) {
        const r = await writeOhlcvBatch(rows, db, { conflictStrategy: "backfill" });
        summary.totalWritten += r.written;
        summary.totalSkipped += r.skipped;
        summary.totalRejected += r.rejected.length;
        summary.codesWithData++;
        log(`[backfill] VNINDEX: fetched=${rows.length} written=${r.written} skipped=${r.skipped} rejected=${r.rejected.length}`);
      } else {
        summary.codesEmpty.push("VNINDEX");
        log(`[backfill] VNINDEX: 0 usable bars after filter`);
      }
    } else {
      summary.codesEmpty.push("VNINDEX");
      log(`[backfill] VNINDEX: empty response — honest gap`);
    }
  } catch (err) {
    summary.errors.push(`VNINDEX: ${err instanceof Error ? err.message : String(err)}`);
    log(`[backfill] VNINDEX: ERROR ${err instanceof Error ? err.message : String(err)}`);
  }
  await sleep(sleepMs);

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (!code) continue;
    try {
      const bars = await fetchStock(code);
      if (bars.length === 0) {
        summary.codesEmpty.push(code);
        log(`[backfill] ${code}: empty response — honest gap`);
      } else {
        const rows = bars
          .filter((b) => b.close != null && b.open != null && b.high != null && b.low != null && b.close !== 0)
          .map((b) => ({
            code,
            date: b.date,
            open: b.open as number,
            high: b.high as number,
            low: b.low as number,
            close: b.close as number,
            volume: b.nmVolume ?? 0,
            type: "stock" as const,
          }));
        if (rows.length === 0) {
          summary.codesEmpty.push(code);
          log(`[backfill] ${code}: 0 usable bars after filter`);
        } else {
          const r = await writeOhlcvBatch(rows, db, { conflictStrategy: "backfill" });
          summary.totalWritten += r.written;
          summary.totalSkipped += r.skipped;
          summary.totalRejected += r.rejected.length;
          summary.codesWithData++;
          if ((i + 1) % 50 === 0 || i === codes.length - 1) {
            log(`[backfill] progress ${i + 1}/${codes.length} — last=${code} written_total=${summary.totalWritten}`);
          }
        }
      }
    } catch (err) {
      summary.errors.push(`${code}: ${err instanceof Error ? err.message : String(err)}`);
      log(`[backfill] ${code}: ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
    if (i < codes.length - 1) await sleep(sleepMs);
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--apply");

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[backfill] backfill-ohlcv-gap-2026-07-06`);
  log(`[backfill] mode=${isDryRun ? "DRY-RUN" : "APPLY"}`);
  log(`[backfill] DB_PATH=${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[backfill] ERROR: DB not found at ${DB_PATH}`);
    process.exit(1);
  }

  let db: Database;
  try {
    db = new Database(DB_PATH, { readwrite: true });
  } catch (err) {
    log(`[backfill] ERROR: Cannot open DB: ${err}`);
    process.exit(1);
  }

  (async () => {
    const codes = findGapCodes(db);
    log(`[backfill] gap codes (present ${PRIOR_DATE} + ${NEXT_DATE}, missing ${GAP_DATE}): ${codes.length}`);
    log(`[backfill] sample: ${codes.slice(0, 10).join(", ")}`);

    if (isDryRun) {
      log(`[backfill] DRY-RUN — no HTTP fetch, no writes. Re-run with --apply to execute.`);
      db.close();
      return;
    }

    const summary = await runBackfill(db, codes, { logger: log });
    log(
      `[backfill] APPLY summary: codesAttempted=${summary.codesAttempted} codesWithData=${summary.codesWithData} ` +
        `codesEmpty=${summary.codesEmpty.length} totalWritten=${summary.totalWritten} totalSkipped=${summary.totalSkipped} ` +
        `totalRejected=${summary.totalRejected} errors=${summary.errors.length}`,
    );
    if (summary.codesEmpty.length > 0) {
      log(`[backfill] empty-response codes (honest gaps, up to 20): ${summary.codesEmpty.slice(0, 20).join(", ")}`);
    }
    if (summary.errors.length > 0) {
      log(`[backfill] errors (up to 10): ${summary.errors.slice(0, 10).join(" | ")}`);
    }
    db.close();
  })().catch((err) => {
    log(`[backfill] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
}
