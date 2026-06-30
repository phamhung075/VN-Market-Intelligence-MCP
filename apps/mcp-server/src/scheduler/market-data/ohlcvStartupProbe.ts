// src/scheduler/ohlcvStartupProbe.ts
// Task 1353 — ohlcv-startup-probe implementation (Sprint 119)
// SUBTASK-D (FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR) — depth-floor shallow classification
//
// Runs once at startup. Queries daily_ohlcv row counts for each watchlist
// ticker. Classifies tickers into three buckets:
//   sparse  (cnt < SPARSE_THRESHOLD=8)    — WORK alert + backfill triggered (existing behavior)
//   shallow (SPARSE_THRESHOLD <= cnt < DEPTH_FLOOR=252) — ONE aggregated WORK alert (new)
//   healthy (cnt >= DEPTH_FLOOR=252)      — no action

import { Database } from "bun:sqlite";
import type { OhlcvBackfillResult } from "../../infrastructure/fetchers/ohlcvBackfill.js";

/** Tickers below this threshold are classified as sparse and trigger backfill. */
export const SPARSE_THRESHOLD = 8;
/** Tickers below this floor lack momentum-indicator depth (need 252 bars / ~1yr). */
export const DEPTH_FLOOR = 252;

export interface OhlcvStartupProbeDeps {
  db?: Database;
  sendWorkFn?: (msg: string) => Promise<boolean>;
  /** Injectable for tests — defaults to real runOhlcvBackfill */
  runBackfillFn?: (db: Database) => Promise<OhlcvBackfillResult>;
}

export interface OhlcvStartupProbeResult {
  sparseTickers: Array<{ code: string; count: number }>;
  /** Tickers with SPARSE_THRESHOLD <= cnt < DEPTH_FLOOR (8–251 bars). */
  shallowTickers: Array<{ code: string; count: number }>;
  /** true when the sparse WORK alert was sent. */
  sent: boolean;
  /** true when the shallow depth WORK alert was sent. */
  shallowSent: boolean;
}

export async function runOhlcvStartupProbe(
  deps?: OhlcvStartupProbeDeps
): Promise<OhlcvStartupProbeResult> {
  try {
    // Resolve dependencies — production uses real DB + Telegram
    let db: Database;
    let sendWorkFn: (msg: string) => Promise<boolean>;
    let runBackfillFn: (db: Database) => Promise<OhlcvBackfillResult>;

    if (deps?.db) {
      db = deps.db;
    } else {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      db = getDb();
    }

    if (deps?.sendWorkFn) {
      sendWorkFn = deps.sendWorkFn;
    } else {
      const { sendTelegramWork } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );
      sendWorkFn = (msg: string) => sendTelegramWork(msg, { parseMode: "" });
    }

    if (deps?.runBackfillFn) {
      runBackfillFn = deps.runBackfillFn;
    } else {
      const { runOhlcvBackfill } = await import(
        "../../infrastructure/fetchers/ohlcvBackfill.js"
      );
      runBackfillFn = runOhlcvBackfill;
    }

    // Phase 1: get watchlist tickers
    const rows = db.prepare("SELECT code FROM watchlist").all() as Array<{
      code: string;
    }>;

    if (rows.length === 0) {
      return { sparseTickers: [], shallowTickers: [], sent: false, shallowSent: false };
    }

    // Phase 2: count daily_ohlcv rows per ticker, classify into three buckets
    const countStmt = db.prepare(
      "SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ?"
    );

    const sparseTickers: Array<{ code: string; count: number }> = [];
    const shallowTickers: Array<{ code: string; count: number }> = [];

    for (const { code } of rows) {
      const result = countStmt.get(code) as { cnt: number };
      const count = result?.cnt ?? 0;
      if (count < SPARSE_THRESHOLD) {
        sparseTickers.push({ code, count });
      } else if (count < DEPTH_FLOOR) {
        // shallow: has some bars but below momentum depth floor
        shallowTickers.push({ code, count });
      }
      // count >= DEPTH_FLOOR: healthy — no action needed
    }

    if (sparseTickers.length === 0 && shallowTickers.length === 0) {
      return { sparseTickers: [], shallowTickers: [], sent: false, shallowSent: false };
    }

    // Phase 3: insert a queue row if no existing pending row (dedup guard)
    // Only for sparse tickers — shallow tickers do not trigger backfill
    let backfillAlreadyQueued = false;
    if (sparseTickers.length > 0) {
      try {
        const existing = db.prepare<{ id: number }, []>(
          "SELECT id FROM ohlcv_backfill_queue WHERE done = 0 LIMIT 1"
        ).get();
        if (!existing) {
          db.prepare(
            "INSERT INTO ohlcv_backfill_queue (queued_at, done) VALUES (datetime('now'), 0)"
          ).run();
        } else {
          backfillAlreadyQueued = true;
        }
      } catch {
        // ohlcv_backfill_queue table may not exist on older deployments — skip
      }

      // Phase 4: fire backfill automatically (fire-and-forget, non-blocking).
      // runOhlcvBackfill() fetches from VNDirect directly — no VPS required.
      // Skip if a pending queue row already existed (another startup already triggered it).
      if (!backfillAlreadyQueued) {
        void runBackfillFn(db)
          .then((r) => {
            console.log(
              `[ohlcv-probe] backfill complete — fetched=${r.fetched} skipped=${r.skipped} errors=${r.errors.length}`
            );
            // Mark queue row as done
            try {
              db.prepare(
                "UPDATE ohlcv_backfill_queue SET done = 1 WHERE done = 0"
              ).run();
            } catch {
              // table may not exist
            }
          })
          .catch((err) => {
            console.error(
              `[ohlcv-probe] backfill error: ${err instanceof Error ? err.message : String(err)}`
            );
          });
      }
    }

    // Sparse alert — existing behavior unchanged (ONE message listing all sparse tickers)
    let sent = false;
    if (sparseTickers.length > 0) {
      const tickerList = sparseTickers
        .map((t) => `${t.code}(${t.count})`)
        .join(", ");

      const queueNote = backfillAlreadyQueued
        ? "(backfill already in progress)"
        : "(backfill triggered automatically)";

      const msg =
        `[ohlcv-probe] daily_ohlcv sparse on boot — taSummary will be empty for: ${tickerList}\n` +
        `Auto-backfill started from VNDirect ${queueNote}`;

      await sendWorkFn(msg);
      sent = true;
    }

    // Shallow alert — ONE aggregated WORK message per startup (SUBTASK-D)
    // Lists all tickers in 8 ≤ cnt < 252 range. Not per-ticker. No backfill triggered.
    let shallowSent = false;
    if (shallowTickers.length > 0) {
      const shallowList = shallowTickers
        .map((t) => `${t.code}(${t.count})`)
        .join(", ");

      const shallowMsg =
        `[ohlcv-probe] daily_ohlcv shallow on boot — tickers need ≥${DEPTH_FLOOR} bars for momentum: ${shallowList}`;

      await sendWorkFn(shallowMsg);
      shallowSent = true;
    }

    return { sparseTickers, shallowTickers, sent, shallowSent };
  } catch (err) {
    console.warn(
      `[ohlcv-probe] DB error: ${err instanceof Error ? err.message : String(err)}`
    );
    return { sparseTickers: [], shallowTickers: [], sent: false, shallowSent: false };
  }
}
