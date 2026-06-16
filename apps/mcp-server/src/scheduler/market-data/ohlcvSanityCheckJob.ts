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
//
// FR-G2 (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0): cross-day scale check.
//   For any row in last 7 days, compute ratio = close / prior_real_close where
//   prior_real_close = most recent daily_ohlcv close for that code with
//   date < row.date AND volume > 0.  If ratio > 500 OR ratio < 0.002,
//   flag as scale_mismatch_vs_prior and emit BUG.  Catches both ÷1000 and ×1000
//   classes that pass all intra-row validateOhlcvUnit rules.
//   Single batched JOIN query (non-N+1) fetches all prior closes up-front.
//
// FR-G3 (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0): synthetic seed-bar detector.
//   Flag any row where open=high AND high=low AND low=close AND volume=0
//   AND date >= VN_TODAY (UTC+7) as synthetic_seed_bar and emit BUG.
//   Catches the whole-universe seed write regardless of scale.

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
  volume: number;
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
// Constants — FR-G2 cross-day scale thresholds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FR-G2: ratio = close / prior_real_close
 * Flag if ratio > SCALE_RATIO_HIGH (÷1000 → close collapses, ratio ~0.001)
 * OR   ratio < SCALE_RATIO_LOW  (×1000 → close inflates, ratio ~1000)
 */
const SCALE_RATIO_HIGH = 500;   // ratio above this → ×1000 class (inflated)
const SCALE_RATIO_LOW  = 0.002; // ratio below this → ÷1000 class (collapsed)

// ─────────────────────────────────────────────────────────────────────────────
// runOhlcvSanityCheck
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans daily_ohlcv for mixed-scale / contaminated rows.
 *
 * Scan window: last 7 days for all watchlist tickers.
 * All-zero rows (BACKLOG_CONTAM_8) are skipped without sending Telegram.
 * Any contamination hit triggers a single BUG Telegram; all hits are returned.
 *
 * Three detector passes (all reuse the same sendBugFn / Telegram mechanism):
 *
 * Pass 1 — intra-row unit guard (existing, CONTAM-1):
 *   validateOhlcvUnit rules: range / cross-field / hilo-ratio / plausibility.
 *
 * Pass 2 — FR-G2 cross-day scale check (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0):
 *   ratio = close / prior_real_close.  If ratio > 500 OR ratio < 0.002,
 *   flag scale_mismatch_vs_prior.  prior_real_close fetched via a single batched
 *   JOIN (non-N+1) for all candidate rows before the per-row loop.
 *   Index tickers are exempt (their price band is unrelated to prior-day stock prices).
 *
 * Pass 3 — FR-G3 synthetic seed-bar detector (FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0):
 *   Flag any row where open=high=low=close AND volume=0 AND date >= VN_TODAY
 *   (UTC+7) as synthetic_seed_bar.  Catches whole-universe seed writes regardless
 *   of unit scale.
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

  // VN_TODAY: Vietnam date (UTC+7) — used by FR-G3 seed-bar check
  // At 01:30 UTC = 08:30 VN, this correctly returns the current VN calendar date.
  const vnToday = new Date(nowMs + 7 * 3600_000).toISOString().slice(0, 10);

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

  // Fetch all candidate rows in the window (include volume for FR-G3)
  const rows = db
    .prepare(
      `SELECT code, date, open, high, low, close, volume
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
    volume: number;
  }>;

  // ── FR-G2: Batched prior-close fetch (non-N+1) ───────────────────────────
  //
  // Single JOIN query: for each (code, date) in the window, find the most recent
  // real close (volume > 0) with date strictly before the row's date.
  //
  // Strategy: fetch the most-recent real close per code across ALL dates < cutoff
  // from the full daily_ohlcv table (not just the 7-day window) so that rows at
  // the start of the window also get a valid prior close.
  //
  // Because rows in the window can span multiple dates per code, we need
  // per-(code, date) prior closes.  We achieve this with a self-JOIN:
  //
  //   For each row R in the window, find the latest real row P where
  //   P.code = R.code AND P.date < R.date AND P.volume > 0.
  //
  // SQLite does not support LATERAL joins, so we use a correlated subquery
  // wrapped in a single query over the window rows — still one round-trip
  // to the DB (no per-row Python-level query).
  //
  // Result shape: Map<`${code}__${date}`, priorClose>

  const priorCloseRows = db
    .prepare(
      `SELECT w.code,
              w.date   AS window_date,
              p.close  AS prior_close
       FROM daily_ohlcv AS w
       INNER JOIN daily_ohlcv AS p
         ON p.code = w.code
        AND p.date = (
              SELECT MAX(x.date)
              FROM daily_ohlcv AS x
              WHERE x.code   = w.code
                AND x.date   < w.date
                AND x.volume > 0
            )
       WHERE w.code IN (${placeholders})
         AND w.date >= ?`,
    )
    .all(...codes, cutoff) as Array<{
    code: string;
    window_date: string;
    prior_close: number;
  }>;

  const priorCloseMap = new Map<string, number>();
  for (const r of priorCloseRows) {
    priorCloseMap.set(`${r.code}__${r.window_date}`, r.prior_close);
  }

  // ── Main scan loop ────────────────────────────────────────────────────────

  let scanned = 0;
  let skippedAllZero = 0;
  const hits: OhlcvSanityHit[] = [];

  // Track which (code, date) pairs have already been flagged to avoid
  // appending multiple flags for the same row; we push at most one hit
  // per row per pass (a row could theoretically trigger both FR-G2 and FR-G3,
  // but each is a separate, independent detector so both hits are recorded).

  for (const row of rows) {
    scanned++;

    // Tolerate known all-zero rows (BACKLOG_CONTAM_8) — do NOT send Telegram
    if (row.open === 0 && row.high === 0 && row.low === 0 && row.close === 0) {
      skippedAllZero++;
      continue;
    }

    const type = tickerType(row.code);

    // ── Pass 1: intra-row unit guard (existing CONTAM-1 check) ──────────
    const unitResult = validateOhlcvUnit(
      row.code,
      type,
      row.open,
      row.high,
      row.low,
      row.close,
    );

    if (!unitResult.valid) {
      hits.push({
        code: row.code,
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        flag: unitResult.reason ?? "invalid",
      });
    }

    // ── Pass 2: FR-G2 cross-day scale check ─────────────────────────────
    // Exempt index tickers (their absolute price range is unrelated to stock scale).
    if (type === "stock" && row.close > 0) {
      const priorClose = priorCloseMap.get(`${row.code}__${row.date}`);
      if (priorClose !== undefined && priorClose > 0) {
        const ratio = row.close / priorClose;
        if (ratio > SCALE_RATIO_HIGH || ratio < SCALE_RATIO_LOW) {
          hits.push({
            code: row.code,
            date: row.date,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            flag: `scale_mismatch_vs_prior: close=${row.close} prior_real_close=${priorClose} ratio=${ratio.toFixed(6)}`,
          });
        }
      }
    }

    // ── Pass 3: FR-G3 synthetic seed-bar detector ────────────────────────
    // Flag rows where O=H=L=C AND volume=0 AND date >= VN_TODAY.
    // This catches the whole-universe seed write regardless of unit scale.
    if (
      row.volume === 0 &&
      row.date >= vnToday &&
      row.open === row.high &&
      row.high === row.low &&
      row.low === row.close
    ) {
      hits.push({
        code: row.code,
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        flag: `synthetic_seed_bar: O=H=L=C=${row.close} volume=0 date=${row.date}>=vnToday=${vnToday}`,
      });
    }
  }

  if (hits.length === 0) {
    return { scanned, skippedAllZero, hitCount: 0, hits: [], sentBug: false };
  }

  // Build fail-loud BUG Telegram message (reuses existing alert mechanism)
  const topHits = hits.slice(0, 10); // cap to 10 rows in message (prevent length overflow)
  const hitLines = topHits.map(
    (h) =>
      `  ${h.code} ${h.date}: open=${h.open} high=${h.high} low=${h.low} close=${h.close} vol=${h.volume} → ${h.flag}`,
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
