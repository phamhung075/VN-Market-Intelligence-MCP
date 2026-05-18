/**
 * Sprint 1949 Phase 4 — Cron Rewiring Tests
 * Tasks: 1949-T6, 1949-T7, 1949-T8
 *
 * AC coverage:
 *   TC-1 (T6): CRONS.foreignFlowAlert default = '13 8 * * 1-5' (08:13 UTC M-F)
 *   TC-2 (T6): env override CRON_FOREIGN_FLOW_ALERT respected
 *   TC-3 (T7): CRONS.macroIndicatorRefresh default = '13 19 * * *' (19:13 UTC daily)
 *   TC-4 (T7): env override CRON_MACRO_INDICATOR_REFRESH respected
 *   TC-5 (T8): foreignFlowAlert slot fires before EOD chef (08:37 UTC) — 24min window
 *   TC-6 (T8): macroIndicatorRefresh slot fires before Evening Preview (19:37 UTC) — 24min window
 *   TC-7 (T6): off-minute hygiene: new foreignFlowAlert slot is not :00/:17/:30 or interval
 *   TC-8 (T7): off-minute hygiene: new macroIndicatorRefresh slot is not :00/:17/:30 or interval
 *   TC-9 (T6): cron expression is weekday-only (1-5) for foreignFlowAlert
 */

import { describe, it, expect } from "bun:test";
import { CRONS } from "../scheduler/cronConfig.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Parse minute field from a cron expression like '13 8 * * 1-5' => 13.
// Returns the minute fragment (e.g. '0', '13', or interval patterns).
function parseCronMinuteField(expr: string): string {
  return expr.split(" ")[0]!;
}

// Parse hour field from a cron expression like '13 8 * * 1-5' => '8'.
function parseCronHourField(expr: string): string {
  return expr.split(" ")[1]!;
}

// Minute-field hygiene check.
// Returns true when minute is "clean" (not :00, :17, :30, or an interval pattern).
function isCleanMinute(minuteField: string): boolean {
  if (minuteField.includes("*")) return false; // catches */10, */5, etc.
  const m = parseInt(minuteField, 10);
  if (isNaN(m)) return false;
  if (m === 0 || m === 17 || m === 30) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-1: foreignFlowAlert default cron expression
// ─────────────────────────────────────────────────────────────────────────────

describe("1949-T6 — foreignFlowAlertJob cron rewiring", () => {
  it("TC-1: CRONS.foreignFlowAlert default = '13 8 * * 1-5' (08:13 UTC M-F)", () => {
    // When env override is absent, default must be new value.
    // We read the resolved CRONS value (env already applied at module load).
    const expected = Bun.env.CRON_FOREIGN_FLOW_ALERT ?? "13 8 * * 1-5";
    expect(CRONS.foreignFlowAlert).toBe(expected);
  });

  it("TC-2: env override CRON_FOREIGN_FLOW_ALERT is respected", () => {
    // CRONS.foreignFlowAlert must equal the env var when set.
    // The module already read Bun.env at load time; this confirms the fallback
    // chain is wired correctly.
    const envVal = Bun.env.CRON_FOREIGN_FLOW_ALERT;
    if (envVal !== undefined) {
      expect(CRONS.foreignFlowAlert).toBe(envVal);
    } else {
      expect(CRONS.foreignFlowAlert).toBe("13 8 * * 1-5");
    }
  });

  it("TC-7: off-minute hygiene — minute field is not :00, :17, :30, or interval", () => {
    const minuteField = parseCronMinuteField(CRONS.foreignFlowAlert);
    expect(isCleanMinute(minuteField)).toBe(true);
  });

  it("TC-9: weekday-only restriction — day-of-week field contains '1-5'", () => {
    const parts = CRONS.foreignFlowAlert.split(" ");
    const dowField = parts[4]; // 5th field = day-of-week
    expect(dowField).toBe("1-5");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-3: macroIndicatorRefresh default cron expression
// ─────────────────────────────────────────────────────────────────────────────

describe("1949-T7 — macroIndicatorRefreshJob cron rewiring", () => {
  it("TC-3: CRONS.macroIndicatorRefresh default = '13 19 * * *' (19:13 UTC daily)", () => {
    const expected = Bun.env.CRON_MACRO_INDICATOR_REFRESH ?? "13 19 * * *";
    expect(CRONS.macroIndicatorRefresh).toBe(expected);
  });

  it("TC-4: env override CRON_MACRO_INDICATOR_REFRESH is respected", () => {
    const envVal = Bun.env.CRON_MACRO_INDICATOR_REFRESH;
    if (envVal !== undefined) {
      expect(CRONS.macroIndicatorRefresh).toBe(envVal);
    } else {
      expect(CRONS.macroIndicatorRefresh).toBe("13 19 * * *");
    }
  });

  it("TC-8: off-minute hygiene — minute field is not :00, :17, :30, or interval", () => {
    const minuteField = parseCronMinuteField(CRONS.macroIndicatorRefresh);
    expect(isCleanMinute(minuteField)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-5/TC-6: timing window validation (24-min lead before chef slots)
// ─────────────────────────────────────────────────────────────────────────────

describe("1949-T8 — cook-window timing validation", () => {
  it("TC-5: foreignFlowAlert fires at hour 8 minute 13 — before EOD chef at 08:37 UTC (24min gap)", () => {
    // foreignFlowAlert = '13 8 * * 1-5'
    // EOD chef = 08:37 UTC
    // Gap = (8*60+37) - (8*60+13) = 24 minutes ≥ 10min minimum
    const parts = CRONS.foreignFlowAlert.split(" ");
    const minute = parseInt(parts[0]!, 10);
    const hour = parseInt(parts[1]!, 10);
    const gapToEodChef = (8 * 60 + 37) - (hour * 60 + minute);
    expect(gapToEodChef).toBeGreaterThanOrEqual(10);
    expect(hour).toBe(8); // must fire in hour 8 UTC
    expect(minute).toBeLessThan(37); // must fire before 08:37
  });

  it("TC-6: macroIndicatorRefresh fires at hour 19 minute 13 — before Evening Preview at 19:37 UTC (24min gap)", () => {
    // macroIndicatorRefresh = '13 19 * * *'
    // Evening Preview chef = 19:37 UTC
    // Gap = (19*60+37) - (19*60+13) = 24 minutes ≥ 10min minimum
    const parts = CRONS.macroIndicatorRefresh.split(" ");
    const minute = parseInt(parts[0]!, 10);
    const hour = parseInt(parts[1]!, 10);
    const gapToEveningChef = (19 * 60 + 37) - (hour * 60 + minute);
    expect(gapToEveningChef).toBeGreaterThanOrEqual(10);
    expect(hour).toBe(19); // must fire in hour 19 UTC
    expect(minute).toBeLessThan(37); // must fire before 19:37
  });
});
