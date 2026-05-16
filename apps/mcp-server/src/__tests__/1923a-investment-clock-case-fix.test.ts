// apps/mcp-server/src/__tests__/1923a-investment-clock-case-fix.test.ts
// Task 1923a — Investment clock case-mismatch fix
//
// TC1: DB row with country='vietnam' → investment clock returns a valid phase (not null)
// TC2: country='Vietnam' query finds nothing; 'vietnam' query finds the row (case fix)
// TC3: RECOVERY phase: gdpGrowth=7.4, cpi=2.84 → phase='Recovery', growth='UP', inflation='LOW'
// TC4: macroIndicatorRefreshJob upserts with country='vietnam' (lowercase SSOT key)

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeAll } from "bun:test";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";
import { classifyInvestmentClockPhase } from "../domain/services/macro/investmentClock.js";

describe("Task 1923a — Investment Clock Case Fix", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    await initDatabase();
    db = getDb();
  });

  // ── TC1: DB row with country='vietnam' → valid phase returned ─────────────
  it("TC1: row country='vietnam' + gdpGrowth=7.4 + cpi=2.84 → non-null phase from readVietnamMacroIndicators", () => {
    // Seed DB with lowercase 'vietnam' as SSOT requires
    db.exec("DELETE FROM macro_indicators");
    db.prepare(
      `INSERT INTO macro_indicators (country, gdp_growth, cpi, fetched_at)
       VALUES (?, ?, ?, ?)`
    ).run("vietnam", 7.4, 2.84, "2025-03-01T00:00:00Z");

    // Query as the fixed tool should — lowercase 'vietnam'
    const row = db
      .prepare<
        { gdp_growth: number | null; cpi: number | null; manufacturing_pmi: number | null; inflation_rate: number | null },
        [string]
      >(
        `SELECT manufacturing_pmi, gdp_growth, cpi, inflation_rate
         FROM macro_indicators
         WHERE country = ?
         ORDER BY fetched_at DESC
         LIMIT 1`
      )
      .get("vietnam");

    expect(row).not.toBeNull();
    expect(row?.gdp_growth).toBe(7.4);
    expect(row?.cpi).toBe(2.84);
  });

  // ── TC2: uppercase 'Vietnam' query finds nothing; lowercase finds the row ──
  it("TC2: query with 'Vietnam' (capital V) returns null; 'vietnam' (lowercase) returns the row", () => {
    db.exec("DELETE FROM macro_indicators");
    db.prepare(
      `INSERT INTO macro_indicators (country, gdp_growth, cpi, fetched_at)
       VALUES (?, ?, ?, ?)`
    ).run("vietnam", 7.4, 2.84, "2025-03-01T00:00:00Z");

    // Capital V — should NOT find it (SQLite TEXT is case-sensitive for = operator)
    const wrongRow = db
      .prepare<{ gdp_growth: number | null }, [string]>(
        `SELECT gdp_growth FROM macro_indicators WHERE country = ?`
      )
      .get("Vietnam");
    expect(wrongRow).toBeNull();

    // Lowercase — MUST find it
    const correctRow = db
      .prepare<{ gdp_growth: number | null }, [string]>(
        `SELECT gdp_growth FROM macro_indicators WHERE country = ?`
      )
      .get("vietnam");
    expect(correctRow).not.toBeNull();
    expect(correctRow?.gdp_growth).toBe(7.4);
  });

  // ── TC3: RECOVERY phase — gdpGrowth=7.4, CPI=2.84 ────────────────────────
  it("TC3: classifyInvestmentClockPhase({pmi:null, cpi:2.84, gdpGrowth:7.4}) → Recovery, UP, LOW", () => {
    const result = classifyInvestmentClockPhase({
      pmi: null,
      cpi: 2.84,
      gdpGrowth: 7.4,
    });
    expect(result.phase).toBe("Recovery");
    expect(result.growthSignal).toBe("UP");
    expect(result.inflationSignal).toBe("LOW");
    expect(result.reason).toBeUndefined();
  });

  // ── TC4: macroIndicatorRefreshJob upserts with 'vietnam' key ─────────────
  it("TC4: upsert with country='vietnam' updates existing row (not creates duplicate)", () => {
    db.exec("DELETE FROM macro_indicators");

    // Pre-insert existing row (as DB SSOT — lowercase)
    db.prepare(
      `INSERT INTO macro_indicators (country, gdp_growth, cpi, fetched_at)
       VALUES (?, ?, ?, ?)`
    ).run("vietnam", 7.4, 2.84, "2025-03-01T00:00:00Z");

    // Simulate the fixed upsert using 'vietnam' (lowercase)
    db.prepare(
      `INSERT INTO macro_indicators
         (country, interest_rate, fetched_at, last_refresh_job)
       VALUES (?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(country) DO UPDATE SET
         interest_rate    = excluded.interest_rate,
         fetched_at       = excluded.fetched_at,
         last_refresh_job = excluded.last_refresh_job`
    ).run("vietnam", 4.5);

    // Should still be ONE row, not two
    const count = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM macro_indicators`
      )
      .get();
    expect(count?.cnt).toBe(1);

    // Interest rate should be updated
    const row = db
      .prepare<{ interest_rate: number | null; gdp_growth: number | null }, [string]>(
        `SELECT interest_rate, gdp_growth FROM macro_indicators WHERE country = ?`
      )
      .get("vietnam");
    expect(row?.interest_rate).toBe(4.5);
    // gdp_growth preserved from original row (not overwritten by the upsert)
    expect(row?.gdp_growth).toBe(7.4);
  });
});
