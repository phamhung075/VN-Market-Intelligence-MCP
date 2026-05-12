/**
 * Task 1879b — get_fed_liquidity_spread MCP Tool
 *
 * Tests for computeFedLiquiditySpread domain fn, fetchEffrIorbSamples infra helper,
 * and the get_fed_liquidity_spread MCP tool registration.
 *
 * 5 tests:
 *   T1 — schema: output matches expected shape
 *   T2 — fixture: 30-row widening dataset → trend30d='widening', spread>0
 *   T3 — classification: narrowing / flat / stable
 *   T4 — insufficient_data: <30 rows → trend30d=null; 0 rows → InsufficientDataError
 *   T5 — DDD audit: domain fn pure (no DB/Date.now imports); interface calls infra→domain
 */

import { Database } from "bun:sqlite";
import { describe, it, expect } from "bun:test";
import { z } from "zod";

import {
  computeFedLiquiditySpread,
  InsufficientDataError,
  type FedLiquiditySpreadResult,
} from "../domain/services/macro/computeFedLiquiditySpread.js";
import { fetchEffrIorbSamples } from "../infrastructure/db/fredQueries.js";

// ---------------------------------------------------------------------------
// Schema (Zod)
// ---------------------------------------------------------------------------

const FedLiquiditySpreadSchema = z.object({
  effr: z.number(),
  iorb: z.number(),
  spread: z.number(),
  asOf: z.string(),
  trend30d: z.enum(["widening", "narrowing", "stable"]).nullable(),
  samples: z.number().int(),
});

// ---------------------------------------------------------------------------
// In-memory DB factory with fred_series_daily schema
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fred_series_daily (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      series     TEXT NOT NULL,
      date       TEXT NOT NULL,
      value      REAL NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(series, date) ON CONFLICT IGNORE
    );
    CREATE INDEX IF NOT EXISTS idx_fred_series_date ON fred_series_daily(series, date);
  `);
  return db;
}

// ---------------------------------------------------------------------------
// Sample builders
// ---------------------------------------------------------------------------

/** Build N samples with a linear spread trend. spreadStart → spreadEnd over N days. */
function buildSamples(
  n: number,
  baseEffr: number,
  spreadStart: number,
  spreadEnd: number,
): Array<{ date: string; effr: number; iorb: number }> {
  const samples: Array<{ date: string; effr: number; iorb: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const spread = spreadStart + t * (spreadEnd - spreadStart);
    const effr = baseEffr;
    const iorb = effr - spread;
    // date: use simple day strings
    const d = new Date(2026, 0, 1 + i);
    const date = d.toISOString().slice(0, 10);
    samples.push({ date, effr, iorb });
  }
  return samples;
}

/** Seed fred_series_daily with EFFR and IORB rows from samples array. */
function seedDb(
  db: Database,
  samples: Array<{ date: string; effr: number; iorb: number }>,
): void {
  const insertEFFR = db.prepare(
    `INSERT OR IGNORE INTO fred_series_daily (series, date, value) VALUES ('EFFR', ?, ?)`,
  );
  const insertIORB = db.prepare(
    `INSERT OR IGNORE INTO fred_series_daily (series, date, value) VALUES ('IORB', ?, ?)`,
  );
  for (const s of samples) {
    insertEFFR.run(s.date, s.effr);
    insertIORB.run(s.date, s.iorb);
  }
}

// ===========================================================================
// T1 — Schema: output matches Zod schema
// ===========================================================================

describe("T1 — schema: output matches FedLiquiditySpreadSchema", () => {
  it("should return an object conforming to the schema with 30 rows", () => {
    const samples = buildSamples(30, 5.33, 0.05, 0.15); // widening
    const result = computeFedLiquiditySpread(samples);
    const parsed = FedLiquiditySpreadSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("should have correct field types: spread = effr - iorb at latest row", () => {
    const samples = buildSamples(30, 5.33, 0.1, 0.2);
    const result = computeFedLiquiditySpread(samples);
    const last = samples[samples.length - 1]!;
    const expectedSpread = last.effr - last.iorb;
    expect(result.effr).toBe(last.effr);
    expect(result.iorb).toBe(last.iorb);
    expect(Math.abs(result.spread - expectedSpread)).toBeLessThan(1e-9);
    expect(result.asOf).toBe(last.date);
    expect(result.samples).toBe(30);
  });
});

// ===========================================================================
// T2 — Fixture: 30-row widening dataset → trend30d='widening', spread>0
// ===========================================================================

describe("T2 — fixture: 30-row widening dataset", () => {
  it("should classify trend30d='widening' when spread increases by >0.01/day", () => {
    // spread goes from 0.05 to 0.65 over 30 days → OLS slope ≈ 0.02 > 0.01
    const samples = buildSamples(30, 5.33, 0.05, 0.65);
    const result = computeFedLiquiditySpread(samples);
    expect(result.trend30d).toBe("widening");
    expect(result.spread).toBeGreaterThan(0);
    expect(result.samples).toBe(30);
  });

  it("should have spread > 0 (effr > iorb)", () => {
    const samples = buildSamples(30, 5.33, 0.10, 0.30);
    const result = computeFedLiquiditySpread(samples);
    expect(result.spread).toBeGreaterThan(0);
  });
});

// ===========================================================================
// T3 — Classification: narrowing / stable
// ===========================================================================

describe("T3 — classification: narrowing and stable", () => {
  it("should classify trend30d='narrowing' when spread decreases by >0.01/day", () => {
    // spread goes from 0.65 to 0.05 over 30 days → OLS slope ≈ -0.02 < -0.01
    const samples = buildSamples(30, 5.33, 0.65, 0.05);
    const result = computeFedLiquiditySpread(samples);
    expect(result.trend30d).toBe("narrowing");
  });

  it("should classify trend30d='stable' when OLS slope is between -0.01 and 0.01", () => {
    // flat: spread constant at 0.1 → slope = 0
    const samples = buildSamples(30, 5.33, 0.1, 0.1);
    const result = computeFedLiquiditySpread(samples);
    expect(result.trend30d).toBe("stable");
  });
});

// ===========================================================================
// T4 — Insufficient data
// ===========================================================================

describe("T4 — insufficient data handling", () => {
  it("should return trend30d=null when samples.length < 30", () => {
    const samples = buildSamples(15, 5.33, 0.1, 0.2);
    const result = computeFedLiquiditySpread(samples);
    expect(result.trend30d).toBeNull();
    expect(result.effr).toBe(samples[samples.length - 1]!.effr);
    expect(result.samples).toBe(15);
  });

  it("should throw InsufficientDataError when 0 rows provided", () => {
    expect(() => computeFedLiquiditySpread([])).toThrow(InsufficientDataError);
  });
});

// ===========================================================================
// T5 — DDD audit: domain fn pure; fetchEffrIorbSamples infra query works
// ===========================================================================

describe("T5 — DDD audit", () => {
  it("domain fn is pure: no DB import, no Date.now() — source text check", async () => {
    // Read the source file and verify no infra/interface imports
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL(
        "../domain/services/macro/computeFedLiquiditySpread.ts",
        import.meta.url,
      ),
      "utf-8",
    );
    // Strip comment lines before checking for banned patterns
    const codeLines = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
    // Must not import from infra or interface
    expect(codeLines).not.toMatch(/from ['"].*infrastructure/);
    expect(codeLines).not.toMatch(/from ['"].*interface/);
    // Must not call Date.now() in actual code
    expect(codeLines).not.toMatch(/Date\.now\(\)/);
  });

  it("fetchEffrIorbSamples returns correct rows from in-memory DB", () => {
    const db = makeTestDb();
    const samples = buildSamples(10, 5.0, 0.08, 0.12);
    seedDb(db, samples);
    const rows = fetchEffrIorbSamples(db, 365); // large window to get all
    expect(rows.length).toBe(10);
    expect(rows[0]).toHaveProperty("date");
    expect(rows[0]).toHaveProperty("effr");
    expect(rows[0]).toHaveProperty("iorb");
  });
});
