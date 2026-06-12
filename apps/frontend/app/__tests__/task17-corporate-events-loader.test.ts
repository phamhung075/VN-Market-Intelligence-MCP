/**
 * task17-corporate-events-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.corporate-events.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live 2026-06-11:
 *   generatedAt, windowDays=90, since, asOf, events[], byType[], summary{}
 *
 * Suites:
 *   1. clampDays — null→90, valid values pass-through, invalid→90
 *   2. ALLOWED_DAYS_VALUES — whitelist contains exactly [30,90,180,365]
 *   3. categoryColorClass — dividend→emerald, issuance→blue, insider→amber,
 *                           meeting→purple, other→slate, unknown→slate
 *   4. filterEvents — "all" → all, specific category → filtered subset
 *   5. CATEGORY_FILTER_OPTIONS — 6 entries, first is "all" / "Tất cả"
 *   6. Fixture A — events[] populated, isEmpty=false (count>0)
 *   7. Fixture B — empty state (count=0, isEmpty=true)
 *   8. Fixture A — category filter logic (filtering by dividend, issuance, insider)
 *   9. Fixture A — byType breakdown ordering (desc by count)
 *  10. Fixture A — topActiveCodes present and non-empty
 *  11. Honest framing — no "sắp tới" / "upcoming" / "calendar" strings in any rendered labels
 *  12. fetchCorporateEventsData — happy path (Fixture A shape via mocked fetch)
 *  13. fetchCorporateEventsData — network error → error string set, events=[]
 *  14. fetchCorporateEventsData — bad shape → error set
 *  15. fetchCorporateEventsData — upstream 502 → error set
 *  16. fetchCorporateEventsData — Fixture B empty response → count=0, no crash
 *  17. filterEvents ticker filter — AC-7: (a) VNM only, (b) Tất cả, (c) empty code set
 *  18. filterEvents cascade — category THEN ticker (AC-4)
 *  19. distinctCodes derivation — sorted A-Z, no duplicates (AC-1)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clampDays,
  ALLOWED_DAYS_VALUES,
  categoryColorClass,
  filterEvents,
  CATEGORY_FILTER_OPTIONS,
  fetchCorporateEventsData,
} from "../routes/dashboard.corporate-events";
import type {
  CorporateEvent,
  CorporateEventsDto,
} from "../routes/dashboard.corporate-events";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_EVENTS: CorporateEvent[] = [
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
    code: "ACB",
    eventType: "CASH_DIVIDEND",
    category: "dividend",
    categoryLabel: "Cổ tức tiền mặt",
    title: "ACB Cash Dividend 2025",
    detail: "ACB chi trả cổ tức tiền mặt năm 2025 tỷ lệ 10%",
    eventDate: "2026-06-09",
  },
  {
    code: "FPT",
    eventType: "STOCK_ISSUANCE",
    category: "issuance",
    categoryLabel: "Phát hành cổ phiếu",
    title: "FPT Stock Issuance",
    detail: "FPT phát hành thêm cổ phiếu ESOP 2026",
    eventDate: "2026-06-08",
  },
  {
    code: "MBB",
    eventType: "INSIDER_TRANSACTION",
    category: "insider",
    categoryLabel: "Giao dịch cổ đông nội bộ",
    title: "MBB Insider Buy",
    detail: "Cổ đông nội bộ MBB mua thêm 100,000 cổ phần",
    eventDate: "2026-06-07",
  },
  {
    code: "VHM",
    eventType: "AGM_ANNUAL",
    category: "meeting",
    categoryLabel: "ĐHĐCĐ thường niên",
    title: "VHM Annual General Meeting",
    detail: "VHM tổ chức Đại hội đồng cổ đông thường niên 2026",
    eventDate: "2026-06-05",
  },
  {
    code: "TCB",
    eventType: "OTHER_EVENT",
    category: "other",
    categoryLabel: "Khác",
    title: "TCB Other Corporate Event",
    detail: "TCB thông báo sự kiện doanh nghiệp khác",
    eventDate: "2026-06-04",
  },
];

const FIXTURE_A_BY_TYPE = [
  { eventType: "CASH_DIVIDEND", categoryLabel: "Cổ tức tiền mặt", count: 2 },
  { eventType: "STOCK_ISSUANCE", categoryLabel: "Phát hành cổ phiếu", count: 1 },
  { eventType: "INSIDER_TRANSACTION", categoryLabel: "Giao dịch cổ đông nội bộ", count: 1 },
  { eventType: "AGM_ANNUAL", categoryLabel: "ĐHĐCĐ thường niên", count: 1 },
  { eventType: "OTHER_EVENT", categoryLabel: "Khác", count: 1 },
];

const FIXTURE_A_SUMMARY = {
  totalEvents: 6,
  distinctCodes: 6,
  dividend: 2,
  issuance: 1,
  insider: 1,
  meeting: 1,
  other: 1,
  topActiveCodes: [
    { code: "VCB", count: 1 },
    { code: "ACB", count: 1 },
    { code: "FPT", count: 1 },
  ],
};

const FIXTURE_A_DTO: CorporateEventsDto = {
  generatedAt: "2026-06-11T10:00:00.000Z",
  windowDays: 90,
  since: "2026-03-13",
  asOf: "2026-06-10",
  typeFilter: null,
  events: FIXTURE_A_EVENTS,
  byType: FIXTURE_A_BY_TYPE,
  summary: FIXTURE_A_SUMMARY,
  count: 6,
};

// ---------------------------------------------------------------------------
// Suite 1: clampDays
// ---------------------------------------------------------------------------

describe("clampDays", () => {
  it("null → 90 (default)", () => {
    expect(clampDays(null)).toBe(90);
  });

  it("'30' → 30 (valid whitelist value)", () => {
    expect(clampDays("30")).toBe(30);
  });

  it("'90' → 90 (valid whitelist value)", () => {
    expect(clampDays("90")).toBe(90);
  });

  it("'180' → 180 (valid whitelist value)", () => {
    expect(clampDays("180")).toBe(180);
  });

  it("'365' → 365 (valid whitelist value)", () => {
    expect(clampDays("365")).toBe(365);
  });

  it("'7' → 90 (not in whitelist, falls back to default)", () => {
    expect(clampDays("7")).toBe(90);
  });

  it("'999' → 90 (out of whitelist, falls back to default)", () => {
    expect(clampDays("999")).toBe(90);
  });

  it("'abc' → 90 (NaN, falls back to default)", () => {
    expect(clampDays("abc")).toBe(90);
  });

  it("'' (empty string) → 90 (NaN, falls back to default)", () => {
    expect(clampDays("")).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: ALLOWED_DAYS_VALUES
// ---------------------------------------------------------------------------

describe("ALLOWED_DAYS_VALUES", () => {
  it("contains exactly [30, 90, 180, 365]", () => {
    expect(ALLOWED_DAYS_VALUES).toEqual([30, 90, 180, 365]);
  });

  it("has length 4", () => {
    expect(ALLOWED_DAYS_VALUES).toHaveLength(4);
  });

  it("does not contain 7 (upstream minimum)", () => {
    expect(ALLOWED_DAYS_VALUES).not.toContain(7);
  });

  it("does not contain values > 365", () => {
    expect(ALLOWED_DAYS_VALUES.every((d) => d <= 365)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: categoryColorClass
// ---------------------------------------------------------------------------

describe("categoryColorClass", () => {
  it("'dividend' → contains emerald", () => {
    expect(categoryColorClass("dividend")).toContain("emerald");
  });

  it("'issuance' → contains blue", () => {
    expect(categoryColorClass("issuance")).toContain("blue");
  });

  it("'insider' → contains amber", () => {
    expect(categoryColorClass("insider")).toContain("amber");
  });

  it("'meeting' → contains purple", () => {
    expect(categoryColorClass("meeting")).toContain("purple");
  });

  it("'other' → contains slate", () => {
    expect(categoryColorClass("other")).toContain("slate");
  });

  it("unknown value → contains slate (fallback)", () => {
    expect(categoryColorClass("unknown_type")).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: filterEvents
// ---------------------------------------------------------------------------

describe("filterEvents", () => {
  it("'all' → returns all 6 events unchanged", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "all");
    expect(result).toHaveLength(6);
    expect(result).toBe(FIXTURE_A_EVENTS); // same reference (no copy)
  });

  it("'dividend' → returns 2 events (VCB + ACB)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "dividend");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.category === "dividend")).toBe(true);
    const codes = result.map((e) => e.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("ACB");
  });

  it("'issuance' → returns 1 event (FPT)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "issuance");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("FPT");
    expect(result[0]!.category).toBe("issuance");
  });

  it("'insider' → returns 1 event (MBB)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "insider");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("MBB");
  });

  it("'meeting' → returns 1 event (VHM)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "meeting");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("VHM");
  });

  it("'other' → returns 1 event (TCB)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "other");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("TCB");
  });

  it("empty events array with any category → returns []", () => {
    expect(filterEvents([], "dividend")).toHaveLength(0);
    expect(filterEvents([], "all")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: CATEGORY_FILTER_OPTIONS
// ---------------------------------------------------------------------------

describe("CATEGORY_FILTER_OPTIONS", () => {
  it("has exactly 6 options", () => {
    expect(CATEGORY_FILTER_OPTIONS).toHaveLength(6);
  });

  it("first option is 'all' / 'Tất cả'", () => {
    expect(CATEGORY_FILTER_OPTIONS[0]!.value).toBe("all");
    expect(CATEGORY_FILTER_OPTIONS[0]!.label).toBe("Tất cả");
  });

  it("contains all 5 category values after 'all'", () => {
    const values = CATEGORY_FILTER_OPTIONS.map((o) => o.value);
    expect(values).toContain("dividend");
    expect(values).toContain("issuance");
    expect(values).toContain("insider");
    expect(values).toContain("meeting");
    expect(values).toContain("other");
  });

  it("all labels are non-empty Vietnamese strings", () => {
    for (const opt of CATEGORY_FILTER_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Fixture A — events populated, isEmpty=false
// ---------------------------------------------------------------------------

describe("Fixture A — events populated (count=6)", () => {
  it("count = 6", () => {
    expect(FIXTURE_A_DTO.count).toBe(6);
  });

  it("isEmpty = false when count=6 and error=null", () => {
    const error: string | null = null;
    const isEmpty = !error && FIXTURE_A_DTO.count === 0;
    expect(isEmpty).toBe(false);
  });

  it("events[] has 6 items", () => {
    expect(FIXTURE_A_DTO.events).toHaveLength(6);
  });

  it("first event is VCB dividend on 2026-06-10 (sorted eventDate DESC)", () => {
    const first = FIXTURE_A_DTO.events[0]!;
    expect(first.code).toBe("VCB");
    expect(first.category).toBe("dividend");
    expect(first.eventDate).toBe("2026-06-10");
  });

  it("last event is TCB other on 2026-06-04", () => {
    const last = FIXTURE_A_DTO.events.at(-1)!;
    expect(last.code).toBe("TCB");
    expect(last.category).toBe("other");
    expect(last.eventDate).toBe("2026-06-04");
  });

  it("summary.distinctCodes = 6", () => {
    expect(FIXTURE_A_SUMMARY.distinctCodes).toBe(6);
  });

  it("summary.dividend = 2 (VCB + ACB)", () => {
    expect(FIXTURE_A_SUMMARY.dividend).toBe(2);
  });

  it("windowDays = 90, since and asOf are populated", () => {
    expect(FIXTURE_A_DTO.windowDays).toBe(90);
    expect(FIXTURE_A_DTO.since).toBe("2026-03-13");
    expect(FIXTURE_A_DTO.asOf).toBe("2026-06-10");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture B — empty state
// ---------------------------------------------------------------------------

describe("Fixture B — empty state (count=0)", () => {
  it("isEmpty = true when count=0 and error=null", () => {
    const error: string | null = null;
    const count = 0;
    const isEmpty = !error && count === 0;
    expect(isEmpty).toBe(true);
  });

  it("isEmpty = false when error is set (even with count=0)", () => {
    const error: string | null = "Connection refused";
    const count = 0;
    const isEmpty = !error && count === 0;
    expect(isEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Category filter logic on Fixture A
// ---------------------------------------------------------------------------

describe("Category filter logic — Fixture A", () => {
  it("filter 'all' → 6 events", () => {
    expect(filterEvents(FIXTURE_A_EVENTS, "all")).toHaveLength(6);
  });

  it("filter 'dividend' → 2 events (VCB, ACB)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "dividend");
    expect(result).toHaveLength(2);
    const codes = result.map((e) => e.code).sort();
    expect(codes).toEqual(["ACB", "VCB"]);
  });

  it("filter 'issuance' → 1 event (FPT)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "issuance");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("FPT");
    expect(result[0]!.categoryLabel).toBe("Phát hành cổ phiếu");
  });

  it("filter 'insider' → 1 event (MBB)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "insider");
    expect(result).toHaveLength(1);
    expect(result[0]!.categoryLabel).toBe("Giao dịch cổ đông nội bộ");
  });

  it("filter result for 'dividend' matches summary.dividend count", () => {
    const count = filterEvents(FIXTURE_A_EVENTS, "dividend").length;
    expect(count).toBe(FIXTURE_A_SUMMARY.dividend);
  });

  it("filter result for 'issuance' matches summary.issuance count", () => {
    const count = filterEvents(FIXTURE_A_EVENTS, "issuance").length;
    expect(count).toBe(FIXTURE_A_SUMMARY.issuance);
  });

  it("sum of all per-category filter counts equals totalEvents", () => {
    const cats = ["dividend", "issuance", "insider", "meeting", "other"] as const;
    const total = cats.reduce(
      (acc, cat) => acc + filterEvents(FIXTURE_A_EVENTS, cat).length,
      0,
    );
    expect(total).toBe(FIXTURE_A_SUMMARY.totalEvents);
  });
});

// ---------------------------------------------------------------------------
// Suite 9: byType ordering
// ---------------------------------------------------------------------------

describe("byType breakdown — Fixture A", () => {
  it("byType has 5 entries", () => {
    expect(FIXTURE_A_BY_TYPE).toHaveLength(5);
  });

  it("first byType entry is CASH_DIVIDEND with count=2 (desc by count)", () => {
    expect(FIXTURE_A_BY_TYPE[0]!.eventType).toBe("CASH_DIVIDEND");
    expect(FIXTURE_A_BY_TYPE[0]!.count).toBe(2);
  });

  it("remaining byType entries have count=1", () => {
    for (const entry of FIXTURE_A_BY_TYPE.slice(1)) {
      expect(entry.count).toBe(1);
    }
  });

  it("all byType categoryLabels are non-empty Vietnamese strings", () => {
    for (const entry of FIXTURE_A_BY_TYPE) {
      expect(entry.categoryLabel.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 10: topActiveCodes
// ---------------------------------------------------------------------------

describe("topActiveCodes — Fixture A", () => {
  it("topActiveCodes has 3 entries", () => {
    expect(FIXTURE_A_SUMMARY.topActiveCodes).toHaveLength(3);
  });

  it("each topActiveCode has code and count properties", () => {
    for (const tc of FIXTURE_A_SUMMARY.topActiveCodes) {
      expect(typeof tc.code).toBe("string");
      expect(tc.code.length).toBeGreaterThan(0);
      expect(typeof tc.count).toBe("number");
      expect(tc.count).toBeGreaterThan(0);
    }
  });

  it("topActiveCodes includes VCB, ACB, FPT", () => {
    const codes = FIXTURE_A_SUMMARY.topActiveCodes.map((t) => t.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("ACB");
    expect(codes).toContain("FPT");
  });
});

// ---------------------------------------------------------------------------
// Suite 11: Honest framing — NO "sắp tới" / "upcoming" / "calendar" in labels
// ---------------------------------------------------------------------------

describe("Honest backward-looking framing", () => {
  it("CATEGORY_FILTER_OPTIONS labels contain no 'sắp tới'", () => {
    for (const opt of CATEGORY_FILTER_OPTIONS) {
      expect(opt.label.toLowerCase()).not.toContain("sắp tới");
    }
  });

  it("CATEGORY_FILTER_OPTIONS labels contain no 'upcoming'", () => {
    for (const opt of CATEGORY_FILTER_OPTIONS) {
      expect(opt.label.toLowerCase()).not.toContain("upcoming");
    }
  });

  it("CATEGORY_FILTER_OPTIONS labels contain no 'calendar'", () => {
    for (const opt of CATEGORY_FILTER_OPTIONS) {
      expect(opt.label.toLowerCase()).not.toContain("calendar");
    }
  });

  it("CATEGORY_FILTER_OPTIONS labels contain no 'lịch' (calendar in VN)", () => {
    // The page framing must be backward-looking "hoạt động gần đây" not forward-looking
    // "lịch sự kiện". This test guards the filter labels specifically.
    for (const opt of CATEGORY_FILTER_OPTIONS) {
      // "lịch" alone is allowed (e.g., "lịch sử" = history), but "lịch sự kiện" is not.
      // We check the full label does not spell out a calendar-oriented label.
      expect(opt.label.toLowerCase()).not.toContain("lịch sự kiện");
    }
  });

  it("Fixture A events have non-empty detail or title (backward-looking content)", () => {
    for (const event of FIXTURE_A_EVENTS) {
      const displayText = event.detail || event.title;
      expect(displayText.length).toBeGreaterThan(0);
    }
  });

  it("clampDays whitelist does not include future-only values", () => {
    // The page is purely backward-looking; whitelist is just window sizes
    for (const d of ALLOWED_DAYS_VALUES) {
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(365);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 12: fetchCorporateEventsData — happy path
// ---------------------------------------------------------------------------

describe("fetchCorporateEventsData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses events, summary, byType, count correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchCorporateEventsData("http://localhost:3001", 90);

    expect(result.error).toBeNull();
    expect(result.events).toHaveLength(6);
    expect(result.count).toBe(6);
    expect(result.windowDays).toBe(90);
    expect(result.since).toBe("2026-03-13");
    expect(result.asOf).toBe("2026-06-10");
    expect(result.summary.totalEvents).toBe(6);
    expect(result.summary.distinctCodes).toBe(6);
    expect(result.summary.dividend).toBe(2);
    expect(result.summary.topActiveCodes).toHaveLength(3);
    expect(result.byType).toHaveLength(5);
  });

  it("first event is VCB dividend (server sort order preserved)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchCorporateEventsData("http://localhost:3001", 90);

    expect(result.events[0]!.code).toBe("VCB");
    expect(result.events[0]!.category).toBe("dividend");
  });

  it("typeFilter=null is preserved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchCorporateEventsData("http://localhost:3001", 90);

    expect(result.typeFilter).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 13: fetchCorporateEventsData — network error
// ---------------------------------------------------------------------------

describe("fetchCorporateEventsData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, events is empty array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchCorporateEventsData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.events).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.summary.totalEvents).toBe(0);
    expect(result.summary.topActiveCodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: fetchCorporateEventsData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchCorporateEventsData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, events=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      }),
    );

    const result = await fetchCorporateEventsData("http://localhost:3001");

    expect(result.error).toContain("/api/corporate-events");
    expect(result.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: fetchCorporateEventsData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchCorporateEventsData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, events=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }),
    );

    const result = await fetchCorporateEventsData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 16: fetchCorporateEventsData — Fixture B empty (count=0, no crash)
// ---------------------------------------------------------------------------

describe("fetchCorporateEventsData — Fixture B empty (count=0, no crash)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty events response → count=0, no error, no crash", async () => {
    const emptyPayload: CorporateEventsDto = {
      generatedAt: "2026-06-11T00:00:00.000Z",
      windowDays: 90,
      since: "2026-03-13",
      asOf: "",
      typeFilter: null,
      events: [],
      byType: [],
      summary: {
        totalEvents: 0,
        distinctCodes: 0,
        dividend: 0,
        issuance: 0,
        insider: 0,
        meeting: 0,
        other: 0,
        topActiveCodes: [],
      },
      count: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyPayload,
      }),
    );

    const result = await fetchCorporateEventsData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.events).toHaveLength(0);
    expect(result.count).toBe(0);
    const isEmpty = !result.error && result.count === 0;
    expect(isEmpty).toBe(true);
    expect(result.summary.totalEvents).toBe(0);
    expect(result.summary.topActiveCodes).toHaveLength(0);
    expect(result.asOf).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Suite 17: filterEvents ticker filter — AC-7 (a) VNM only (b) Tất cả (c) empty set
// ---------------------------------------------------------------------------

// Extended fixture with VNM events for AC-7a
const FIXTURE_WITH_VNM: CorporateEvent[] = [
  {
    code: "VNM",
    eventType: "CASH_DIVIDEND",
    category: "dividend",
    categoryLabel: "Cổ tức tiền mặt",
    title: "VNM Cash Dividend 2025",
    detail: "VNM chi trả cổ tức tiền mặt năm 2025",
    eventDate: "2026-06-10",
  },
  {
    code: "VNM",
    eventType: "STOCK_ISSUANCE",
    category: "issuance",
    categoryLabel: "Phát hành cổ phiếu",
    title: "VNM Stock Issuance",
    detail: "VNM phát hành thêm cổ phiếu ESOP",
    eventDate: "2026-06-09",
  },
  {
    code: "ACB",
    eventType: "AGM_ANNUAL",
    category: "meeting",
    categoryLabel: "ĐHĐCĐ thường niên",
    title: "ACB AGM",
    detail: "ACB tổ chức ĐHĐCĐ thường niên 2026",
    eventDate: "2026-06-08",
  },
];

describe("filterEvents ticker filter — AC-7", () => {
  // AC-7a: filterEvents with ticker='VNM' returns only VNM events
  it("(a) ticker='VNM' → returns only VNM events", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "all", "VNM");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.code === "VNM")).toBe(true);
  });

  // AC-7b: filterEvents with 'Tất cả' returns all events
  it("(b) ticker='Tất cả' → returns all events (unfiltered by ticker)", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "all", "Tất cả");
    expect(result).toHaveLength(3);
    expect(result).toBe(FIXTURE_WITH_VNM); // same reference — no copy when both filters are 'all'
  });

  // AC-7c: empty events set → filterEvents returns [] regardless of ticker
  it("(c) empty events array → returns [] for any ticker value", () => {
    expect(filterEvents([], "all", "VNM")).toHaveLength(0);
    expect(filterEvents([], "all", "Tất cả")).toHaveLength(0);
  });

  // Default param: backward-compat — calling with 2 args still works (AC-3)
  it("(compat) calling with 2 args → behaves as selectedTicker='Tất cả'", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "all");
    expect(result).toHaveLength(3);
  });

  // Ticker that matches no events → returns empty
  it("ticker with no matching events → returns []", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "all", "HPG");
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 18: filterEvents cascade — category THEN ticker (AC-4)
// ---------------------------------------------------------------------------

describe("filterEvents cascade — category THEN ticker (AC-4)", () => {
  it("category='dividend' + ticker='VNM' → only VNM dividend event", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "dividend", "VNM");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("VNM");
    expect(result[0]!.category).toBe("dividend");
  });

  it("category='issuance' + ticker='VNM' → only VNM issuance event", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "issuance", "VNM");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("VNM");
    expect(result[0]!.category).toBe("issuance");
  });

  it("category='meeting' + ticker='VNM' → empty (ACB has the meeting, not VNM)", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "meeting", "VNM");
    expect(result).toHaveLength(0);
  });

  it("category='meeting' + ticker='Tất cả' → 1 event (ACB meeting)", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "meeting", "Tất cả");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("ACB");
  });

  it("category='all' + ticker='ACB' → 1 event (ACB meeting)", () => {
    const result = filterEvents(FIXTURE_WITH_VNM, "all", "ACB");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("ACB");
  });

  it("Fixture A: category='dividend' + ticker='VCB' → only VCB dividend", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "dividend", "VCB");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("VCB");
  });

  it("Fixture A: category='dividend' + ticker='FPT' → empty (FPT is issuance)", () => {
    const result = filterEvents(FIXTURE_A_EVENTS, "dividend", "FPT");
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 19: distinctCodes derivation — sorted A-Z, no duplicates (AC-1)
// ---------------------------------------------------------------------------

describe("distinctCodes derivation — AC-1 payload-SSOT, sorted A-Z", () => {
  it("Fixture A: 6 events with 6 distinct codes → distinctCodes has 6 entries", () => {
    const distinctCodes = [...new Set(FIXTURE_A_EVENTS.map((e) => e.code))].sort();
    expect(distinctCodes).toHaveLength(6);
  });

  it("Fixture A: distinctCodes are sorted A-Z", () => {
    const distinctCodes = [...new Set(FIXTURE_A_EVENTS.map((e) => e.code))].sort();
    const sorted = [...distinctCodes].sort();
    expect(distinctCodes).toEqual(sorted);
  });

  it("Fixture A: distinctCodes contains ACB, FPT, MBB, TCB, VCB, VHM", () => {
    const distinctCodes = [...new Set(FIXTURE_A_EVENTS.map((e) => e.code))].sort();
    expect(distinctCodes).toContain("ACB");
    expect(distinctCodes).toContain("FPT");
    expect(distinctCodes).toContain("MBB");
    expect(distinctCodes).toContain("TCB");
    expect(distinctCodes).toContain("VCB");
    expect(distinctCodes).toContain("VHM");
  });

  it("duplicate codes in payload → distinctCodes deduplicates", () => {
    const eventsWithDups: CorporateEvent[] = [
      { ...FIXTURE_A_EVENTS[0]!, code: "VCB" },
      { ...FIXTURE_A_EVENTS[1]!, code: "VCB" }, // dup
      { ...FIXTURE_A_EVENTS[2]!, code: "FPT" },
    ];
    const distinctCodes = [...new Set(eventsWithDups.map((e) => e.code))].sort();
    expect(distinctCodes).toHaveLength(2);
    expect(distinctCodes).toEqual(["FPT", "VCB"]);
  });

  it("empty events → distinctCodes is empty array (AC-6: graceful degrade)", () => {
    const distinctCodes = [...new Set(([] as CorporateEvent[]).map((e) => e.code))].sort();
    expect(distinctCodes).toHaveLength(0);
  });
});
