/**
 * Morning Briefing — freshness gate step: suppresses the MARKET Telegram send
 * and alerts WORK when daily_ohlcv prices are >24h stale.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (formerly the
 * unlabeled trailing "Step 14" — a numbering collision with the real Step 14
 * insiderRecent above it, pre-existing in the source; not renumbered here to
 * avoid unrelated churn) — FACTORY-APP-split-assembleBriefing.
 *
 * Layer: application/usecases/briefing — may import from application/utils.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { isPriceFresh } from "../../utils/priceFreshnessGate.js";

/**
 * Checks price freshness; when stale AND a Telegram sender is provided,
 * suppresses the MARKET send and posts a WORK-channel warning instead.
 */
export async function checkFreshnessGate(
  db: Database,
  sendTelegramFn?: (channel: string, message: string) => Promise<void>,
): Promise<void> {
  const isFresh = await isPriceFresh(db, "briefing");

  if (!isFresh && sendTelegramFn) {
    // Prices are stale — suppress MARKET send and alert WORK team
    logger.warn("[assembleBriefing] freshness gate: prices >24h stale, suppressing MARKET send");
    const row = db
      .prepare<{ latest: string | null }, []>("SELECT MAX(updated_at) as latest FROM daily_ohlcv")
      .get();
    await sendTelegramFn(
      "work",
      `[FRESHNESS GATE] Briefing suppressed. Last price update: ${row?.latest ?? "unknown"}`
    );
  }
}
