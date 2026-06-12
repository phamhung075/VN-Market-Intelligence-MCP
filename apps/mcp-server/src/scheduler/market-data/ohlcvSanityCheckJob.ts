// src/scheduler/market-data/ohlcvSanityCheckJob.ts
// Task CONTAM-5 / Sprint OHLCV-UNIT-CONTAM
//
// Post-aggregation sanity scan: detects mixed-scale / contaminated daily_ohlcv rows
// across the whole table (all watchlist tickers, last 7 days).
//
// Fail-loud protocol: on any contaminated row, sends to BUG Telegram channel.
// All-zero rows (2026-05-30 bulk-zero defect, BACKLOG_CONTAM_8) are TOLERATED —
// skipped before contamination checks to avoid spam.
//
// Reuses validateOhlcvUnit from CONTAM-1 (domain/services/market-data/ohlcvUnitGuard).
// DDD layer: scheduler (imports from domain — allowed; no infrastructure imports in domain).

import { Database } from "bun:sqlite";
import { validateOhlcvUnit } from "../../domain/services/market-data/ohlcvUnitGuard.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OhlcvSanityCheckDeps {
  db?: () => Database;
  nowMsFn?: () => number;
  sendBugFn?: (msg: string) => Promise<unknown>;
}

export interface OhlcvSanityHit {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  flag: string;
}

export interface OhlcvSanityCheckResult {
  scanned: number;
  skippedAllZero: number;
  hitCount: number;
  hits: OhlcvSanityHit[];
  sentBug: boolean;
}

// Known index tickers (exempt from stock range guard)
// Matches the list used in other writers via validateOhlcvUnit type="index".
const INDEX_TICKERS = new Set(["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX"]);

function tickerType(code: string): "stock" | "index" {
  return INDEX_TICKERS.has(code) ? "index" : "stock";
}

// ─────────────────────────────────────────────────────────────────────────────
// runOhlcvSanityCheck
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans daily_ohlcv for mixed-scale / contaminated rows.
 *
 * Scan window: last 7 days for all watchlist tickers.
 * All-zero rows (BACKLOG_CONTAM_8) are skipped without sending Telegram.
 * First contamination hit triggers a BUG Telegram; all hits are returned.
 *
 * Fail-loud per arch brief Decision 4:
 *   - open < 100 → 'open_too_low'
 *   - low  < 100 → 'low_too_low'
 *   - high > 10_000_000 → 'high_too_high'
 *   - high / low > 5 → 'hilo_ratio_extreme'
 *   - plausibility (low ≤ open/close ≤ high) → caught by validateOhlcvUnit
 *
 * The underlying validateOhlcvUnit() from CONTAM-1 covers all these rules.
 */
export async function runOhlcvSanityCheck(
  deps?: OhlcvSanityCheckDeps,
): Promise<OhlcvSanityCheckResult> {
  let db: Database;
  let sendBugFn: (msg: string) => Promise<unknown>;
  const nowMs = deps?.nowMsFn ? deps.nowMsFn() : Date.now();

  if (deps?.db) {
    db = deps.db();
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    db = getDb();
  }

  if (deps?.sendBugFn) {
    sendBugFn = deps.sendBugFn;
  } else {
    const { sendTelegramBug } = await import(
      "../../infrastructure/notifiers/telegram.js"
    );
    sendBugFn = (msg: string) => sendTelegramBug(msg);
  }

  // Compute 7-day lookback window
  const cutoff = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Query watchlist tickers for in-clause
  const watchlist = db
    .prepare("SELECT code FROM watchlist")
    .all() as Array<{ code: string }>;

  if (watchlist.length === 0) {
    return { scanned: 0, skippedAllZero: 0, hitCount: 0, hits: [], sentBug: false };
  }

  // Build parameterized placeholder list
  const placeholders = watchlist.map(() => "?").join(", ");
  const codes = watchlist.map((r) => r.code);

  // Fetch all candidate rows in the window
  const rows = db
    .prepare(
      `SELECT code, date, open, high, low, close
       FROM daily_ohlcv
       WHERE code IN (${placeholders})
         AND date >= ?
       ORDER BY date DESC, code ASC`,
    )
    .all(...codes, cutoff) as Array<{
    code: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;

  let scanned = 0;
  let skippedAllZero = 0;
  const hits: OhlcvSanityHit[] = [];

  for (const row of rows) {
    scanned++;

    // Tolerate known all-zero rows (BACKLOG_CONTAM_8) — do NOT send Telegram
    if (row.open === 0 && row.high === 0 && row.low === 0 && row.close === 0) {
      skippedAllZero++;
      continue;
    }

    const type = tickerType(row.code);
    const result = validateOhlcvUnit(
      row.code,
      type,
      row.open,
      row.high,
      row.low,
      row.close,
    );

    if (!result.valid) {
      hits.push({
        code: row.code,
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        flag: result.reason ?? "invalid",
      });
    }
  }

  if (hits.length === 0) {
    return { scanned, skippedAllZero, hitCount: 0, hits: [], sentBug: false };
  }

  // Build fail-loud BUG Telegram message
  const topHits = hits.slice(0, 10); // cap to 10 rows in message (prevent length overflow)
  const hitLines = topHits.map(
    (h) =>
      `  ${h.code} ${h.date}: open=${h.open} high=${h.high} low=${h.low} close=${h.close} → ${h.flag}`,
  );
  const overflow = hits.length > 10 ? `\n  ... +${hits.length - 10} more` : "";
  const msg =
    `[ohlcv-sanity] UNIT CONTAMINATION DETECTED — ${hits.length} row(s) in last 7 days\n` +
    hitLines.join("\n") +
    overflow +
    `\nAction: run repair migration CONTAM-6 or force-run ohlcvDailyAggregator for affected dates.`;

  let sentBug = false;
  try {
    await sendBugFn(msg);
    sentBug = true;
  } catch {
    // Swallow notification errors — detection succeeded; alert is best-effort
  }

  return { scanned, skippedAllZero, hitCount: hits.length, hits, sentBug };
}
