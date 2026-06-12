/**
 * REAUDIT-005 — NFR-C-6 financials yoyDirection fields
 *
 * Tests for:
 *   - deriveYoyDirection: "up" / "down" / "flat" per AC
 *   - mapRow: revenueYoyDirection and netProfitYoyDirection derived correctly
 *   - handleGetFinancials: direction fields present in every row of live response
 *
 * Acceptance Criteria covered:
 *   AC-1: revenueYoy > 0 → "up"
 *   AC-2: revenueYoy < 0 → "down"
 *   AC-3: revenueYoy === 0 → "flat"
 *   AC-4: revenueYoy === null → "flat"
 *   AC-5: same four cases for netProfitYoy
 *   AC-6: combination rows (up/down, down/flat, flat/up)
 *   AC-7: direction fields present in every row of assembled response
 *   AC-8: direction fields in response row shape (field existence check)
 *
 * DDD layer: interface — no DB schema change; pure derived field.
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[REAUDIT-005] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  deriveYoyDirection,
  mapRow,
  handleGetFinancials,
  type ScreenerRow,
  type YoyDirection,
} from "../interface/mcp/routes/financialsHandler.js";
import type { FinancialRow } from "../infrastructure/db/financialsStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const baseFinancialRow: FinancialRow = {
  code: "TST",
  yearReport: 2024,
  quarter: 4,
  revenueBn: 1000,
  revenueYoy: 10,
  netProfitBn: 200,
  netProfitYoy: 5,
  eps: 3000,
  pe: 12,
  pb: 1.5,
  roe: 15,
  roa: 5,
  debtToEquity: 0.5,
  netProfitMargin: 10,
  nim: null,
  npl: null,
};

function insertFinancialDirect(opts: {
  code: string;
  year_report: number;
  quarter: number;
  revenue_yoy?: number | null;
  net_profit_yoy?: number | null;
}): void {
  const db = getDb();
  const {
    code,
    year_report,
    quarter,
    revenue_yoy = null,
    net_profit_yoy = null,
  } = opts;
  db.prepare(
    `INSERT OR IGNORE INTO vnstock_financials
       (code, year_report, quarter, revenue_bn, revenue_yoy, net_profit_bn, net_profit_yoy,
        eps, pe, pb, roe, roa, debt_to_equity, net_profit_margin, nim, npl, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code, year_report, quarter,
    1000, revenue_yoy, 200, net_profit_yoy,
    3000, 12, 1.5, 15, 5, 0.5, 10, null, null,
    "2026-06-10T12:00:00.000Z",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1..AC-4: deriveYoyDirection — revenueYoy cases
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveYoyDirection", () => {
  it("AC-1: positive value → 'up'", () => {
    expect(deriveYoyDirection(12.5)).toBe("up");
  });

  it("AC-1: small positive → 'up'", () => {
    expect(deriveYoyDirection(0.001)).toBe("up");
  });

  it("AC-2: negative value → 'down'", () => {
    expect(deriveYoyDirection(-5.2)).toBe("down");
  });

  it("AC-2: large negative → 'down'", () => {
    expect(deriveYoyDirection(-99.9)).toBe("down");
  });

  it("AC-3: zero → 'flat'", () => {
    expect(deriveYoyDirection(0)).toBe("flat");
  });

  it("AC-3: negative zero → 'flat'", () => {
    expect(deriveYoyDirection(-0)).toBe("flat");
  });

  it("AC-4: null → 'flat'", () => {
    expect(deriveYoyDirection(null)).toBe("flat");
  });

  it("AC-4: undefined → 'flat'", () => {
    expect(deriveYoyDirection(undefined)).toBe("flat");
  });

  it("AC-4: NaN → 'flat' (non-finite treated as null)", () => {
    expect(deriveYoyDirection(NaN)).toBe("flat");
  });

  it("AC-4: Infinity → 'flat' (non-finite treated as null)", () => {
    expect(deriveYoyDirection(Infinity)).toBe("flat");
  });

  it("returns YoyDirection union type only", () => {
    const validValues: YoyDirection[] = ["up", "down", "flat"];
    const results = [10, -10, 0, null, undefined].map(deriveYoyDirection);
    for (const r of results) {
      expect(validValues.includes(r)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: deriveYoyDirection — same rules apply for netProfitYoy (same function)
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveYoyDirection — netProfitYoy equivalence", () => {
  it("AC-5: netProfitYoy > 0 → 'up'", () => {
    expect(deriveYoyDirection(18.3)).toBe("up");
  });

  it("AC-5: netProfitYoy < 0 → 'down'", () => {
    expect(deriveYoyDirection(-8.0)).toBe("down");
  });

  it("AC-5: netProfitYoy === 0 → 'flat'", () => {
    expect(deriveYoyDirection(0)).toBe("flat");
  });

  it("AC-5: netProfitYoy === null → 'flat'", () => {
    expect(deriveYoyDirection(null)).toBe("flat");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapRow — direction fields derived correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("mapRow — yoyDirection fields", () => {
  it("AC-1: revenueYoy > 0 → revenueYoyDirection = 'up'", () => {
    const row = mapRow({ ...baseFinancialRow, revenueYoy: 22.5 });
    expect(row.revenueYoyDirection).toBe("up");
  });

  it("AC-2: revenueYoy < 0 → revenueYoyDirection = 'down'", () => {
    const row = mapRow({ ...baseFinancialRow, revenueYoy: -5.0 });
    expect(row.revenueYoyDirection).toBe("down");
  });

  it("AC-3: revenueYoy === 0 → revenueYoyDirection = 'flat'", () => {
    const row = mapRow({ ...baseFinancialRow, revenueYoy: 0 });
    expect(row.revenueYoyDirection).toBe("flat");
  });

  it("AC-4: revenueYoy === null → revenueYoyDirection = 'flat'", () => {
    const row = mapRow({ ...baseFinancialRow, revenueYoy: null });
    expect(row.revenueYoyDirection).toBe("flat");
  });

  it("AC-5: netProfitYoy > 0 → netProfitYoyDirection = 'up'", () => {
    const row = mapRow({ ...baseFinancialRow, netProfitYoy: 9.5 });
    expect(row.netProfitYoyDirection).toBe("up");
  });

  it("AC-5: netProfitYoy < 0 → netProfitYoyDirection = 'down'", () => {
    const row = mapRow({ ...baseFinancialRow, netProfitYoy: -8.0 });
    expect(row.netProfitYoyDirection).toBe("down");
  });

  it("AC-5: netProfitYoy === 0 → netProfitYoyDirection = 'flat'", () => {
    const row = mapRow({ ...baseFinancialRow, netProfitYoy: 0 });
    expect(row.netProfitYoyDirection).toBe("flat");
  });

  it("AC-5: netProfitYoy === null → netProfitYoyDirection = 'flat'", () => {
    const row = mapRow({ ...baseFinancialRow, netProfitYoy: null });
    expect(row.netProfitYoyDirection).toBe("flat");
  });

  it("AC-6: combination up/down (revenue up, profit down)", () => {
    const row = mapRow({ ...baseFinancialRow, revenueYoy: 10, netProfitYoy: -3 });
    expect(row.revenueYoyDirection).toBe("up");
    expect(row.netProfitYoyDirection).toBe("down");
  });

  it("AC-6: combination down/flat (revenue down, profit null)", () => {
    const row = mapRow({ ...baseFinancialRow, revenueYoy: -5, netProfitYoy: null });
    expect(row.revenueYoyDirection).toBe("down");
    expect(row.netProfitYoyDirection).toBe("flat");
  });

  it("AC-6: combination flat/up (revenue 0, profit positive)", () => {
    const row = mapRow({ ...baseFinancialRow, revenueYoy: 0, netProfitYoy: 15 });
    expect(row.revenueYoyDirection).toBe("flat");
    expect(row.netProfitYoyDirection).toBe("up");
  });

  it("AC-8: direction fields present in ScreenerRow (field existence check)", () => {
    const row = mapRow(baseFinancialRow);
    expect("revenueYoyDirection" in row).toBe(true);
    expect("netProfitYoyDirection" in row).toBe(true);
  });

  it("AC-8: all other existing fields are still present (no regression)", () => {
    const row = mapRow(baseFinancialRow);
    const requiredFields: (keyof ScreenerRow)[] = [
      "code", "period", "yearReport", "quarter",
      "revenueBn", "revenueYoy", "revenueYoyDirection",
      "netProfitBn", "netProfitYoy", "netProfitYoyDirection",
      "eps", "pe", "pb", "roe", "roa",
      "debtToEquity", "netProfitMargin", "nim", "npl",
    ];
    for (const field of requiredFields) {
      expect(field in row).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: handleGetFinancials — direction fields present in every response row
// ─────────────────────────────────────────────────────────────────────────────

describe("handleGetFinancials — yoyDirection in assembled response", () => {
  it("AC-7: direction fields present on every row when seeded (3 codes)", () => {
    insertFinancialDirect({ code: "AAA", year_report: 2024, quarter: 4, revenue_yoy: 10, net_profit_yoy: 5 });
    insertFinancialDirect({ code: "BBB", year_report: 2024, quarter: 4, revenue_yoy: -3, net_profit_yoy: -1 });
    insertFinancialDirect({ code: "CCC", year_report: 2024, quarter: 4, revenue_yoy: 0, net_profit_yoy: null });

    const result = handleGetFinancials(getDb(), new Date("2026-06-10T12:00:00Z"));
    expect(result.rows).toHaveLength(3);
    for (const row of result.rows) {
      expect("revenueYoyDirection" in row).toBe(true);
      expect("netProfitYoyDirection" in row).toBe(true);
    }
  });

  it("AC-7: direction values match yoy sign for each seeded row", () => {
    insertFinancialDirect({ code: "FPT", year_report: 2024, quarter: 4, revenue_yoy: 22.5, net_profit_yoy: 18.3 });
    insertFinancialDirect({ code: "HPG", year_report: 2024, quarter: 4, revenue_yoy: 5.8, net_profit_yoy: -8.0 });
    insertFinancialDirect({ code: "MWG", year_report: 2024, quarter: 4, revenue_yoy: null, net_profit_yoy: null });

    const result = handleGetFinancials(getDb(), new Date("2026-06-10T12:00:00Z"));
    const rows = result.rows;

    const fpt = rows.find((r) => r.code === "FPT")!;
    expect(fpt.revenueYoyDirection).toBe("up");
    expect(fpt.netProfitYoyDirection).toBe("up");

    const hpg = rows.find((r) => r.code === "HPG")!;
    expect(hpg.revenueYoyDirection).toBe("up");
    expect(hpg.netProfitYoyDirection).toBe("down");

    const mwg = rows.find((r) => r.code === "MWG")!;
    expect(mwg.revenueYoyDirection).toBe("flat");
    expect(mwg.netProfitYoyDirection).toBe("flat");
  });

  it("AC-7: empty table → empty rows array (no crash)", () => {
    const result = handleGetFinancials(getDb(), new Date("2026-06-10T12:00:00Z"));
    expect(result.rows).toHaveLength(0);
  });
});
