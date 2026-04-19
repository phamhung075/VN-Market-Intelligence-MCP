// src/__tests__/1285-macro-alert-cooldown.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import {
  runIntelligenceCycle,
  resetCycleGuard,
} from "../scheduler/intelligenceCycleJob.js";
import type { CycleDeps } from "../scheduler/intelligenceCycleJob.js";
import type { Alert } from "../domain/services/alertGenerator.js";
import type { SignalType } from "../domain/services/signalDetector.js";

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
  // AC-1: alert with notified_telegram=0 in history window IS suppressed
  //
  // Scenario: cycle N sent the alert but Telegram delivery failed
  // (notified_telegram stays 0). In cycle N+1, the same alert appears again as
  // unnotified. The cooldown history now includes notified_telegram=0 rows, so
  // `shouldSuppressAlert` finds the previous attempt and suppresses.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-1: alert with notified_telegram=0 in history (failed send) is suppressed in next cycle", async () => {
    resetCycleGuard();

    const sendLog: Alert[] = [];
    const markLog: string[] = [];

    // Simulate: the MACRO alert was attempted 10 minutes ago (within 30-min window)
    // but its send failed — so notified_telegram=0. The real DB query (without
    // notified_telegram filter) would return it; we inject it via getRecentAlertHistoryFn.
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
      // getRecentAlertHistoryFn simulates what the broadened SQL query returns:
      // the same alert attempt (notified_telegram=0, 10 min ago) IS included.
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

    // The alert must be suppressed — sendAlertsFn should NOT be called
    expect(sendLog.length).toBe(0);
    // markAlertNotified IS called (suppressed alerts are still marked to prevent
    // step E from processing them again in subsequent cycles)
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

    const alert1 = makeMacroAlert("macro-2026-04-15-vnindex-high-a");
    const alert2 = makeMacroAlert("macro-2026-04-15-vnindex-high-b");
    // alert2 has a different id but same stock+signal type

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
        if (callCount === 1) {
          // First call: Telegram fails — return 0 (no send)
          return 0;
        }
        // Should never reach here — second alert must be suppressed by in-memory history
        sendLog.push(...alerts);
        return alerts.length;
      },
      cooldownConfig: {
        cooldownMinutes: 30,
        maxAlertsPerStockPerDay: 10,
      },
      // No recent history — history starts empty this cycle
      getRecentAlertHistoryFn: async () => [],
    };

    const result = await runIntelligenceCycle(deps);
    expect(result).not.toBeNull();

    // sendAlertsFn called exactly once (for alert1); alert2 suppressed by in-memory state
    expect(callCount).toBe(1);
    // The second alert must NOT have been sent
    expect(sendLog.length).toBe(0);
    // Only alert2 (suppressed by cooldown) is marked notified.
    // alert1 send failed (sent=0) so markAlertNotified is NOT called for it —
    // it stays notified_telegram=0 so the next cycle can retry the send.
    // The in-memory history append (regardless of sent count) is what blocks
    // same-cycle siblings, not markAlertNotified.
    expect(markLog.length).toBe(1);
    expect(markLog[0]).toBe("macro-2026-04-15-vnindex-high-b");
  });
});
