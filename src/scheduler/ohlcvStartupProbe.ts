// src/scheduler/ohlcvStartupProbe.ts
// Task 1353 — ohlcv-startup-probe implementation (Sprint 119)
//
// Runs once at startup. Queries daily_ohlcv row counts for each watchlist
// ticker. Sends a WORK-channel alert listing sparse tickers (< 8 rows) so the
// developer knows to run the backfill script before taSummary is useful.

import { Database } from "bun:sqlite";

export interface OhlcvStartupProbeDeps {
  db?: Database;
  sendWorkFn?: (msg: string) => Promise<boolean>;
}

export interface OhlcvStartupProbeResult {
  sparseTickers: Array<{ code: string; count: number }>;
  sent: boolean;
}

export async function runOhlcvStartupProbe(
  deps?: OhlcvStartupProbeDeps
): Promise<OhlcvStartupProbeResult> {
  try {
    // Resolve dependencies — production uses real DB + Telegram
    let db: Database;
    let sendWorkFn: (msg: string) => Promise<boolean>;

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

    // Phase 1: get watchlist tickers
    const rows = db.prepare("SELECT code FROM watchlist").all() as Array<{
      code: string;
    }>;

    if (rows.length === 0) {
      return { sparseTickers: [], sent: false };
    }

    // Phase 2: count daily_ohlcv rows per ticker (parameterized binding)
    const countStmt = db.prepare(
      "SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ?"
    );

    const sparseTickers: Array<{ code: string; count: number }> = [];

    for (const { code } of rows) {
      const result = countStmt.get(code) as { cnt: number };
      const count = result?.cnt ?? 0;
      if (count < 8) {
        sparseTickers.push({ code, count });
      }
    }

    if (sparseTickers.length === 0) {
      return { sparseTickers: [], sent: false };
    }

    // Build and send the alert message
    const tickerList = sparseTickers
      .map((t) => `${t.code}(${t.count})`)
      .join(", ");

    const msg =
      `[ohlcv-probe] daily_ohlcv sparse on boot — taSummary will be empty for: ${tickerList}\n` +
      `Run on VPS: ./fetch-ohlcv-backfill.sh`;

    await sendWorkFn(msg);

    return { sparseTickers, sent: true };
  } catch (err) {
    console.warn(
      `[ohlcv-probe] DB error: ${err instanceof Error ? err.message : String(err)}`
    );
    return { sparseTickers: [], sent: false };
  }
}
