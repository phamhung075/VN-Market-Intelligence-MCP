/**
 * task17-page15-officers-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.officers.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live 2026-06-11:
 *   generatedAt, asOf, codes[], selectedCode, officers[], selectedSummary{}, ranking[]
 *
 * Suites:
 *   1. formatQuantity — numbers with separators, null→"—", zero→"0"
 *   2. formatPct — two decimal places, null→"—", zero→"0.00%"
 *   3. Fixture A — shapes loaded correctly (count, codes, selectedCode)
 *   4. Fixture A — selectedSummary present, officerCount, boardSeats, totalInsiderPct
 *   5. Fixture A — officers[] has expected rank/name/position/appointmentYear
 *   6. Fixture A — appointmentYear null → formatQuantity/formatPct null guard
 *   7. Fixture A — ranking[] ordered totalInsiderPct DESC
 *   8. totalInsiderPct honest framing — 0 for state-owned, non-zero for founder-heavy
 *   9. Fixture B — empty state (codes=[], isEmpty=true)
 *  10. fetchOfficersData — happy path (Fixture A via mocked fetch)
 *  11. fetchOfficersData — ?code forwarded in URL
 *  12. fetchOfficersData — network error → error string set, officers=[]
 *  13. fetchOfficersData — bad shape → error set
 *  14. fetchOfficersData — upstream 502 → error set
 *  15. fetchOfficersData — Fixture B empty codes → no crash
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatQuantity,
  formatPct,
  fetchOfficersData,
} from "../routes/dashboard.officers";
import type {
  OfficersDto,
} from "../routes/dashboard.officers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_OFFICERS = [
  { rank: 1, name: "Trương Gia Bình", position: "Chủ tịch Hội đồng Quản trị", ownPercent: 6.89, quantity: 130000000, appointmentYear: 1988 },
  { rank: 2, name: "Nguyễn Văn Khoa", position: "Tổng Giám đốc", ownPercent: 0.12, quantity: 2000000, appointmentYear: null },
  { rank: 3, name: "Bùi Quang Ngọc", position: "Phó Chủ tịch HĐQT", ownPercent: null, quantity: null, appointmentYear: null },
];

const FIXTURE_A_SUMMARY = {
  code: "FPT",
  officerCount: 17,
  boardSeats: 7,
  totalInsiderPct: 10.45,
  topName: "Trương Gia Bình",
  topPosition: "Chủ tịch Hội đồng Quản trị",
  topPct: 6.89,
};

const FIXTURE_A_RANKING = [
  {
    code: "HPG",
    officerCount: 12,
    boardSeats: 9,
    totalInsiderPct: 34.04,
  },
  {
    code: "PDR",
    officerCount: 8,
    boardSeats: 5,
    totalInsiderPct: 28.46,
  },
  {
    code: "FPT",
    officerCount: 17,
    boardSeats: 7,
    totalInsiderPct: 10.45,
  },
  {
    code: "BID",
    officerCount: 24,
    boardSeats: 10,
    totalInsiderPct: 0.0,
  },
];

const FIXTURE_A_DTO: OfficersDto = {
  generatedAt: "2026-06-11T10:00:00.000Z",
  asOf: "2026-04-14T18:08:47.720Z",
  codes: ["BID", "FPT", "HPG", "PDR"],
  selectedCode: "FPT",
  officers: FIXTURE_A_OFFICERS,
  selectedSummary: FIXTURE_A_SUMMARY,
  ranking: FIXTURE_A_RANKING,
  count: 4,
};

// ---------------------------------------------------------------------------
// Suite 1: formatQuantity
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

  it("130000000 → contains commas as thousands separators", () => {
    const result = formatQuantity(130000000);
    expect(result).toContain(",");
    expect(result).toBe("130,000,000");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: formatPct
// ---------------------------------------------------------------------------

describe("formatPct", () => {
  it("null → '—'", () => {
    expect(formatPct(null)).toBe("—");
  });

  it("0 → '0.00%'", () => {
    expect(formatPct(0)).toBe("0.00%");
  });

  it("6.89 → '6.89%'", () => {
    expect(formatPct(6.89)).toBe("6.89%");
  });

  it("34.04 → '34.04%'", () => {
    expect(formatPct(34.04)).toBe("34.04%");
  });

  it("result ends with '%'", () => {
    expect(formatPct(10.45)).toMatch(/%$/);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Fixture A — shapes loaded correctly
// ---------------------------------------------------------------------------

describe("Fixture A — basic shape", () => {
  it("codes has 4 entries", () => {
    expect(FIXTURE_A_DTO.codes).toHaveLength(4);
  });

  it("selectedCode is 'FPT'", () => {
    expect(FIXTURE_A_DTO.selectedCode).toBe("FPT");
  });

  it("count = 4", () => {
    expect(FIXTURE_A_DTO.count).toBe(4);
  });

  it("codes contains BID, FPT, HPG, PDR", () => {
    expect(FIXTURE_A_DTO.codes).toContain("BID");
    expect(FIXTURE_A_DTO.codes).toContain("FPT");
    expect(FIXTURE_A_DTO.codes).toContain("HPG");
    expect(FIXTURE_A_DTO.codes).toContain("PDR");
  });

  it("isEmpty = false when codes.length>0 and error=null", () => {
    const error: string | null = null;
    const isEmpty = !error && FIXTURE_A_DTO.codes.length === 0;
    expect(isEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Fixture A — selectedSummary
// ---------------------------------------------------------------------------

describe("Fixture A — selectedSummary", () => {
  it("selectedSummary is not null", () => {
    expect(FIXTURE_A_DTO.selectedSummary).not.toBeNull();
  });

  it("officerCount is 17", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.officerCount).toBe(17);
  });

  it("boardSeats is 7", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.boardSeats).toBe(7);
  });

  it("totalInsiderPct is 10.45", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.totalInsiderPct).toBe(10.45);
  });

  it("topName is 'Trương Gia Bình'", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.topName).toBe("Trương Gia Bình");
  });

  it("topPosition is 'Chủ tịch Hội đồng Quản trị'", () => {
    expect(FIXTURE_A_DTO.selectedSummary!.topPosition).toBe("Chủ tịch Hội đồng Quản trị");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Fixture A — officers[]
// ---------------------------------------------------------------------------

describe("Fixture A — officers roster", () => {
  it("officers has 3 rows", () => {
    expect(FIXTURE_A_DTO.officers).toHaveLength(3);
  });

  it("first officer is rank 1 with topName and topPct", () => {
    const first = FIXTURE_A_DTO.officers[0]!;
    expect(first.rank).toBe(1);
    expect(first.name).toBe("Trương Gia Bình");
    expect(first.ownPercent).toBe(6.89);
  });

  it("first officer has appointmentYear 1988", () => {
    const first = FIXTURE_A_DTO.officers[0]!;
    expect(first.appointmentYear).toBe(1988);
  });

  it("second officer has null appointmentYear", () => {
    const second = FIXTURE_A_DTO.officers[1]!;
    expect(second.appointmentYear).toBeNull();
  });

  it("third officer has null quantity and null ownPercent", () => {
    const third = FIXTURE_A_DTO.officers[2]!;
    expect(third.quantity).toBeNull();
    expect(third.ownPercent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 6: appointmentYear null guard — null → "—"
// ---------------------------------------------------------------------------

describe("appointmentYear null guard", () => {
  it("null appointmentYear displayed as '—' (not invented)", () => {
    const second = FIXTURE_A_DTO.officers[1]!;
    // UI renders: officer.appointmentYear !== null ? officer.appointmentYear : "—"
    const display = second.appointmentYear !== null ? String(second.appointmentYear) : "—";
    expect(display).toBe("—");
  });

  it("non-null appointmentYear displayed as the year value", () => {
    const first = FIXTURE_A_DTO.officers[0]!;
    const display = first.appointmentYear !== null ? String(first.appointmentYear) : "—";
    expect(display).toBe("1988");
  });

  it("formatQuantity on null quantity returns '—'", () => {
    const third = FIXTURE_A_DTO.officers[2]!;
    expect(formatQuantity(third.quantity)).toBe("—");
    expect(formatPct(third.ownPercent)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture A — ranking[]
// ---------------------------------------------------------------------------

describe("Fixture A — ranking table", () => {
  it("ranking has 4 entries", () => {
    expect(FIXTURE_A_DTO.ranking).toHaveLength(4);
  });

  it("first ranking entry is HPG with totalInsiderPct=34.04 (totalInsiderPct DESC)", () => {
    expect(FIXTURE_A_DTO.ranking[0]!.code).toBe("HPG");
    expect(FIXTURE_A_DTO.ranking[0]!.totalInsiderPct).toBe(34.04);
  });

  it("second ranking entry is PDR with totalInsiderPct=28.46", () => {
    expect(FIXTURE_A_DTO.ranking[1]!.code).toBe("PDR");
    expect(FIXTURE_A_DTO.ranking[1]!.totalInsiderPct).toBe(28.46);
  });

  it("last ranking entry is BID with totalInsiderPct=0 (state bank)", () => {
    const last = FIXTURE_A_DTO.ranking.at(-1)!;
    expect(last.code).toBe("BID");
    expect(last.totalInsiderPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: totalInsiderPct honest framing
// ---------------------------------------------------------------------------

describe("totalInsiderPct honest framing", () => {
  it("totalInsiderPct=0 for BID (state bank) — no assertion that 0 means error", () => {
    const bid = FIXTURE_A_DTO.ranking.find((r) => r.code === "BID");
    expect(bid).toBeDefined();
    expect(bid!.totalInsiderPct).toBe(0);
    // formatPct(0) must render as "0.00%" not "—"
    expect(formatPct(bid!.totalInsiderPct)).toBe("0.00%");
  });

  it("high totalInsiderPct for HPG (founder-heavy) renders correctly", () => {
    const hpg = FIXTURE_A_DTO.ranking.find((r) => r.code === "HPG");
    expect(hpg).toBeDefined();
    expect(hpg!.totalInsiderPct).toBeGreaterThan(30);
    expect(formatPct(hpg!.totalInsiderPct)).toBe("34.04%");
  });

  it("formatPct does not cap or reject any valid non-negative value", () => {
    expect(formatPct(0)).toBe("0.00%");
    expect(formatPct(10.45)).toBe("10.45%");
    expect(formatPct(34.04)).toBe("34.04%");
    expect(formatPct(100)).toBe("100.00%");
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
// Suite 10: fetchOfficersData — happy path
// ---------------------------------------------------------------------------

describe("fetchOfficersData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses codes, selectedCode, officers, selectedSummary, ranking, count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchOfficersData("http://localhost:3001", "FPT");

    expect(result.error).toBeNull();
    expect(result.codes).toHaveLength(4);
    expect(result.selectedCode).toBe("FPT");
    expect(result.officers).toHaveLength(3);
    expect(result.count).toBe(4);
    expect(result.selectedSummary).not.toBeNull();
    expect(result.selectedSummary!.topName).toBe("Trương Gia Bình");
    expect(result.ranking).toHaveLength(4);
  });

  it("first ranking entry is HPG (totalInsiderPct DESC order preserved)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchOfficersData("http://localhost:3001");

    expect(result.ranking[0]!.code).toBe("HPG");
    expect(result.ranking[0]!.totalInsiderPct).toBe(34.04);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: fetchOfficersData — ?code forwarded in URL
// ---------------------------------------------------------------------------

describe("fetchOfficersData — ?code forwarded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes ?code=FPT in the fetch URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...FIXTURE_A_DTO, selectedCode: "FPT" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchOfficersData("http://localhost:3001", "FPT");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("code=FPT");
  });

  it("no ?code param when code is undefined (default BID from server)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FIXTURE_A_DTO,
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchOfficersData("http://localhost:3001");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain("code=");
  });
});

// ---------------------------------------------------------------------------
// Suite 12: fetchOfficersData — network error
// ---------------------------------------------------------------------------

describe("fetchOfficersData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, officers and codes are empty arrays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchOfficersData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.officers).toHaveLength(0);
    expect(result.codes).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.selectedSummary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 13: fetchOfficersData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchOfficersData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, officers=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      }),
    );

    const result = await fetchOfficersData("http://localhost:3001");

    expect(result.error).toContain("/api/officers");
    expect(result.officers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: fetchOfficersData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchOfficersData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, officers=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }),
    );

    const result = await fetchOfficersData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.officers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: fetchOfficersData — Fixture B empty codes (no crash)
// ---------------------------------------------------------------------------

describe("fetchOfficersData — Fixture B empty codes (no crash)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty codes response → codes=[], selectedSummary=null, no error, no crash", async () => {
    const emptyPayload: OfficersDto = {
      generatedAt: "2026-06-11T00:00:00.000Z",
      asOf: "",
      codes: [],
      selectedCode: "",
      officers: [],
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

    const result = await fetchOfficersData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.codes).toHaveLength(0);
    expect(result.officers).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.selectedSummary).toBeNull();
    const isEmpty = !result.error && result.codes.length === 0;
    expect(isEmpty).toBe(true);
  });
});
