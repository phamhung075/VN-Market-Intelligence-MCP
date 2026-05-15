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
 *
 * Original 5 types (Task 234):
 *   price, bctc, news, sbv_fx, foreign_flow
 *
 * Sprint 1920 additions (Task 1920i):
 *   vnstock_fundamentals — monitors vnstock_financials.fetched_at (weekly; 72h SLA)
 *   bond_maturity        — monitors bond_maturity.updated_at (weekly; 168h SLA)
 *   commodity_prices     — monitors commodity_prices.fetched_at (daily; 36h SLA)
 *   broker_sanctions     — monitors broker_sanctions.created_at (quarterly; 2160h SLA)
 *   backtest_runs        — monitors backtest_runs.run_at (daily; 36h SLA)
 *   signal_quality_audit — monitors signal_quality_audit.created_at (event-driven; 48h SLA)
 *   prediction_claims    — monitors prediction_claims.created_at (event-driven; 168h SLA)
 */
export type SignalType =
  | "price"
  | "bctc"
  | "news"
  | "sbv_fx"
  | "foreign_flow"
  | "vnstock_fundamentals"
  | "bond_maturity"
  | "commodity_prices"
  | "broker_sanctions"
  | "backtest_runs"
  | "signal_quality_audit"
  | "prediction_claims";

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
 * Original 5 types (Task 234):
 * - price: 10 min (market-critical)
 * - bctc: 120 min (market hours), 360 min (off-hours)
 * - news: 30 min
 * - sbv_fx: 30 min
 * - foreign_flow: 10 min (trading-critical)
 *
 * Sprint 1920 additions (Task 1920i):
 * - vnstock_fundamentals: 4320 min = 72h (quarterly data; SLA = 3 days after dispatch)
 * - bond_maturity: 10080 min = 168h (weekly poll; SLA = 7 days)
 * - commodity_prices: 2160 min = 36h (daily cadence + 1.5× window)
 * - broker_sanctions: 129600 min = 2160h = 90 days (quarterly; observability only)
 * - backtest_runs: 2160 min = 36h (daily job + 1.5× window)
 * - signal_quality_audit: 2880 min = 48h (event-driven; tolerate quiet periods)
 * - prediction_claims: 10080 min = 168h (weekly minimum cadence)
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
  // ── Sprint 1920 additions ─────────────────────────────────────────────────
  {
    signalType: "vnstock_fundamentals",
    defaultThresholdMinutes: 72 * 60, // 4320 min = 72h
  },
  {
    signalType: "bond_maturity",
    defaultThresholdMinutes: 168 * 60, // 10080 min = 7 days
  },
  {
    signalType: "commodity_prices",
    defaultThresholdMinutes: 36 * 60, // 2160 min = 36h (daily + 1.5× window)
  },
  {
    signalType: "broker_sanctions",
    defaultThresholdMinutes: 2160 * 60, // 129600 min = 90 days (quarterly)
  },
  {
    signalType: "backtest_runs",
    defaultThresholdMinutes: 36 * 60, // 2160 min = 36h (daily + 1.5× window)
  },
  {
    signalType: "signal_quality_audit",
    defaultThresholdMinutes: 48 * 60, // 2880 min = 48h (event-driven)
  },
  {
    signalType: "prediction_claims",
    defaultThresholdMinutes: 168 * 60, // 10080 min = 7 days (weekly minimum)
  },
];

/**
 * VN public holidays — fixed Gregorian dates (YYYY-MM-DD in VN timezone).
 * Update annually per official decree. Entries must cover the current calendar year.
 */
const VN_PUBLIC_HOLIDAYS: ReadonlySet<string> = new Set([
  // New Year's Day
  "2026-01-01",
  // Hung Kings Commemoration
  "2026-04-07",
  // Liberation Day + Labour Day
  "2026-04-30", "2026-05-01",
  // National Day
  "2026-09-02",
  // Tet 2026 (provisional)
  "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30",
  "2026-01-31", "2026-02-01", "2026-02-02",
]);

function toVnDateString(now: Date): string {
  const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
  const vnDate = new Date(vnMs);
  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isVnTradingDay(now: Date = new Date()): boolean {
  const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
  const vnDate = new Date(vnMs);
  const dayOfWeek = vnDate.getUTCDay(); // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !VN_PUBLIC_HOLIDAYS.has(toVnDateString(now));
}

/**
 * Determines if current time is within VN market hours (09:00-15:00 UTC+7).
 *
 * @param now Current date/time
 * @returns true if between 09:00-15:00 VN time (= 02:00-08:00 UTC), on a VN trading day
 */
export function isVnMarketHours(now: Date = new Date()): boolean {
  if (!isVnTradingDay(now)) return false;

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
 * Sentinel guard: if ageMinutes === -1 the table has zero rows (not yet seeded).
 * These are silently skipped — no breach recorded, no escalation fired (FR-4).
 *
 * @param signalAges Map of signalType → ageMinutes (-1 = not seeded)
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

  // All monitored signal types (5 original + 7 Sprint-1920 additions)
  const signalTypes: SignalType[] = [
    "price",
    "bctc",
    "news",
    "sbv_fx",
    "foreign_flow",
    "vnstock_fundamentals",
    "bond_maturity",
    "commodity_prices",
    "broker_sanctions",
    "backtest_runs",
    "signal_quality_audit",
    "prediction_claims",
  ];

  for (const signalType of signalTypes) {
    const ageMinutes = signalAges[signalType] ?? 0;

    // FR-4: sentinel -1 means table has zero rows (not yet seeded).
    // Skip entirely — do not record as breach, do not fire escalation.
    if (ageMinutes === -1) {
      console.debug(
        `[sla-monitor] ${signalType}: not seeded yet (age=-1), skipping SLA check`
      );
      continue;
    }

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
