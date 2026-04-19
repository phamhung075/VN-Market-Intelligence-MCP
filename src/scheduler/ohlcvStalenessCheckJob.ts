// src/scheduler/ohlcvStalenessCheckJob.ts
// Task 1465 — ohlcv-staleness-check (Sprint 175)
//
// Fires 08:15 UTC Mon-Fri. Queries daily_ohlcv for the current VN date
// per watchlist ticker. Sends WORK alert when >50% are missing.
// Complements ohlcvStartupProbe (boot-time). This covers mid-day VPS outage.

import { Database } from "bun:sqlite";

export interface OhlcvStalenessCheckDeps {
  db?: Database;
  nowMsFn?: () => number;
  sendWorkFn?: (msg: string) => Promise<boolean>;
}

export interface OhlcvStalenessCheckResult {
  totalCount: number;
  missingCount: number;
  missingTickers: string[];
  sent: boolean;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

function vnDateString(nowMs: number): string {
  return new Date(nowMs + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export async function runOhlcvStalenessCheck(
  deps?: OhlcvStalenessCheckDeps
): Promise<OhlcvStalenessCheckResult> {
  try {
    let db: Database;
    let sendWorkFn: (msg: string) => Promise<boolean>;
    const nowMs = deps?.nowMsFn ? deps.nowMsFn() : Date.now();

    if (deps?.db) {
      db = deps.db;
    } else {
      const { getDb } = await import("../infrastructure/db/schema.js");
      db = getDb();
    }

    if (deps?.sendWorkFn) {
      sendWorkFn = deps.sendWorkFn;
    } else {
      const { sendTelegramWork } = await import(
        "../infrastructure/notifiers/telegram.js"
      );
      sendWorkFn = (msg: string) => sendTelegramWork(msg, { parseMode: "" });
    }

    // Phase 1: watchlist tickers
    const watchlist = db
      .prepare("SELECT code FROM watchlist")
      .all() as Array<{ code: string }>;

    if (watchlist.length === 0) {
      return { totalCount: 0, missingCount: 0, missingTickers: [], sent: false };
    }

    // Phase 2: VN date for today
    const vnDate = vnDateString(nowMs);

    // Phase 3: check presence in daily_ohlcv for today's VN date (parameterized)
    const stmt = db.prepare(
      "SELECT 1 FROM daily_ohlcv WHERE code = ? AND date = ? LIMIT 1"
    );

    const missingTickers: string[] = [];
    for (const { code } of watchlist) {
      const row = stmt.get(code, vnDate);
      if (!row) missingTickers.push(code);
    }

    const totalCount = watchlist.length;
    const missingCount = missingTickers.length;

    // Phase 4: fire alert only when strictly >50% missing
    if (missingCount / totalCount <= 0.5) {
      return { totalCount, missingCount, missingTickers, sent: false };
    }

    const tickerList = missingTickers.join(", ");
    const msg =
      `[ohlcv-staleness] >50% watchlist missing daily_ohlcv for VN date ${vnDate}\n` +
      `Missing (${missingCount}/${totalCount}): ${tickerList}\n` +
      `Action: check VPS vn-price-fetch.service + run ohlcv backfill if needed.`;

    await sendWorkFn(msg);
    return { totalCount, missingCount, missingTickers, sent: true };

  } catch (err) {
    console.warn(
      `[ohlcv-staleness] error: ${err instanceof Error ? err.message : String(err)}`
    );
    return { totalCount: 0, missingCount: 0, missingTickers: [], sent: false };
  }
}
