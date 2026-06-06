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
 * - price: 10 min during market hours; off-hours uses dynamic window threshold (see getSlaThreshold)
 * - bctc: 120 min (market hours), 360 min (off-hours)
 * - news: 30 min
 * - sbv_fx: 30 min
 * - foreign_flow: 10 min during market hours; off-hours uses dynamic window threshold
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
    // off-hours: dynamically computed via getSlaThreshold (window-aware)
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
    // off-hours: dynamically computed via getSlaThreshold (window-aware)
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

// ─────────────────────────────────────────────────────────────────────────────
// Market-hours-only source logic (FIX-SLA-WEEKEND-AWARE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signal source types that are ONLY active during VN market hours.
 *
 * The VPS fetch loops for these sources are gated Mon–Fri 02:00–08:59 UTC
 * (dow<=5 && hour 02-08Z — confirmed by ops-vps-fetch SSH recon 45641b7a).
 * Outside that window, staleness is BY DESIGN — the SLA clock should measure
 * against the last expected push slot, not wall-clock now.
 *
 * Sources: "price" (prices every ~60s during session),
 *          "foreign_flow" (embedded in same VPS price push).
 */
export const MARKET_HOURS_ONLY_SOURCES: ReadonlySet<SignalType> = new Set([
  "price",
  "foreign_flow",
]);

/**
 * News sources that are only published during VN publisher active hours.
 *
 * VN news publishers are quiet overnight (VN 22:00–07:00 = UTC 15:00–00:00).
 * Active window: Mon–Sun 00:00–15:00 UTC (07:00–22:00 VN time).
 * The tight 30-min SLA only applies during active hours; outside that window
 * the SLA clock measures against the last expected publish slot.
 *
 * Source: "news" (rag_analyses — scraped from VN news portals via VPS).
 */
export const NEWS_QUIET_HOURS_SOURCES: ReadonlySet<SignalType> = new Set([
  "news",
]);

/**
 * SBV FX sources that are only published on VN business days (Mon–Fri).
 *
 * SBV publishes daily USD/VND fixing rates on business days only.
 * On weekends and public holidays no new rates are published — staleness
 * on those days is BY DESIGN.
 *
 * Source: "sbv_fx" (sbv_rates table — fetched from SBV official portal).
 */
export const SBV_BUSINESS_DAY_ONLY_SOURCES: ReadonlySet<SignalType> = new Set([
  "sbv_fx",
]);

/**
 * Grace period added on top of "time since last window end" when computing the
 * off-hours SLA threshold.  Allows for minor clock skew and the last-push lag
 * before the cron window actually fires.
 */
const OFF_HOURS_GRACE_MINUTES = 30;

/**
 * Returns the UTC Date of the most recent VN market-session close before `now`.
 *
 * The VPS push window ends at 08:59 UTC (= 15:59 VN time).
 * We scan backwards up to 7 days to find the last trading-day close.
 *
 * Edge cases handled:
 *   - Weekend (Sat/Sun) → last Friday 08:59Z
 *   - Public holiday → the last working day's 08:59Z
 *   - During active window (02:00–08:59Z weekday) → previous trading day 08:59Z
 *     (the current push cycle is OPEN so current data is expected fresh within 10 min)
 *
 * @param now Current time (overridable for testing)
 * @returns Date representing the most recent expected window-end timestamp
 */
export function lastExpectedWindowEnd(now: Date = new Date()): Date {
  // If we are currently IN the market window, the previous window ended
  // yesterday (or last trading day) — the current window is still live.
  // If we are OUTSIDE the window, last close is today's 08:59Z if it was a
  // trading day, otherwise the last trading day's 08:59Z.

  const WINDOW_END_UTC_HOUR = 8;
  const WINDOW_END_UTC_MIN = 59;

  // Build candidate "today at 08:59Z"
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    WINDOW_END_UTC_HOUR,
    WINDOW_END_UTC_MIN,
    0,
    0,
  ));

  // Walk backwards until we find a trading-day window-end that is in the past
  // (strictly before `now` if in market hours, or <= now if already past close).
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const windowEnd = new Date(candidate.getTime() - daysBack * 24 * 60 * 60 * 1000);
    // Must be in the past
    if (windowEnd >= now) continue;
    // Must be a trading day
    if (isVnTradingDay(windowEnd)) {
      return windowEnd;
    }
  }

  // Fallback: should never be reached with up to 7 days scan
  return new Date(candidate.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * Returns minutes elapsed since the last expected VN market window closed.
 *
 * Used to compute the off-hours SLA threshold for market-hours-only sources.
 * Outside the active window the "expected age" of data is at most
 * (minutesSinceLastWindowEnd + grace), not 10 minutes.
 *
 * @param now Current time (overridable for testing)
 * @returns Non-negative minutes since last window end
 */
export function minutesSinceLastWindowEnd(now: Date = new Date()): number {
  const windowEnd = lastExpectedWindowEnd(now);
  const ms = now.getTime() - windowEnd.getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

// ─────────────────────────────────────────────────────────────────────────────
// News publisher quiet-hours logic (FIX-SLA-EXEMPT-NEWS-SBVFX)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if now falls within VN news publisher active hours.
 *
 * VN news portals publish actively during day/evening (07:00–22:00 VN time).
 * Quiet period: overnight VN 22:00–07:00 = UTC 15:00–00:00 (next day).
 * Active window (UTC): 00:00–14:59 UTC (= 07:00–21:59 VN).
 *
 * Note: news publishing is 7 days a week (unlike market hours which are Mon–Fri).
 * We do NOT gate on isVnTradingDay here — weekend news is still published.
 *
 * @param now Current date/time (UTC)
 * @returns true during 00:00–14:59 UTC (07:00–21:59 VN time)
 */
export function isVnNewsPublishHours(now: Date = new Date()): boolean {
  const utcHour = now.getUTCHours();
  // 00:00 UTC (07:00 VN) to 14:59 UTC (21:59 VN) = publish window
  // 15:00 UTC (22:00 VN) onward = quiet hours
  return utcHour < 15;
}

/**
 * Returns the UTC Date of the most recent VN news publisher window close.
 *
 * The news publish window ends at 14:59 UTC (21:59 VN time) every day.
 * Unlike market sessions, news publishes 7 days/week.
 *
 * @param now Current time (overridable for testing)
 * @returns Date representing the most recent expected news window-end timestamp
 */
export function lastExpectedNewsWindowEnd(now: Date = new Date()): Date {
  const NEWS_WINDOW_END_UTC_HOUR = 14;
  const NEWS_WINDOW_END_UTC_MIN = 59;

  // Candidate: today at 14:59 UTC
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    NEWS_WINDOW_END_UTC_HOUR,
    NEWS_WINDOW_END_UTC_MIN,
    0,
    0,
  ));

  // Scan backwards up to 7 days for a window-end that is strictly in the past
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const windowEnd = new Date(candidate.getTime() - daysBack * 24 * 60 * 60 * 1000);
    if (windowEnd < now) {
      return windowEnd;
    }
  }

  // Fallback (should never be reached)
  return new Date(candidate.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * Returns minutes elapsed since the last expected VN news publish window closed.
 *
 * @param now Current time (overridable for testing)
 * @returns Non-negative minutes since last news window end
 */
export function minutesSinceLastNewsWindowEnd(now: Date = new Date()): number {
  const windowEnd = lastExpectedNewsWindowEnd(now);
  const ms = now.getTime() - windowEnd.getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

// ─────────────────────────────────────────────────────────────────────────────
// SBV FX business-day logic (FIX-SLA-EXEMPT-NEWS-SBVFX)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the UTC Date of the most recent VN SBV business-day close.
 *
 * SBV publishes FX rates on business days only (Mon–Fri, excluding VN holidays).
 * The SBV daily fixing is published by end of business day (17:00 VN = 10:00 UTC).
 * We use end-of-business-day as the expected publish window end.
 *
 * @param now Current time (overridable for testing)
 * @returns Date representing the most recent expected SBV publish slot
 */
export function lastExpectedSbvWindowEnd(now: Date = new Date()): Date {
  const SBV_WINDOW_END_UTC_HOUR = 10; // 17:00 VN = 10:00 UTC
  const SBV_WINDOW_END_UTC_MIN = 0;

  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    SBV_WINDOW_END_UTC_HOUR,
    SBV_WINDOW_END_UTC_MIN,
    0,
    0,
  ));

  // Walk backwards to find last business-day window-end strictly before now
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const windowEnd = new Date(candidate.getTime() - daysBack * 24 * 60 * 60 * 1000);
    if (windowEnd >= now) continue;
    if (isVnTradingDay(windowEnd)) {
      return windowEnd;
    }
  }

  return new Date(candidate.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * Returns minutes elapsed since the last expected SBV FX rate publish slot.
 *
 * @param now Current time (overridable for testing)
 * @returns Non-negative minutes since last SBV window end
 */
export function minutesSinceLastSbvWindowEnd(now: Date = new Date()): number {
  const windowEnd = lastExpectedSbvWindowEnd(now);
  const ms = now.getTime() - windowEnd.getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

/**
 * Returns true if now is within SBV business hours (Mon–Fri VN trading day,
 * before or at the expected daily publish time).
 *
 * We consider SBV "active" during any VN trading day (same weekday+holiday gate
 * as the market, since SBV is closed on the same public holidays).
 *
 * @param now Current date/time (UTC)
 * @returns true if today is a VN trading day
 */
export function isVnSbvBusinessDay(now: Date = new Date()): boolean {
  return isVnTradingDay(now);
}

/**
 * Gets the active SLA threshold for a signal type based on current time.
 *
 * For market-hours-only sources (price, foreign_flow):
 *   - During market hours (Mon–Fri 02:00–08:59 UTC): returns 10 min (tight real-time SLA)
 *   - Outside market hours: returns (minutesSinceLastWindowEnd + OFF_HOURS_GRACE_MINUTES)
 *     This means data that was pushed before the last window close is always "ok",
 *     and staleness only fires if data is OLDER than the last expected push slot.
 *     Edge case: Monday 03:00Z with no push since Friday is stale
 *     (Friday close was ~70h ago → threshold ≈ 4230 min, but age since Friday = ~4200 min,
 *      so it passes if Friday data arrived; if no data at all → age = 0 sentinel → skipped).
 *     Wait — re-read: if Friday pushed at 08:59Z and it is now Monday 03:00Z,
 *     age ≈ (Mon 03:00 − Fri 08:59) = ~66h = 3960 min.
 *     minutesSinceLastWindowEnd(Mon 03:00Z) → last window = Mon 08:59Z? No — Mon 03:00Z
 *     is INSIDE the Mon window (02:00-08:59Z) so lastExpectedWindowEnd returns Fri 08:59Z
 *     → minutesSince ≈ 66h×60 = 3960 min.  threshold = 3960 + 30 = 3990 min.
 *     But a REAL stale case on Monday mid-session: if no new data has been pushed since
 *     Friday (age = 3960 min) the threshold is 3990 min → still "ok" — this is WRONG.
 *
 *     The correct Monday-stale check: DURING market hours the tight 10-min threshold
 *     applies. At 03:00Z the window is OPEN so the 10-min tight SLA fires → stale if
 *     no push within 10 min of session open. Friday data that is 66h old will then
 *     breach the 10-min market-hours threshold → CRITICAL as expected.
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

  // Market-hours-only sources (price, foreign_flow):
  // During the active VPS fetch window → tight 10-min SLA.
  // Outside the window → data is expected stale; threshold = time-since-last-window-end
  // plus a small grace so that correctly-pushed end-of-session data stays "ok".
  if (MARKET_HOURS_ONLY_SOURCES.has(signalType)) {
    if (isVnMarketHours(now)) {
      return cfg.defaultThresholdMinutes; // tight real-time SLA (10 min)
    }
    // Off-hours: SLA = how long ago the last window ended + grace.
    // Data pushed at/before window close is always within this threshold.
    const sinceWindowEnd = minutesSinceLastWindowEnd(now);
    return sinceWindowEnd + OFF_HOURS_GRACE_MINUTES;
  }

  // News: quiet overnight (VN 22:00–07:00 = UTC 15:00–00:00).
  // During active publish hours (UTC 00:00–14:59): tight 30-min SLA.
  // During quiet hours: threshold = time since last news window end + grace.
  if (NEWS_QUIET_HOURS_SOURCES.has(signalType)) {
    if (isVnNewsPublishHours(now)) {
      return cfg.defaultThresholdMinutes; // tight SLA during publish hours (30 min)
    }
    const sinceNewsWindowEnd = minutesSinceLastNewsWindowEnd(now);
    return sinceNewsWindowEnd + OFF_HOURS_GRACE_MINUTES;
  }

  // SBV FX: published on VN business days only.
  // On a trading day: tight 30-min SLA (SBV updates once per day — allow up to 30 min).
  // On a non-trading day (weekend/holiday): threshold = time since last SBV publish + grace.
  if (SBV_BUSINESS_DAY_ONLY_SOURCES.has(signalType)) {
    if (isVnSbvBusinessDay(now)) {
      return cfg.defaultThresholdMinutes; // tight SLA on business days (30 min)
    }
    const sinceSbvWindowEnd = minutesSinceLastSbvWindowEnd(now);
    return sinceSbvWindowEnd + OFF_HOURS_GRACE_MINUTES;
  }

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
