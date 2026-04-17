process.env["DB_PATH"] = ":memory:";

/**
 * Task 265 — Mention Velocity Store + Reputation Store Tests
 *
 * Uses an in-memory SQLite DB via initDatabase() singleton to test:
 * - mentionVelocityStore: recordMention, getVelocity, getBaseline
 * - reputationStore: saveReputation, getReputation
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  recordMention,
  getVelocity,
  getBaseline,
} from "../infrastructure/db/mentionVelocityStore.js";
import {
  saveReputation,
  getReputation,
} from "../infrastructure/db/reputationStore.js";
import type { ReputationScore } from "../domain/services/reputationScorer.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup: fresh in-memory DB per test
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(async () => {
  closeDb();
  await initDatabase();
  db = getDb();
});


// ─────────────────────────────────────────────────────────────────────────────
// mentionVelocityStore tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 265 — Mention Velocity Store", () => {
  it("records a mention and retrieves velocity", () => {
    const hour = "2026-04-03T10:00:00.000Z";
    recordMention(db, { code: "VNM", hour, mentionCount: 5, negativeCount: 2, sourceCount: 2 });
    const velocity = getVelocity(db, "VNM", hour);
    expect(velocity).not.toBeNull();
    expect(velocity!.mentionCount).toBe(5);
    expect(velocity!.negativeCount).toBe(2);
    expect(velocity!.sourceCount).toBe(2);
  });

  it("upserts: second insert for same code+hour increments counts", () => {
    const hour = "2026-04-03T10:00:00.000Z";
    recordMention(db, { code: "VNM", hour, mentionCount: 3, negativeCount: 1, sourceCount: 1 });
    recordMention(db, { code: "VNM", hour, mentionCount: 2, negativeCount: 1, sourceCount: 1 });
    const velocity = getVelocity(db, "VNM", hour);
    expect(velocity!.mentionCount).toBe(5);
  });

  it("returns null for unknown code", () => {
    const velocity = getVelocity(db, "UNKNOWN", "2026-04-03T10:00:00.000Z");
    expect(velocity).toBeNull();
  });

  it("getBaseline returns average across recent windows", () => {
    // Sprint 053 / 1021: use hours relative to `now` so the 24h window
    // covers them. Hard-coded 2026-04-03 drifted outside the window.
    for (let i = 0; i < 3; i++) {
      const hour = new Date(Date.now() - (i + 1) * 60 * 60 * 1000).toISOString();
      recordMention(db, { code: "VNM", hour, mentionCount: i + 2, negativeCount: 0, sourceCount: 1 });
    }
    // Baseline should be avg of 2, 3, 4 = 3
    const baseline = getBaseline(db, "VNM", 24);
    expect(baseline).toBeCloseTo(3, 1);
  });

  it("getBaseline returns 1 for stock with no history", () => {
    const baseline = getBaseline(db, "UNKNOWN", 24);
    expect(baseline).toBe(1);
  });

  it("stores different codes independently", () => {
    const hour = "2026-04-03T10:00:00.000Z";
    recordMention(db, { code: "VNM", hour, mentionCount: 5, negativeCount: 0, sourceCount: 1 });
    recordMention(db, { code: "FPT", hour, mentionCount: 3, negativeCount: 1, sourceCount: 1 });
    expect(getVelocity(db, "VNM", hour)!.mentionCount).toBe(5);
    expect(getVelocity(db, "FPT", hour)!.mentionCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reputationStore tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 265 — Reputation Store", () => {
  it("saves and retrieves a reputation score", () => {
    const rep: ReputationScore = {
      stockCode: "VNM",
      score: 75,
      riskLevel: "safe",
      trend: "stable",
      computedAt: "2026-04-03T10:00:00.000Z",
    };
    saveReputation(db, rep, "2026-04-03");
    const result = getReputation(db, "VNM", "2026-04-03");
    expect(result).not.toBeNull();
    expect(result!.score).toBe(75);
    expect(result!.riskLevel).toBe("safe");
    expect(result!.trend).toBe("stable");
  });

  it("returns null for unknown code", () => {
    const result = getReputation(db, "UNKNOWN", "2026-04-03");
    expect(result).toBeNull();
  });

  it("upserts reputation for same code+date", () => {
    const rep1: ReputationScore = {
      stockCode: "VNM",
      score: 75,
      riskLevel: "safe",
      trend: "stable",
      computedAt: "2026-04-03T08:00:00.000Z",
    };
    saveReputation(db, rep1, "2026-04-03");
    const rep2: ReputationScore = {
      stockCode: "VNM",
      score: 60,
      riskLevel: "watch",
      trend: "deteriorating",
      computedAt: "2026-04-03T12:00:00.000Z",
    };
    saveReputation(db, rep2, "2026-04-03");
    const result = getReputation(db, "VNM", "2026-04-03");
    expect(result!.score).toBe(60);
    expect(result!.riskLevel).toBe("watch");
  });

  it("stores multiple stocks for same date", () => {
    const date = "2026-04-03";
    saveReputation(db, { stockCode: "VNM", score: 80, riskLevel: "safe", trend: "stable", computedAt: date }, date);
    saveReputation(db, { stockCode: "FPT", score: 45, riskLevel: "warning", trend: "deteriorating", computedAt: date }, date);
    expect(getReputation(db, "VNM", date)!.score).toBe(80);
    expect(getReputation(db, "FPT", date)!.score).toBe(45);
  });

  it("retrieves latest reputation when no date specified", () => {
    saveReputation(db, { stockCode: "VNM", score: 70, riskLevel: "safe", trend: "stable", computedAt: "2026-04-01" }, "2026-04-01");
    saveReputation(db, { stockCode: "VNM", score: 65, riskLevel: "watch", trend: "deteriorating", computedAt: "2026-04-03" }, "2026-04-03");
    const result = getReputation(db, "VNM");
    expect(result!.score).toBe(65);
    expect(result!.riskLevel).toBe("watch");
  });
});
