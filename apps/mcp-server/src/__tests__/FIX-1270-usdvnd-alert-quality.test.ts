Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-1270/1276 — USD/VND alert quality: 50 VND minimum absolute deviation
 * guard + 6-hour macro deviation cooldown.
 *
 * AC-1: 2.8 VND deviation (0.011%) on USD/VND → no alert fired (below 50 VND minimum)
 * AC-2: 200 VND deviation → alert fires (extreme)
 * AC-3: same macro_deviation alert fired twice within 6h → second suppressed by cooldown
 * AC-4: same macro_deviation alert after 7h → NOT suppressed (outside cooldown window)
 * AC-5: oil/gold thresholds are unaffected by the VND guard
 */

import { describe, it, expect } from "bun:test";
import { classifyDeviation } from "../domain/services/macroThresholds";
import { shouldSuppressAlert } from "../domain/services/alertCooldown";

// ── AC-1: 2.8 VND deviation must NOT fire (below 50 VND minimum) ─────────────
describe("FIX-1270 AC-1 — 2.8 VND deviation blocked by 50 VND guard", () => {
  it("usdVndRate: 2.8 VND below mean → level is normal or elevated, NOT high/extreme", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26331.2,  // 2.8 VND below mean (real false-positive scenario)
      mean: 26334,
      stdDev: 0.76,      // tight σ ≈ 0.76 VND → zScore = -3.68σ without guard
      sampleCount: 30,
    });

    // 2.8 VND < 50 VND minimum → must NOT produce high or extreme
    expect(result.level).not.toBe("extreme");
    expect(result.level).not.toBe("high");
  });
});

// ── AC-2: 200 VND deviation must fire (economically significant) ──────────────
describe("FIX-1270 AC-2 — 200 VND deviation triggers alert", () => {
  it("usdVndRate: 200 VND below mean → extreme", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26134,   // 200 VND below 26334
      mean: 26334,
      stdDev: 0.76,
      sampleCount: 30,
    });

    // 200 VND >> 50 VND minimum → extreme
    expect(result.level).toBe("extreme");
  });

  it("usdVndRate: 60 VND above mean → extreme (above 50 VND minimum)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26394,   // 60 VND above 26334
      mean: 26334,
      stdDev: 0.76,
      sampleCount: 30,
    });

    // 60 VND > 50 VND minimum → must be high or extreme
    expect(["high", "extreme"]).toContain(result.level);
  });
});

// ── AC-3: same macro_deviation alert within 6h → suppressed ──────────────────
describe("FIX-1276 AC-3 — macro_deviation suppressed within 6h cooldown", () => {
  it("MACRO macro_deviation alert suppressed when prior alert is 5h old (within 6h window)", () => {
    const alert = {
      stocks: ["MACRO"],
      signalTypes: ["macro_deviation"],
      severity: "high",
      actionCode: "MACRO",
    };

    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60_000).toISOString();
    const recentAlerts = [
      {
        stocks: "MACRO",
        signalTypes: "macro_deviation",
        triggeredAt: fiveHoursAgo,
      },
    ];

    const result = shouldSuppressAlert(alert, recentAlerts, {
      cooldownMinutes: 360, // 6 hours
      maxAlertsPerStockPerDay: 5,
    });

    expect(result).toBe(true); // within 6h window → suppressed
  });
});

// ── AC-4: same macro_deviation alert after 7h → NOT suppressed ───────────────
describe("FIX-1276 AC-4 — macro_deviation NOT suppressed after 7h", () => {
  it("MACRO macro_deviation alert NOT suppressed when prior alert is 7h old (outside 6h window)", () => {
    const alert = {
      stocks: ["MACRO"],
      signalTypes: ["macro_deviation"],
      severity: "high",
      actionCode: "MACRO",
    };

    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60_000).toISOString();
    const recentAlerts = [
      {
        stocks: "MACRO",
        signalTypes: "macro_deviation",
        triggeredAt: sevenHoursAgo,
      },
    ];

    const result = shouldSuppressAlert(alert, recentAlerts, {
      cooldownMinutes: 360, // 6 hours
      maxAlertsPerStockPerDay: 5,
    });

    expect(result).toBe(false); // outside 6h window → fires
  });
});

// ── AC-5: oil and gold thresholds unaffected by VND guard ────────────────────
describe("FIX-1270 AC-5 — oil/gold are NOT affected by VND minimum guard", () => {
  it("brentCrudeUSD: 3 USD deviation (within normal range) → elevated, not blocked", () => {
    const result = classifyDeviation({
      name: "brentCrudeUSD",
      current: 77,
      mean: 74,
      stdDev: 3,      // zScore = 1.0 → elevated
      sampleCount: 30,
    });

    expect(result.level).toBe("elevated");
  });

  it("goldUSDPerOz: $2 deviation → blocked only if z < 1σ (no absolute guard for gold)", () => {
    const result = classifyDeviation({
      name: "goldUSDPerOz",
      current: 2002,
      mean: 2000,
      stdDev: 30,     // zScore = 0.067 → normal
      sampleCount: 30,
    });

    expect(result.level).toBe("normal");
  });
});
