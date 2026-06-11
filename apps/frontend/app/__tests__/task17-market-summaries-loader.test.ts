/**
 * task17-market-summaries-loader.test.ts
 *
 * Production-shape guards for /dashboard/market-summaries.
 *
 * Live payload shapes (STEP 0 — verified 2026-06-11 against http://localhost:3000):
 *
 *   keyEvents[0]:
 *     { date: "2026-06-10T01:35:37.958Z", title: "PDR tăng tốc...",
 *       impact: "", direction: "up" }
 *
 *   stockPerformance[0]:
 *     { symbol: "VCB", firstPrice: 61700, lastPrice: 61700,
 *       changePct: 0.33, alertCount: 0 }
 *
 *   recommendations[0]:
 *     { symbol: "VCB", outlook: "neutral", confidence: 0.5,
 *       reasoning: "price stable (+0.3%)" }
 *
 * Critical guards:
 *   - formatChangePct(0.33) === "+0.3%"  (positive → "+" prefix)
 *   - formatChangePct(-1.5) === "-1.5%"  (negative → "-" prefix)
 *   - changePctColorClass(>0) === "text-emerald-400"
 *   - changePctColorClass(<0) === "text-red-400"
 *   - changePctColorClass(0)  === "text-slate-400"
 *   - outlookLabel("neutral")  === "Trung lập"
 *   - outlookLabel("bullish")  === "Tích cực"
 *   - outlookLabel("bearish")  === "Tiêu cực"
 *   - outlookColorClass("neutral") contains "slate" (grey), NOT "red"
 *   - filterTickers: empty query → all rows, symbol match → subset, zero rows lost
 *   - LIST mode: period counts rendered from live periods block
 *   - DETAIL mode: item:null → empty-state (no crash)
 *   - DETAIL mode: item:null → error is null (not a 404 error)
 *   - fetchSummaries LIST: items array zero rows lost
 *   - fetchSummaries DETAIL: shape guard / non-fatal errors
 *
 * Strategy: import named helpers directly (Remix strips loader in jsdom).
 * Same pattern as task17-prediction-claims-loader.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSummaries,
  formatDateRange,
  formatChangePct,
  changePctColorClass,
  outlookLabel,
  outlookColorClass,
  filterTickers,
  PERIOD_LABELS,
} from "~/routes/dashboard.market-summaries";
import type {
  SummaryListItem,
  StockPerf,
  Recommendation,
} from "~/routes/dashboard.market-summaries";

// ---------------------------------------------------------------------------
// Fixtures — production-shape (mirrors STEP 0 live payload)
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const GENERATED_AT = "2026-06-11T11:54:48.266Z";

/** Fixture matching the live LIST item shape */
const LIST_ITEM_1: SummaryListItem = {
  id: "daily-2026-06-10",
  periodType: "daily",
  periodStart: "2026-06-10",
  periodEnd: "2026-06-10",
  createdAt: "2026-06-10T09:10:45.925Z",
  newsCount: 67,
  alertCount: 17,
  reportCount: 0,
  summaryPreview: "Tổng hợp thị trường ngày 2026-06-10...",
  keyEventCount: 47,
  stockCount: 121,
};

const LIST_ITEM_2: SummaryListItem = {
  id: "daily-2026-06-09",
  periodType: "daily",
  periodStart: "2026-06-09",
  periodEnd: "2026-06-09",
  createdAt: "2026-06-09T15:30:09.013Z",
  newsCount: 61,
  alertCount: 16,
  reportCount: 0,
  summaryPreview: "Tổng hợp thị trường ngày 2026-06-09...",
  keyEventCount: 42,
  stockCount: 121,
};

const PERIODS = {
  daily: 76,
  weekly: 13,
  monthly: 5,
  quarterly: 2,
  yearly: 1,
};

const LIST_DTO = {
  generatedAt: GENERATED_AT,
  periods: PERIODS,
  items: [LIST_ITEM_1, LIST_ITEM_2],
  count: 2,
};

const LIST_DTO_EMPTY = {
  generatedAt: GENERATED_AT,
  periods: PERIODS,
  items: [],
  count: 0,
};

/** Stock performance rows — production shape from STEP 0 */
const STOCK_PERF_ROWS: StockPerf[] = [
  { symbol: "VCB", firstPrice: 61700, lastPrice: 61700, changePct: 0.33, alertCount: 0 },
  { symbol: "FPT", firstPrice: 120000, lastPrice: 122400, changePct: 2.0, alertCount: 1 },
  { symbol: "HPG", firstPrice: 31000, lastPrice: 30000, changePct: -3.23, alertCount: 2 },
  { symbol: "TCB", firstPrice: 28000, lastPrice: 28000, changePct: 0.0, alertCount: 0 },
];

/** Recommendation rows — production shape from STEP 0 */
const REC_ROWS: Recommendation[] = [
  { symbol: "VCB", outlook: "neutral", confidence: 0.5, reasoning: "price stable (+0.3%)" },
  { symbol: "FPT", outlook: "bullish", confidence: 0.75, reasoning: "strong upside momentum" },
  { symbol: "HPG", outlook: "bearish", confidence: 0.6, reasoning: "price declined -3.2%" },
];

const DETAIL_DTO = {
  generatedAt: GENERATED_AT,
  item: {
    id: "daily-2026-06-10",
    periodType: "daily" as const,
    periodStart: "2026-06-10",
    periodEnd: "2026-06-10",
    createdAt: "2026-06-10T09:10:45.925Z",
    updatedAt: "2026-06-10T09:10:45.925Z",
    summaryText: "Thị trường hôm nay ghi nhận nhiều biến động...\n\nVNINDEX tăng nhẹ.",
    keyEvents: [
      {
        date: "2026-06-10T01:35:37.958Z",
        title: "PDR tăng tốc tái cấu trúc danh mục đầu tư",
        impact: "",
        direction: "up",
      },
    ],
    stockPerformance: STOCK_PERF_ROWS,
    recommendations: REC_ROWS,
    newsCount: 67,
    alertCount: 17,
    reportCount: 0,
  },
};

/** DETAIL with item:null — id not found (200 with null, NOT a 404) */
const DETAIL_DTO_NULL_ITEM = {
  generatedAt: GENERATED_AT,
  item: null,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Suite 1 — PERIOD_LABELS
// ---------------------------------------------------------------------------

describe("PERIOD_LABELS — Vietnamese labels", () => {
  it("daily → 'Hàng ngày'", () => {
    expect(PERIOD_LABELS.daily).toBe("Hàng ngày");
  });

  it("weekly → 'Hàng tuần'", () => {
    expect(PERIOD_LABELS.weekly).toBe("Hàng tuần");
  });

  it("monthly → 'Hàng tháng'", () => {
    expect(PERIOD_LABELS.monthly).toBe("Hàng tháng");
  });

  it("quarterly → 'Hàng quý'", () => {
    expect(PERIOD_LABELS.quarterly).toBe("Hàng quý");
  });

  it("yearly → 'Hàng năm'", () => {
    expect(PERIOD_LABELS.yearly).toBe("Hàng năm");
  });

  it("covers all 5 period types", () => {
    expect(Object.keys(PERIOD_LABELS)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — formatDateRange
// ---------------------------------------------------------------------------

describe("formatDateRange — date-range display", () => {
  it("same start and end → single date string", () => {
    expect(formatDateRange("2026-06-10", "2026-06-10")).toBe("2026-06-10");
  });

  it("different start and end → 'start → end'", () => {
    expect(formatDateRange("2026-06-01", "2026-06-07")).toBe(
      "2026-06-01 → 2026-06-07"
    );
  });

  it("empty start → returns end", () => {
    expect(formatDateRange("", "2026-06-07")).toBe("2026-06-07");
  });

  it("daily items (start===end) show just one date — no duplicate", () => {
    const result = formatDateRange("2026-06-10", "2026-06-10");
    expect(result).not.toContain("→");
  });

  it("weekly items (start !== end) show range with arrow", () => {
    const result = formatDateRange("2026-06-01", "2026-06-07");
    expect(result).toContain("→");
    expect(result).toContain("2026-06-01");
    expect(result).toContain("2026-06-07");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — formatChangePct (CRITICAL sign + color guards)
// ---------------------------------------------------------------------------

describe("formatChangePct — sign prefix and decimal", () => {
  it("positive 0.33 → '+0.3%'", () => {
    expect(formatChangePct(0.33)).toBe("+0.3%");
  });

  it("negative -1.5 → '-1.5%'", () => {
    expect(formatChangePct(-1.5)).toBe("-1.5%");
  });

  it("zero 0.0 → '0.0%' (no + prefix)", () => {
    expect(formatChangePct(0.0)).toBe("0.0%");
    expect(formatChangePct(0.0)).not.toContain("+");
  });

  it("positive value does NOT contain '-'", () => {
    expect(formatChangePct(2.5)).not.toContain("-");
  });

  it("negative value contains '-' only (no '+')", () => {
    const r = formatChangePct(-3.23);
    expect(r).toContain("-");
    expect(r).not.toContain("+");
  });

  it("large positive 10.5 → '+10.5%'", () => {
    expect(formatChangePct(10.5)).toBe("+10.5%");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — changePctColorClass (CRITICAL colour guards)
// ---------------------------------------------------------------------------

describe("changePctColorClass — colour by sign", () => {
  it("positive → 'text-emerald-400' (green)", () => {
    expect(changePctColorClass(0.33)).toBe("text-emerald-400");
  });

  it("negative → 'text-red-400' (red)", () => {
    expect(changePctColorClass(-3.23)).toBe("text-red-400");
  });

  it("zero → 'text-slate-400' (grey)", () => {
    expect(changePctColorClass(0)).toBe("text-slate-400");
  });

  it("positive does NOT contain 'red'", () => {
    expect(changePctColorClass(2.0)).not.toContain("red");
  });

  it("negative does NOT contain 'emerald'", () => {
    expect(changePctColorClass(-1.5)).not.toContain("emerald");
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — outlookLabel (Vietnamese)
// ---------------------------------------------------------------------------

describe("outlookLabel — VN labels", () => {
  it("'neutral' → 'Trung lập'", () => {
    expect(outlookLabel("neutral")).toBe("Trung lập");
  });

  it("'bullish' → 'Tích cực'", () => {
    expect(outlookLabel("bullish")).toBe("Tích cực");
  });

  it("'bearish' → 'Tiêu cực'", () => {
    expect(outlookLabel("bearish")).toBe("Tiêu cực");
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — outlookColorClass (CRITICAL: neutral is slate/grey, NOT red)
// ---------------------------------------------------------------------------

describe("outlookColorClass — CRITICAL: neutral is grey, NOT red", () => {
  it("'neutral' contains 'slate' (grey)", () => {
    expect(outlookColorClass("neutral")).toContain("slate");
  });

  it("'neutral' does NOT contain 'red'", () => {
    expect(outlookColorClass("neutral")).not.toContain("red");
  });

  it("'bullish' contains 'emerald' (green)", () => {
    expect(outlookColorClass("bullish")).toContain("emerald");
  });

  it("'bearish' contains 'red'", () => {
    expect(outlookColorClass("bearish")).toContain("red");
  });

  it("'bearish' does NOT contain 'emerald'", () => {
    expect(outlookColorClass("bearish")).not.toContain("emerald");
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — filterTickers: zero rows lost, client-side search
// ---------------------------------------------------------------------------

describe("filterTickers — ticker search", () => {
  it("empty query → returns ALL rows unchanged (zero rows lost)", () => {
    const result = filterTickers(STOCK_PERF_ROWS, "");
    expect(result).toHaveLength(STOCK_PERF_ROWS.length);
    expect(result).toEqual(STOCK_PERF_ROWS);
  });

  it("whitespace-only query → returns ALL rows (zero rows lost)", () => {
    const result = filterTickers(STOCK_PERF_ROWS, "   ");
    expect(result).toHaveLength(STOCK_PERF_ROWS.length);
  });

  it("exact symbol match (uppercase) → returns matching rows only", () => {
    const result = filterTickers(STOCK_PERF_ROWS, "VCB");
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("VCB");
  });

  it("lowercase query is case-insensitive", () => {
    const result = filterTickers(STOCK_PERF_ROWS, "vcb");
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("VCB");
  });

  it("no match → returns empty array (not a crash)", () => {
    const result = filterTickers(STOCK_PERF_ROWS, "ZZZZ");
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it("partial match → returns subset", () => {
    // "F" matches "FPT"
    const result = filterTickers(STOCK_PERF_ROWS, "F");
    expect(result.some((r) => r.symbol === "FPT")).toBe(true);
  });

  it("works on Recommendation rows (same generic contract)", () => {
    const result = filterTickers(REC_ROWS, "HPG");
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("HPG");
  });

  it("ALL 121-shape rows preserved when query empty (zero-row-loss guard)", () => {
    // Build 121 synthetic rows to mirror the live stockCount
    const rows: StockPerf[] = Array.from({ length: 121 }, (_, i) => ({
      symbol: `S${String(i).padStart(3, "0")}`,
      firstPrice: 10000 + i,
      lastPrice: 10000 + i,
      changePct: 0,
      alertCount: 0,
    }));
    const result = filterTickers(rows, "");
    expect(result).toHaveLength(121);
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — fetchSummaries LIST mode: happy path
// ---------------------------------------------------------------------------

describe("fetchSummaries — LIST mode 200 valid DTO", () => {
  it("returns mode:'list', items array, count, periods, error null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "daily" });

    expect(data.mode).toBe("list");
    if (data.mode !== "list") throw new Error("Mode guard");
    expect(data.error).toBeNull();
    expect(data.items).toHaveLength(2);
    expect(data.count).toBe(2);
  });

  it("periods block is parsed correctly from live shape", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "daily" });
    if (data.mode !== "list") throw new Error("Mode guard");

    expect(data.periods.daily).toBe(76);
    expect(data.periods.weekly).toBe(13);
    expect(data.periods.monthly).toBe(5);
    expect(data.periods.quarterly).toBe(2);
    expect(data.periods.yearly).toBe(1);
  });

  it("item fields preserved: id, periodStart, periodEnd, summaryPreview", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "daily" });
    if (data.mode !== "list") throw new Error("Mode guard");

    const first = data.items[0];
    expect(first.id).toBe("daily-2026-06-10");
    expect(first.periodStart).toBe("2026-06-10");
    expect(first.periodEnd).toBe("2026-06-10");
    expect(first.newsCount).toBe(67);
    expect(first.alertCount).toBe(17);
    expect(first.keyEventCount).toBe(47);
    expect(first.stockCount).toBe(121);
  });

  it("forwards period param in query string", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(LIST_DTO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await fetchSummaries(ORIGIN, { period: "weekly" });

    expect(capturedUrl).toContain("period=weekly");
  });

  it("forwards limit param when provided", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(LIST_DTO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await fetchSummaries(ORIGIN, { period: "daily", limit: 20 });

    expect(capturedUrl).toContain("limit=20");
  });

  it("empty items array → count 0, error null (no crash)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO_EMPTY), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "monthly" });
    if (data.mode !== "list") throw new Error("Mode guard");

    expect(data.error).toBeNull();
    expect(data.items).toEqual([]);
    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — fetchSummaries DETAIL mode: happy path
// ---------------------------------------------------------------------------

describe("fetchSummaries — DETAIL mode 200 valid DTO", () => {
  it("returns mode:'detail', item present, error null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DETAIL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });

    expect(data.mode).toBe("detail");
    if (data.mode !== "detail") throw new Error("Mode guard");
    expect(data.error).toBeNull();
    expect(data.item).not.toBeNull();
  });

  it("item fields preserved: summaryText, keyEvents, stockPerformance, recommendations", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DETAIL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });
    if (data.mode !== "detail") throw new Error("Mode guard");
    if (!data.item) throw new Error("Item null guard");

    expect(data.item.summaryText).toContain("VNINDEX");
    expect(data.item.keyEvents).toHaveLength(1);
    expect(data.item.stockPerformance).toHaveLength(4);
    expect(data.item.recommendations).toHaveLength(3);
  });

  it("keyEvents[0] shape matches live payload: date/title/impact/direction", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DETAIL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });
    if (data.mode !== "detail" || !data.item) throw new Error("Guard");

    const ev = data.item.keyEvents[0];
    expect(ev).toHaveProperty("date");
    expect(ev).toHaveProperty("title");
    expect(ev).toHaveProperty("impact");
    expect(ev).toHaveProperty("direction");
    expect(ev.direction).toBe("up");
  });

  it("stockPerformance[0] shape: symbol/firstPrice/lastPrice/changePct/alertCount", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DETAIL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });
    if (data.mode !== "detail" || !data.item) throw new Error("Guard");

    const perf = data.item.stockPerformance[0];
    expect(perf.symbol).toBe("VCB");
    expect(perf.firstPrice).toBe(61700);
    expect(perf.lastPrice).toBe(61700);
    expect(perf.changePct).toBeCloseTo(0.33);
    expect(perf.alertCount).toBe(0);
  });

  it("recommendations[0] shape: symbol/outlook/confidence/reasoning", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DETAIL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });
    if (data.mode !== "detail" || !data.item) throw new Error("Guard");

    const rec = data.item.recommendations[0];
    expect(rec.symbol).toBe("VCB");
    expect(rec.outlook).toBe("neutral");
    expect(rec.confidence).toBeCloseTo(0.5);
    expect(rec.reasoning).toContain("stable");
  });

  it("forwards ?id= in the request URL", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(DETAIL_DTO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });

    expect(capturedUrl).toContain("id=daily-2026-06-10");
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — CRITICAL: item:null → empty-state, NOT an error
// ---------------------------------------------------------------------------

describe("DETAIL mode — CRITICAL: item:null is empty-state, NOT error (200 with null)", () => {
  it("item:null → data.item is null, data.error is null (not a network error)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DETAIL_DTO_NULL_ITEM), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-12-31" });

    expect(data.mode).toBe("detail");
    if (data.mode !== "detail") throw new Error("Mode guard");
    expect(data.item).toBeNull();
    expect(data.error).toBeNull();
  });

  it("item:null preserves selectedId for empty-state display", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DETAIL_DTO_NULL_ITEM), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-12-31" });
    if (data.mode !== "detail") throw new Error("Mode guard");

    expect(data.selectedId).toBe("daily-2026-12-31");
  });
});

// ---------------------------------------------------------------------------
// Suite 11 — Non-fatal: LIST upstream errors
// ---------------------------------------------------------------------------

describe("fetchSummaries LIST — non-fatal upstream errors", () => {
  it("502 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "daily" });
    if (data.mode !== "list") throw new Error("Mode guard");

    expect(data.items).toEqual([]);
    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/502/);
  });

  it("503 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "daily" });
    if (data.mode !== "list") throw new Error("Mode guard");

    expect(data.items).toEqual([]);
    expect(data.error).toMatch(/503/);
  });

  it("network throw → error message preserved, items empty, no crash", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchSummaries(ORIGIN, { period: "daily" });
    if (data.mode !== "list") throw new Error("Mode guard");

    expect(data.items).toEqual([]);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("unexpected JSON shape → error string, items empty", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "no items here" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "daily" });
    if (data.mode !== "list") throw new Error("Mode guard");

    expect(data.items).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });
});

// ---------------------------------------------------------------------------
// Suite 12 — Non-fatal: DETAIL upstream errors
// ---------------------------------------------------------------------------

describe("fetchSummaries DETAIL — non-fatal upstream errors", () => {
  it("502 upstream → item null + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });
    if (data.mode !== "detail") throw new Error("Mode guard");

    expect(data.item).toBeNull();
    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/502/);
  });

  it("network throw → item null + error message, no crash", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });
    if (data.mode !== "detail") throw new Error("Mode guard");

    expect(data.item).toBeNull();
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("unexpected JSON shape → item null + error string", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: "no item key" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { id: "daily-2026-06-10" });
    if (data.mode !== "detail") throw new Error("Mode guard");

    expect(data.item).toBeNull();
    expect(data.error).toContain("Unexpected response shape");
  });
});

// ---------------------------------------------------------------------------
// Suite 13 — LIST partition: period counts rendered from live periods block
// ---------------------------------------------------------------------------

describe("fetchSummaries LIST — period count rendering", () => {
  it("all 5 period counts are preserved from the DTO (daily:76, weekly:13, monthly:5, quarterly:2, yearly:1)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, { period: "daily" });
    if (data.mode !== "list") throw new Error("Mode guard");

    // Mirror the live production shape exactly
    expect(data.periods.daily).toBe(76);
    expect(data.periods.weekly).toBe(13);
    expect(data.periods.monthly).toBe(5);
    expect(data.periods.quarterly).toBe(2);
    expect(data.periods.yearly).toBe(1);
  });

  it("selectedPeriod is echoed back in loader data", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const weekly = await fetchSummaries(ORIGIN, { period: "weekly" });
    if (weekly.mode !== "list") throw new Error("Mode guard");
    expect(weekly.selectedPeriod).toBe("weekly");

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const monthly = await fetchSummaries(ORIGIN, { period: "monthly" });
    if (monthly.mode !== "list") throw new Error("Mode guard");
    expect(monthly.selectedPeriod).toBe("monthly");
  });

  it("default period is 'daily' when no period specified", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LIST_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchSummaries(ORIGIN, {});
    if (data.mode !== "list") throw new Error("Mode guard");
    expect(data.selectedPeriod).toBe("daily");
  });
});
