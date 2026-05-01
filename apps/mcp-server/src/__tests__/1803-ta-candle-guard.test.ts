/**
 * Task 1803 — TA candle guard: explicit 'pending' annotation
 *
 * Acceptance criteria:
 *   AC-1: taAlertScanJob does not crash and correctly skips when RSI null
 *         with candlesAvailable provided; scanned=1, fired=0.
 *   AC-2: formatTaIndicatorReport includes "TA: en attente (N/35 bougies)"
 *         when candle count < 35.
 *   AC-3: formatTaIndicatorReport does NOT include the pending annotation
 *         when candle count >= 35 (normal path unaffected).
 *   AC-4: ComputeTAResponse type accepts candlesAvailable field.
 */

// Set DB_PATH before any imports (same pattern as 1307-ta-alert-scan-job.test.ts)
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { formatTaIndicatorReport } from "../interface/mcp/tools/market-data/technicalIndicatorTools.js";
import { runTaAlertScan } from "../scheduler/market-data/taAlertScanJob.js";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY)`);
  db.run(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT, price REAL, fetched_at TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      affected_actions_json TEXT NOT NULL,
      analysis_ids_json TEXT,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT
    )
  `);
  return db;
}

function makeCandles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: 100 + i,
  }));
}

function makeComputeFn(
  rsi: number | null,
  candlesAvailable: number,
): (code: string) => Promise<ComputeTAResponse> {
  return async (code: string): Promise<ComputeTAResponse> => ({
    code,
    trend: "NEUTRAL" as const,
    candlesAvailable,
    ...(rsi !== null ? { rsi } : {}),
  });
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("Task 1803 — TA candle guard", () => {
  // AC-1: scan does not crash and correctly skips null RSI
  it("AC-1: scan returns scanned=1 fired=0 for null RSI with candlesAvailable", async () => {
    const db = buildTestDb();
    db.run("INSERT INTO watchlist (code) VALUES ('VIC')");

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(null, 2),
      nowFn: () => new Date("2026-05-01T03:00:00Z"),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(0);
  });

  // AC-2: pending annotation in report
  it("AC-2: report includes TA pending annotation when candles < 35 (2 candles)", () => {
    const candles = makeCandles(2);
    const report = formatTaIndicatorReport("VIC", candles, 60);
    expect(report).toContain("TA: en attente (2/35 bougies)");
  });

  it("AC-2: report includes correct count in pending annotation (10 candles)", () => {
    const candles = makeCandles(10);
    const report = formatTaIndicatorReport("VIC", candles, 60);
    expect(report).toContain("TA: en attente (10/35 bougies)");
  });

  // AC-3: normal path unaffected
  it("AC-3: report does NOT include pending annotation when candles >= 35", () => {
    const candles = makeCandles(50);
    const report = formatTaIndicatorReport("VIC", candles, 60);
    expect(report).not.toContain("TA: en attente");
  });

  // AC-4: ComputeTAResponse type accepts candlesAvailable
  it("AC-4: ComputeTAResponse type accepts candlesAvailable field", () => {
    const response: ComputeTAResponse = {
      code: "VIC",
      trend: "NEUTRAL",
      candlesAvailable: 2,
    };
    expect(response.candlesAvailable).toBe(2);
  });
});
