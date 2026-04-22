import { describe, it, expect } from "bun:test";
import { shouldSuppressAlert } from "../domain/services/alertCooldown.js";

describe("Task 1276 — Macro cooldown bypass fix", () => {
  // ── AC-1: Macro alert suppressed when same signal within 30-min window ────
  it("AC-1: MACRO alert with severity=critical is suppressed by 10-min old alert", () => {
    const alert = {
      stocks: ["MACRO"],
      signalTypes: ["macro_deviation"],
      severity: "critical", // MACRO alerts are "critical" (not downgraded)
    };

    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const recentAlerts = [
      {
        stocks: "MACRO",
        signalTypes: "macro_deviation",
        triggeredAt: tenMinAgo,
      },
    ];

    const result = shouldSuppressAlert(alert, recentAlerts, {
      cooldownMinutes: 30,
      maxAlertsPerStockPerDay: 5,
    });
    expect(result).toBe(true); // Must be suppressed
  });

  // ── AC-2: Macro alert NOT suppressed outside 30-min window ────────────────
  it("AC-2: MACRO alert with severity=critical is NOT suppressed by 35-min old alert", () => {
    const alert = {
      stocks: ["MACRO"],
      signalTypes: ["macro_deviation"],
      severity: "critical",
    };

    const thirtyFiveMinAgo = new Date(
      Date.now() - 35 * 60_000
    ).toISOString();
    const recentAlerts = [
      {
        stocks: "MACRO",
        signalTypes: "macro_deviation",
        triggeredAt: thirtyFiveMinAgo,
      },
    ];

    const result = shouldSuppressAlert(alert, recentAlerts, {
      cooldownMinutes: 30,
      maxAlertsPerStockPerDay: 5,
    });
    expect(result).toBe(false); // Outside window — must NOT suppress
  });

  // ── AC-3: Different signal types do not suppress each other ─────────────────
  it("AC-3: MACRO alert with macro_high_volatility is NOT suppressed by prior macro_deviation alert", () => {
    const alert = {
      stocks: ["MACRO"],
      signalTypes: ["macro_high_volatility"],
      severity: "critical",
    };

    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const recentAlerts = [
      {
        stocks: "MACRO",
        signalTypes: "macro_deviation",
        triggeredAt: tenMinAgo,
      },
    ];

    const result = shouldSuppressAlert(alert, recentAlerts, {
      cooldownMinutes: 30,
      maxAlertsPerStockPerDay: 5,
    });
    expect(result).toBe(false); // Different signal types
  });

  // ── AC-4: Daily cap still applies to MACRO alerts ────────────────────────
  it("AC-4: MACRO alert is suppressed when daily cap (3/day) is reached", () => {
    const alert = {
      stocks: ["MACRO"],
      signalTypes: ["macro_deviation"],
      severity: "high", // Non-critical to test daily cap (critical alerts bypass everything)
    };

    const today = new Date().toISOString();
    const recentAlerts = [
      { stocks: "MACRO", signalTypes: "macro_deviation", triggeredAt: today },
      { stocks: "MACRO", signalTypes: "macro_deviation", triggeredAt: today },
      { stocks: "MACRO", signalTypes: "macro_deviation", triggeredAt: today },
    ];

    const result = shouldSuppressAlert(alert, recentAlerts, {
      cooldownMinutes: 30,
      maxAlertsPerStockPerDay: 3, // Cap is 3
    });
    expect(result).toBe(true); // 4th alert today — must be suppressed
  });
});
