/**
 * FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H (2026-07-30)
 *
 * SURFACE SYMPTOM (mechanically verified from production, see PO evidence on
 * the board row): 37 unresolved [sla-monitor] CRITICAL breach alerts for
 * signal_quality_audit, staleness climbing 73217→76067min (~52.8 days) and
 * still growing, threshold constant at 2880min (48h) throughout.
 *
 * ROOT CAUSE — CORRECTED FROM THE ROW'S OWN HYPOTHESIS (read at source, do
 * not repeat the wrong premise): the row title assumed
 * signal_quality_audit.created_at tracks the same-named
 * `monthlySignalQualityAuditJob` cron (schedulerJobTable.ts:227,
 * cron `0 0 1 * *`, cronConfig.ts:129) and that the 48h threshold was simply
 * grading the wrong cadence class. That assumption is FALSE:
 *   - runMonthlySignalQualityJob() (scheduler/audits/monthlySignalQualityJob.ts)
 *     queries `signal_rejections` and sends a Telegram WORK report. It never
 *     writes to the `signal_quality_audit` table.
 *   - The ONLY writer of `signal_quality_audit` is insertSignalQualityAudit()
 *     (infrastructure/db/signalQualityAuditStore.ts), called from exactly one
 *     call site: interface/mcp/tools/news-analysis/agentSignalTools.ts's
 *     post_agent_signal handler — and ONLY when signal_type is
 *     'price_confirmation' or 'urgent_news' AND finding_data.confidence is a
 *     number.
 * So the table genuinely IS event-driven, matching the pre-fix code comment —
 * the defect is not a cadence-class mismatch. The defect is that the 48h
 * constant was too tight for how rarely qualifying agents actually post
 * those two signal types with a confidence field: live production DB history
 * (queried directly against the container's market.db, working around known
 * cron_job_runs page corruption via an indexed exact-match lookup — see
 * closing report) shows only 6 rows ever, with real gaps of >2 weeks between
 * them even in a "healthy" period, and zero rows since 2026-06-05T20:12Z
 * (~52.8 days as of this fix) — that 2026-06-05 timestamp, not any monthly
 * cron, is what the 76067min staleness figure backs out to.
 *
 * SEPARATE, CONFIRMED DEFECT (does not affect signal_quality_audit staleness,
 * documented here for completeness — see closing report for the follow-up):
 * cron_job_runs (queried via the idx_cron_job_runs_job_started index to work
 * around the table's known page corruption) shows monthlySignalQualityAuditJob
 * DID fire 2026-05-01 and 2026-06-01 (both status='success') but has NO row
 * for 2026-07-01 — the monthly cron genuinely missed its July fire, and
 * schedulerJobTable.ts:229 sets recoverMissedExecutions:false so it was never
 * backfilled. This is real, but it is a different bug from the one this file
 * pins (it never touches signal_quality_audit).
 *
 * FIX: signal_quality_audit's defaultThresholdMinutes is now 43200 (30 days)
 * — long enough to tolerate the observed real quiet-period length between
 * qualifying post_agent_signal calls, short enough that a genuine multi-week
 * dead spot (like the ~52.8-day one this fix was filed against) still fires.
 *
 * AC-1 (from the board row): fixture MAX(created_at) 20 days old must NOT
 * breach; 40 days old MUST breach. Both asserted below, bidirectionally.
 *
 * @module __tests__/FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H
 */

import { describe, it, expect } from "bun:test";
import {
  getSlaThreshold,
  checkSignalSla,
  checkDataFreshnessSla,
  DEFAULT_SLA_CONFIG,
  type SignalType,
} from "../domain/services/freshnessSlaChecker.js";

const NOW = new Date("2026-07-30T12:00:00.000Z");

const MIN_PER_DAY = 24 * 60;

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

describe("FIX-SLA-SIGNALQUALITYAUDIT-MONTHLY-CADENCE-MISCLASSIFIED-48H", () => {
  it("AC-4 (config pin): signal_quality_audit defaultThresholdMinutes is 43200 (30d), no earnings-window override", () => {
    const cfg = DEFAULT_SLA_CONFIG.find((c) => c.signalType === "signal_quality_audit");
    expect(cfg).toBeDefined();
    expect(cfg!.defaultThresholdMinutes).toBe(30 * MIN_PER_DAY);
    expect(cfg!.earningsWindowThresholdMinutes).toBeUndefined();
  });

  it("getSlaThreshold('signal_quality_audit') is a FIXED 43200min regardless of time-of-day/weekday (not a calendar-derived age term)", () => {
    const weekdayMarketHours = new Date("2026-07-29T04:00:00.000Z"); // Wed, in VN market hours
    const weekendOffHours = new Date("2026-08-01T20:00:00.000Z"); // Sat, off-hours
    expect(getSlaThreshold("signal_quality_audit", DEFAULT_SLA_CONFIG, weekdayMarketHours)).toBe(43200);
    expect(getSlaThreshold("signal_quality_audit", DEFAULT_SLA_CONFIG, weekendOffHours)).toBe(43200);
  });

  it("AC-1a: MAX(created_at) 20 days old does NOT breach", () => {
    const ageMinutes = 20 * MIN_PER_DAY; // 28800
    const result = checkSignalSla("signal_quality_audit", ageMinutes, DEFAULT_SLA_CONFIG, NOW);
    expect(result.status).toBe("ok");
    expect(result.thresholdMinutes).toBe(43200);
  });

  it("AC-1b: MAX(created_at) 40 days old DOES breach", () => {
    const ageMinutes = 40 * MIN_PER_DAY; // 57600
    const result = checkSignalSla("signal_quality_audit", ageMinutes, DEFAULT_SLA_CONFIG, NOW);
    expect(result.status).toBe("breached");
    expect(result.severity).toBeDefined();
    expect(result.thresholdMinutes).toBe(43200);
  });

  it("AC-1 bidirectional, via the full checkDataFreshnessSla pipeline: 20d fixture produces zero breaches, 40d fixture produces exactly one", () => {
    const ages20d: Record<SignalType, number> = { ...BASE_AGES, signal_quality_audit: 20 * MIN_PER_DAY };
    const ages40d: Record<SignalType, number> = { ...BASE_AGES, signal_quality_audit: 40 * MIN_PER_DAY };

    const result20d = checkDataFreshnessSla(ages20d, DEFAULT_SLA_CONFIG, [], NOW);
    const result40d = checkDataFreshnessSla(ages40d, DEFAULT_SLA_CONFIG, [], NOW);

    expect(result20d.breaches.find((b) => b.signalType === "signal_quality_audit")).toBeUndefined();
    const breach40d = result40d.breaches.find((b) => b.signalType === "signal_quality_audit");
    expect(breach40d).toBeDefined();
    expect(breach40d!.ageMinutes).toBe(40 * MIN_PER_DAY);
  });

  it("does not silently widen the threshold past the real confirmed defect: a ~52.8-day gap (the production figure this fix was filed against) still breaches CRITICAL", () => {
    const ageMinutes = 76067; // production staleness figure from the board row's evidence
    const result = checkSignalSla("signal_quality_audit", ageMinutes, DEFAULT_SLA_CONFIG, NOW);
    expect(result.status).toBe("breached");
    expect(result.severity).toBe("CRITICAL"); // 76067 > 43200 * 1.5 = 64800
  });

  it("boundary: exactly 30 days (43200min) old is still OK (age <= threshold, not strictly greater)", () => {
    const result = checkSignalSla("signal_quality_audit", 43200, DEFAULT_SLA_CONFIG, NOW);
    expect(result.status).toBe("ok");
  });

  it("boundary: 30 days + 1 minute breaches (HIGH, not yet CRITICAL)", () => {
    const result = checkSignalSla("signal_quality_audit", 43201, DEFAULT_SLA_CONFIG, NOW);
    expect(result.status).toBe("breached");
    expect(result.severity).toBe("HIGH");
  });
});
