/**
 * Task 915 — Forecast Confidence Score
 *
 * Pure domain function that discounts a broker/analyst forecast confidence
 * score based on whether the broker is currently under SSC sanction.
 *
 * Use case: On 2026-04-06 TVS (Chứng khoán Tân Việt) issued a bullish Q1
 * sector forecast the same day cafef ran "Vì sao Chứng khoán Tân Việt bị
 * xử phạt?" — TVS was fined by SSC. The forecast had been fed into cascade
 * analysis at full weight. Broker credibility should be discounted when the
 * broker is currently under SSC sanction.
 *
 * Discount table (severity → multiplier applied to baseConfidence):
 *   - none       → 1.00  (no active sanction)
 *   - warning    → 0.50  (active SSC warning / fine)
 *   - suspension → 0.20  (active SSC suspension of operations)
 *
 * A broker with severity=suspension therefore keeps 20% of its base weight.
 *
 * @module domain/services/forecastConfidenceScore
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SanctionSeverity = "warning" | "suspension";

export interface BrokerSanction {
  /** Broker legal / display name (e.g. "Chứng khoán Tân Việt"). */
  brokerName: string;
  /** ISO date (YYYY-MM-DD) when sanction became effective. */
  sanctionStart: string;
  /** ISO date (YYYY-MM-DD) when sanction expires. Null = open-ended. */
  sanctionEnd: string | null;
  /** Severity level. */
  severity: SanctionSeverity;
  /** Optional source URL / description. */
  source?: string;
}

export interface ConfidenceDiscount {
  /** Original confidence (unchanged if no active sanction). */
  baseConfidence: number;
  /** Discounted confidence = baseConfidence * multiplier. */
  adjustedConfidence: number;
  /** Multiplier applied (1.0 if no active sanction). */
  multiplier: number;
  /** Reason string, Vietnamese, for logs / UI. */
  reason: string;
  /** The sanction that triggered the discount, if any. */
  activeSanction: BrokerSanction | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants — discount multipliers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multiplier applied when the broker has an active SSC sanction.
 * Keep as exported const so tests and cascade wire-in use the same numbers.
 */
export const SANCTION_MULTIPLIER: Record<SanctionSeverity, number> = {
  warning: 0.5,
  suspension: 0.2,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `asOf` falls within [sanctionStart, sanctionEnd].
 * Null sanctionEnd is treated as "open-ended" (still active).
 * All dates are compared as ISO `YYYY-MM-DD` strings so lexical comparison
 * is equivalent to chronological comparison.
 */
export function isSanctionActive(
  sanction: BrokerSanction,
  asOf: string,
): boolean {
  if (asOf < sanction.sanctionStart) return false;
  if (sanction.sanctionEnd !== null && asOf > sanction.sanctionEnd) return false;
  return true;
}

/**
 * Pick the strictest active sanction for a broker on a given date.
 * "Strictest" = lowest multiplier (suspension beats warning).
 */
export function pickStrictestActiveSanction(
  sanctions: readonly BrokerSanction[],
  asOf: string,
): BrokerSanction | null {
  const active = sanctions.filter((s) => isSanctionActive(s, asOf));
  if (active.length === 0) return null;

  let strictest = active[0]!;
  let strictestMult = SANCTION_MULTIPLIER[strictest.severity];
  for (let i = 1; i < active.length; i++) {
    const s = active[i]!;
    const m = SANCTION_MULTIPLIER[s.severity];
    if (m < strictestMult) {
      strictest = s;
      strictestMult = m;
    }
  }
  return strictest;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a confidence discount for a broker's forecast.
 *
 * @param brokerName       - Broker name (case-insensitive exact match)
 * @param baseConfidence   - Original confidence score (typically 0.0-1.0)
 * @param sanctions        - All known sanctions for this broker
 * @param asOf             - Date to evaluate (YYYY-MM-DD), usually "today"
 */
export function forecastConfidenceScore(
  brokerName: string,
  baseConfidence: number,
  sanctions: readonly BrokerSanction[],
  asOf: string,
): ConfidenceDiscount {
  if (!Number.isFinite(baseConfidence)) {
    throw new TypeError("baseConfidence must be a finite number");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new TypeError(`asOf must be YYYY-MM-DD, got: ${asOf}`);
  }

  const normalizedName = brokerName.trim().toLowerCase();
  const forBroker = sanctions.filter(
    (s) => s.brokerName.trim().toLowerCase() === normalizedName,
  );

  const active = pickStrictestActiveSanction(forBroker, asOf);
  if (active === null) {
    return {
      baseConfidence,
      adjustedConfidence: baseConfidence,
      multiplier: 1,
      reason: "Không có chế tài SSC đang hiệu lực",
      activeSanction: null,
    };
  }

  const multiplier = SANCTION_MULTIPLIER[active.severity];
  const adjustedConfidence = baseConfidence * multiplier;
  const severityLabel =
    active.severity === "suspension" ? "đình chỉ hoạt động" : "cảnh cáo / xử phạt";

  return {
    baseConfidence,
    adjustedConfidence,
    multiplier,
    reason: `Broker đang bị SSC ${severityLabel} (${active.sanctionStart}${active.sanctionEnd ? ` → ${active.sanctionEnd}` : " → mở"})`,
    activeSanction: active,
  };
}
