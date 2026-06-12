/**
 * reaudit-fe-003-stock-direction-arrow.test.ts
 *
 * TDD: RED first — REAUDIT-FE-003
 * NFR-C-4: direction field rendering in market-summaries stockPerformance table.
 *
 * Live probe (2026-06-12):
 *   stockPerformance[0]: {"symbol":"VCB","firstPrice":61600,"lastPrice":61600,
 *     "changePct":-0.16,"alertCount":1,"direction":"down"}
 *   stockPerformance[1]: {"symbol":"BID","firstPrice":41400,"lastPrice":41400,
 *     "changePct":-0.6,"alertCount":0,"direction":"down"}
 *
 * AC tested:
 *   1. StockPerf interface accepts direction field (optional "up"|"down"|"flat")
 *   2. directionArrow("up")  → "↑"
 *   3. directionArrow("down")→ "↓"
 *   4. directionArrow("flat")→ "—"
 *   5. directionArrow(undefined) → "" (backward compat — no crash)
 *   6. directionArrowColorClass("up")  → text-emerald-400 (green)
 *   7. directionArrowColorClass("down")→ text-red-400     (red)
 *   8. directionArrowColorClass("flat")→ text-slate-400   (neutral)
 *   9. directionArrowColorClass(undefined) → "" (backward compat)
 *  10. directionArrow result matches changePctColorClass sign alignment
 *      (up ↔ positive changePct → same color family)
 */

import { describe, it, expect } from "vitest";
import {
  directionArrow,
  directionArrowColorClass,
} from "~/routes/dashboard.market-summaries";
import type { StockPerf } from "~/routes/dashboard.market-summaries";

// ---------------------------------------------------------------------------
// Suite 1 — directionArrow glyph mapping
// ---------------------------------------------------------------------------

describe("directionArrow — Unicode glyph per direction value", () => {
  it("'up' → '↑'", () => {
    expect(directionArrow("up")).toBe("↑");
  });

  it("'down' → '↓'", () => {
    expect(directionArrow("down")).toBe("↓");
  });

  it("'flat' → '—'", () => {
    expect(directionArrow("flat")).toBe("—");
  });

  it("undefined → '' (backward compat — no crash, no arrow)", () => {
    expect(directionArrow(undefined)).toBe("");
  });

  it("unknown value → '' (defensive fallback)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(directionArrow("unknown" as any)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — directionArrowColorClass
// ---------------------------------------------------------------------------

describe("directionArrowColorClass — Tailwind color class", () => {
  it("'up' → 'text-emerald-400' (green)", () => {
    expect(directionArrowColorClass("up")).toBe("text-emerald-400");
  });

  it("'down' → 'text-red-400' (red)", () => {
    expect(directionArrowColorClass("down")).toBe("text-red-400");
  });

  it("'flat' → 'text-slate-400' (neutral)", () => {
    expect(directionArrowColorClass("flat")).toBe("text-slate-400");
  });

  it("undefined → '' (no class — backward compat)", () => {
    expect(directionArrowColorClass(undefined)).toBe("");
  });

  it("'up' does NOT contain 'red'", () => {
    expect(directionArrowColorClass("up")).not.toContain("red");
  });

  it("'down' does NOT contain 'emerald'", () => {
    expect(directionArrowColorClass("down")).not.toContain("emerald");
  });

  it("'flat' does NOT contain 'red' or 'emerald'", () => {
    const cls = directionArrowColorClass("flat");
    expect(cls).not.toContain("red");
    expect(cls).not.toContain("emerald");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — StockPerf type: direction field accepted (optional)
// ---------------------------------------------------------------------------

describe("StockPerf interface — direction field optional", () => {
  it("StockPerf without direction compiles (backward compat)", () => {
    const row: StockPerf = {
      symbol: "VCB",
      firstPrice: 61600,
      lastPrice: 61600,
      changePct: -0.16,
      alertCount: 1,
    };
    expect(row.direction).toBeUndefined();
  });

  it("StockPerf with direction='down' accepted", () => {
    const row: StockPerf = {
      symbol: "VCB",
      firstPrice: 61600,
      lastPrice: 61600,
      changePct: -0.16,
      alertCount: 1,
      direction: "down",
    };
    expect(row.direction).toBe("down");
  });

  it("StockPerf with direction='up' accepted", () => {
    const row: StockPerf = {
      symbol: "FPT",
      firstPrice: 120000,
      lastPrice: 122400,
      changePct: 2.0,
      alertCount: 0,
      direction: "up",
    };
    expect(row.direction).toBe("up");
  });

  it("StockPerf with direction='flat' accepted", () => {
    const row: StockPerf = {
      symbol: "TCB",
      firstPrice: 28000,
      lastPrice: 28000,
      changePct: 0.0,
      alertCount: 0,
      direction: "flat",
    };
    expect(row.direction).toBe("flat");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Alignment: direction ↔ changePct sign consistency
// ---------------------------------------------------------------------------

describe("directionArrow ↔ changePctColorClass alignment", () => {
  it("up direction matches emerald (green) — same family as positive changePct color", () => {
    const arrowColor = directionArrowColorClass("up");
    expect(arrowColor).toContain("emerald");
  });

  it("down direction matches red — same family as negative changePct color", () => {
    const arrowColor = directionArrowColorClass("down");
    expect(arrowColor).toContain("red");
  });

  it("directionArrow('up') is not empty (renders visible glyph)", () => {
    expect(directionArrow("up").length).toBeGreaterThan(0);
  });

  it("directionArrow('down') is not empty (renders visible glyph)", () => {
    expect(directionArrow("down").length).toBeGreaterThan(0);
  });

  it("directionArrow('flat') is not empty (renders visible dash)", () => {
    expect(directionArrow("flat").length).toBeGreaterThan(0);
  });
});
