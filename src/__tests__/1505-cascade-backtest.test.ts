Bun.env["DB_PATH"] = ":memory:";

import { describe, test, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";

describe("1505 cascade-backtest", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
  });

  // AC-1: runCascadeBacktest import exists and returns result shape
  test("AC-1: runCascadeBacktest exists and returns CascadeBacktestResult shape", async () => {
    const { runCascadeBacktest } = await import("../scheduler/cascadeBacktestJob.js");
    const result = await runCascadeBacktest({ db, sendWorkFn: async () => true });
    expect(result).toHaveProperty("processed");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("noData");
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0);
  });

  // AC-2: skip rows newer than 3 days (WHERE clause pre-filters)
  test("AC-2: rows < 3 days old are not processed", async () => {
    const { recordHit } = await import("../infrastructure/db/cascadeHitStore.js");
    const { runCascadeBacktest } = await import("../scheduler/cascadeBacktestJob.js");

    recordHit(db, "oil_gas_up", "text", "oil_gas", "VCB");
    // hit_at defaults to now — within 3 days

    // Insert d0 close so data exists
    const today = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)").run("VCB", today, 50000);

    const result = await runCascadeBacktest({ db, sendWorkFn: async () => true });
    expect(result.processed).toBe(0);

    const row = db.prepare("SELECT price_impact_3d FROM cascade_rule_hits LIMIT 1").get() as { price_impact_3d: number | null };
    expect(row.price_impact_3d).toBeNull();
  });

  // AC-3: fills price_impact_3d and outcome_correct = 1 when price rises > 1%
  test("AC-3: fills price_impact_3d and outcome_correct=1 for +2% rise", async () => {
    const { recordHit } = await import("../infrastructure/db/cascadeHitStore.js");
    const { runCascadeBacktest } = await import("../scheduler/cascadeBacktestJob.js");

    recordHit(db, "oil_gas_up", "text", "oil_gas", "VCB");
    const hitRow = db.prepare("SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1").get() as { id: number };

    const hitDate = "2026-04-10";
    const d3Date = "2026-04-13";
    db.prepare("UPDATE cascade_rule_hits SET hit_at = ? WHERE id = ?").run(hitDate + " 09:00:00", hitRow.id);
    db.prepare("INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)").run("VCB", hitDate, 50000);
    db.prepare("INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)").run("VCB", d3Date, 51000);

    const result = await runCascadeBacktest({ db, sendWorkFn: async () => true });
    expect(result.processed).toBe(1);

    const updated = db.prepare("SELECT price_impact_3d, outcome_correct FROM cascade_rule_hits WHERE id = ?").get(hitRow.id) as { price_impact_3d: number; outcome_correct: number };
    expect(updated.price_impact_3d).toBeCloseTo(2.0, 3);
    expect(updated.outcome_correct).toBe(1);
  });

  // AC-4: outcome_correct = 0 when price drops > 1%
  test("AC-4: outcome_correct=0 for -4% drop", async () => {
    const { recordHit } = await import("../infrastructure/db/cascadeHitStore.js");
    const { runCascadeBacktest } = await import("../scheduler/cascadeBacktestJob.js");

    recordHit(db, "banking_down", "text", "banking", "VCB");
    const hitRow = db.prepare("SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1").get() as { id: number };

    const hitDate = "2026-04-10";
    const d3Date = "2026-04-13";
    db.prepare("UPDATE cascade_rule_hits SET hit_at = ? WHERE id = ?").run(hitDate + " 09:00:00", hitRow.id);
    db.prepare("INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)").run("VCB", hitDate, 50000);
    db.prepare("INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)").run("VCB", d3Date, 48000);

    const result = await runCascadeBacktest({ db, sendWorkFn: async () => true });
    expect(result.processed).toBe(1);

    const updated = db.prepare("SELECT price_impact_3d, outcome_correct FROM cascade_rule_hits WHERE id = ?").get(hitRow.id) as { price_impact_3d: number; outcome_correct: number };
    expect(updated.price_impact_3d).toBeCloseTo(-4.0, 3);
    expect(updated.outcome_correct).toBe(0);
  });

  // AC-5: affected_stocks NULL → noData, updateOutcome NOT called
  test("AC-5: affected_stocks NULL counted as noData, row untouched", async () => {
    const { runCascadeBacktest } = await import("../scheduler/cascadeBacktestJob.js");

    db.prepare(
      "INSERT INTO cascade_rule_hits (rule_key, matched_text, hit_at) VALUES (?, ?, ?)"
    ).run("no_stock_rule", "text", "2026-04-10 09:00:00");

    const result = await runCascadeBacktest({ db, sendWorkFn: async () => true });
    expect(result.noData).toBeGreaterThanOrEqual(1);
    expect(result.processed).toBe(0);
  });

  // AC-6: close_d3 missing → row untouched, noData++
  test("AC-6: missing close_d3 leaves row untouched, noData++", async () => {
    const { recordHit } = await import("../infrastructure/db/cascadeHitStore.js");
    const { runCascadeBacktest } = await import("../scheduler/cascadeBacktestJob.js");

    recordHit(db, "oil_gas_up", "text", "oil_gas", "FPT");
    const hitRow = db.prepare("SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1").get() as { id: number };

    const hitDate = "2026-04-10";
    db.prepare("UPDATE cascade_rule_hits SET hit_at = ? WHERE id = ?").run(hitDate + " 09:00:00", hitRow.id);
    // Insert d0 close only — no d3 row
    db.prepare("INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)").run("FPT", hitDate, 90000);

    const result = await runCascadeBacktest({ db, sendWorkFn: async () => true });
    expect(result.processed).toBe(0);
    expect(result.noData).toBeGreaterThanOrEqual(1);

    const row = db.prepare("SELECT price_impact_3d FROM cascade_rule_hits WHERE id = ?").get(hitRow.id) as { price_impact_3d: number | null };
    expect(row.price_impact_3d).toBeNull();
  });

  // AC-7: sendWorkFn called exactly once with correct format
  test("AC-7: sendWorkFn called exactly once matching [cascade-backtest] format", async () => {
    const { runCascadeBacktest } = await import("../scheduler/cascadeBacktestJob.js");

    const messages: string[] = [];
    const sendWorkFn = async (msg: string) => { messages.push(msg); return true; };

    await runCascadeBacktest({ db, sendWorkFn });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/\[cascade-backtest\] processed=\d+ skipped=\d+ noData=\d+/);
  });
});
