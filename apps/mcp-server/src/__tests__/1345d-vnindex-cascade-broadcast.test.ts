// apps/mcp-server/src/__tests__/1345d-vnindex-cascade-broadcast.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";
import {
  runIntelligenceCycle,
  resetCycleGuard,
} from "../scheduler/news-analysis/intelligenceCycleJob.js";
import type { CycleDeps } from "../scheduler/news-analysis/intelligenceCycleJob.js";
import type { Alert } from "../domain/services/alertGenerator.js";
import type { SignalType } from "../domain/services/signalDetector.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

/**
 * Task 1345d — VN-Index cascade market-wide broadcast fix.
 *
 * Problem: intelligenceCycleJob step E sends all cascade alerts to BUG channel
 * via notifyTelegramAlert. No market-wide summary reaches the MARKET channel.
 *
 * Fix: add a pre-pass in step E that detects when >= 2 distinct stocks have
 * alerts containing "market-wide cascade" in a signal message. When the batch
 * qualifies, compose a Vietnamese summary and send it via sendTelegramMarket
 * (injected as sendMarketFn in CycleDeps for test isolation).
 *
 * The per-stock loop (BUG channel) is unchanged.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeCascadeAlert(code: string, severity: "high" | "critical" = "high"): Alert {
  const now = new Date().toISOString();
  return {
    id: `alert-cascade-${code}`,
    actionCode: code,
    signals: [
      {
        type: "news_mention" as SignalType,
        severity,
        actionCode: code,
        message: `market-wide cascade: VN-Index policy shock impacts ${code}`,
        confidence: 0.9,
        detectedAt: now,
      },
    ],
    severity,
    createdAt: now,
    message: `Cascade alert for ${code}`,
    isRead: false,
  };
}

function makeNonCascadeAlert(code: string): Alert {
  const now = new Date().toISOString();
  return {
    id: `alert-noncascade-${code}`,
    actionCode: code,
    signals: [
      {
        type: "volume_spike" as SignalType,
        severity: "high",
        actionCode: code,
        message: `Volume spike detected for ${code}`,
        confidence: 0.85,
        detectedAt: now,
      },
    ],
    severity: "high",
    createdAt: now,
    message: `Volume spike for ${code}`,
    isRead: false,
  };
}

/** Build minimal CycleDeps for step-E-only tests. */
function baseDeps(overrides: Partial<CycleDeps>): CycleDeps {
  return {
    isMarketHoursFn: () => false, // off-hours → only step E runs
    pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
    listSscDocsFn: async () => [],
    fetchPricesFn: async () => 0,
    runImpactChainFn: async () => 0,
    getWatchlistCodesFn: async () => [],
    syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
    computeHexagramsFn: async () => 0,
    markAlertNotifiedFn: async () => {},
    getRecentAlertHistoryFn: async () => [],
    cooldownConfig: { cooldownMinutes: 0, maxAlertsPerStockPerDay: 100 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1345d — VN-Index cascade market-wide broadcast", () => {

  /**
   * T1: >= 2 market-wide cascade alerts in batch → sendMarketFn called once.
   * This is the core acceptance criterion.
   */
  it("T1: sends market summary when >= 2 market-wide cascade alerts in batch", async () => {
    resetCycleGuard();

    const marketCalls: Array<{ text: string; opts: unknown }> = [];
    const perStockCalls: Alert[] = [];

    const alerts = [makeCascadeAlert("VIC"), makeCascadeAlert("VCB")];

    const deps = baseDeps({
      readUnnotifiedAlertsFn: async () => alerts,
      sendAlertsFn: async (as) => { perStockCalls.push(...as); return as.length; },
      sendMarketFn: async (text, opts) => { marketCalls.push({ text, opts }); return true; },
    });

    await runIntelligenceCycle(deps);

    // Market summary must have been sent exactly once
    expect(marketCalls.length).toBe(1);
  });

  /**
   * T2: Only 1 market-wide cascade alert → sendMarketFn NOT called.
   * Single-stock cascade is not "market-wide" — avoid noise.
   */
  it("T2: does NOT send market summary when only 1 market-wide cascade alert", async () => {
    resetCycleGuard();

    const marketCalls: Array<{ text: string; opts: unknown }> = [];

    const deps = baseDeps({
      readUnnotifiedAlertsFn: async () => [makeCascadeAlert("VIC")],
      sendAlertsFn: async (as) => as.length,
      sendMarketFn: async (text, opts) => { marketCalls.push({ text, opts }); return true; },
    });

    await runIntelligenceCycle(deps);

    expect(marketCalls.length).toBe(0);
  });

  /**
   * T3: No alerts contain "market-wide cascade" in signal message → sendMarketFn NOT called.
   */
  it("T3: does NOT send market summary when no alerts have market-wide cascade signal", async () => {
    resetCycleGuard();

    const marketCalls: Array<{ text: string; opts: unknown }> = [];

    const deps = baseDeps({
      readUnnotifiedAlertsFn: async () => [makeNonCascadeAlert("FPT"), makeNonCascadeAlert("VNM")],
      sendAlertsFn: async (as) => as.length,
      sendMarketFn: async (text, opts) => { marketCalls.push({ text, opts }); return true; },
    });

    await runIntelligenceCycle(deps);

    expect(marketCalls.length).toBe(0);
  });

  /**
   * T4: Market summary message includes all affected stock codes.
   */
  it("T4: market summary message includes all affected stock codes", async () => {
    resetCycleGuard();

    const marketCalls: Array<{ text: string; opts: unknown }> = [];

    const alerts = [
      makeCascadeAlert("VIC"),
      makeCascadeAlert("VCB"),
      makeCascadeAlert("VNM"),
    ];

    const deps = baseDeps({
      readUnnotifiedAlertsFn: async () => alerts,
      sendAlertsFn: async (as) => as.length,
      sendMarketFn: async (text, opts) => { marketCalls.push({ text, opts }); return true; },
    });

    await runIntelligenceCycle(deps);

    expect(marketCalls.length).toBe(1);
    const msg = marketCalls[0]!.text;
    expect(msg).toContain("VIC");
    expect(msg).toContain("VCB");
    expect(msg).toContain("VNM");
  });

  /**
   * T5: sendMarketFn failure does NOT abort the per-stock alert loop.
   * Market summary send is non-fatal.
   */
  it("T5: market summary failure does not abort per-stock alert loop", async () => {
    resetCycleGuard();

    const perStockCalls: Alert[] = [];

    const alerts = [makeCascadeAlert("VIC"), makeCascadeAlert("VCB")];

    const deps = baseDeps({
      readUnnotifiedAlertsFn: async () => alerts,
      sendAlertsFn: async (as) => { perStockCalls.push(...as); return as.length; },
      // Market send throws
      sendMarketFn: async () => { throw new Error("Telegram 429 rate limit"); },
    });

    // Should not throw and should complete normally
    const result = await runIntelligenceCycle(deps);

    expect(result).not.toBeNull();
    // Both per-stock alerts still processed
    expect(perStockCalls.length).toBe(2);
  });

  /**
   * T6: Non-cascade alerts in same batch are unaffected — still route to BUG
   * channel via sendAlertsFn (per-stock loop).
   */
  it("T6: non-cascade alerts in same batch still route to per-stock loop", async () => {
    resetCycleGuard();

    const perStockCalls: Alert[] = [];
    const marketCalls: Array<{ text: string }> = [];

    // Mixed batch: 2 cascade + 1 non-cascade
    const alerts = [
      makeCascadeAlert("VIC"),
      makeCascadeAlert("VCB"),
      makeNonCascadeAlert("FPT"),
    ];

    const deps = baseDeps({
      readUnnotifiedAlertsFn: async () => alerts,
      sendAlertsFn: async (as) => { perStockCalls.push(...as); return as.length; },
      sendMarketFn: async (text) => { marketCalls.push({ text }); return true; },
    });

    await runIntelligenceCycle(deps);

    // Market summary sent once (2 cascade alerts qualify)
    expect(marketCalls.length).toBe(1);
    // All 3 per-stock alerts routed through the existing loop
    expect(perStockCalls.length).toBe(3);
  });

  /**
   * T7: CycleResult.telegramAlertsSent counts per-stock sends, NOT the market summary.
   * The market summary send must not inflate the counter.
   */
  it("T7: CycleResult.telegramAlertsSent counts per-stock sends, not market summary", async () => {
    resetCycleGuard();

    const alerts = [makeCascadeAlert("VIC"), makeCascadeAlert("VCB")];

    const deps = baseDeps({
      readUnnotifiedAlertsFn: async () => alerts,
      sendAlertsFn: async (as) => as.length, // 2 per-stock sends
      sendMarketFn: async () => true,          // 1 market summary (must NOT count)
    });

    const result = await runIntelligenceCycle(deps);

    expect(result).not.toBeNull();
    // telegramAlertsSent should be 2 (per-stock), not 3
    expect(result!.telegramAlertsSent).toBe(2);
  });

});
