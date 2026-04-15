process.env["DB_PATH"] = ":memory:";

/**
 * Task 266 — Signal Integration Tests
 *
 * Tests that:
 * 1. SignalType includes "crisis_event"
 * 2. detectSignals generates crisis_event when CrisisEvent context provided
 * 3. Crisis cooldown is 30 minutes
 * 4. getReputationWarnings identifies stocks with reputation < 50
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { detectSignals } from "../domain/services/signalDetector.js";
import type { SignalType } from "../domain/services/signalDetector.js";
import { ensureMentionVelocityTable } from "./helpers/mentionVelocityTestDdl.js";
import { saveReputation, getReputation } from "../infrastructure/db/reputationStore.js";
import { ensureReputationScoresTable } from "./helpers/reputationScoresTestDdl.js";
import { CRISIS_COOLDOWN_MINUTES } from "../domain/services/crisisPatternDetector.js";
import { getReputationWarnings } from "../application/usecases/getReputationWarnings.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function makeDb() {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureMentionVelocityTable(db);
  ensureReputationScoresTable(db);
  return db;
}

describe("Task 266 — Signal Integration", () => {
  // 1. SignalType extends with crisis_event
  it("SignalType includes 'crisis_event'", () => {
    const t: SignalType = "crisis_event";
    expect(t).toBe("crisis_event");
  });

  // 2. crisis_event signal detected when crisis context provided
  it("detects crisis_event signal when crisis context is provided", () => {
    const snapshot = {
      actionCode: "VNM",
      price: 100000,
      previousPrice: 100000,
      volume: 1000,
      avgVolume: 1000,
    };
    const context = {
      crisisEvent: {
        detected: true,
        severity: "high" as const,
        crisisType: "product_recall" as const,
        matchedPatterns: ["thu hồi sản phẩm"],
        velocityRatio: 4.5,
      },
    };
    const signals = detectSignals(snapshot, context);
    const crisisSignal = signals.find((s) => s.type === "crisis_event");
    expect(crisisSignal).toBeDefined();
    expect(crisisSignal!.severity).toBe("high");
    expect(crisisSignal!.actionCode).toBe("VNM");
  });

  // 3. No crisis signal when no crisis context
  it("does not produce crisis_event signal without crisis context", () => {
    const snapshot = {
      actionCode: "VNM",
      price: 100000,
      previousPrice: 100000,
      volume: 1000,
      avgVolume: 1000,
    };
    const signals = detectSignals(snapshot, {});
    const crisisSignal = signals.find((s) => s.type === "crisis_event");
    expect(crisisSignal).toBeUndefined();
  });

  // 4. crisis_event with critical severity
  it("crisis_event signal maps critical severity", () => {
    const snapshot = {
      actionCode: "VCB",
      price: 80000,
      previousPrice: 80000,
      volume: 500,
      avgVolume: 500,
    };
    const context = {
      crisisEvent: {
        detected: true,
        severity: "critical" as const,
        crisisType: "fraud_scandal" as const,
        matchedPatterns: ["gian lận tài chính"],
        velocityRatio: 6.2,
      },
    };
    const signals = detectSignals(snapshot, context);
    const crisisSignal = signals.find((s) => s.type === "crisis_event");
    expect(crisisSignal).toBeDefined();
    expect(crisisSignal!.severity).toBe("critical");
  });

  // 5. Crisis cooldown constant is 30 minutes
  it("CRISIS_COOLDOWN_MINUTES is 30", () => {
    expect(CRISIS_COOLDOWN_MINUTES).toBe(30);
  });

  // 6. getReputationWarnings returns stocks with score < 50
  it("getReputationWarnings returns stocks with reputation < 50", () => {
    const db = makeDb();
    const today = new Date().toISOString().slice(0, 10);
    saveReputation(db, {
      stockCode: "VNM",
      score: 40,
      riskLevel: "warning",
      trend: "deteriorating",
      computedAt: new Date().toISOString(),
    }, today);
    saveReputation(db, {
      stockCode: "FPT",
      score: 80,
      riskLevel: "safe",
      trend: "stable",
      computedAt: new Date().toISOString(),
    }, today);
    const warnings = getReputationWarnings(db, ["VNM", "FPT"]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]!.stockCode).toBe("VNM");
    db.close();
  });

  // 7. getReputationWarnings returns empty when all scores safe
  it("getReputationWarnings returns empty when all reputation scores are >= 50", () => {
    const db = makeDb();
    const today = new Date().toISOString().slice(0, 10);
    saveReputation(db, {
      stockCode: "VNM",
      score: 75,
      riskLevel: "safe",
      trend: "stable",
      computedAt: new Date().toISOString(),
    }, today);
    const warnings = getReputationWarnings(db, ["VNM"]);
    expect(warnings.length).toBe(0);
    db.close();
  });

  // 8. getReputationWarnings handles stocks with no reputation record
  it("getReputationWarnings ignores stocks with no reputation record", () => {
    const db = makeDb();
    const warnings = getReputationWarnings(db, ["VNM", "FPT"]);
    // No records → no warnings
    expect(warnings.length).toBe(0);
    db.close();
  });
});
