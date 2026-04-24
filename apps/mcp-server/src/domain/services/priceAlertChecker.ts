/**
 * Task 206 — Price Alert Checker
 *
 * Pure domain service — no I/O, no SQLite imports.
 *
 * Compares a list of active price threshold alerts against a map of current
 * prices and returns the subset that have been triggered.
 *
 * Trigger rules:
 *   - stop_loss:   fires when currentPrice <= threshold
 *   - take_profit: fires when currentPrice >= threshold
 *
 * @module domain/services/priceAlertChecker
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal alert descriptor consumed by the checker (maps to price_alerts row). */
export interface PriceAlertInput {
  /** Primary key from price_alerts table. */
  id: number;
  /** Stock ticker, e.g. "VCB". */
  code: string;
  /** "stop_loss" | "take_profit" */
  alertType: string;
  /** Price level that triggers the alert (in VND). */
  threshold: number;
}

/** Describes a single alert that has been triggered. */
export interface TriggeredAlert {
  /** price_alerts.id of the triggered record. */
  alertId: number;
  /** Stock ticker. */
  code: string;
  /** "stop_loss" | "take_profit" */
  alertType: string;
  /** The configured trigger level (VND). */
  threshold: number;
  /** Live price at the time of evaluation (VND). */
  currentPrice: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate active price alerts against current market prices.
 *
 * @param alerts       - List of active price_alerts rows to check.
 * @param currentPrices - Map<stockCode, priceVND> of latest prices.
 * @returns Array of alerts that have met their trigger condition.
 */
export function checkPriceAlerts(
  alerts: PriceAlertInput[],
  currentPrices: Map<string, number>,
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const alert of alerts) {
    const currentPrice = currentPrices.get(alert.code);
    if (currentPrice === undefined) continue; // no price data — skip

    const isTriggered =
      alert.alertType === "stop_loss"
        ? currentPrice <= alert.threshold
        : alert.alertType === "take_profit"
          ? currentPrice >= alert.threshold
          : false; // unknown type — never trigger

    if (isTriggered) {
      triggered.push({
        alertId: alert.id,
        code: alert.code,
        alertType: alert.alertType,
        threshold: alert.threshold,
        currentPrice,
      });
    }
  }

  return triggered;
}
