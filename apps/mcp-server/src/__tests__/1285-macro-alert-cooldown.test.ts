// src/__tests__/1285-macro-alert-cooldown.test.ts
Bun.env["DB_PATH"] = ":memory:";
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
 * Task 1285 — macro_deviation alerts bypass step E cooldown.
 *
 * Two root causes fixed:
 *   1. Cooldown history SQL filtered `AND notified_telegram = 1` — failed sends
 *      (notified_telegram=0) were invisible to the cooldown, so the same alert
 *      re-fired every cycle.
 *   2. `recentAlertHistory.push(...)` was inside `if (sent > 0)` guard — failed
 *      sends did not populate the in-memory snapshot for within-cycle dedup.
 *
 * AC-1: An alert whose previous attempt had `notified_telegram=0` (failed send)
 *       IS still suppressed by cooldown on the next cycle — because the cooldown
 *       history query now includes undelivered rows (no notified_telegram filter).
 *
 * AC-2: When `sendAlertsFn` returns 0 (Telegram send failed), the alert is still
 *       appended to the in-memory `recentAlertHistory` so a sibling alert for the
 *       same stock+signal in the same cycle is suppressed.
 */

function makeMacroAlert(id: string): Alert {
  const now = new Date().toISOString();
  return {
    id,
    actionCode: "MACRO",
    signals: [
      {
        type: "macro_deviation" as SignalType,
        severity: "high",
        actionCode: "MACRO",
        message: "VN-Index -2σ from mean — macro deviation detected",
        confidence: 0.85,
        detectedAt: now,
      },
    ],
    severity: "high",
    createdAt: now,
    message: "Macro deviation alert",
    isRead: false,
  };
}

describe("Task 1285 — macro_deviation cooldown bypass fix", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // AC-1 (updated by Task 1383): MACRO alert with cooldown history still reaches
  // sendAlertsFn. Step A2.5 INSERT OR IGNORE is the dedup guard; step E must
  // always attempt to send whatever readUnnotifiedAlerts returns for MACRO.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-1: MACRO alert with cooldown history still reaches sendAlertsFn (task 1383 fix)", async () => {
    resetCycleGuard();

    const sendLog: Alert[] = [];
    const markLog: string[] = [];
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();

    const deps: CycleDeps = {
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      getWatchlistCodesFn: async () => ["MACRO"],
      syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
      computeHexagramsFn: async () => 0,
      readUnnotifiedAlertsFn: async () => [makeMacroAlert("macro-2026-04-15-vnindex-high")],
      markAlertNotifiedFn: async (id: string) => { markLog.push(id); },
      sendAlertsFn: async (alerts: Alert[]) => {
        sendLog.push(...alerts);
        return alerts.length;
      },
      cooldownConfig: {
        cooldownMinutes: 30,
        maxAlertsPerStockPerDay: 10,
      },
      // History has a previous MACRO attempt — but MACRO now bypasses shouldSuppressAlert.
      getRecentAlertHistoryFn: async () => [
        {
          stocks: "MACRO",
          signalTypes: "macro_deviation",
          triggeredAt: tenMinAgo,
        },
      ],
    };

    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();

    // Task 1383: MACRO bypasses cooldown — sendAlertsFn MUST be called
    expect(sendLog.length).toBe(1);
    // markAlertNotified called after successful send
    expect(markLog.length).toBe(1);
    expect(markLog[0]).toBe("macro-2026-04-15-vnindex-high");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-2: failed send still updates in-memory recentAlertHistory
  //       so a same-cycle sibling is suppressed
  //
  // Scenario: two MACRO alerts in same cycle for same stock+signal.
  // sendAlertsFn returns 0 for the first (Telegram failure). The second alert
  // must still be suppressed because the first was appended to the in-memory
  // history even on failure.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-2: when first send fails (sent=0), second sibling alert in same cycle is suppressed", async () => {
    resetCycleGuard();

    const sendLog: Alert[] = [];
    const markLog: string[] = [];
    let callCount = 0;

    const alert1 = makeMacroAlert("macro-2026-04-15-brentCrudeUSD-extreme");
    const alert2 = makeMacroAlert("macro-2026-04-15-goldUSDPerOz-extreme");
    // Two different indicators — step A2.5 dedup allows both; step E must send both.

    const deps: CycleDeps = {
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      getWatchlistCodesFn: async () => ["MACRO"],
      syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
      computeHexagramsFn: async () => 0,
      readUnnotifiedAlertsFn: async () => [alert1, alert2],
      markAlertNotifiedFn: async (id: string) => { markLog.push(id); },
      sendAlertsFn: async (alerts: Alert[]) => {
        callCount++;
        sendLog.push(...alerts);
        return alerts.length;
      },
      cooldownConfig: {
        cooldownMinutes: 30,
        maxAlertsPerStockPerDay: 10,
      },
      getRecentAlertHistoryFn: async () => [],
    };

    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();

    // Task 1383: MACRO bypasses cooldown — both alerts must reach sendAlertsFn
    expect(callCount).toBe(2);
    expect(sendLog.length).toBe(2);
    expect(markLog.length).toBe(2);
  });
});
