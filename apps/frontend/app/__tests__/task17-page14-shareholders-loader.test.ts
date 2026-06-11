/**
 * task17-page14-shareholders-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.shareholders.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live 2026-06-11:
 *   generatedAt, asOf, codes[], selectedCode, holders[], selectedSummary{}, ranking[]
 *
 * Suites:
 *   1. concentrationColorClass — high=red, medium=amber, low=emerald, unknown=slate
 *   2. formatQuantity — numbers with separators, null→"—", zero→"0"
 *   3. formatPct — two decimal places, null→"—", zero→"0.00%"
 *   4. Fixture A — shapes loaded correctly (count, codes, selectedCode)
 *   5. Fixture A — selectedSummary present, top1Name, concentration
 *   6. Fixture A — holders[] has expected rank/name/quantity/ownPercent
 *   7. Fixture A — ranking[] ordered top1Pct DESC, concentrationLabel present
 *   8. disclosedPct honest framing — can exceed 100
 *   9. Fixture B — empty state (codes=[], isEmpty=true)
 *  10. fetchShareholdersData — happy path (Fixture A via mocked fetch)
 *  11. fetchShareholdersData — ?code forwarded in URL
 *  12. fetchShareholdersData — network error → error string set, holders=[]
 *  13. fetchShareholdersData — bad shape → error set
 *  14. fetchShareholdersData — upstream 502 → error set
 *  15. fetchShareholdersData — Fixture B empty codes → no crash
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  concentrationColorClass,
  formatQuantity,
  formatPct,
  fetchShareholdersData,
} from "../routes/dashboard.shareholders";
import type {
  ShareholdersDto,
} from "../routes/dashboard.shareholders";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_HOLDERS = [
  { rank: 1, name: "Ngân Hàng Nhà Nước Việt Nam", quantity: 28975736590, ownPercent: 79.56 },
  { rank: 2, name: "Vietcombank Fund Management", quantity: 500000000, ownPercent: 1.37 },
  { rank: 3, name: "Cổ đông khác", quantity: null, ownPercent: null },
];

const FIXTURE_A_SUMMARY = {
  code: "BID",
  holderCount: 77,
  top1Name: "Ngân Hàng Nhà Nước Việt Nam",
  top1Pct: 79.56,
  top5Pct: 82.31,
  disclosedPct: 83.12,
  concentration: "high" as const,
  concentrationLabel: "Tập trung cao",
};

const FIXTURE_A_RANKING = [
  {
    code: "BSR",
    holderCount: 5,
    top1Pct: 92.13,
    top5Pct: 98.0,
    disclosedPct: 99.5,
    concentration: "high" as const,
    concentrationLabel: "Tập trung cao",
  },
  {
    code: "BID",
    holderCount: 77,
    top1Pct: 79.56,
    top5Pct: 82.31,
    disclosedPct: 83.12,
    concentration: "high" as const,
    concentrationLabel: "Tập trung cao",
  },
  {
    code: "FPT",
    holderCount: 86,
    top1Pct: 6.89,
    top5Pct: 23.25,
    disclosedPct: 56.29,
    concentration: "low" as const,
    concentrationLabel: "Phân tán",
  },
];

const FIXTURE_A_DTO: ShareholdersDto = {
  generatedAt: "2026-06-11T10:00:00.000Z",
  asOf: "2026-04-14T18:08:47.720Z",
  codes: ["BID", "BSR", "FPT"],
  selectedCode: "BID",
  holders: FIXTURE_A_HOLDERS,
  selectedSummary: FIXTURE_A_SUMMARY,
  ranking: FIXTURE_A_RANKING,
  count: 3,
};

// ---------------------------------------------------------------------------
// Suite 1: concentrationColorClass
// ---------------------------------------------------------------------------

describe("concentrationColorClass", () => {
  it("'high' → contains red", () => {
    expect(concentrationColorClass("high")).toContain("red");
  });

  it("'medium' → contains amber", () => {
    expect(concentrationColorClass("medium")).toContain("amber");
  });

  it("'low' → contains emerald", () => {
    expect(concentrationColorClass("low")).toContain("emerald");
  });

  it("unknown value → contains slate (fallback)", () => {
    expect(concentrationColorClass("unknown")).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: formatQuantity
// ---------------------------------------------------------------------------

describe("formatQuantity", () => {
  it("null → '—'", () => {
    expect(formatQuantity(null)).toBe("—");
  });

  it("0 → '0'", () => {
    expect(formatQuantity(0)).toBe("0");
  });

  it("1000 → '1,000'", () => {
    expect(formatQuantity(1000)).toBe("1,000");
  });

  it("28975736590 → contains commas as thousands separators", () => {
    const result = formatQuantity(28975736590);
    expect(result).toContain(",");
    expect(result).toBe("28,975,736,590");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: formatPct
// ---------------------------------------------------------------------------

describe("formatPct", () => {
  it("null → '—'", () => {
    expect(formatPct(null)).toBe("—");
  });

  it("0 → '0.00%'", () => {
    expect(formatPct(0)).toBe("0.00%");
  });

  it("79.56 → '79.56%'", () => {
    expect(formatPct(79.56)).toBe("79.56%");
  });

  it("6.89 → '6.89%'", () => {
    expect(formatPct(6.89)).toBe("6.89%");
  });

  it("result ends with '%'", () => {
    expect(formatPct(50)).toMatch(/%$/);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Fixture A — shapes loaded correctly
// ---------------------------------------------------------------------------

describe("Fixture A — basic shape", () => {
  it("codes has 3 entries", () => {
    expect(FIXTURE_A_DTO.codes).toHaveLength(3);
  });

  it("selectedCode is 'BID'", () => {
    expect(FIXTURE_A_DTO.selectedCode).toBe("BID");
  });

  it("count = 3", () => {
    expect(FIXTURE_A_DTO.count).toBe(3);
  });

  it("codes contains BID, BSR, FPT", () => {
    expect(FIXTURE_A_DTO.codes).toContain("BID");
    expect(FIXTURE_A_DTO.codes).toContain("BSR");
    expect(FIXTURE_A_DTO.codes).toContain("FPT");
  });

  it("isEmpty = false when codes.length>0 and error=null", () => {
    const error: string | null = null;
    const isEmpty = !error && FIXTURE_A_DTO.codes.length === 0;
    expect(isEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Fixture A — selectedSummary
// ---------------------------------------------------------------------------

describe("Fixture A — selectedSummary", () => {
  it("selectedSummary is not null", () => {
    expect(FIXTURE_A_DTO.selectedSummary).not.toBeNull();
  });

  it("top1Name is 'Ngân Hàng Nhà Nước Việt Nam'", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.top1Name).toBe("Ngân Hàng Nhà Nước Việt Nam");
  });

  it("top1Pct is 79.56", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.top1Pct).toBe(79.56);
  });

  it("concentration is 'high'", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.concentration).toBe("high");
  });

  it("concentrationLabel is 'Tập trung cao'", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.concentrationLabel).toBe("Tập trung cao");
  });

  it("holderCount is 77", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.holderCount).toBe(77);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Fixture A — holders[]
// ---------------------------------------------------------------------------

describe("Fixture A — holders roster", () => {
  it("holders has 3 rows", () => {
    expect(FIXTURE_A_DTO.holders).toHaveLength(3);
  });

  it("first holder is rank 1 with top1Name and top1Pct", () => {
    const first = FIXTURE_A_DTO.holders[0]!;
    expect(first.rank).toBe(1);
    expect(first.name).toBe("Ngân Hàng Nhà Nước Việt Nam");
    expect(first.ownPercent).toBe(79.56);
  });

  it("third holder has null quantity and null ownPercent", () => {
    const third = FIXTURE_A_DTO.holders[2]!;
    expect(third.quantity).toBeNull();
    expect(third.ownPercent).toBeNull();
  });

  it("formatQuantity on null holder returns '—'", () => {
    const third = FIXTURE_A_DTO.holders[2]!;
    expect(formatQuantity(third.quantity)).toBe("—");
    expect(formatPct(third.ownPercent)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture A — ranking[]
// ---------------------------------------------------------------------------

describe("Fixture A — ranking table", () => {
  it("ranking has 3 entries", () => {
    expect(FIXTURE_A_DTO.ranking).toHaveLength(3);
  });

  it("first ranking entry is BSR with top1Pct=92.13 (top1Pct DESC)", () => {
    expect(FIXTURE_A_DTO.ranking[0]!.code).toBe("BSR");
    expect(FIXTURE_A_DTO.ranking[0]!.top1Pct).toBe(92.13);
  });

  it("last ranking entry is FPT with concentration 'low'", () => {
    const last = FIXTURE_A_DTO.ranking.at(-1)!;
    expect(last.code).toBe("FPT");
    expect(last.concentration).toBe("low");
    expect(last.concentrationLabel).toBe("Phân tán");
  });

  it("all ranking entries have concentrationLabel non-empty", () => {
    for (const r of FIXTURE_A_DTO.ranking) {
      expect(r.concentrationLabel.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 8: disclosedPct honest framing
// ---------------------------------------------------------------------------

describe("disclosedPct honest framing", () => {
  it("disclosedPct can legitimately exceed 100 (no assertion that it must be <=100)", () => {
    // This fixture has disclosedPct=99.5 for BSR. The system must not cap or reject it.
    const bsr = FIXTURE_A_DTO.ranking.find((r) => r.code === "BSR");
    expect(bsr).toBeDefined();
    expect(bsr!.disclosedPct).toBeGreaterThan(0);
    // Verify formatPct does not cap values above 100
    expect(formatPct(110.5)).toBe("110.50%");
  });

  it("formatPct(disclosedPct) renders raw value without capping", () => {
    expect(formatPct(105.0)).toBe("105.00%");
    expect(formatPct(83.12)).toBe("83.12%");
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Fixture B — empty state
// ---------------------------------------------------------------------------

describe("Fixture B — empty state (codes=[], isEmpty=true)", () => {
  it("isEmpty = true when codes=[] and error=null", () => {
    const error: string | null = null;
    const codes: string[] = [];
    const isEmpty = !error && codes.length === 0;
    expect(isEmpty).toBe(true);
  });

  it("isEmpty = false when error is set (even with codes=[])", () => {
    const error: string | null = "Connection refused";
    const codes: string[] = [];
    const isEmpty = !error && codes.length === 0;
    expect(isEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 10: fetchShareholdersData — happy path
// ---------------------------------------------------------------------------

describe("fetchShareholdersData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses codes, selectedCode, holders, selectedSummary, ranking, count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchShareholdersData("http://localhost:3001", "BID");

    expect(result.error).toBeNull();
    expect(result.codes).toHaveLength(3);
    expect(result.selectedCode).toBe("BID");
    expect(result.holders).toHaveLength(3);
    expect(result.count).toBe(3);
    expect(result.selectedSummary).not.toBeNull();
    expect(result.selectedSummary!.top1Name).toBe("Ngân Hàng Nhà Nước Việt Nam");
    expect(result.ranking).toHaveLength(3);
  });

  it("first ranking entry is BSR (top1Pct DESC order preserved)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchShareholdersData("http://localhost:3001");

    expect(result.ranking[0]!.code).toBe("BSR");
    expect(result.ranking[0]!.top1Pct).toBe(92.13);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: fetchShareholdersData — ?code forwarded in URL
// ---------------------------------------------------------------------------

describe("fetchShareholdersData — ?code forwarded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes ?code=FPT in the fetch URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...FIXTURE_A_DTO, selectedCode: "FPT" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchShareholdersData("http://localhost:3001", "FPT");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("code=FPT");
  });

  it("no ?code param when code is undefined (default BID from server)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FIXTURE_A_DTO,
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchShareholdersData("http://localhost:3001");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain("code=");
  });
});

// ---------------------------------------------------------------------------
// Suite 12: fetchShareholdersData — network error
// ---------------------------------------------------------------------------

describe("fetchShareholdersData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, holders and codes are empty arrays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchShareholdersData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.holders).toHaveLength(0);
    expect(result.codes).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.selectedSummary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 13: fetchShareholdersData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchShareholdersData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, holders=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      }),
    );

    const result = await fetchShareholdersData("http://localhost:3001");

    expect(result.error).toContain("/api/shareholders");
    expect(result.holders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: fetchShareholdersData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchShareholdersData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, holders=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }),
    );

    const result = await fetchShareholdersData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.holders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: fetchShareholdersData — Fixture B empty codes (no crash)
// ---------------------------------------------------------------------------

describe("fetchShareholdersData — Fixture B empty codes (no crash)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty codes response → codes=[], selectedSummary=null, no error, no crash", async () => {
    const emptyPayload: ShareholdersDto = {
      generatedAt: "2026-06-11T00:00:00.000Z",
      asOf: "",
      codes: [],
      selectedCode: "",
      holders: [],
      selectedSummary: null,
      ranking: [],
      count: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyPayload,
      }),
    );

    const result = await fetchShareholdersData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.codes).toHaveLength(0);
    expect(result.holders).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.selectedSummary).toBeNull();
    const isEmpty = !result.error && result.codes.length === 0;
    expect(isEmpty).toBe(true);
  });
});
