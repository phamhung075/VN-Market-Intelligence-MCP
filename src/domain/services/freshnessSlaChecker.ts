/**
 * Domain Service — Data Freshness SLA Checker
 *
 * Pure business logic for checking SLA breach on signal source data freshness.
 * No I/O or infrastructure imports — accepts data age + thresholds as plain parameters.
 *
 * Task 234: Detects when signal sources exceed age thresholds and classifies severity.
 *
 * @module domain/services/freshnessSlaChecker
 */

/**
 * Signal source type names.
 */
export type SignalType = "price" | "bctc" | "news" | "sbv_fx" | "foreign_flow";

/**
 * SLA breach severity classification.
 */
export type BreachSeverity = "HIGH" | "CRITICAL";

/**
 * Result of checking a single signal type's freshness SLA.
 */
export interface SlaCheckResult {
  signalType: SignalType;
  ageMinutes: number;
  thresholdMinutes: number;
  status: "ok" | "breached";
  severity?: BreachSeverity; // only present when status='breached'
}

/**
 * Collection of SLA check results.
 */
export interface FreshnessSlaCheckOutput {
  checkedAt: string; // ISO 8601
  breaches: SlaCheckResult[];
  recoveries: SlaCheckResult[]; // signals that were breached but now recovered
}

/**
 * Per-signal-type SLA configuration.
 */
export interface SignalSlaConfig {
  signalType: SignalType;
  defaultThresholdMinutes: number;
  /** Market hours threshold (9:00-15:00 VN time). Optional override. */
  marketHoursThresholdMinutes?: number;
  /** Off-hours threshold (16:00-8:59 next day VN time). Optional override. */
  offHoursThresholdMinutes?: number;
}

/**
 * Default SLA thresholds (in minutes).
 *
 * - price: 10 min (market-critical)
 * - bctc: 120 min (market hours), 360 min (off-hours)
 * - news: 30 min
 * - sbv_fx: 30 min
 * - foreign_flow: 10 min (trading-critical)
 */
export const DEFAULT_SLA_CONFIG: SignalSlaConfig[] = [
  {
    signalType: "price",
    defaultThresholdMinutes: 10,
  },
  {
    signalType: "bctc",
    defaultThresholdMinutes: 120,
    marketHoursThresholdMinutes: 120,
    offHoursThresholdMinutes: 360,
  },
  {
    signalType: "news",
    defaultThresholdMinutes: 30,
  },
  {
    signalType: "sbv_fx",
    defaultThresholdMinutes: 30,
  },
  {
    signalType: "foreign_flow",
    defaultThresholdMinutes: 10,
  },
];

/**
 * Determines if current time is within VN market hours (09:00-15:00 UTC+7).
 *
 * @param now Current date/time
 * @returns true if between 09:00-15:00 VN time (= 02:00-08:00 UTC)
 */
export function isVnMarketHours(now: Date = new Date()): boolean {
  // VN time = UTC + 7 hours
  // Market hours: 09:00-15:00 VN = 02:00-08:00 UTC
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();

  // 02:00 UTC or later AND before 08:59 UTC
  if (utcHour < 2) return false;
  if (utcHour > 8) return false;
  if (utcHour === 2 && utcMin < 0) return false; // Edge case: never (min >= 0)
  if (utcHour === 8 && utcMin > 59) return false; // Edge case: never (min <= 59)

  return true;
}

/**
 * Gets the active SLA threshold for a signal type based on current time.
 *
 * @param signalType Signal type
 * @param config Configuration (defaults to DEFAULT_SLA_CONFIG)
 * @param now Current date/time for time-based thresholds
 * @returns SLA threshold in minutes
 */
export function getSlaThreshold(
  signalType: SignalType,
  config: SignalSlaConfig[] = DEFAULT_SLA_CONFIG,
  now: Date = new Date(),
): number {
  const cfg = config.find((c) => c.signalType === signalType);
  if (!cfg) return 60; // Fallback if not found

  // BCTC has time-based thresholds
  if (signalType === "bctc") {
    const marketHours = isVnMarketHours(now);
    if (marketHours && cfg.marketHoursThresholdMinutes !== undefined) {
      return cfg.marketHoursThresholdMinutes;
    }
    if (!marketHours && cfg.offHoursThresholdMinutes !== undefined) {
      return cfg.offHoursThresholdMinutes;
    }
  }

  return cfg.defaultThresholdMinutes;
}

/**
 * Classifies breach severity based on age relative to threshold.
 *
 * @param ageMinutes Data age in minutes
 * @param thresholdMinutes SLA threshold in minutes
 * @returns Severity classification
 *
 * - HIGH: age > threshold (exceeded)
 * - CRITICAL: age > threshold × 1.5 (severely exceeded)
 */
export function classifySeverity(
  ageMinutes: number,
  thresholdMinutes: number,
): BreachSeverity {
  const criticalThreshold = thresholdMinutes * 1.5;
  if (ageMinutes > criticalThreshold) {
    return "CRITICAL";
  }
  return "HIGH";
}

/**
 * Checks a single signal type for SLA breach.
 *
 * @param signalType Signal type
 * @param ageMinutes Data age in minutes
 * @param config SLA configuration (optional override per signal type)
 * @param now Current time (for time-based thresholds)
 * @returns SlaCheckResult
 */
export function checkSignalSla(
  signalType: SignalType,
  ageMinutes: number,
  config: SignalSlaConfig[] = DEFAULT_SLA_CONFIG,
  now: Date = new Date(),
): SlaCheckResult {
  const thresholdMinutes = getSlaThreshold(signalType, config, now);

  if (ageMinutes <= thresholdMinutes) {
    return {
      signalType,
      ageMinutes,
      thresholdMinutes,
      status: "ok",
    };
  }

  return {
    signalType,
    ageMinutes,
    thresholdMinutes,
    status: "breached",
    severity: classifySeverity(ageMinutes, thresholdMinutes),
  };
}

/**
 * Checks all signal types for SLA breaches.
 *
 * @param signalAges Map of signalType → ageMinutes
 * @param config SLA configuration (defaults to DEFAULT_SLA_CONFIG)
 * @param priorBreaches Prior SLA breach records (for recovery detection)
 * @param now Current time
 * @returns FreshnessSlaCheckOutput with breaches and recoveries
 */
export function checkDataFreshnessSla(
  signalAges: Record<SignalType, number>,
  config: SignalSlaConfig[] = DEFAULT_SLA_CONFIG,
  priorBreaches: Array<{ signalType: SignalType; status: "breach_open" | "recovered" }> = [],
  now: Date = new Date(),
): FreshnessSlaCheckOutput {
  const checkedAt = now.toISOString();
  const breaches: SlaCheckResult[] = [];
  const recoveries: SlaCheckResult[] = [];

  const signalTypes: SignalType[] = [
    "price",
    "bctc",
    "news",
    "sbv_fx",
    "foreign_flow",
  ];

  for (const signalType of signalTypes) {
    const ageMinutes = signalAges[signalType] ?? 0;
    const result = checkSignalSla(signalType, ageMinutes, config, now);

    if (result.status === "breached") {
      breaches.push(result);
    } else {
      // Check if this was previously breached
      const wasBreachy = priorBreaches.some(
        (b) => b.signalType === signalType && b.status === "breach_open",
      );
      if (wasBreachy) {
        recoveries.push(result);
      }
    }
  }

  return {
    checkedAt,
    breaches,
    recoveries,
  };
}
