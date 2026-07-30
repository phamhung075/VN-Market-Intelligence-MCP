/**
 * FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT (2026-07-30)
 *
 * ROOT CAUSE (confirmed by reading source, per AC-1): the bctc SLA threshold
 * was NOT a policy duration. In its off-hours/weekend/out-of-window branches,
 * getSlaThreshold("bctc", ...) returned
 * `minutesSinceLast{WindowEnd,EarningsWindowEnd}(now) + OFF_HOURS_GRACE_MINUTES`
 * — literally `now - T_anchor` for some FIXED past anchor timestamp
 * (T_anchor = last VN market-session close, or last earnings-window close).
 * Meanwhile `ageMinutes` (the numerator sla-monitor compares it against) is
 * `now - T_data` for the FIXED timestamp of the last real `financial_reports`
 * row. Both quantities are AGES that grow at the identical
 * 1-minute-per-minute rate as wall-clock `now` advances, so their difference
 *   ageMinutes - thresholdMinutes = (now - T_data) - (now - T_anchor + grace)
 *                                 = (T_anchor - T_data) - grace
 * is a TIME-INVARIANT CONSTANT for as long as no new bctc data arrives and
 * the day/hours regime doesn't flip. This is mechanically proven by
 * production data: 12 consecutive sla-monitor CRITICAL alerts sampled over a
 * 21h window (2026-07-24T17:00Z → 2026-07-25T14:00Z, all falling inside the
 * same VN-Saturday non-trading-day regime) had (stale - threshold) EXACTLY
 * equal to 5439 in every sample — i.e. T_anchor - T_data - 30 = 5439, so
 * T_anchor (that Friday's 08:59Z market close) was ~91.15h (5469 min) after
 * T_data (the actual last bctc parse). Because that gap never closes on its
 * own, the gate could never clear (AC-1 answer: "5439" is not a duration —
 * it is the fixed offset between two independently-anchored age clocks).
 *
 * FIX: getSlaThreshold("bctc") now returns one of exactly two FIXED,
 * config-sourced constants selected only by the isBctcEarningsWindowActive(now)
 * boolean gate — never a `minutesSinceX(now)` term:
 *   - earnings-filing window active  → 1440 min (24h)
 *   - earnings-filing window inactive → 10080 min (168h / 7d)
 * SSOT: docs/data/system-map.json .project.data_sources["bctc-discover"].sla
 * (mirrored on "bctc-push") — `earnings_window.stale_threshold_hours: 24` and
 * `default_stale_threshold_hours: 168`. These values pre-existed in the SSOT
 * but were never wired into DEFAULT_SLA_CONFIG; the code instead invented its
 * own (120/360-min, and the broken dynamic formula) values.
 *
 * AC-5 answer (configured bctc SLA duration, explicit): 1440 min (24h) while
 * an earnings-filing window is active; 10080 min (168h/7d) otherwise.
 *
 * @module __tests__/FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT
 */

import { describe, it, expect } from "bun:test";
import {
  getSlaThreshold,
  checkDataFreshnessSla,
  checkSignalSla,
  isBctcEarningsWindowActive,
  DEFAULT_SLA_CONFIG,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";

// ─── Time fixtures ────────────────────────────────────────────────────────────

/** Three timestamps >1h apart, all inside the April 1-14 earnings window,
 *  spanning market-hours, off-hours, and a weekend day. */
const IN_WINDOW_T1 = new Date("2026-04-08T03:00:00.000Z"); // Wed, market hours
const IN_WINDOW_T2 = new Date("2026-04-08T10:00:00.000Z"); // Wed, off-hours (+7h)
const IN_WINDOW_T3 = new Date("2026-04-11T12:00:00.000Z"); // Sat, weekend (+3 days)

/** Three timestamps >1h apart, all OUTSIDE any earnings window (June),
 *  spanning market-hours, off-hours, and a weekend day. */
const OUT_WINDOW_T1 = new Date("2026-06-04T04:30:00.000Z"); // Wed, market hours
const OUT_WINDOW_T2 = new Date("2026-06-04T10:00:00.000Z"); // Wed, off-hours (+5.5h)
const OUT_WINDOW_T3 = new Date("2026-06-06T12:00:00.000Z"); // Sat, weekend (+2 days)

const BASE_AGES: Record<SignalType, number> = {
  price: 0,
  bctc: 0,
  news: 0,
  sbv_fx: 0,
  foreign_flow: 0,
  vnstock_fundamentals: -1,
  bond_maturity: -1,
  commodity_prices: -1,
  broker_sanctions: -1,
  backtest_runs: -1,
  signal_quality_audit: -1,
  prediction_claims: -1,
};

// ─── AC-4: regression pin — DEFAULT_SLA_CONFIG cannot silently drift ────────

describe("FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT — AC-4: config pin", () => {
  it("pins the bctc entry's raw config to the SSOT-sourced constants (not a computed value)", () => {
    const cfg = DEFAULT_SLA_CONFIG.find((c) => c.signalType === "bctc");
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(10080); // 168h = 7d — SSOT default_stale_threshold_hours
    expect(cfg!.earningsWindowThresholdMinutes).toBe(1440); // 24h — SSOT earnings_window.stale_threshold_hours
    // Regression guard: the legacy fields that used to carry the buggy
    // market/off-hours split must never reappear on the bctc config entry.
    expect((cfg as unknown as Record<string, unknown>)["marketHoursThresholdMinutes"]).toBeUndefined();
    expect((cfg as unknown as Record<string, unknown>)["offHoursThresholdMinutes"]).toBeUndefined();
  });
});

// ─── AC-2: threshold is FIXED — constant across ≥3 emissions >1h apart ──────

describe("FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT — AC-2: threshold is a FIXED duration from config", () => {
  it("earnings-window ACTIVE: threshold is byte-identical across 3 emissions spanning market-hours/off-hours/weekend (>1h apart, up to 3 days apart)", () => {
    expect(isBctcEarningsWindowActive(IN_WINDOW_T1)).toBe(true);
    expect(isBctcEarningsWindowActive(IN_WINDOW_T2)).toBe(true);
    expect(isBctcEarningsWindowActive(IN_WINDOW_T3)).toBe(true);

    const t1 = getSlaThreshold("bctc", undefined, IN_WINDOW_T1);
    const t2 = getSlaThreshold("bctc", undefined, IN_WINDOW_T2);
    const t3 = getSlaThreshold("bctc", undefined, IN_WINDOW_T3);

    expect(t1).toBe(1440);
    expect(t2).toBe(1440);
    expect(t3).toBe(1440);
    expect(new Set([t1, t2, t3]).size).toBe(1); // same property bond_maturity/signal_quality_audit already satisfy
  });

  it("earnings-window INACTIVE: threshold is byte-identical across 3 emissions spanning market-hours/off-hours/weekend (>1h apart, up to 2 days apart)", () => {
    expect(isBctcEarningsWindowActive(OUT_WINDOW_T1)).toBe(false);
    expect(isBctcEarningsWindowActive(OUT_WINDOW_T2)).toBe(false);
    expect(isBctcEarningsWindowActive(OUT_WINDOW_T3)).toBe(false);

    const t1 = getSlaThreshold("bctc", undefined, OUT_WINDOW_T1);
    const t2 = getSlaThreshold("bctc", undefined, OUT_WINDOW_T2);
    const t3 = getSlaThreshold("bctc", undefined, OUT_WINDOW_T3);

    expect(t1).toBe(10080);
    expect(t2).toBe(10080);
    expect(t3).toBe(10080);
    expect(new Set([t1, t2, t3]).size).toBe(1);
  });

  it("does NOT reproduce the moving-second-clock shape: threshold at now+0 vs now+90 days (same window state) is identical, not offset by elapsed time", () => {
    // The old defect made threshold grow ~1min per elapsed min. Advancing
    // `now` by 90 days while remaining in the same (out-of-window) state
    // must NOT change the threshold at all under the fix.
    const now = new Date("2026-06-01T00:00:00.000Z");
    const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    // Both June 1 and ~Aug 30 are out-of-earnings-window months relative to
    // the [1,4,7,10] trigger set... guard with an explicit sanity check
    // instead of assuming, since Aug 30 could theoretically land differently
    // if trigger months ever change.
    expect(isBctcEarningsWindowActive(now)).toBe(false);
    expect(isBctcEarningsWindowActive(ninetyDaysLater)).toBe(false);

    const t1 = getSlaThreshold("bctc", undefined, now);
    const t2 = getSlaThreshold("bctc", undefined, ninetyDaysLater);
    expect(t1).toBe(10080);
    expect(t2).toBe(10080);
    expect(t1).toBe(t2); // NOT offset by the elapsed 90 days — this is the actual fix
  });
});

// ─── AC-3: BIDIRECTIONAL proof — gate CLEARS on fresh, FIRES on stale ───────

describe("FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT — AC-3: bidirectional proof (both regimes)", () => {
  it("earnings-window ACTIVE (1440-min threshold): fresh data (age=1439) CLEARS; stale data (age=1441) FIRES", () => {
    const fresh = checkDataFreshnessSla(
      { ...BASE_AGES, bctc: 1439 },
      undefined,
      [],
      IN_WINDOW_T1,
    );
    expect(fresh.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();

    const stale = checkDataFreshnessSla(
      { ...BASE_AGES, bctc: 1441 },
      undefined,
      [],
      IN_WINDOW_T1,
    );
    const breach = stale.breaches.find((b) => b.signalType === "bctc");
    expect(breach).toBeDefined();
    expect(breach!.status).toBe("breached");
    expect(breach!.thresholdMinutes).toBe(1440);
  });

  it("earnings-window INACTIVE (10080-min threshold): fresh data (age=10079) CLEARS; stale data (age=10081) FIRES", () => {
    const fresh = checkDataFreshnessSla(
      { ...BASE_AGES, bctc: 10079 },
      undefined,
      [],
      OUT_WINDOW_T1,
    );
    expect(fresh.breaches.find((b) => b.signalType === "bctc")).toBeUndefined();

    const stale = checkDataFreshnessSla(
      { ...BASE_AGES, bctc: 10081 },
      undefined,
      [],
      OUT_WINDOW_T1,
    );
    const breach = stale.breaches.find((b) => b.signalType === "bctc");
    expect(breach).toBeDefined();
    expect(breach!.status).toBe("breached");
    expect(breach!.thresholdMinutes).toBe(10080);
  });

  it("previously-breached bctc signal RECOVERS once a fresh push lands (age drops back under the fixed threshold)", () => {
    // Simulates the exact "gate can clear" property the pre-fix formula
    // structurally could not deliver: same `now`, same window-state, only
    // ageMinutes drops (a genuine new push arrived) — status flips from
    // breached to ok, and (with a prior breach_open record) is reported as
    // a recovery.
    const priorBreaches = [{ signalType: "bctc" as SignalType, status: "breach_open" as const }];

    const stillBreached = checkDataFreshnessSla(
      { ...BASE_AGES, bctc: 10081 },
      undefined,
      priorBreaches,
      OUT_WINDOW_T1,
    );
    expect(stillBreached.breaches.some((b) => b.signalType === "bctc")).toBe(true);

    const recovered = checkDataFreshnessSla(
      { ...BASE_AGES, bctc: 5 }, // fresh push just landed
      undefined,
      priorBreaches,
      OUT_WINDOW_T1,
    );
    expect(recovered.breaches.some((b) => b.signalType === "bctc")).toBe(false);
    expect(recovered.recoveries.some((b) => b.signalType === "bctc")).toBe(true);
  });
});

// ─── AC-1 corroboration: idle gate (unaffected by this fix) still short-circuits ──

describe("FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT — runtime-state idle gate is independent of the threshold fix", () => {
  it("service active + queue empty → 'idle' verdict regardless of which fixed threshold would otherwise apply", () => {
    const result = checkSignalSla("bctc", 999_999, undefined, OUT_WINDOW_T1, {
      serviceActive: true,
      queueDepth: 0,
    });
    expect(result.status).toBe("ok");
    expect(result.verdict).toBe("idle");
  });

  it("service confirmed down → 'crash' verdict regardless of age or window state", () => {
    const result = checkSignalSla("bctc", 5, undefined, IN_WINDOW_T1, {
      serviceActive: false,
      queueDepth: 0,
    });
    expect(result.status).toBe("breached");
    expect(result.verdict).toBe("crash");
    expect(result.severity).toBe("CRITICAL");
  });
});
