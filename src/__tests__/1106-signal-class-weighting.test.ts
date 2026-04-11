/**
 * Task 1106 — Signal Fix B: signal_class migration + conviction score weighting
 *
 * Tests cover:
 *   - Schema: agent_signals has signal_class column after initDatabase()
 *   - Storage: postSignal with signal_class persists the value
 *   - Weighting: computeWeightedConvictionScore applies class weights correctly
 *   - Regression: NULL signal_class == weight 1.0 == simple average
 *   - Data safety: pre-migration rows retain NULL signal_class, no data loss
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// We open :memory: DBs directly — no singleton
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";
import {
  SIGNAL_CLASS_WEIGHTS,
  computeWeightedConvictionScore,
  type SignalClassWeight,
} from "../domain/services/signalClassWeighter.js";

// ── helpers ────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  return new Database(":memory:");
}

// Reset the singleton between tests — needed because initDatabase() uses getDb()
function setTestDbEnv(): void {
  process.env["DB_PATH"] = ":memory:";
  process.env["BUN_ENV"] = "test";
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Task 1106 — signal_class migration + weighting", () => {

  // ── Schema tests ──────────────────────────────────────────────────────────

  describe("Schema: agent_signals.signal_class column", () => {
    beforeEach(() => {
      setTestDbEnv();
      closeDb();
    });

    afterEach(() => {
      closeDb();
    });

    it("agent_signals has signal_class column after initDatabase()", async () => {
      await initDatabase();

      const { getDb } = await import("../infrastructure/db/schema.js");
      const db = getDb();

      const cols = db
        .query<{ name: string }, []>("PRAGMA table_info(agent_signals)")
        .all();

      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("signal_class");
    });

    it("signal_class column is nullable (existing rows have NULL, no data loss)", async () => {
      await initDatabase();

      const { getDb } = await import("../infrastructure/db/schema.js");
      const db = getDb();

      // Insert a signal WITHOUT signal_class (simulates pre-migration row)
      db.exec(`
        INSERT INTO agent_signals
          (from_agent, to_agent, signal_type, payload, expires_at)
        VALUES
          ('01-news-scout', 'all', 'urgent_news', '{}', datetime('now', '+2 hours'))
      `);

      const row = db
        .query<{ signal_class: string | null }, []>(
          "SELECT signal_class FROM agent_signals ORDER BY id DESC LIMIT 1",
        )
        .get();

      expect(row).not.toBeNull();
      expect(row!.signal_class).toBeNull();
    });
  });

  // ── Storage tests ─────────────────────────────────────────────────────────

  describe("postSignal with signal_class", () => {
    beforeEach(() => {
      setTestDbEnv();
      closeDb();
    });

    afterEach(() => {
      closeDb();
    });

    it("stores signal_class='structural_factor' correctly", async () => {
      await initDatabase();

      const { getDb } = await import("../infrastructure/db/schema.js");
      const db = getDb();

      const id = postSignal(db, {
        fromAgent: "01-news-scout",
        toAgent: "05-alert-commander",
        signalType: "urgent_news",
        stockCode: "FPT",
        payload: { title: "FPT P/E analysis", impact_score: 6 },
        ttlMinutes: 120,
        signalClass: "structural_factor",
      });

      expect(id).toBeGreaterThan(0);

      const row = db
        .query<{ signal_class: string | null }, [number]>(
          "SELECT signal_class FROM agent_signals WHERE id = ?",
        )
        .get(id);

      expect(row).not.toBeNull();
      expect(row!.signal_class).toBe("structural_factor");
    });

    it("stores signal_class='one_time_catalyst' correctly", async () => {
      await initDatabase();

      const { getDb } = await import("../infrastructure/db/schema.js");
      const db = getDb();

      const id = postSignal(db, {
        fromAgent: "01-news-scout",
        toAgent: "05-alert-commander",
        signalType: "urgent_news",
        stockCode: "FPT",
        payload: { title: "FPT wins government contract", impact_score: 8 },
        ttlMinutes: 120,
        signalClass: "one_time_catalyst",
      });

      const row = db
        .query<{ signal_class: string | null }, [number]>(
          "SELECT signal_class FROM agent_signals WHERE id = ?",
        )
        .get(id);

      expect(row!.signal_class).toBe("one_time_catalyst");
    });

    it("stores signal_class=undefined as NULL", async () => {
      await initDatabase();

      const { getDb } = await import("../infrastructure/db/schema.js");
      const db = getDb();

      const id = postSignal(db, {
        fromAgent: "01-news-scout",
        toAgent: "05-alert-commander",
        signalType: "urgent_news",
        payload: { title: "generic signal" },
        ttlMinutes: 120,
        // signalClass intentionally omitted
      });

      const row = db
        .query<{ signal_class: string | null }, [number]>(
          "SELECT signal_class FROM agent_signals WHERE id = ?",
        )
        .get(id);

      expect(row!.signal_class).toBeNull();
    });

    it("stores all 5 valid signal classes", async () => {
      await initDatabase();

      const { getDb } = await import("../infrastructure/db/schema.js");
      const db = getDb();

      const classes: SignalClassWeight[] = [
        "structural_factor",
        "cyclical",
        "technical_signal",
        "one_time_catalyst",
        "sentiment",
      ];

      for (const cls of classes) {
        const id = postSignal(db, {
          fromAgent: "test",
          toAgent: "all",
          signalType: "urgent_news",
          payload: {},
          ttlMinutes: 120,
          signalClass: cls,
        });

        const row = db
          .query<{ signal_class: string | null }, [number]>(
            "SELECT signal_class FROM agent_signals WHERE id = ?",
          )
          .get(id);

        expect(row!.signal_class).toBe(cls);
      }
    });
  });

  // ── Weight map tests ──────────────────────────────────────────────────────

  describe("SIGNAL_CLASS_WEIGHTS map", () => {
    it("structural_factor has weight 1.5", () => {
      expect(SIGNAL_CLASS_WEIGHTS.structural_factor).toBe(1.5);
    });

    it("cyclical has weight 1.0", () => {
      expect(SIGNAL_CLASS_WEIGHTS.cyclical).toBe(1.0);
    });

    it("technical_signal has weight 0.8", () => {
      expect(SIGNAL_CLASS_WEIGHTS.technical_signal).toBe(0.8);
    });

    it("one_time_catalyst has weight 0.7", () => {
      expect(SIGNAL_CLASS_WEIGHTS.one_time_catalyst).toBe(0.7);
    });

    it("sentiment has weight 0.5", () => {
      expect(SIGNAL_CLASS_WEIGHTS.sentiment).toBe(0.5);
    });
  });

  // ── computeWeightedConvictionScore tests ──────────────────────────────────

  describe("computeWeightedConvictionScore", () => {
    it("AC-B2: structural_factor score=0.6 + one_time_catalyst score=0.9 → ~0.695", () => {
      const signals = [
        { score: 0.6, signalClass: "structural_factor" as SignalClassWeight },
        { score: 0.9, signalClass: "one_time_catalyst" as SignalClassWeight },
      ];

      const result = computeWeightedConvictionScore(signals);

      // (0.6*1.5 + 0.9*0.7) / (1.5 + 0.7) = (0.90 + 0.63) / 2.2 = 1.53 / 2.2 ≈ 0.6954...
      expect(result).toBeCloseTo(0.695, 2);
    });

    it("AC-B2: weighted result differs from simple average of 0.75", () => {
      const signals = [
        { score: 0.6, signalClass: "structural_factor" as SignalClassWeight },
        { score: 0.9, signalClass: "one_time_catalyst" as SignalClassWeight },
      ];

      const result = computeWeightedConvictionScore(signals);
      const simpleAvg = (0.6 + 0.9) / 2; // 0.75

      expect(result).not.toBeCloseTo(simpleAvg, 2);
      expect(result).toBeCloseTo(0.695, 2);
    });

    it("AC-B3: all NULL signal_class → equals simple average (weight=1.0 for all)", () => {
      const signals = [
        { score: 0.4, signalClass: null },
        { score: 0.8, signalClass: null },
        { score: 0.6, signalClass: null },
      ];

      const result = computeWeightedConvictionScore(signals);
      const simpleAvg = (0.4 + 0.8 + 0.6) / 3; // 0.6

      expect(result).toBeCloseTo(simpleAvg, 5);
    });

    it("AC-B3: undefined signal_class treated as weight 1.0 (same as NULL)", () => {
      const signals = [
        { score: 0.4, signalClass: undefined },
        { score: 0.8, signalClass: undefined },
      ];

      const result = computeWeightedConvictionScore(signals);
      const simpleAvg = (0.4 + 0.8) / 2; // 0.6

      expect(result).toBeCloseTo(simpleAvg, 5);
    });

    it("single signal: score returned as-is regardless of class", () => {
      const result = computeWeightedConvictionScore([
        { score: 0.7, signalClass: "structural_factor" as SignalClassWeight },
      ]);

      expect(result).toBeCloseTo(0.7, 5);
    });

    it("empty signals array returns 0", () => {
      const result = computeWeightedConvictionScore([]);
      expect(result).toBe(0);
    });

    it("mixed: structural_factor score=0.5 + cyclical score=0.5 → 0.5 (symmetric)", () => {
      const result = computeWeightedConvictionScore([
        { score: 0.5, signalClass: "structural_factor" as SignalClassWeight },
        { score: 0.5, signalClass: "cyclical" as SignalClassWeight },
      ]);

      // (0.5*1.5 + 0.5*1.0) / (1.5 + 1.0) = 1.25 / 2.5 = 0.5
      expect(result).toBeCloseTo(0.5, 5);
    });

    it("high structural_factor pulls score up vs low one_time_catalyst", () => {
      const weighted = computeWeightedConvictionScore([
        { score: 0.8, signalClass: "structural_factor" as SignalClassWeight },
        { score: 0.2, signalClass: "one_time_catalyst" as SignalClassWeight },
      ]);

      const simple = (0.8 + 0.2) / 2; // 0.5

      // Weighted should be > simple because structural_factor has higher weight
      // (0.8*1.5 + 0.2*0.7)/(1.5+0.7) = (1.2+0.14)/2.2 = 1.34/2.2 ≈ 0.609
      expect(weighted).toBeGreaterThan(simple);
      expect(weighted).toBeCloseTo(0.609, 2);
    });

    it("result is clamped to [0, 1]", () => {
      const result = computeWeightedConvictionScore([
        { score: 1.0, signalClass: "structural_factor" as SignalClassWeight },
        { score: 1.0, signalClass: "structural_factor" as SignalClassWeight },
      ]);

      expect(result).toBeLessThanOrEqual(1.0);
      expect(result).toBeGreaterThanOrEqual(0.0);
    });
  });
});
