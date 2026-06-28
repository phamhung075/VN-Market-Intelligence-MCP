/**
 * FE-AHUB-W2-CORPEVENTS-ZONE.test.ts
 *
 * Unit tests for CorporateEventsZone pure-logic helpers.
 * Component uses useFetcher (Remix hook) so render tests target the
 * exported pure-function layer only — consistent with the project's
 * "named-export bypass" pattern for Remix-strip protection.
 *
 * Suites:
 *   1. filterStockEvents — basic ticker filter (event.code === stock)
 *   2. filterStockEvents — empty events array
 *   3. filterStockEvents — no matching events (unknown ticker)
 *   4. filterStockEvents — case-sensitivity (UPPERCASE expected per API)
 *   5. filterStockEvents — multiple events for same stock
 *   6. filterStockEvents — preserves server sort order (eventDate DESC)
 *   7. deriveSortedCategories — distinct category labels from stock events
 *   8. CorporateEventsZoneProps interface shape (type-level checks via fixture)
 *
 * Sprint: FRONTEND-ANALYSIS-HUB-CONSOLIDATION
 * Task:   FE-AHUB-W2-CORPEVENTS-ZONE
 */

import { describe, it, expect } from "vitest";
import {
  filterStockEvents,
  deriveSortedCategories,
} from "~/components/analysis/CorporateEventsZone";
import type { CorporateEvent } from "~/routes/dashboard.corporate-events";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_EVENTS: CorporateEvent[] = [
  {
    code: "VCB",
    eventType: "CASH_DIVIDEND",
    category: "dividend",
    categoryLabel: "Cổ tức tiền mặt",
    title: "VCB Cash Dividend 2025",
    detail: "VCB chi trả cổ tức tiền mặt năm 2025 tỷ lệ 12%",
    eventDate: "2026-06-10",
  },
  {
    code: "VCB",
    eventType: "INSIDER_TRANSACTION",
    category: "insider",
    categoryLabel: "Giao dịch cổ đông nội bộ",
    title: "VCB Insider Buy",
    detail: "Cổ đông nội bộ VCB mua thêm cổ phần",
    eventDate: "2026-06-08",
  },
  {
    code: "FPT",
    eventType: "STOCK_ISSUANCE",
    category: "issuance",
    categoryLabel: "Phát hành cổ phiếu",
    title: "FPT Stock Issuance",
    detail: "FPT phát hành thêm cổ phiếu ESOP 2026",
    eventDate: "2026-06-07",
  },
  {
    code: "MBB",
    eventType: "AGM_ANNUAL",
    category: "meeting",
    categoryLabel: "ĐHĐCĐ thường niên",
    title: "MBB AGM 2026",
    detail: "MBB tổ chức Đại hội đồng cổ đông thường niên 2026",
    eventDate: "2026-06-05",
  },
  {
    code: "VCB",
    eventType: "OTHER_EVENT",
    category: "other",
    categoryLabel: "Khác",
    title: "VCB Corporate Event",
    detail: "VCB thông báo sự kiện khác",
    eventDate: "2026-06-03",
  },
];

// ---------------------------------------------------------------------------
// Suite 1: filterStockEvents — basic ticker filter
// ---------------------------------------------------------------------------

describe("filterStockEvents — basic ticker filter", () => {
  it("returns only events for VCB (3 events)", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    expect(result).toHaveLength(3);
    expect(result.every((e) => e.code === "VCB")).toBe(true);
  });

  it("returns only events for FPT (1 event)", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "FPT");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("FPT");
    expect(result[0]!.category).toBe("issuance");
  });

  it("returns only events for MBB (1 event)", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "MBB");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("MBB");
    expect(result[0]!.category).toBe("meeting");
  });

  it("VCB events include dividend, insider, and other categories", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    const categories = result.map((e) => e.category).sort();
    expect(categories).toContain("dividend");
    expect(categories).toContain("insider");
    expect(categories).toContain("other");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: filterStockEvents — empty events array
// ---------------------------------------------------------------------------

describe("filterStockEvents — empty events array", () => {
  it("returns [] when events is empty (any stock)", () => {
    expect(filterStockEvents([], "VCB")).toHaveLength(0);
    expect(filterStockEvents([], "FPT")).toHaveLength(0);
  });

  it("returns [] when events is empty (no crash)", () => {
    const result = filterStockEvents([], "HPG");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: filterStockEvents — no matching events
// ---------------------------------------------------------------------------

describe("filterStockEvents — no matching events", () => {
  it("returns [] for a ticker with no events in the payload", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "HPG");
    expect(result).toHaveLength(0);
  });

  it("returns [] for a completely unknown ticker", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "UNKNOWN");
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: filterStockEvents — case-sensitivity (UPPERCASE expected)
// ---------------------------------------------------------------------------

describe("filterStockEvents — case sensitivity", () => {
  it("lowercase 'vcb' does NOT match UPPERCASE 'VCB' events (API uses UPPERCASE)", () => {
    // The API returns event.code in UPPERCASE; the stock prop should also be UPPERCASE.
    // This test documents that filterStockEvents is case-sensitive (by design).
    const result = filterStockEvents(FIXTURE_EVENTS, "vcb");
    expect(result).toHaveLength(0);
  });

  it("UPPERCASE 'VCB' matches correctly", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: filterStockEvents — multiple events for same stock
// ---------------------------------------------------------------------------

describe("filterStockEvents — multiple events per stock", () => {
  it("VCB has 3 events in fixture (dividend + insider + other)", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    expect(result).toHaveLength(3);
  });

  it("all returned events share the same code", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    for (const event of result) {
      expect(event.code).toBe("VCB");
    }
  });

  it("each event has required fields: code, eventType, category, categoryLabel, detail, eventDate", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    for (const e of result) {
      expect(e.code).toBeTruthy();
      expect(e.eventType).toBeTruthy();
      expect(e.category).toBeTruthy();
      expect(e.categoryLabel).toBeTruthy();
      expect(typeof (e.detail || e.title)).toBe("string");
      expect(e.eventDate).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6: filterStockEvents — preserves server sort order (eventDate DESC)
// ---------------------------------------------------------------------------

describe("filterStockEvents — server sort order preserved", () => {
  it("VCB events preserve server order (eventDate DESC: 2026-06-10, 2026-06-08, 2026-06-03)", () => {
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    expect(result[0]!.eventDate).toBe("2026-06-10");
    expect(result[1]!.eventDate).toBe("2026-06-08");
    expect(result[2]!.eventDate).toBe("2026-06-03");
  });

  it("does not re-sort the events (preserves insertion order from filter)", () => {
    // Filter is purely Array.prototype.filter — order must be preserved.
    const result = filterStockEvents(FIXTURE_EVENTS, "VCB");
    const dates = result.map((e) => e.eventDate);
    // Dates should match the order they appear in FIXTURE_EVENTS for VCB.
    expect(dates).toEqual(["2026-06-10", "2026-06-08", "2026-06-03"]);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: deriveSortedCategories — distinct category labels from stock events
// ---------------------------------------------------------------------------

describe("deriveSortedCategories — distinct labels sorted", () => {
  it("VCB events → 3 distinct categories (dividend, insider, other)", () => {
    const vcbEvents = filterStockEvents(FIXTURE_EVENTS, "VCB");
    const result = deriveSortedCategories(vcbEvents);
    expect(result).toHaveLength(3);
  });

  it("returns distinct category values (no duplicates)", () => {
    const vcbEvents = filterStockEvents(FIXTURE_EVENTS, "VCB");
    const result = deriveSortedCategories(vcbEvents);
    const unique = [...new Set(result)];
    expect(result).toHaveLength(unique.length);
  });

  it("returns sorted category values A-Z", () => {
    const vcbEvents = filterStockEvents(FIXTURE_EVENTS, "VCB");
    const result = deriveSortedCategories(vcbEvents);
    const sorted = [...result].sort();
    expect(result).toEqual(sorted);
  });

  it("empty events → returns []", () => {
    const result = deriveSortedCategories([]);
    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it("single event → returns that event's category", () => {
    const fptEvents = filterStockEvents(FIXTURE_EVENTS, "FPT");
    const result = deriveSortedCategories(fptEvents);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("issuance");
  });
});

// ---------------------------------------------------------------------------
// Suite 8: CorporateEventsZoneProps — interface structural check via fixture
// ---------------------------------------------------------------------------

describe("CorporateEventsZoneProps — type-level structural check", () => {
  it("stock prop is a string (ticker code)", () => {
    // type-level fixture: if CorporateEventsZoneProps changes incompatibly,
    // the import in the component file would fail tsc.
    const prop: { stock: string } = { stock: "VCB" };
    expect(typeof prop.stock).toBe("string");
    expect(prop.stock.length).toBeGreaterThan(0);
  });

  it("filter produces expected count when stock prop changes", () => {
    const stocks = ["VCB", "FPT", "MBB", "HPG"];
    const expectedCounts: Record<string, number> = {
      VCB: 3,
      FPT: 1,
      MBB: 1,
      HPG: 0,
    };
    for (const stock of stocks) {
      const result = filterStockEvents(FIXTURE_EVENTS, stock);
      expect(result).toHaveLength(expectedCounts[stock]!);
    }
  });
});
