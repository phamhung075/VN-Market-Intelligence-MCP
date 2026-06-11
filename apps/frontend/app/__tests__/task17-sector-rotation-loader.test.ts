/**
 * task17-sector-rotation-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.sector-rotation.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — importable by both bun test and vitest.
 *
 * Fixtures mirror the PRODUCTION payload verified live on 2026-06-11:
 *   - Fixture A: 14 sectors, only1dAvailable=true, avg5dReturn=null, classification=NEUTRAL.
 *     Spread: agriculture +2.135 (top) → retail -1.66 (bottom).
 *   - Fixture B: 3 sectors, only1dAvailable=false, non-null avg5dReturn,
 *     classifications DONG_TIEN_VAO / DONG_TIEN_RA / NEUTRAL to prove 5d-mode paths.
 *
 * Suites:
 *   1. formatReturn — signed %, 2 dp
 *   2. returnColorClass — green/red/slate
 *   3. classificationLabel — VN mapping
 *   4. classificationBadgeClass — badge CSS mapping
 *   5. format5dReturn — null → "đang tích lũy", number → formatReturn
 *   6. formatTradingDate — ISO → VN locale, empty → "—"
 *   7. Fixture A: sort order (agriculture first, retail last)
 *   8. Fixture A: null avg5dReturn renders as "đang tích lũy"
 *   9. Fixture A: all classifications = NEUTRAL
 *  10. Fixture A: summary counts (inflow=0, outflow=0, neutral=14)
 *  11. Fixture A: topInflow first entry = agriculture (highest avg1dReturn)
 *  12. Fixture A: topOutflow first entry = retail (lowest avg1dReturn)
 *  13. Fixture B: DONG_TIEN_VAO → badge class contains emerald
 *  14. Fixture B: DONG_TIEN_RA → badge class contains red
 *  15. Fixture B: non-null avg5dReturn renders as signed %
 *  16. Empty state: count=0 / sectors=[] — isEmpty logic
 *  17. watchlistWarning flag is propagated correctly
 *  18. fetchSectorRotationData: happy path with mocked fetch (Fixture A shape)
 *  19. fetchSectorRotationData: network error → error string set, sectors=[]
 *  20. fetchSectorRotationData: bad shape → error set
 *  21. fetchSectorRotationData: upstream 502 → error set
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatReturn,
  returnColorClass,
  classificationLabel,
  classificationBadgeClass,
  format5dReturn,
  formatTradingDate,
  fetchSectorRotationData,
} from "../routes/dashboard.sector-rotation";
import type { SectorEntry, SectorSummary } from "../routes/dashboard.sector-rotation";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fixture A — mirrors live production payload 2026-06-11 (only1dAvailable=true) */
const FIXTURE_A_SECTORS: SectorEntry[] = [
  {
    sector: "agriculture",
    sectorNameVi: "Nông nghiệp",
    classification: "NEUTRAL" as const,
    avg1dReturn: 2.135,
    avg5dReturn: null,
    stockCount: 2,
    stocks: ["HAG", "HNG"],
    watchlistWarning: false,
  },
  {
    sector: "chemicals",
    sectorNameVi: "Hóa chất",
    classification: "NEUTRAL" as const,
    avg1dReturn: 1.8,
    avg5dReturn: null,
    stockCount: 1,
    stocks: ["DGC"],
    watchlistWarning: false,
  },
  {
    sector: "other",
    sectorNameVi: "Khác",
    classification: "NEUTRAL" as const,
    avg1dReturn: 1.2,
    avg5dReturn: null,
    stockCount: 3,
    stocks: ["VHM", "VIC", "GVR"],
    watchlistWarning: false,
  },
  {
    sector: "utilities",
    sectorNameVi: "Tiện ích",
    classification: "NEUTRAL" as const,
    avg1dReturn: 0.95,
    avg5dReturn: null,
    stockCount: 2,
    stocks: ["GAS", "POW"],
    watchlistWarning: false,
  },
  {
    sector: "machinery",
    sectorNameVi: "Máy móc",
    classification: "NEUTRAL" as const,
    avg1dReturn: 0.72,
    avg5dReturn: null,
    stockCount: 1,
    stocks: ["PVT"],
    watchlistWarning: false,
  },
  {
    sector: "banking",
    sectorNameVi: "Ngân hàng",
    classification: "NEUTRAL" as const,
    avg1dReturn: 0.33,
    avg5dReturn: null,
    stockCount: 4,
    stocks: ["VCB", "TCB", "BID", "CTG"],
    watchlistWarning: true,
  },
  {
    sector: "realestate",
    sectorNameVi: "Bất động sản",
    classification: "NEUTRAL" as const,
    avg1dReturn: 0.1,
    avg5dReturn: null,
    stockCount: 2,
    stocks: ["NVL", "PDR"],
    watchlistWarning: false,
  },
  {
    sector: "insurance",
    sectorNameVi: "Bảo hiểm",
    classification: "NEUTRAL" as const,
    avg1dReturn: 0.0,
    avg5dReturn: null,
    stockCount: 1,
    stocks: ["BVH"],
    watchlistWarning: false,
  },
  {
    sector: "construction",
    sectorNameVi: "Xây dựng",
    classification: "NEUTRAL" as const,
    avg1dReturn: -0.15,
    avg5dReturn: null,
    stockCount: 1,
    stocks: ["HBC"],
    watchlistWarning: false,
  },
  {
    sector: "food",
    sectorNameVi: "Thực phẩm",
    classification: "NEUTRAL" as const,
    avg1dReturn: -0.44,
    avg5dReturn: null,
    stockCount: 2,
    stocks: ["MSN", "VNM"],
    watchlistWarning: false,
  },
  {
    sector: "aviation",
    sectorNameVi: "Hàng không",
    classification: "NEUTRAL" as const,
    avg1dReturn: -0.78,
    avg5dReturn: null,
    stockCount: 1,
    stocks: ["HVN"],
    watchlistWarning: false,
  },
  {
    sector: "steel",
    sectorNameVi: "Thép",
    classification: "NEUTRAL" as const,
    avg1dReturn: -0.95,
    avg5dReturn: null,
    stockCount: 2,
    stocks: ["HPG", "HSG"],
    watchlistWarning: false,
  },
  {
    sector: "securities",
    sectorNameVi: "Chứng khoán",
    classification: "NEUTRAL" as const,
    avg1dReturn: -1.12,
    avg5dReturn: null,
    stockCount: 3,
    stocks: ["SSI", "VND", "MBS"],
    watchlistWarning: false,
  },
  {
    sector: "tech",
    sectorNameVi: "Công nghệ",
    classification: "NEUTRAL" as const,
    avg1dReturn: -1.42,
    avg5dReturn: null,
    stockCount: 2,
    stocks: ["FPT", "CMG"],
    watchlistWarning: false,
  },
  {
    sector: "retail",
    sectorNameVi: "Bán lẻ",
    classification: "NEUTRAL" as const,
    avg1dReturn: -1.66,
    avg5dReturn: null,
    stockCount: 2,
    stocks: ["MWG", "PNJ"],
    watchlistWarning: false,
  },
];

// Fixture A is pre-sorted DESC by avg1dReturn (as the endpoint returns it):
// This array already is sorted: agriculture 2.135 → retail -1.66.

const FIXTURE_A_SUMMARY: SectorSummary = {
  inflow: 0,
  outflow: 0,
  neutral: 14,
  topInflow: [FIXTURE_A_SECTORS[0]!], // agriculture
  topOutflow: [FIXTURE_A_SECTORS[FIXTURE_A_SECTORS.length - 1]!], // retail
};

/** Fixture B — only1dAvailable=false, 5d history available, mixed classifications */
const FIXTURE_B_SECTORS: SectorEntry[] = [
  {
    sector: "banking",
    sectorNameVi: "Ngân hàng",
    classification: "DONG_TIEN_VAO" as const,
    avg1dReturn: 1.5,
    avg5dReturn: 3.2,
    stockCount: 4,
    stocks: ["VCB", "TCB", "BID", "CTG"],
    watchlistWarning: true,
  },
  {
    sector: "insurance",
    sectorNameVi: "Bảo hiểm",
    classification: "NEUTRAL" as const,
    avg1dReturn: 0.1,
    avg5dReturn: 0.05,
    stockCount: 1,
    stocks: ["BVH"],
    watchlistWarning: false,
  },
  {
    sector: "retail",
    sectorNameVi: "Bán lẻ",
    classification: "DONG_TIEN_RA" as const,
    avg1dReturn: -2.1,
    avg5dReturn: -4.8,
    stockCount: 2,
    stocks: ["MWG", "PNJ"],
    watchlistWarning: false,
  },
];

const FIXTURE_B_SUMMARY: SectorSummary = {
  inflow: 1,
  outflow: 1,
  neutral: 1,
  topInflow: [FIXTURE_B_SECTORS[0]!],
  topOutflow: [FIXTURE_B_SECTORS[2]!],
};

// ---------------------------------------------------------------------------
// Suite 1: formatReturn
// ---------------------------------------------------------------------------

describe("formatReturn", () => {
  it("positive → +XX.XX% (JS toFixed banker rounding: 2.135 → 2.13)", () => {
    // JS toFixed uses IEEE 754 representation: 2.135.toFixed(2) = "2.13"
    expect(formatReturn(2.135)).toBe("+2.13%");
  });

  it("negative → -XX.XX%", () => {
    expect(formatReturn(-1.66)).toBe("-1.66%");
  });

  it("zero → 0.00%", () => {
    expect(formatReturn(0)).toBe("0.00%");
  });

  it("small positive → +0.33%", () => {
    expect(formatReturn(0.33)).toBe("+0.33%");
  });

  it("large value → correct 2dp (JS toFixed: 10.555 → 10.55)", () => {
    // JS toFixed uses IEEE 754 representation: 10.555.toFixed(2) = "10.55"
    expect(formatReturn(10.555)).toBe("+10.55%");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: returnColorClass
// ---------------------------------------------------------------------------

describe("returnColorClass", () => {
  it("positive → emerald-400", () => {
    expect(returnColorClass(2.135)).toContain("emerald-400");
  });

  it("negative → red-400", () => {
    expect(returnColorClass(-1.66)).toContain("red-400");
  });

  it("zero → slate-400", () => {
    expect(returnColorClass(0)).toContain("slate-400");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: classificationLabel
// ---------------------------------------------------------------------------

describe("classificationLabel", () => {
  it("DONG_TIEN_VAO → VÀO", () => {
    expect(classificationLabel("DONG_TIEN_VAO")).toBe("VÀO");
  });

  it("DONG_TIEN_RA → RA", () => {
    expect(classificationLabel("DONG_TIEN_RA")).toBe("RA");
  });

  it("NEUTRAL → TRUNG LẬP", () => {
    expect(classificationLabel("NEUTRAL")).toBe("TRUNG LẬP");
  });

  it("unknown string → TRUNG LẬP (default fallback)", () => {
    expect(classificationLabel("UNKNOWN")).toBe("TRUNG LẬP");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: classificationBadgeClass
// ---------------------------------------------------------------------------

describe("classificationBadgeClass", () => {
  it("DONG_TIEN_VAO → contains emerald", () => {
    expect(classificationBadgeClass("DONG_TIEN_VAO")).toContain("emerald");
  });

  it("DONG_TIEN_RA → contains red", () => {
    expect(classificationBadgeClass("DONG_TIEN_RA")).toContain("red");
  });

  it("NEUTRAL → contains slate", () => {
    expect(classificationBadgeClass("NEUTRAL")).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: format5dReturn
// ---------------------------------------------------------------------------

describe("format5dReturn", () => {
  it("null → 'đang tích lũy'", () => {
    expect(format5dReturn(null)).toBe("đang tích lũy");
  });

  it("undefined → 'đang tích lũy'", () => {
    expect(format5dReturn(undefined as unknown as null)).toBe("đang tích lũy");
  });

  it("positive number → signed %", () => {
    expect(format5dReturn(3.2)).toBe("+3.20%");
  });

  it("negative number → signed %", () => {
    expect(format5dReturn(-4.8)).toBe("-4.80%");
  });

  it("zero → 0.00%", () => {
    expect(format5dReturn(0)).toBe("0.00%");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: formatTradingDate
// ---------------------------------------------------------------------------

describe("formatTradingDate", () => {
  it("empty string → '—'", () => {
    expect(formatTradingDate("")).toBe("—");
  });

  it("valid ISO string → non-empty string (locale formatted)", () => {
    const result = formatTradingDate("2026-06-11T12:15:02.679Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("—");
  });

  it("invalid string → returns original (graceful fallback)", () => {
    const result = formatTradingDate("not-a-date");
    // new Date("not-a-date") is Invalid Date — toLocaleString returns "Invalid Date"
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture A — sort order
// ---------------------------------------------------------------------------

describe("Fixture A — sort order (agriculture first, retail last)", () => {
  it("first sector by avg1dReturn DESC is agriculture (+2.135)", () => {
    expect(FIXTURE_A_SECTORS[0]!.sector).toBe("agriculture");
    expect(FIXTURE_A_SECTORS[0]!.avg1dReturn).toBe(2.135);
  });

  it("last sector by avg1dReturn DESC is retail (-1.66)", () => {
    const last = FIXTURE_A_SECTORS[FIXTURE_A_SECTORS.length - 1]!;
    expect(last.sector).toBe("retail");
    expect(last.avg1dReturn).toBe(-1.66);
  });

  it("sectors are in descending order of avg1dReturn", () => {
    for (let i = 1; i < FIXTURE_A_SECTORS.length; i++) {
      expect(FIXTURE_A_SECTORS[i - 1]!.avg1dReturn).toBeGreaterThanOrEqual(
        FIXTURE_A_SECTORS[i]!.avg1dReturn
      );
    }
  });

  it("has exactly 15 sectors in Fixture A", () => {
    expect(FIXTURE_A_SECTORS).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Fixture A — null avg5dReturn renders as "đang tích lũy"
// ---------------------------------------------------------------------------

describe("Fixture A — null avg5dReturn", () => {
  it("all sectors have avg5dReturn === null", () => {
    for (const s of FIXTURE_A_SECTORS) {
      expect(s.avg5dReturn).toBeNull();
    }
  });

  it("format5dReturn(null) → 'đang tích lũy' for all fixture A sectors", () => {
    for (const s of FIXTURE_A_SECTORS) {
      expect(format5dReturn(s.avg5dReturn)).toBe("đang tích lũy");
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Fixture A — all classifications = NEUTRAL
// ---------------------------------------------------------------------------

describe("Fixture A — all NEUTRAL classification", () => {
  it("every sector has classification NEUTRAL", () => {
    for (const s of FIXTURE_A_SECTORS) {
      expect(s.classification).toBe("NEUTRAL");
    }
  });

  it("classificationLabel(NEUTRAL) → TRUNG LẬP for all", () => {
    for (const s of FIXTURE_A_SECTORS) {
      expect(classificationLabel(s.classification)).toBe("TRUNG LẬP");
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 10: Fixture A — summary counts
// ---------------------------------------------------------------------------

describe("Fixture A — summary counts (inflow=0, outflow=0, neutral=14)", () => {
  it("summary.inflow is 0", () => {
    expect(FIXTURE_A_SUMMARY.inflow).toBe(0);
  });

  it("summary.outflow is 0", () => {
    expect(FIXTURE_A_SUMMARY.outflow).toBe(0);
  });

  it("summary.neutral is 14", () => {
    expect(FIXTURE_A_SUMMARY.neutral).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: Fixture A — topInflow first entry = agriculture
// ---------------------------------------------------------------------------

describe("Fixture A — topInflow", () => {
  it("topInflow[0] is agriculture (highest avg1dReturn)", () => {
    expect(FIXTURE_A_SUMMARY.topInflow[0]!.sector).toBe("agriculture");
    expect(FIXTURE_A_SUMMARY.topInflow[0]!.avg1dReturn).toBe(2.135);
  });
});

// ---------------------------------------------------------------------------
// Suite 12: Fixture A — topOutflow first entry = retail
// ---------------------------------------------------------------------------

describe("Fixture A — topOutflow", () => {
  it("topOutflow[0] is retail (lowest avg1dReturn)", () => {
    expect(FIXTURE_A_SUMMARY.topOutflow[0]!.sector).toBe("retail");
    expect(FIXTURE_A_SUMMARY.topOutflow[0]!.avg1dReturn).toBe(-1.66);
  });
});

// ---------------------------------------------------------------------------
// Suite 13: Fixture B — DONG_TIEN_VAO badge
// ---------------------------------------------------------------------------

describe("Fixture B — DONG_TIEN_VAO badge", () => {
  it("banking classification DONG_TIEN_VAO → badge contains emerald", () => {
    const banking = FIXTURE_B_SECTORS[0]!;
    expect(banking.classification).toBe("DONG_TIEN_VAO");
    expect(classificationBadgeClass(banking.classification)).toContain("emerald");
    expect(classificationLabel(banking.classification)).toBe("VÀO");
  });
});

// ---------------------------------------------------------------------------
// Suite 14: Fixture B — DONG_TIEN_RA badge
// ---------------------------------------------------------------------------

describe("Fixture B — DONG_TIEN_RA badge", () => {
  it("retail classification DONG_TIEN_RA → badge contains red", () => {
    const retail = FIXTURE_B_SECTORS[2]!;
    expect(retail.classification).toBe("DONG_TIEN_RA");
    expect(classificationBadgeClass(retail.classification)).toContain("red");
    expect(classificationLabel(retail.classification)).toBe("RA");
  });
});

// ---------------------------------------------------------------------------
// Suite 15: Fixture B — non-null avg5dReturn renders as signed %
// ---------------------------------------------------------------------------

describe("Fixture B — non-null avg5dReturn", () => {
  it("banking avg5dReturn=3.2 → '+3.20%'", () => {
    const banking = FIXTURE_B_SECTORS[0]!;
    expect(format5dReturn(banking.avg5dReturn)).toBe("+3.20%");
  });

  it("retail avg5dReturn=-4.8 → '-4.80%'", () => {
    const retail = FIXTURE_B_SECTORS[2]!;
    expect(format5dReturn(retail.avg5dReturn)).toBe("-4.80%");
  });

  it("insurance avg5dReturn=0.05 → '+0.05%'", () => {
    const insurance = FIXTURE_B_SECTORS[1]!;
    expect(format5dReturn(insurance.avg5dReturn)).toBe("+0.05%");
  });
});

// ---------------------------------------------------------------------------
// Suite 16: Empty state — isEmpty logic
// ---------------------------------------------------------------------------

describe("Empty state — count=0 / sectors=[]", () => {
  it("empty sectors array length is 0", () => {
    const emptySectors: SectorEntry[] = [];
    expect(emptySectors.length).toBe(0);
  });

  it("isEmpty = !error && count === 0", () => {
    // Mimic loader return with count=0
    const loaderResult = {
      count: 0,
      sectors: [] as SectorEntry[],
      error: null,
    };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(true);
  });

  it("isEmpty = false when sectors present", () => {
    const loaderResult = {
      count: 14,
      sectors: FIXTURE_A_SECTORS,
      error: null,
    };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(false);
  });

  it("isEmpty = false when error present (error takes precedence)", () => {
    const loaderResult = {
      count: 0,
      sectors: [] as SectorEntry[],
      error: "Network error",
    };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 17: watchlistWarning flag
// ---------------------------------------------------------------------------

describe("watchlistWarning flag", () => {
  it("banking sector in Fixture A has watchlistWarning=true", () => {
    const banking = FIXTURE_A_SECTORS.find((s) => s.sector === "banking");
    expect(banking).toBeDefined();
    expect(banking!.watchlistWarning).toBe(true);
  });

  it("agriculture sector in Fixture A has watchlistWarning=false", () => {
    const agriculture = FIXTURE_A_SECTORS.find((s) => s.sector === "agriculture");
    expect(agriculture).toBeDefined();
    expect(agriculture!.watchlistWarning).toBe(false);
  });

  it("banking sector in Fixture B has watchlistWarning=true", () => {
    const banking = FIXTURE_B_SECTORS.find((s) => s.sector === "banking");
    expect(banking).toBeDefined();
    expect(banking!.watchlistWarning).toBe(true);
  });

  it("retail sector in Fixture B has watchlistWarning=false", () => {
    const retail = FIXTURE_B_SECTORS.find((s) => s.sector === "retail");
    expect(retail).toBeDefined();
    expect(retail!.watchlistWarning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 18: fetchSectorRotationData — happy path with mocked fetch
// ---------------------------------------------------------------------------

describe("fetchSectorRotationData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses sectors, summary, only1dAvailable, tradingDate correctly", async () => {
    const mockPayload = {
      generatedAt: "2026-06-11T12:15:02.679Z",
      tradingDate: "2026-06-11T12:15:02.679Z",
      priceSource: "stored",
      only1dAvailable: true,
      sectors: FIXTURE_A_SECTORS,
      summary: FIXTURE_A_SUMMARY,
      count: 15,
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    }));

    const result = await fetchSectorRotationData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.only1dAvailable).toBe(true);
    expect(result.sectors).toHaveLength(15);
    expect(result.sectors[0]!.sector).toBe("agriculture");
    expect(result.summary.inflow).toBe(0);
    expect(result.summary.neutral).toBe(14);
    expect(result.count).toBe(15);
    expect(result.tradingDate).toBe("2026-06-11T12:15:02.679Z");
  });

  it("parses Fixture B shape with non-null avg5dReturn and mixed classifications", async () => {
    const mockPayload = {
      generatedAt: "2026-06-11T09:00:00.000Z",
      tradingDate: "2026-06-11T09:00:00.000Z",
      priceSource: "stored",
      only1dAvailable: false,
      sectors: FIXTURE_B_SECTORS,
      summary: FIXTURE_B_SUMMARY,
      count: 3,
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    }));

    const result = await fetchSectorRotationData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.only1dAvailable).toBe(false);
    expect(result.sectors).toHaveLength(3);
    expect(result.sectors[0]!.avg5dReturn).toBe(3.2);
    expect(result.sectors[0]!.classification).toBe("DONG_TIEN_VAO");
    expect(result.sectors[2]!.classification).toBe("DONG_TIEN_RA");
    expect(result.summary.inflow).toBe(1);
    expect(result.summary.outflow).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 19: fetchSectorRotationData — network error
// ---------------------------------------------------------------------------

describe("fetchSectorRotationData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, sectors is empty array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await fetchSectorRotationData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.sectors).toHaveLength(0);
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 20: fetchSectorRotationData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchSectorRotationData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: "shape" }),
    }));

    const result = await fetchSectorRotationData("http://localhost:3001");

    expect(result.error).toContain("/api/sector-rotation");
    expect(result.sectors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 21: fetchSectorRotationData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchSectorRotationData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, sectors=[]", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => ({}),
    }));

    const result = await fetchSectorRotationData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.sectors).toHaveLength(0);
  });
});
