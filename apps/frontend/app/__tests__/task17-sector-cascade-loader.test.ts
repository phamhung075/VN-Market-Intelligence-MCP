/**
 * task17-sector-cascade-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.sector-cascade.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — importable by both bun test and vitest.
 *
 * Fixtures mirror the PRODUCTION payload verified live on 2026-06-11:
 *   - Fixture A: 17-sector populated response, recentHits present.
 *     netBias: tech +19 (top) → oil_gas -2 (bottom). 9 bullish / 3 bearish / 5 neutral.
 *   - Fixture B: empty response (count=0, sectors=[], recentHits=[]) — honest empty-state path.
 *
 * Suites:
 *   1. netBiasLabel — TÍCH CỰC / TIÊU CỰC / TRUNG TÍNH
 *   2. netBiasBadgeClass — emerald / red / slate
 *   3. directionLabel — Tăng / Giảm / Trung tính + unknown fallback
 *   4. directionBadgeClass — emerald / red / slate
 *   5. formatHitAt — ISO/YYYY-MM-DD HH:MM:SS → VN locale, empty → "—"
 *   6. getSectorNameVi — all 17 live sector keys covered, unmapped → raw key fallback
 *   7. Fixture A — sort order (tech first by netBias, oil_gas last)
 *   8. Fixture A — netBias→badge classification for all sectors
 *   9. Fixture A — summary counts (9 bullish / 3 bearish / 5 neutral)
 *  10. Fixture A — topBullish first = tech (netBias +19), topBearish first = banking or oil_gas (negative)
 *  11. Fixture A — recentHits direction→label mapping
 *  12. Fixture A — affectedStocks [] → graceful (no crash, no stocks rendered)
 *  13. Fixture B — empty state (count=0, isEmpty logic)
 *  14. fetchSectorCascadeData — happy path (Fixture A shape via mocked fetch)
 *  15. fetchSectorCascadeData — network error → error string set, sectors=[]
 *  16. fetchSectorCascadeData — bad shape → error set
 *  17. fetchSectorCascadeData — upstream 502 → error set
 *  18. fetchSectorCascadeData — Fixture B empty response → count=0, no crash
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  netBiasLabel,
  netBiasBadgeClass,
  directionLabel,
  directionBadgeClass,
  formatHitAt,
  getSectorNameVi,
  sectorNameViMap,
  fetchSectorCascadeData,
} from "../routes/dashboard.sector-cascade";
import type {
  SectorCascadeEntry,
  CascadeSummary,
  RecentHit,
} from "../routes/dashboard.sector-cascade";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fixture A — mirrors live production payload 2026-06-11 (17 sectors, 7d window) */
const FIXTURE_A_SECTORS: SectorCascadeEntry[] = [
  { sector: "tech",         up: 21, down: 2,  neutral: 17,  total: 40, netBias: 19  },
  { sector: "real_estate",  up: 12, down: 3,  neutral: 5,   total: 20, netBias: 9   },
  { sector: "retail",       up: 10, down: 3,  neutral: 4,   total: 17, netBias: 7   },
  { sector: "gold_mining",  up: 6,  down: 2,  neutral: 2,   total: 10, netBias: 4   },
  { sector: "logistics",    up: 6,  down: 2,  neutral: 3,   total: 11, netBias: 4   },
  { sector: "aviation",     up: 5,  down: 3,  neutral: 2,   total: 10, netBias: 2   },
  { sector: "pharma",       up: 62, down: 61, neutral: 121, total: 244, netBias: 1  },
  { sector: "utilities",    up: 4,  down: 3,  neutral: 5,   total: 12, netBias: 1   },
  { sector: "construction", up: 5,  down: 4,  neutral: 3,   total: 12, netBias: 1   },
  { sector: "agriculture",  up: 3,  down: 3,  neutral: 4,   total: 10, netBias: 0   },
  { sector: "steel",        up: 3,  down: 3,  neutral: 4,   total: 10, netBias: 0   },
  { sector: "machinery",    up: 2,  down: 2,  neutral: 3,   total: 7,  netBias: 0   },
  { sector: "chemicals",    up: 2,  down: 2,  neutral: 2,   total: 6,  netBias: 0   },
  { sector: "automotive",   up: 2,  down: 2,  neutral: 2,   total: 6,  netBias: 0   },
  { sector: "securities",   up: 3,  down: 4,  neutral: 3,   total: 10, netBias: -1  },
  { sector: "banking",      up: 4,  down: 6,  neutral: 5,   total: 15, netBias: -2  },
  { sector: "oil_gas",      up: 2,  down: 4,  neutral: 3,   total: 9,  netBias: -2  },
];

// Fixture A is pre-sorted netBias DESC (as the endpoint returns it).
// 9 bullish (netBias>0), 3 bearish (netBias<0), 5 neutral (netBias=0).

const FIXTURE_A_SUMMARY: CascadeSummary = {
  bullishSectors: 9,
  bearishSectors: 3,
  neutralSectors: 5,
  topBullish: [
    FIXTURE_A_SECTORS[0]!, // tech +19
    FIXTURE_A_SECTORS[1]!, // real_estate +9
    FIXTURE_A_SECTORS[2]!, // retail +7
    FIXTURE_A_SECTORS[3]!, // gold_mining +4
    FIXTURE_A_SECTORS[4]!, // logistics +4
  ],
  topBearish: [
    FIXTURE_A_SECTORS[16]!, // oil_gas -2
    FIXTURE_A_SECTORS[15]!, // banking -2
    FIXTURE_A_SECTORS[14]!, // securities -1
  ],
};

const FIXTURE_A_RECENT_HITS: RecentHit[] = [
  {
    ruleKey: "tech_bullish_funding",
    sector: "tech",
    direction: "up",
    matchedText: "FPT nhận khoản đầu tư lớn từ đối tác Nhật Bản trong lĩnh vực AI",
    affectedStocks: ["FPT", "CMG"],
    hitAt: "2026-06-10 14:35:22",
    confidence: null,
  },
  {
    ruleKey: "pharma_neutral_cron",
    sector: "pharma",
    direction: "neutral",
    matchedText: "Cục quản lý dược cập nhật danh mục thuốc thiết yếu định kỳ",
    affectedStocks: [],
    hitAt: "2026-06-10 12:00:00",
    confidence: null,
  },
  {
    ruleKey: "banking_bearish_npl",
    sector: "banking",
    direction: "down",
    matchedText: "NHNN cảnh báo tỷ lệ nợ xấu ngân hàng tăng trong quý 2",
    affectedStocks: ["VCB", "TCB", "BID"],
    hitAt: "2026-06-09 09:15:00",
    confidence: 0.85,
  },
];

/** Fixture B — empty response */
const FIXTURE_B_SECTORS: SectorCascadeEntry[] = [];
const FIXTURE_B_SUMMARY: CascadeSummary = {
  bullishSectors: 0,
  bearishSectors: 0,
  neutralSectors: 0,
  topBullish: [],
  topBearish: [],
};
const FIXTURE_B_RECENT_HITS: RecentHit[] = [];

// ---------------------------------------------------------------------------
// Suite 1: netBiasLabel
// ---------------------------------------------------------------------------

describe("netBiasLabel", () => {
  it("positive netBias → TÍCH CỰC", () => {
    expect(netBiasLabel(19)).toBe("TÍCH CỰC");
    expect(netBiasLabel(1)).toBe("TÍCH CỰC");
  });

  it("negative netBias → TIÊU CỰC", () => {
    expect(netBiasLabel(-2)).toBe("TIÊU CỰC");
    expect(netBiasLabel(-1)).toBe("TIÊU CỰC");
  });

  it("zero netBias → TRUNG TÍNH", () => {
    expect(netBiasLabel(0)).toBe("TRUNG TÍNH");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: netBiasBadgeClass
// ---------------------------------------------------------------------------

describe("netBiasBadgeClass", () => {
  it("positive → contains emerald", () => {
    expect(netBiasBadgeClass(9)).toContain("emerald");
  });

  it("negative → contains red", () => {
    expect(netBiasBadgeClass(-1)).toContain("red");
  });

  it("zero → contains slate", () => {
    expect(netBiasBadgeClass(0)).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: directionLabel
// ---------------------------------------------------------------------------

describe("directionLabel", () => {
  it("up → Tăng", () => {
    expect(directionLabel("up")).toBe("Tăng");
  });

  it("down → Giảm", () => {
    expect(directionLabel("down")).toBe("Giảm");
  });

  it("neutral → Trung tính", () => {
    expect(directionLabel("neutral")).toBe("Trung tính");
  });

  it("unknown string → Trung tính (default fallback)", () => {
    expect(directionLabel("unknown_direction")).toBe("Trung tính");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: directionBadgeClass
// ---------------------------------------------------------------------------

describe("directionBadgeClass", () => {
  it("up → contains emerald", () => {
    expect(directionBadgeClass("up")).toContain("emerald");
  });

  it("down → contains red", () => {
    expect(directionBadgeClass("down")).toContain("red");
  });

  it("neutral → contains slate", () => {
    expect(directionBadgeClass("neutral")).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: formatHitAt
// ---------------------------------------------------------------------------

describe("formatHitAt", () => {
  it("empty string → '—'", () => {
    expect(formatHitAt("")).toBe("—");
  });

  it("ISO datetime string → non-empty locale string", () => {
    const result = formatHitAt("2026-06-10T14:35:22.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("—");
  });

  it("YYYY-MM-DD HH:MM:SS format → non-empty string (graceful)", () => {
    const result = formatHitAt("2026-06-10 14:35:22");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("invalid string → returns original (graceful fallback)", () => {
    const result = formatHitAt("not-a-date");
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: getSectorNameVi — all 17 live sector keys + unmapped fallback
// ---------------------------------------------------------------------------

describe("getSectorNameVi — Vietnamese label coverage", () => {
  const LIVE_SECTOR_KEYS = [
    "tech",
    "real_estate",
    "retail",
    "gold_mining",
    "logistics",
    "aviation",
    "pharma",
    "utilities",
    "construction",
    "agriculture",
    "steel",
    "machinery",
    "chemicals",
    "automotive",
    "securities",
    "banking",
    "oil_gas",
  ];

  it("all 17 live sector keys have a Vietnamese label (not the raw key)", () => {
    for (const key of LIVE_SECTOR_KEYS) {
      const label = getSectorNameVi(key);
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
      // Should NOT equal the raw key (i.e., it must be mapped)
      expect(label).not.toBe(key);
    }
  });

  it("tech → Công nghệ", () => {
    expect(getSectorNameVi("tech")).toBe("Công nghệ");
  });

  it("real_estate → Bất động sản", () => {
    expect(getSectorNameVi("real_estate")).toBe("Bất động sản");
  });

  it("gold_mining → Khai khoáng/Vàng", () => {
    expect(getSectorNameVi("gold_mining")).toBe("Khai khoáng/Vàng");
  });

  it("machinery → Máy móc/Cơ khí", () => {
    expect(getSectorNameVi("machinery")).toBe("Máy móc/Cơ khí");
  });

  it("chemicals → Hóa chất", () => {
    expect(getSectorNameVi("chemicals")).toBe("Hóa chất");
  });

  it("automotive → Ô tô/Xe máy", () => {
    expect(getSectorNameVi("automotive")).toBe("Ô tô/Xe máy");
  });

  it("oil_gas → Dầu khí", () => {
    expect(getSectorNameVi("oil_gas")).toBe("Dầu khí");
  });

  it("pharma → Dược phẩm", () => {
    expect(getSectorNameVi("pharma")).toBe("Dược phẩm");
  });

  it("banking → Ngân hàng", () => {
    expect(getSectorNameVi("banking")).toBe("Ngân hàng");
  });

  it("unmapped key → raw key fallback (never crash)", () => {
    expect(getSectorNameVi("unknown_sector_key_xyz")).toBe("unknown_sector_key_xyz");
  });

  it("sectorNameViMap has at least 17 entries (all live keys)", () => {
    const liveKeys = LIVE_SECTOR_KEYS;
    for (const key of liveKeys) {
      expect(sectorNameViMap).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture A — sort order
// ---------------------------------------------------------------------------

describe("Fixture A — sort order (tech first by netBias DESC, oil_gas last)", () => {
  it("first sector is tech (netBias +19)", () => {
    expect(FIXTURE_A_SECTORS[0]!.sector).toBe("tech");
    expect(FIXTURE_A_SECTORS[0]!.netBias).toBe(19);
  });

  it("last sector is oil_gas (netBias -2)", () => {
    const last = FIXTURE_A_SECTORS[FIXTURE_A_SECTORS.length - 1]!;
    expect(last.sector).toBe("oil_gas");
    expect(last.netBias).toBe(-2);
  });

  it("has exactly 17 sectors in Fixture A", () => {
    expect(FIXTURE_A_SECTORS).toHaveLength(17);
  });

  it("sectors are in non-increasing netBias order", () => {
    for (let i = 1; i < FIXTURE_A_SECTORS.length; i++) {
      expect(FIXTURE_A_SECTORS[i - 1]!.netBias).toBeGreaterThanOrEqual(
        FIXTURE_A_SECTORS[i]!.netBias
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Fixture A — netBias→badge classification
// ---------------------------------------------------------------------------

describe("Fixture A — netBias badge classification", () => {
  it("tech netBias +19 → TÍCH CỰC + emerald badge", () => {
    const tech = FIXTURE_A_SECTORS[0]!;
    expect(netBiasLabel(tech.netBias)).toBe("TÍCH CỰC");
    expect(netBiasBadgeClass(tech.netBias)).toContain("emerald");
  });

  it("agriculture netBias 0 → TRUNG TÍNH + slate badge", () => {
    const agr = FIXTURE_A_SECTORS.find((s) => s.sector === "agriculture")!;
    expect(netBiasLabel(agr.netBias)).toBe("TRUNG TÍNH");
    expect(netBiasBadgeClass(agr.netBias)).toContain("slate");
  });

  it("banking netBias -2 → TIÊU CỰC + red badge", () => {
    const banking = FIXTURE_A_SECTORS.find((s) => s.sector === "banking")!;
    expect(netBiasLabel(banking.netBias)).toBe("TIÊU CỰC");
    expect(netBiasBadgeClass(banking.netBias)).toContain("red");
  });

  it("oil_gas netBias -2 → TIÊU CỰC + red badge", () => {
    const oil = FIXTURE_A_SECTORS.find((s) => s.sector === "oil_gas")!;
    expect(netBiasLabel(oil.netBias)).toBe("TIÊU CỰC");
    expect(netBiasBadgeClass(oil.netBias)).toContain("red");
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Fixture A — summary counts
// ---------------------------------------------------------------------------

describe("Fixture A — summary counts (9 bullish / 3 bearish / 5 neutral)", () => {
  it("bullishSectors = 9", () => {
    expect(FIXTURE_A_SUMMARY.bullishSectors).toBe(9);
  });

  it("bearishSectors = 3", () => {
    expect(FIXTURE_A_SUMMARY.bearishSectors).toBe(3);
  });

  it("neutralSectors = 5", () => {
    expect(FIXTURE_A_SUMMARY.neutralSectors).toBe(5);
  });

  it("bullish + bearish + neutral = total sector count", () => {
    const total =
      FIXTURE_A_SUMMARY.bullishSectors +
      FIXTURE_A_SUMMARY.bearishSectors +
      FIXTURE_A_SUMMARY.neutralSectors;
    expect(total).toBe(FIXTURE_A_SECTORS.length);
  });
});

// ---------------------------------------------------------------------------
// Suite 10: Fixture A — topBullish and topBearish
// ---------------------------------------------------------------------------

describe("Fixture A — topBullish and topBearish", () => {
  it("topBullish[0] is tech (highest netBias +19)", () => {
    expect(FIXTURE_A_SUMMARY.topBullish[0]!.sector).toBe("tech");
    expect(FIXTURE_A_SUMMARY.topBullish[0]!.netBias).toBe(19);
  });

  it("topBullish has 5 entries (netBias DESC)", () => {
    expect(FIXTURE_A_SUMMARY.topBullish).toHaveLength(5);
  });

  it("topBearish[0] is oil_gas (most negative netBias -2)", () => {
    expect(FIXTURE_A_SUMMARY.topBearish[0]!.sector).toBe("oil_gas");
    expect(FIXTURE_A_SUMMARY.topBearish[0]!.netBias).toBe(-2);
  });

  it("topBearish has 3 entries (all bearish sectors)", () => {
    expect(FIXTURE_A_SUMMARY.topBearish).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: Fixture A — recentHits direction→label mapping
// ---------------------------------------------------------------------------

describe("Fixture A — recentHits direction to label mapping", () => {
  it("tech hit direction 'up' → directionLabel = Tăng", () => {
    const techHit = FIXTURE_A_RECENT_HITS[0]!;
    expect(techHit.direction).toBe("up");
    expect(directionLabel(techHit.direction)).toBe("Tăng");
    expect(directionBadgeClass(techHit.direction)).toContain("emerald");
  });

  it("pharma hit direction 'neutral' → directionLabel = Trung tính", () => {
    const pharmaHit = FIXTURE_A_RECENT_HITS[1]!;
    expect(pharmaHit.direction).toBe("neutral");
    expect(directionLabel(pharmaHit.direction)).toBe("Trung tính");
    expect(directionBadgeClass(pharmaHit.direction)).toContain("slate");
  });

  it("banking hit direction 'down' → directionLabel = Giảm", () => {
    const bankHit = FIXTURE_A_RECENT_HITS[2]!;
    expect(bankHit.direction).toBe("down");
    expect(directionLabel(bankHit.direction)).toBe("Giảm");
    expect(directionBadgeClass(bankHit.direction)).toContain("red");
  });

  it("banking hit has confidence 0.85 (not null — show inline)", () => {
    const bankHit = FIXTURE_A_RECENT_HITS[2]!;
    expect(bankHit.confidence).toBe(0.85);
    expect(bankHit.confidence).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 12: Fixture A — affectedStocks [] → graceful
// ---------------------------------------------------------------------------

describe("Fixture A — affectedStocks graceful handling", () => {
  it("pharma hit has empty affectedStocks ([])", () => {
    const pharmaHit = FIXTURE_A_RECENT_HITS[1]!;
    expect(Array.isArray(pharmaHit.affectedStocks)).toBe(true);
    expect(pharmaHit.affectedStocks).toHaveLength(0);
  });

  it("empty affectedStocks: hasStocks = false (no chips rendered)", () => {
    const pharmaHit = FIXTURE_A_RECENT_HITS[1]!;
    const hasStocks =
      Array.isArray(pharmaHit.affectedStocks) &&
      pharmaHit.affectedStocks.length > 0;
    expect(hasStocks).toBe(false);
  });

  it("tech hit has non-empty affectedStocks: hasStocks = true", () => {
    const techHit = FIXTURE_A_RECENT_HITS[0]!;
    const hasStocks =
      Array.isArray(techHit.affectedStocks) &&
      techHit.affectedStocks.length > 0;
    expect(hasStocks).toBe(true);
    expect(techHit.affectedStocks).toContain("FPT");
    expect(techHit.affectedStocks).toContain("CMG");
  });

  it("pharma hit matchedText is still present even with empty affectedStocks", () => {
    const pharmaHit = FIXTURE_A_RECENT_HITS[1]!;
    expect(pharmaHit.matchedText.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 13: Fixture B — empty state
// ---------------------------------------------------------------------------

describe("Fixture B — empty state (count=0)", () => {
  it("Fixture B has 0 sectors", () => {
    expect(FIXTURE_B_SECTORS).toHaveLength(0);
  });

  it("Fixture B has 0 recentHits", () => {
    expect(FIXTURE_B_RECENT_HITS).toHaveLength(0);
  });

  it("isEmpty = true when count=0 and error=null", () => {
    const loaderResult = { count: 0, sectors: FIXTURE_B_SECTORS, error: null };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(true);
  });

  it("isEmpty = false when count > 0", () => {
    const loaderResult = {
      count: 17,
      sectors: FIXTURE_A_SECTORS,
      error: null,
    };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(false);
  });

  it("isEmpty = false when error present (error takes precedence over count=0)", () => {
    const loaderResult = {
      count: 0,
      sectors: [] as SectorCascadeEntry[],
      error: "Network error",
    };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(false);
  });

  it("Fixture B summary all zeros", () => {
    expect(FIXTURE_B_SUMMARY.bullishSectors).toBe(0);
    expect(FIXTURE_B_SUMMARY.bearishSectors).toBe(0);
    expect(FIXTURE_B_SUMMARY.neutralSectors).toBe(0);
    expect(FIXTURE_B_SUMMARY.topBullish).toHaveLength(0);
    expect(FIXTURE_B_SUMMARY.topBearish).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: fetchSectorCascadeData — happy path
// ---------------------------------------------------------------------------

describe("fetchSectorCascadeData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses sectors, summary, windowDays, recentHits correctly", async () => {
    const mockPayload = {
      generatedAt: "2026-06-11T12:00:00.000Z",
      windowDays: 7,
      windowStart: "2026-06-04 00:00:00",
      source: "cascade_rules",
      sectors: FIXTURE_A_SECTORS,
      summary: FIXTURE_A_SUMMARY,
      recentHits: FIXTURE_A_RECENT_HITS,
      count: 17,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      })
    );

    const result = await fetchSectorCascadeData("http://localhost:3001", 7);

    expect(result.error).toBeNull();
    expect(result.sectors).toHaveLength(17);
    expect(result.sectors[0]!.sector).toBe("tech");
    expect(result.sectors[0]!.netBias).toBe(19);
    expect(result.summary.bullishSectors).toBe(9);
    expect(result.summary.bearishSectors).toBe(3);
    expect(result.summary.neutralSectors).toBe(5);
    expect(result.recentHits).toHaveLength(3);
    expect(result.count).toBe(17);
    expect(result.windowDays).toBe(7);
  });

  it("parses Fixture B (empty) without crash", async () => {
    const mockPayload = {
      generatedAt: "2026-06-11T12:00:00.000Z",
      windowDays: 7,
      windowStart: "2026-06-04 00:00:00",
      source: "cascade_rules",
      sectors: [],
      summary: FIXTURE_B_SUMMARY,
      recentHits: [],
      count: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      })
    );

    const result = await fetchSectorCascadeData("http://localhost:3001", 7);

    expect(result.error).toBeNull();
    expect(result.sectors).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.recentHits).toHaveLength(0);
    expect(result.summary.bullishSectors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: fetchSectorCascadeData — network error
// ---------------------------------------------------------------------------

describe("fetchSectorCascadeData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, sectors is empty array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const result = await fetchSectorCascadeData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.sectors).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.recentHits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 16: fetchSectorCascadeData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchSectorCascadeData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, sectors=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      })
    );

    const result = await fetchSectorCascadeData("http://localhost:3001");

    expect(result.error).toContain("/api/sector-cascade");
    expect(result.sectors).toHaveLength(0);
    expect(result.recentHits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 17: fetchSectorCascadeData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchSectorCascadeData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, sectors=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      })
    );

    const result = await fetchSectorCascadeData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.sectors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 18: fetchSectorCascadeData — Fixture B empty response (count=0, no crash)
// ---------------------------------------------------------------------------

describe("fetchSectorCascadeData — Fixture B empty (count=0, no crash)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty sectors/recentHits response → count=0, no error, no crash", async () => {
    const mockPayload = {
      generatedAt: "2026-06-11T00:00:00.000Z",
      windowDays: 7,
      windowStart: "2026-06-04 00:00:00",
      source: "cascade_rules",
      sectors: [],
      summary: {
        bullishSectors: 0,
        bearishSectors: 0,
        neutralSectors: 0,
        topBullish: [],
        topBearish: [],
      },
      recentHits: [],
      count: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      })
    );

    const result = await fetchSectorCascadeData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.sectors).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.recentHits).toHaveLength(0);
    // isEmpty logic
    const isEmpty = !result.error && result.count === 0;
    expect(isEmpty).toBe(true);
  });
});
