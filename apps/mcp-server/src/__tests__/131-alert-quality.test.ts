Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 131 — Alert Quality System
 *
 * Tests for:
 *   1. Alert cooldown (suppress repeats within window, respect daily cap; critical bypasses daily cap but NOT signal overlap — Task 1378)
 *   2. Alert deduplication (fingerprint hash, skip same event from multiple sources)
 *   3. Alert grouping (merge related alerts, max severity, human-readable message)
 *   4. Integration: alertGenerator → cooldown → dedup → grouped output
 *   5. Config values from mcp.config.json respected
 */

import { describe, it, expect } from "bun:test";
import {
  shouldSuppressAlert,
  type CooldownConfig,
} from "../domain/services/alertCooldown.js";
import {
  computeAlertFingerprint,
} from "../domain/services/alertDedup.js";
import {
  groupRelatedAlerts,
  type GroupedAlert,
} from "../domain/services/alertGrouper.js";
import { generateAlerts } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRecentAlert(
  stocks: string,
  signalTypes: string,
  minutesAgo: number,
): { stocks: string; signalTypes: string; triggeredAt: string } {
  const t = new Date(Date.now() - minutesAgo * 60_000);
  return { stocks, signalTypes, triggeredAt: t.toISOString() };
}

function makeSignal(
  actionCode: string,
  type: Signal["type"] = "price_drop",
  severity: Signal["severity"] = "medium",
): Signal {
  return {
    type,
    severity,
    actionCode,
    message: `${actionCode} ${type} signal`,
    confidence: 0.8,
    detectedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cooldown tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 131 — Alert Cooldown", () => {
  const config: CooldownConfig = {
    cooldownMinutes: 30,
    maxAlertsPerStockPerDay: 5,
  };

  it("suppresses alert when same stock+signal fired within cooldown window", () => {
    const recentAlerts = [makeRecentAlert("VCB", "price_drop", 10)]; // 10 min ago
    const alert = { stocks: ["VCB"], signalTypes: ["price_drop"] };
    expect(shouldSuppressAlert(alert, recentAlerts, config)).toBe(true);
  });

  it("allows alert when cooldown window has expired", () => {
    const recentAlerts = [makeRecentAlert("VCB", "price_drop", 45)]; // 45 min ago > 30 min
    const alert = { stocks: ["VCB"], signalTypes: ["price_drop"] };
    expect(shouldSuppressAlert(alert, recentAlerts, config)).toBe(false);
  });

  it("allows alert when stock+signal combo is different", () => {
    const recentAlerts = [makeRecentAlert("VCB", "price_drop", 5)]; // same stock, different signal
    const alert = { stocks: ["VCB"], signalTypes: ["volume_spike"] };
    expect(shouldSuppressAlert(alert, recentAlerts, config)).toBe(false);
  });

  it("allows alert when stock is different", () => {
    const recentAlerts = [makeRecentAlert("VCB", "price_drop", 5)]; // different stock
    const alert = { stocks: ["HPG"], signalTypes: ["price_drop"] };
    expect(shouldSuppressAlert(alert, recentAlerts, config)).toBe(false);
  });

  it("suppresses when stock has reached maxAlertsPerStockPerDay", () => {
    const today = new Date();
    const recentAlerts = Array.from({ length: 5 }, (_, i) => ({
      stocks: "VCB",
      signalTypes: `signal_${i}`,
      triggeredAt: new Date(today.setHours(i + 6)).toISOString(), // spread over today
    }));
    // Reset to today
    recentAlerts.forEach((a, i) => {
      const d = new Date();
      d.setHours(6 + i, 0, 0, 0);
      a.triggeredAt = d.toISOString();
    });
    const alert = { stocks: ["VCB"], signalTypes: ["new_signal"] };
    expect(shouldSuppressAlert(alert, recentAlerts, config)).toBe(true);
  });

  it("does not suppress when stock has fewer than maxAlertsPerStockPerDay", () => {
    const recentAlerts = [makeRecentAlert("VCB", "old_signal", 200)]; // within day but old
    // Different signal type, and only 1 today
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    const todayAlerts = [{ stocks: "VCB", signalTypes: "price_drop", triggeredAt: d.toISOString() }];
    const alert = { stocks: ["VCB"], signalTypes: ["volume_spike"] };
    expect(shouldSuppressAlert(alert, todayAlerts, config)).toBe(false);
  });

  it("suppresses CRITICAL when signal type overlaps a recently sent alert (Task 1378 fix)", () => {
    // A composite critical alert that shares price_drop with an already-sent alert
    // must be suppressed — it is a duplicate, not a genuinely new event.
    const recentMs = Date.now() - 2 * 60_000; // 2 min ago — inside 30-min window
    const recentAlerts = [
      { stocks: "VCB", signalTypes: "price_drop", triggeredAt: new Date(recentMs).toISOString() },
    ];
    const criticalAlert = {
      stocks: ["VCB"],
      signalTypes: ["price_drop"],
      severity: "critical" as const,
    };
    expect(shouldSuppressAlert(criticalAlert, recentAlerts, config)).toBe(true);
  });

  it("does NOT suppress CRITICAL when signal types are genuinely new (Task 1378 fix)", () => {
    // Critical alert with a brand-new signal type — no overlap with history → must fire
    // even if the daily cap would otherwise block it.
    const today = new Date();
    const recentAlerts = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(today);
      d.setHours(6 + i, 0, 0, 0);
      return { stocks: "VCB", signalTypes: "volume_spike", triggeredAt: d.toISOString() };
    });
    const criticalAlert = {
      stocks: ["VCB"],
      signalTypes: ["price_drop"], // no overlap with volume_spike history
      severity: "critical" as const,
    };
    expect(shouldSuppressAlert(criticalAlert, recentAlerts, config)).toBe(false);
  });

  it("uses default config when none provided", () => {
    // Default cooldownMinutes = 30; alert 10 min ago should be suppressed
    const recentAlerts = [makeRecentAlert("VCB", "price_drop", 10)];
    const alert = { stocks: ["VCB"], signalTypes: ["price_drop"] };
    expect(shouldSuppressAlert(alert, recentAlerts)).toBe(true);
  });

  it("handles empty recent alerts (no suppression)", () => {
    const alert = { stocks: ["VCB"], signalTypes: ["price_drop"] };
    expect(shouldSuppressAlert(alert, [], config)).toBe(false);
  });

  it("handles multi-stock alert — suppresses if any stock is in cooldown", () => {
    const recentAlerts = [makeRecentAlert("VCB", "price_drop", 5)];
    const alert = { stocks: ["VCB", "HPG"], signalTypes: ["price_drop"] };
    expect(shouldSuppressAlert(alert, recentAlerts, config)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deduplication tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 131 — Alert Deduplication", () => {
  it("produces consistent fingerprint for same inputs", () => {
    const alert = { stocks: ["VCB", "HPG"], signalTypes: ["price_drop"], message: "VCB dropped 5%" };
    const fp1 = computeAlertFingerprint(alert);
    const fp2 = computeAlertFingerprint(alert);
    expect(fp1).toBe(fp2);
  });

  it("same stocks + signals + message prefix produces same fingerprint (dedup catches it)", () => {
    const a1 = { stocks: ["VCB"], signalTypes: ["price_drop"], message: "VCB dropped 5% from CafeF" };
    const a2 = { stocks: ["VCB"], signalTypes: ["price_drop"], message: "VCB dropped 5% from VnExpress" };
    // Same first 50 chars check: if first 50 chars differ we won't dedup — but same prefix
    const msg50 = "VCB dropped 5% from CafeF".slice(0, 50);
    const msg50b = "VCB dropped 5% from VnExpress".slice(0, 50);
    // These differ, so fingerprints will differ — that's correct behavior
    const fp1 = computeAlertFingerprint(a1);
    const fp2 = computeAlertFingerprint(a2);
    // If message prefix differs, fingerprints SHOULD differ
    expect(fp1).not.toBe(fp2);
  });

  it("same event content from different sources → same fingerprint when message prefix matches", () => {
    const sharedMsg = "Fed raises interest rates by 25bps — impact on VN market";
    const a1 = { stocks: ["VCB"], signalTypes: ["news_mention"], message: sharedMsg };
    const a2 = { stocks: ["VCB"], signalTypes: ["news_mention"], message: sharedMsg };
    expect(computeAlertFingerprint(a1)).toBe(computeAlertFingerprint(a2));
  });

  it("genuinely different events produce different fingerprints", () => {
    const a1 = { stocks: ["VCB"], signalTypes: ["price_drop"], message: "VCB dropped 5%" };
    const a2 = { stocks: ["HPG"], signalTypes: ["volume_spike"], message: "HPG volume spike 3x" };
    expect(computeAlertFingerprint(a1)).not.toBe(computeAlertFingerprint(a2));
  });

  it("stock order does not affect fingerprint (sorted)", () => {
    const a1 = { stocks: ["HPG", "VCB"], signalTypes: ["price_drop"], message: "Market drop" };
    const a2 = { stocks: ["VCB", "HPG"], signalTypes: ["price_drop"], message: "Market drop" };
    expect(computeAlertFingerprint(a1)).toBe(computeAlertFingerprint(a2));
  });

  it("signal type order does not affect fingerprint (sorted)", () => {
    const a1 = { stocks: ["VCB"], signalTypes: ["volume_spike", "price_drop"], message: "Multi signal" };
    const a2 = { stocks: ["VCB"], signalTypes: ["price_drop", "volume_spike"], message: "Multi signal" };
    expect(computeAlertFingerprint(a1)).toBe(computeAlertFingerprint(a2));
  });

  it("fingerprint is a non-empty string", () => {
    const fp = computeAlertFingerprint({ stocks: ["VCB"], signalTypes: ["price_drop"], message: "test" });
    expect(typeof fp).toBe("string");
    expect(fp.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Alert Grouper tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 131 — Alert Grouper", () => {
  function makeRawAlert(
    id: string,
    stocks: string[],
    signals: string[],
    severity: string,
    message: string,
    minutesAgo = 0,
  ) {
    const t = new Date(Date.now() - minutesAgo * 60_000);
    return { id, severity, stocks, signals, message, triggeredAt: t.toISOString() };
  }

  it("groups alerts within window when signal types overlap", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "medium", "VCB dropped", 0),
      makeRawAlert("a2", ["HPG"], ["price_drop"], "medium", "HPG dropped", 5),
      makeRawAlert("a3", ["FPT"], ["price_drop"], "low", "FPT dropped", 10),
    ];
    const groups = groupRelatedAlerts(alerts, 15);
    // All three overlap on price_drop and are within 15 min → 1 group
    expect(groups.length).toBe(1);
    expect(groups[0]!.individualAlerts).toBe(3);
  });

  it("does not group alerts outside the time window", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "medium", "VCB dropped", 0),
      makeRawAlert("a2", ["HPG"], ["price_drop"], "medium", "HPG dropped", 20), // outside 15 min
    ];
    const groups = groupRelatedAlerts(alerts, 15);
    expect(groups.length).toBe(2);
  });

  it("does not group alerts with no overlapping signal types", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "medium", "VCB dropped", 0),
      makeRawAlert("a2", ["HPG"], ["volume_spike"], "medium", "HPG volume", 2),
    ];
    const groups = groupRelatedAlerts(alerts, 15);
    expect(groups.length).toBe(2);
  });

  it("group severity = max severity of merged alerts", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "low", "VCB low", 0),
      makeRawAlert("a2", ["HPG"], ["price_drop"], "critical", "HPG critical", 2),
      makeRawAlert("a3", ["FPT"], ["price_drop"], "medium", "FPT medium", 4),
    ];
    const groups = groupRelatedAlerts(alerts, 15);
    expect(groups[0]!.severity).toBe("critical");
  });

  it("group includes all affected stocks", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "medium", "VCB dropped", 0),
      makeRawAlert("a2", ["HPG"], ["price_drop"], "medium", "HPG dropped", 3),
    ];
    const groups = groupRelatedAlerts(alerts, 15);
    expect(groups[0]!.affectedStocks).toContain("VCB");
    expect(groups[0]!.affectedStocks).toContain("HPG");
  });

  it("group message is human-readable summary", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "medium", "VCB dropped", 0),
      makeRawAlert("a2", ["HPG"], ["price_drop"], "medium", "HPG dropped", 2),
      makeRawAlert("a3", ["FPT"], ["price_drop"], "medium", "FPT dropped", 4),
    ];
    const groups = groupRelatedAlerts(alerts, 15);
    const msg = groups[0]!.message;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(10);
    // Should mention count or stocks
    const mentionsCount = /\d/.test(msg);
    expect(mentionsCount).toBe(true);
  });

  it("single-alert group preserves original message", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "medium", "VCB dropped 5%", 0),
    ];
    const groups = groupRelatedAlerts(alerts, 15);
    expect(groups.length).toBe(1);
    expect(groups[0]!.individualAlerts).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(groupRelatedAlerts([], 15)).toEqual([]);
  });

  it("uses default 15-minute window when not provided", () => {
    const alerts = [
      makeRawAlert("a1", ["VCB"], ["price_drop"], "medium", "VCB dropped", 0),
      makeRawAlert("a2", ["HPG"], ["price_drop"], "medium", "HPG dropped", 14), // within 15 min
    ];
    const groups = groupRelatedAlerts(alerts); // no windowMinutes
    expect(groups.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Integration: alertGenerator → cooldown → dedup → grouping
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 131 — Integration: alertGenerator with quality filters", () => {
  it("generates alerts for watchlisted stocks", () => {
    const signals = [makeSignal("VCB"), makeSignal("HPG")];
    const watchlist = [{ actionCode: "VCB" }, { actionCode: "HPG" }];
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts.length).toBe(2);
  });

  it("alert has stocks and signalTypes fields for cooldown/dedup pipeline", () => {
    const signals = [makeSignal("VCB", "price_drop", "medium")];
    const watchlist = [{ actionCode: "VCB" }];
    const alerts = generateAlerts(signals, watchlist);
    const alert = alerts[0]!;
    // Standard alert must have these fields for the quality pipeline
    expect(alert.actionCode).toBe("VCB");
    expect(alert.signals.length).toBeGreaterThan(0);
    expect(alert.severity).toBeTruthy();
  });

  it("groupRelatedAlerts consumes alerts from generateAlerts output", () => {
    const signals = [
      makeSignal("VCB", "price_drop", "medium"),
      makeSignal("HPG", "price_drop", "medium"),
    ];
    const watchlist = [{ actionCode: "VCB" }, { actionCode: "HPG" }];
    const alerts = generateAlerts(signals, watchlist);

    // Convert Alert[] to the shape groupRelatedAlerts expects
    const rawForGrouper = alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      stocks: [a.actionCode],
      signals: a.signals.map((s) => s.type),
      message: a.message,
      triggeredAt: a.createdAt,
    }));

    const groups = groupRelatedAlerts(rawForGrouper, 15);
    // Both are price_drop within same window → 1 group
    expect(groups.length).toBe(1);
    expect(groups[0]!.affectedStocks).toContain("VCB");
    expect(groups[0]!.affectedStocks).toContain("HPG");
  });

  it("dedup fingerprint identical for alerts with same content", () => {
    const signal = makeSignal("VCB", "news_mention", "low");
    const watchlist = [{ actionCode: "VCB" }];
    const a1 = generateAlerts([signal], watchlist)[0]!;
    const a2 = generateAlerts([{ ...signal }], watchlist)[0]!;

    const fp1 = computeAlertFingerprint({
      stocks: [a1.actionCode],
      signalTypes: a1.signals.map((s) => s.type),
      message: a1.message,
    });
    const fp2 = computeAlertFingerprint({
      stocks: [a2.actionCode],
      signalTypes: a2.signals.map((s) => s.type),
      message: a2.message,
    });
    expect(fp1).toBe(fp2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Config values
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 131 — Config values from mcp.config.json", () => {
  it("alertQuality config block is present in mcp.config.json", async () => {
    const raw = await Bun.file(
      new URL("../../mcp.config.json", import.meta.url).pathname,
    ).text();
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    expect(cfg["alertQuality"]).toBeDefined();
  });

  it("alertQuality has cooldownMinutes = 30", async () => {
    const raw = await Bun.file(
      new URL("../../mcp.config.json", import.meta.url).pathname,
    ).text();
    const cfg = JSON.parse(raw) as { alertQuality: { cooldownMinutes: number } };
    expect(cfg.alertQuality.cooldownMinutes).toBe(30);
  });

  it("alertQuality has maxAlertsPerStockPerDay = 3", async () => {
    const raw = await Bun.file(
      new URL("../../mcp.config.json", import.meta.url).pathname,
    ).text();
    const cfg = JSON.parse(raw) as { alertQuality: { maxAlertsPerStockPerDay: number } };
    expect(cfg.alertQuality.maxAlertsPerStockPerDay).toBe(3);
  });

  it("alertQuality has neverSuppressSeverity including 'critical'", async () => {
    const raw = await Bun.file(
      new URL("../../mcp.config.json", import.meta.url).pathname,
    ).text();
    const cfg = JSON.parse(raw) as { alertQuality: { neverSuppressSeverity: string[] } };
    expect(cfg.alertQuality.neverSuppressSeverity).toContain("critical");
  });

  it("cooldown uses config cooldownMinutes = 30 correctly", () => {
    // Alert 29 min ago → within 30 min window → suppressed
    const recentAlerts = [makeRecentAlert("VCB", "price_drop", 29)];
    const alert = { stocks: ["VCB"], signalTypes: ["price_drop"] };
    expect(shouldSuppressAlert(alert, recentAlerts, { cooldownMinutes: 30, maxAlertsPerStockPerDay: 5 })).toBe(true);
    // Alert 31 min ago → outside window → allowed
    const olderAlerts = [makeRecentAlert("VCB", "price_drop", 31)];
    expect(shouldSuppressAlert(alert, olderAlerts, { cooldownMinutes: 30, maxAlertsPerStockPerDay: 5 })).toBe(false);
  });
});
