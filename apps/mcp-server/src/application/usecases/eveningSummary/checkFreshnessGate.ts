/**
 * Evening Summary — Step 8: freshness gate. Suppresses the MARKET Telegram
 * send and alerts WORK when daily_ohlcv prices are >24h stale.
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * NOTE: deliberately NOT the same as morning briefing's
 * usecases/briefing/checkFreshnessGate.ts — the isPriceFresh label ("evening
 * summary" vs "briefing") and the WORK-channel message text ("Evening summary
 * suppressed" vs "Briefing suppressed") both differ (behavior preserved
 * verbatim from the pre-split assembleEveningSummary.ts).
 *
 * Layer: application/usecases/eveningSummary — may import from application/utils.
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
  const isFresh = await isPriceFresh(db, "evening summary");

  if (!isFresh && sendTelegramFn) {
    // Prices are stale — suppress MARKET send and alert WORK team
    logger.warn("[assembleEveningSummary] freshness gate: prices >24h stale, suppressing MARKET send");
    const row = db
      .prepare<{ latest: string | null }, []>("SELECT MAX(updated_at) as latest FROM daily_ohlcv")
      .get();
    await sendTelegramFn(
      "work",
      `[FRESHNESS GATE] Evening summary suppressed. Last price update: ${row?.latest ?? "unknown"}`
    );
  }
}
