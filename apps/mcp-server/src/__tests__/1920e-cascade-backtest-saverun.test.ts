Bun.env["DB_PATH"] = ":memory:";

// apps/mcp-server/src/__tests__/1920e-cascade-backtest-saverun.test.ts
// Task 1920e — Wire BacktestResultRepo.saveRun() in cascadeBacktestJob
// Note: DB_PATH is set to :memory: by setup.ts preload (Bun.env)

import { describe, test, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";
import type { BacktestRunRecord } from "../domain/repositories/IBacktestResultRepository.js";
import type { IBacktestResultRepository } from "../domain/repositories/IBacktestResultRepository.js";

describe("1920e — cascadeBacktestJob saveRun wiring", () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(":memory:");
    const { initDatabase } = await import("../infrastructure/db/schema.js");
    initDatabase(db);
  });

  // TC-1: saveRun called after loop with correct aggregate metrics
  test("TC-1: saveRun called after loop with correct aggregate metrics", async () => {
    const { runCascadeBacktest } = await import(
      "../scheduler/macro/cascadeBacktestJob.js"
    );
    const { recordHit } = await import(
      "../infrastructure/db/cascadeHitStore.js"
    );

    // Insert two hits older than 3 days
    recordHit(db, "oil_gas_up", "text", "oil_gas", "VCB");
    const row1 = db
      .prepare(
        "SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1"
      )
      .get() as { id: number };

    recordHit(db, "banking_up", "text", "banking", "BID");
    const row2 = db
      .prepare(
        "SELECT id FROM cascade_rule_hits ORDER BY id DESC LIMIT 1"
      )
      .get() as { id: number };

    const hitDate = "2026-04-10";
    const d3Date = "2026-04-13";

    // row1: +2% → outcomeCorrect=1
    db.prepare(
      "UPDATE cascade_rule_hits SET hit_at = ? WHERE id = ?"
    ).run(hitDate + " 09:00:00", row1.id);
    db.prepare(
      "INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)"
    ).run("VCB", hitDate, 50000);
    db.prepare(
      "INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)"
    ).run("VCB", d3Date, 51000);

    // row2: -4% → outcomeCorrect=0
    db.prepare(
      "UPDATE cascade_rule_hits SET hit_at = ? WHERE id = ?"
    ).run(hitDate + " 09:00:00", row2.id);
    db.prepare(
      "INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)"
    ).run("BID", hitDate, 30000);
    db.prepare(
      "INSERT INTO daily_ohlcv (code, date, close) VALUES (?, ?, ?)"
    ).run("BID", d3Date, 28800);

    const savedRecords: BacktestRunRecord[] = [];
    const mockRepo: IBacktestResultRepository = {
      saveRun: (record: BacktestRunRecord) => {
        savedRecords.push(record);
      },
      getRunsByStrategy: () => [],
      getAllRuns: () => [],
      getRunById: () => null,
      deleteRun: () => false,
    };

    await runCascadeBacktest({
      db,
      sendWorkFn: async () => true,
      backtestResultRepo: mockRepo,
    });

    // saveRun must be called exactly once
    expect(savedRecords).toHaveLength(1);

    expect(savedRecords[0]).toBeDefined();
    const rec = savedRecords[0]!;
    expect(rec.strategy).toBe("cascade-backtest");
    expect(rec.tradeCount).toBe(2);

    // totalReturn = mean of [2.0, -4.0] = -1.0
    expect(rec.totalReturn).toBeCloseTo(-1.0, 3);

    // maxDrawdown = min of [2.0, -4.0] = -4.0
    expect(rec.maxDrawdown).toBeCloseTo(-4.0, 3);

    // winRate = 1 outcomeCorrect=1 out of 2 processed = 0.5
    expect(rec.winRate).toBeCloseTo(0.5, 4);

    expect(rec.benchmarkReturn).toBeNull();
    expect(rec.sharpeRatio).toBeNull();
    expect(rec.id).toBeTruthy();
    expect(rec.runAt).toBeTruthy();
    expect(rec.endDate).toBeTruthy();
  });

  // TC-2: saveRun NOT skipped when zero hits processed (AC-6: tradeCount=0, etc.)
  test("TC-2: saveRun called with tradeCount=0 when no hits processed", async () => {
    const { runCascadeBacktest } = await import(
      "../scheduler/macro/cascadeBacktestJob.js"
    );

    const savedRecords: BacktestRunRecord[] = [];
    const mockRepo: IBacktestResultRepository = {
      saveRun: (record: BacktestRunRecord) => {
        savedRecords.push(record);
      },
      getRunsByStrategy: () => [],
      getAllRuns: () => [],
      getRunById: () => null,
      deleteRun: () => false,
    };

    await runCascadeBacktest({
      db,
      sendWorkFn: async () => true,
      backtestResultRepo: mockRepo,
    });

    // saveRun still called even with zero hits
    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0]).toBeDefined();
    const rec = savedRecords[0]!;
    expect(rec.tradeCount).toBe(0);
    expect(rec.totalReturn).toBe(0);
    expect(rec.winRate).toBe(0);
    expect(rec.maxDrawdown).toBe(0);
    expect(rec.strategy).toBe("cascade-backtest");
  });

  // AC-4: sendWorkFn still called even when saveRun throws
  test("AC-4: sendWorkFn called even if saveRun throws", async () => {
    const { runCascadeBacktest } = await import(
      "../scheduler/macro/cascadeBacktestJob.js"
    );

    const throwingRepo: IBacktestResultRepository = {
      saveRun: () => {
        throw new Error("DB write failure");
      },
      getRunsByStrategy: () => [],
      getAllRuns: () => [],
      getRunById: () => null,
      deleteRun: () => false,
    };

    const workMessages: string[] = [];
    const sendWorkFn = async (msg: string) => {
      workMessages.push(msg);
      return true;
    };

    // Must not throw despite saveRun failing
    await runCascadeBacktest({
      db,
      sendWorkFn,
      backtestResultRepo: throwingRepo,
    });

    // sendWorkFn still called
    expect(workMessages).toHaveLength(1);
    expect(workMessages[0]).toMatch(/\[cascade-backtest\]/);
  });

  // AC-5: CascadeBacktestDeps.backtestResultRepo can be a mock
  test("AC-5: backtestResultRepo injection accepted as mock (interface contract)", async () => {
    const { runCascadeBacktest } = await import(
      "../scheduler/macro/cascadeBacktestJob.js"
    );

    let called = false;
    const mockRepo: IBacktestResultRepository = {
      saveRun: (_record: BacktestRunRecord) => {
        called = true;
      },
      getRunsByStrategy: () => [],
      getAllRuns: () => [],
      getRunById: () => null,
      deleteRun: () => false,
    };

    await runCascadeBacktest({
      db,
      sendWorkFn: async () => true,
      backtestResultRepo: mockRepo,
    });

    expect(called).toBe(true);
  });

  // resultJson contains expected keys
  test("resultJson contains processed/skipped/noData keys", async () => {
    const { runCascadeBacktest } = await import(
      "../scheduler/macro/cascadeBacktestJob.js"
    );

    const savedRecords: BacktestRunRecord[] = [];
    const mockRepo: IBacktestResultRepository = {
      saveRun: (record: BacktestRunRecord) => {
        savedRecords.push(record);
      },
      getRunsByStrategy: () => [],
      getAllRuns: () => [],
      getRunById: () => null,
      deleteRun: () => false,
    };

    await runCascadeBacktest({
      db,
      sendWorkFn: async () => true,
      backtestResultRepo: mockRepo,
    });

    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0]).toBeDefined();
    const parsed = JSON.parse(savedRecords[0]!.resultJson);
    expect(parsed).toHaveProperty("processed");
    expect(parsed).toHaveProperty("skipped");
    expect(parsed).toHaveProperty("noData");
    expect(parsed).toHaveProperty("mean3dImpact");
    expect(parsed).toHaveProperty("minImpact");
  });
});
