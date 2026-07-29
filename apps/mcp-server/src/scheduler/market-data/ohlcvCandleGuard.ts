/**
 * ALPHA-S1-STARTUP-CANDLE-GUARD (2026-07-13) — calendar-aware OHLCV candle presence guard.
 *
 * Detects a missing daily_ohlcv session for the most recent VN trading day and triggers
 * catch-up via recoverMissingOhlcvSession() — but ONLY for genuine trading days. Consults
 * the domain calendar oracle (vnTradingCalendar.mostRecentTradingDayOnOrBefore) so weekends
 * AND holidays are structurally skipped, never mistaken for a missing candle. This closes
 * the exact false-positive class that minted the phantom ALPHA-S1-CANDLE-RECOVER task
 * (2026-07-11 was a Saturday — no candle to recover; the detector that flagged it never
 * consulted the trading calendar).
 *
 * Single-responsibility, one-job-per-file — mirrors ohlcvStartupProbe.ts's placement
 * exactly (scheduler layer per docs/policies/dev-standards.md § DDD Layer Rules:
 * orchestrates domain calendar + infra DB read + the sibling recovery function
 * recoverMissingOhlcvSession.ts — co-located in scheduler/market-data/ since
 * FACTORY-GUARD-CI-TSBOUNDARIES-IMPL, 2026-07-29 relocated it out of
 * application/usecases/, where it had been reaching back into this same
 * scheduler/market-data/ directory for ohlcvDailyAggregatorJob.ts — a Fence-B
 * violation; the recovery helper's sole caller and its core dependency were
 * both already scheduler-owned).
 *
 * Two call sites (both additive, see docs/handoffs/ALPHA-S1-architect-design.md §2):
 *   1. startScheduler.ts — immediately after the existing runOhlcvStartupProbe() call.
 *   2. ohlcvDailyAggregatorJob.ts — trailing step after runOhlcvDailyAggregator's own
 *      write, checking the PREVIOUS trading day (today's own aggregation just ran above
 *      it in the same function) via a nowMs shifted back 24h. This is the daily self-heal
 *      path that does not depend on a container restart ever happening.
 *
 * Idempotency: relies entirely on recoverMissingOhlcvSession's own guards (already-present
 * no-op, pending-row dedup) — calling this guard twice in a row (startup + same-day cron
 * trailing call) is safe by construction, no new dedup logic needed here.
 *
 * Fail-loud contract: a genuine recovery-path exception (not "still missing" — an actual
 * DB/logic error) escalates via sendTelegramBug and is re-thrown, never swallowed. A
 * persistent trading-day gap that routes through the VPS-relay branch (recoverMissingOhlcvSession
 * action:"vps-relay-triggered") is escalated to exactly one Telegram BUG at retry-cap by the
 * ALREADY-EXISTING R-5 retry/escalate ladder inside handleOhlcvBackfillDone
 * (interface/mcp/routes/ohlcvBackfillHandler.ts, ALPHA-S1-OHLCV-BACKFILL-DONE-BUG, commit
 * 599f4aee0) once the VPS poller reports back — this guard does NOT invent a second ladder,
 * it only needs to correctly trigger the existing one via the ohlcv_backfill_queue row.
 *
 * @module scheduler/market-data/ohlcvCandleGuard
 */

import { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { sendTelegramWork, sendTelegramBug } from "../../infrastructure/notifiers/telegram.js";
import {
  mostRecentTradingDayOnOrBefore,
  shiftDateDays,
} from "../../domain/services/vnTradingCalendar.js";
import {
  recoverMissingOhlcvSession,
  type RecoverMissingOhlcvSessionResult,
} from "./recoverMissingOhlcvSession.js";

export interface OhlcvCandleGuardDeps {
  db?: Database;
  sendWorkFn?: (msg: string) => Promise<unknown>;
  /** Epoch ms. Defaults to Date.now(). Callers shift this to control which VN date is "expected". */
  nowMs?: number;
  /** Injectable for tests — defaults to the real recoverMissingOhlcvSession. */
  recoverFn?: (
    date: string,
    deps?: { db?: Database },
  ) => Promise<RecoverMissingOhlcvSessionResult>;
}

export interface OhlcvCandlePresenceGuardResult {
  expectedDate: string;
  missingCodes: string[];
  vnindexMissing: boolean;
  action: string;
}

export async function runOhlcvCandlePresenceGuard(
  deps?: OhlcvCandleGuardDeps,
): Promise<OhlcvCandlePresenceGuardResult> {
  const db = deps?.db ?? getDb();
  const nowMs = deps?.nowMs ?? Date.now();
  const sendWorkFn = deps?.sendWorkFn ?? ((m: string) => sendTelegramWork(m));
  const recoverFn = deps?.recoverFn ?? recoverMissingOhlcvSession;

  // "Expected" session = most recent VN trading day whose close has already passed
  // relative to now (before today's market open ⇒ expect yesterday's trading day).
  // VN 09:00 ICT open, using shifted-UTC hours (nowMs + 7h ⇒ VN local hour-of-day).
  const vnNowIcT = new Date(nowMs + 7 * 3_600_000);
  const beforeMarketOpen = vnNowIcT.getUTCHours() < 9;
  const vnToday = new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10);
  const cutoffDate = beforeMarketOpen ? shiftDateDays(vnToday, -1) : vnToday;
  // Calendar-aware walk-back: NEVER selects a weekend/holiday as "expected" — this is
  // the structural fix for the weekend-blind false-positive class (see module header).
  const expectedDate = mostRecentTradingDayOnOrBefore(cutoffDate);

  const watchlist = db.prepare<{ code: string }, []>("SELECT code FROM watchlist").all();
  const missing = watchlist
    .filter(
      ({ code }) =>
        !db
          .prepare<{ ok: number }, [string, string]>(
            "SELECT 1 as ok FROM daily_ohlcv WHERE code = ? AND date = ?",
          )
          .get(code, expectedDate),
    )
    .map((r) => r.code);

  // VNINDEX is not in the watchlist table — checked separately (matches
  // ohlcvBackfillHandler.ts's existing FR-B2 pattern of checking VNINDEX depth
  // alongside watchlist depth).
  const vnindexMissing =
    !db
      .prepare<{ ok: number }, [string]>(
        "SELECT 1 as ok FROM daily_ohlcv WHERE code = 'VNINDEX' AND date = ?",
      )
      .get(expectedDate);

  if (missing.length === 0 && !vnindexMissing) {
    return { expectedDate, missingCodes: [], vnindexMissing: false, action: "none" };
  }

  try {
    const result = await recoverFn(expectedDate, { db });
    const missingList = [...missing.slice(0, 5), ...(vnindexMissing ? ["VNINDEX"] : [])];
    const totalMissing = missing.length + (vnindexMissing ? 1 : 0);
    await sendWorkFn(
      `[ohlcv-candle-guard] ${expectedDate} missing for ${totalMissing} code(s) ` +
        `(${missingList.join(",")}${missing.length > 5 ? ",..." : ""}) — catch-up action: ${result.action}`,
    );
    return { expectedDate, missingCodes: missing, vnindexMissing, action: result.action };
  } catch (err) {
    // Fail-loud: do not swallow a genuine recovery-path exception.
    await sendTelegramBug(
      `[ohlcv-candle-guard] catch-up FAILED for ${expectedDate}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}
