// apps/mcp-server/src/__tests__/1383-macro-alert-dispatch.test.ts
// Task 1383 — CRITICAL macro alerts dispatched even when cooldown history exists.
//
// Bug: step A2.5 inserts macro alert, then step E reads the same row into
// recentAlertHistory (7h window) → shouldSuppressAlert Rule 1 fires on the
// SAME cycle → markAlertNotified called WITHOUT sending → notified_telegram
// marked 1 but user never received the alert.
//
// Fix: MACRO alerts bypass cooldown suppression in step E — step A2.5 INSERT
// OR IGNORE already provides once-per-indicator-per-day dedup. Cooldown
// suppression is therefore redundant and harmful for macro alerts.
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach } from "bun:test";
import {
  runIntelligenceCycle,
  resetCycleGuard,
} from "../scheduler/news-analysis/intelligenceCycleJob.js";
import type { CycleDeps } from "../scheduler/news-analysis/intelligenceCycleJob.js";
import type { Alert } from "../domain/services/alertGenerator.js";
import type { SignalType } from "../domain/services/signalDetector.js";

function makeMacroCriticalAlert(id: string): Alert {
  const now = new Date().toISOString();
  return {
    id,
    actionCode: "MACRO",
    signals: [
      {
        type: "macro_deviation" as SignalType,
        severity: "critical",
        actionCode: "MACRO",
        message: "Brent: 95.4 — cực đoan (+5.38σ trên TB 72.3)",
        confidence: 0.95,
        detectedAt: now,
      },
    ],
    severity: "critical",
    createdAt: now,
    message: "Macro alert [EXTREME]: Brent +5.38σ",
    isRead: false,
  };
}

describe("Task 1383 — CRITICAL macro alert bypasses cooldown suppression", () => {
  beforeEach(() => resetCycleGuard());

  it("AC-1: CRITICAL macro alert reaches sendAlertsFn even when cooldown history contains same indicator", async () => {
    const alert = makeMacroCriticalAlert("macro-2026-04-28-brentCrudeUSD-extreme");
    const sendCalls: Alert[][] = [];

    // Simulate: recentAlertHistory already has a MACRO/macro_deviation entry
    // (as if step A2.5 inserted it in the same cycle and the history query found it)
    const staleHistory = [
      {
        stocks: "MACRO",
        signalTypes: "macro_deviation",
        triggeredAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago — within 360min cooldown
      },
    ];

    const deps: CycleDeps = {
      isMarketHoursFn: () => true,
      readUnnotifiedAlertsFn: async () => [alert],
      markAlertNotifiedFn: async () => {},
      sendAlertsFn: async (alerts) => {
        sendCalls.push(alerts);
        return alerts.length;
      },
      getRecentAlertHistoryFn: async () => staleHistory,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      getWatchlistCodesFn: async () => [],
      syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
      computeHexagramsFn: async () => 0,
    };

    await runIntelligenceCycle(deps);

    // The CRITICAL macro alert must reach sendAlertsFn — NOT be suppressed
    expect(sendCalls.length).toBeGreaterThan(0);
    expect(sendCalls[0]).toHaveLength(1);
    expect(sendCalls[0]![0]!.id).toBe("macro-2026-04-28-brentCrudeUSD-extreme");
  });

  it("AC-2: non-MACRO alert with no history reaches sendAlertsFn", async () => {
    // Non-MACRO alert with empty history — no cooldown suppression → reaches send.
    // (Task 1378: Rule 1 suppresses even critical when signal overlaps in history.)
    const now = new Date().toISOString();
    const stockAlert: Alert = {
      id: "alert-vcb-high",
      actionCode: "VCB",
      signals: [
        {
          type: "price_drop" as SignalType,
          severity: "high",
          actionCode: "VCB",
          message: "VCB: giảm 3%",
          confidence: 0.9,
          detectedAt: now,
        },
      ],
      severity: "high",
      createdAt: now,
      message: "VCB high drop",
      isRead: false,
    };

    const sendCalls: Alert[][] = [];

    const deps: CycleDeps = {
      isMarketHoursFn: () => true,
      readUnnotifiedAlertsFn: async () => [stockAlert],
      markAlertNotifiedFn: async () => {},
      sendAlertsFn: async (alerts) => {
        sendCalls.push(alerts);
        return alerts.length;
      },
      getRecentAlertHistoryFn: async () => [], // no history → no suppression
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      getWatchlistCodesFn: async () => [],
      syncSectorPeersFn: async () => ({ synced: 0, skipped: 0, apiCalls: 0 }),
      computeHexagramsFn: async () => 0,
    };

    await runIntelligenceCycle(deps);

    expect(sendCalls.length).toBeGreaterThan(0);
    expect(sendCalls[0]![0]!.id).toBe("alert-vcb-high");
  });
});
