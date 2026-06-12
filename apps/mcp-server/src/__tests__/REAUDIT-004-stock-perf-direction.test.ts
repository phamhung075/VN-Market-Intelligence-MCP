/**
 * REAUDIT-004 — stockPerformance direction field
 *
 * AC-1: changePct > 0  → direction = "up"
 * AC-2: changePct < 0  → direction = "down"
 * AC-3: changePct === 0 → direction = "flat"
 * AC-4: changePct is null → direction = "flat"
 * AC-5: changePct is undefined → direction = "flat"
 * AC-6: empty stockPerformance array → returns [] (no errors)
 * AC-7: buildDetail production row → all items have direction populated
 * AC-8: VCB changePct=0.33 → direction="up"
 * AC-9: HPG changePct=-1.79 → direction="down"
 * AC-10: item with changePct=0 → direction="flat"
 *
 * DDD layer: interface (marketSummaryHandler).
 * Isolation: pure function tests + buildDetail integration.
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import {
  deriveDirection,
  buildDetail,
} from "../interface/mcp/routes/marketSummaryHandler.js";
import type { MarketSummaryRow } from "../infrastructure/db/marketSummaryStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Seed data (reuse production shape from TASK17-SUMMARIES tests)
// ─────────────────────────────────────────────────────────────────────────────

const PROD_SHAPE_ROW: MarketSummaryRow = {
  id: "daily-2026-06-11",
  period_type: "daily",
  period_start: "2026-06-11",
  period_end: "2026-06-11",
  created_at: "2026-06-11T09:00:00.000Z",
  updated_at: "2026-06-11T09:00:00.000Z",
  summary_text: "Thị trường 11/06.",
  summary_preview: null,
  key_events_json: null,
  stock_performance_json: JSON.stringify({
    VCB: { firstPrice: 90500, lastPrice: 92000, changePct: 1.66, alertCount: 2 },
    FPT: { firstPrice: 120000, lastPrice: 119000, changePct: -0.83, alertCount: 0 },
    VHM: { firstPrice: 45000, lastPrice: 45000, changePct: 0, alertCount: 1 },
  }),
  alerts_summary_json: null,
  macro_context_json: null,
  recommendation_json: null,
  news_count: 10,
  alert_count: 3,
  report_count: 0,
  data_sources_json: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// deriveDirection pure function tests
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveDirection — pure function", () => {
  it("AC-1: changePct > 0 → direction = 'up'", () => {
    expect(deriveDirection(1.66)).toBe("up");
    expect(deriveDirection(0.01)).toBe("up");
    expect(deriveDirection(100)).toBe("up");
  });

  it("AC-2: changePct < 0 → direction = 'down'", () => {
    expect(deriveDirection(-0.83)).toBe("down");
    expect(deriveDirection(-0.01)).toBe("down");
    expect(deriveDirection(-100)).toBe("down");
  });

  it("AC-3: changePct === 0 → direction = 'flat'", () => {
    expect(deriveDirection(0)).toBe("flat");
  });

  it("AC-4: changePct is null → direction = 'flat'", () => {
    expect(deriveDirection(null)).toBe("flat");
  });

  it("AC-5: changePct is undefined → direction = 'flat'", () => {
    expect(deriveDirection(undefined)).toBe("flat");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDetail integration: direction field on stockPerformance items
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-004 — buildDetail stockPerformance.direction", () => {
  it("AC-6: empty stockPerformance → returns [] (no errors)", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW,
      stock_performance_json: JSON.stringify({}),
    };
    const detail = buildDetail(row);
    expect(detail.stockPerformance).toHaveLength(0);
  });

  it("AC-7: all production items have direction field", () => {
    const detail = buildDetail(PROD_SHAPE_ROW);
    for (const item of detail.stockPerformance) {
      expect(["up", "down", "flat"]).toContain(item.direction);
    }
  });

  it("AC-8: VCB changePct=1.66 → direction='up'", () => {
    const detail = buildDetail(PROD_SHAPE_ROW);
    const vcb = detail.stockPerformance.find((s) => s.symbol === "VCB");
    expect(vcb).toBeDefined();
    expect(vcb!.direction).toBe("up");
  });

  it("AC-9: FPT changePct=-0.83 → direction='down'", () => {
    const detail = buildDetail(PROD_SHAPE_ROW);
    const fpt = detail.stockPerformance.find((s) => s.symbol === "FPT");
    expect(fpt).toBeDefined();
    expect(fpt!.direction).toBe("down");
  });

  it("AC-10: VHM changePct=0 → direction='flat'", () => {
    const detail = buildDetail(PROD_SHAPE_ROW);
    const vhm = detail.stockPerformance.find((s) => s.symbol === "VHM");
    expect(vhm).toBeDefined();
    expect(vhm!.direction).toBe("flat");
  });

  it("NULL stock_performance_json → stockPerformance=[] (no direction error)", () => {
    const row: MarketSummaryRow = {
      ...PROD_SHAPE_ROW,
      stock_performance_json: null,
    };
    const detail = buildDetail(row);
    expect(detail.stockPerformance).toHaveLength(0);
  });
});
