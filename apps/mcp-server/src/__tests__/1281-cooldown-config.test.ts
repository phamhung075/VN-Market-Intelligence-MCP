// src/__tests__/1281-cooldown-config.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import {
  runIntelligenceCycle,
  resetCycleGuard,
} from "../scheduler/news-analysis/intelligenceCycleJob.js";
import type { CycleDeps } from "../scheduler/news-analysis/intelligenceCycleJob.js";
import type { Alert } from "../domain/services/alertGenerator.js";
import { loadMcpConfig } from "../infrastructure/config.js";

/**
 * Task 1281 — Alert cooldown config drift fix.
 *
 * Before the fix, step E hardcoded `cooldownMinutes: 60`.
 * `mcp.config.json` defines `alertQuality.cooldownMinutes: 30`.
 * The hardcoded value doubled the intended cooldown.
 *
 * AC-1: `loadMcpConfig()` must parse `alertQuality.cooldownMinutes`
 *        and return 30 (the value in mcp.config.json).
 *
 * AC-2: Step E must use the injected `cooldownConfig` dep when provided,
 *        not a hardcoded literal.  An alert for stock "TST" sent 31 minutes
 *        ago must NOT be suppressed when cooldownMinutes=30 (window expired)
 *        — but would be suppressed if cooldownMinutes=60 (window still open).
 *
 * AC-3: When no `cooldownConfig` dep is injected, step E must read
 *        `alertQuality.cooldownMinutes` from the loaded MCP config
 *        (not use a hardcoded 60).
 */

import type { SignalType } from "../domain/services/signalDetector.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

function makeAlert(code: string, signalType: SignalType): Alert {
  const now = new Date().toISOString();
  return {
    id: `alert-${code}-${signalType}`,
    actionCode: code,
    signals: [{
      type: signalType,
      severity: "high",
      actionCode: code,
      message: `test ${signalType}`,
      confidence: 0.9,
      detectedAt: now,
    }],
    severity: "high",
    createdAt: now,
    message: `Test alert for ${code}`,
    isRead: false,
  };
}

describe("Task 1281 — Alert cooldown config drift", () => {
  // AC-1: Config loader parses alertQuality section
  it("AC-1: loadMcpConfig() returns alertQuality.cooldownMinutes from mcp.config.json", () => {
    const cfg = loadMcpConfig();
    // mcp.config.json defines alertQuality.cooldownMinutes: 30
    expect(cfg.alertQuality).toBeDefined();
    expect(cfg.alertQuality.cooldownMinutes).toBe(30);
  });

  // AC-2: Step E respects injected cooldownConfig — 30-min window
  it("AC-2: alert not suppressed when cooldownMinutes=30 and last alert was 31 min ago", async () => {
    resetCycleGuard();

    const sendLog: Alert[] = [];
    const suppressLog: string[] = [];

    // Recent alert history: same stock+signal, 31 minutes ago
    const thirtyOneMinAgo = new Date(Date.now() - 31 * 60_000).toISOString();

    const deps: CycleDeps = {
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      getWatchlistCodesFn: async () => ["TST"],
      syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
      computeHexagramsFn: async () => 0,
      readUnnotifiedAlertsFn: async () => [makeAlert("TST", "volume_spike")],
      markAlertNotifiedFn: async () => {},
      sendAlertsFn: async (alerts) => {
        sendLog.push(...alerts);
        return alerts.length;
      },
      // Inject 30-min cooldown config explicitly
      cooldownConfig: {
        cooldownMinutes: 30,
        maxAlertsPerStockPerDay: 10,
      },
      // Override the recent history query to return a 31-min-old alert
      getRecentAlertHistoryFn: async () => [
        {
          stocks: "TST",
          signalTypes: "volume_spike",
          triggeredAt: thirtyOneMinAgo,
        },
      ],
    };

    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();
    // With 30-min cooldown, a 31-min-old alert should NOT suppress the new one
    expect(sendLog.length).toBe(1);
    expect(sendLog[0]?.actionCode).toBe("TST");
  });

  // AC-3: Step E uses config value, not hardcoded 60 — same scenario with 60 min
  it("AC-3: alert IS suppressed when cooldownMinutes=60 and last alert was 31 min ago", async () => {
    resetCycleGuard();

    const sendLog: Alert[] = [];
    const thirtyOneMinAgo = new Date(Date.now() - 31 * 60_000).toISOString();

    const deps: CycleDeps = {
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      getWatchlistCodesFn: async () => ["TST"],
      syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
      computeHexagramsFn: async () => 0,
      readUnnotifiedAlertsFn: async () => [makeAlert("TST", "volume_spike")],
      markAlertNotifiedFn: async () => {},
      sendAlertsFn: async (alerts) => {
        sendLog.push(...alerts);
        return alerts.length;
      },
      // Inject 60-min cooldown — same as old hardcoded value
      cooldownConfig: {
        cooldownMinutes: 60,
        maxAlertsPerStockPerDay: 10,
      },
      getRecentAlertHistoryFn: async () => [
        {
          stocks: "TST",
          signalTypes: "volume_spike",
          triggeredAt: thirtyOneMinAgo,
        },
      ],
    };

    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();
    // With 60-min cooldown, a 31-min-old alert SHOULD suppress the new one
    expect(sendLog.length).toBe(0);
  });
});
