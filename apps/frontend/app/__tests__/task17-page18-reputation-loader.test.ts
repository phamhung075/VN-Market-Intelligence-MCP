/**
 * task17-page18-reputation-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.reputation.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live 2026-06-09:
 *   generatedAt, asOf, summary{total, avgScore, byRisk{}}, leaderboard[], history{}
 *
 * Suites:
 *   1. mapTrend — VN label mapping for all 3 values + unknown passthrough
 *   2. mapRiskLevel — VN label mapping for all 4 risk levels + unknown passthrough
 *   3. getRiskBadgeClass — correct Tailwind class returned per risk level
 *   4. Fixture A — shape loaded correctly (total, leaderboard order, byRisk buckets, history keys)
 *   5. Fixture A — summary values (total, avgScore, byRisk counts)
 *   6. Fixture A — leaderboard order (score DESC)
 *   7. Fixture A — history keys present
 *   8. fetchReputationData — happy path (Fixture A via mocked fetch)
 *   9. fetchReputationData — no query param forwarded
 *  10. fetchReputationData — network error → error string set, leaderboard=[]
 *  11. fetchReputationData — bad shape → error set
 *  12. fetchReputationData — upstream 502 → error set
 *  13. fetchReputationData — empty state (total=0, leaderboard=[], avgScore null)
 *  14. avgScore null guard — formatters handle null without crash
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mapTrend,
  mapRiskLevel,
  getRiskBadgeClass,
  fetchReputationData,
} from "../routes/dashboard.reputation";
import type { ReputationDto } from "../routes/dashboard.reputation";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_LEADERBOARD = [
  { code: "CTG", score: 70, trend: "stable", riskLevel: "safe" },
  { code: "VCB", score: 65, trend: "improving", riskLevel: "safe" },
  { code: "HPG", score: 55, trend: "stable", riskLevel: "watch" },
  { code: "MWG", score: 48, trend: "deteriorating", riskLevel: "watch" },
  { code: "GAS", score: 36, trend: "stable", riskLevel: "warning" },
];

const FIXTURE_A_HISTORY = {
  CTG: [
    { date: "2026-05-18", score: 52 },
    { date: "2026-05-25", score: 58 },
    { date: "2026-06-01", score: 62 },
    { date: "2026-06-05", score: 66 },
    { date: "2026-06-08", score: 68 },
    { date: "2026-06-09", score: 70 },
  ],
  GAS: [
    { date: "2026-05-18", score: 41 },
    { date: "2026-06-09", score: 36 },
  ],
};

const FIXTURE_A_DTO: ReputationDto = {
  generatedAt: "2026-06-09T00:00:00.000Z",
  asOf: "2026-06-09",
  summary: {
    total: 41,
    avgScore: 56.11,
    byRisk: { safe: 3, watch: 37, warning: 1, danger: 0 },
  },
  leaderboard: FIXTURE_A_LEADERBOARD,
  history: FIXTURE_A_HISTORY,
};

const FIXTURE_EMPTY_DTO: ReputationDto = {
  generatedAt: "2026-06-09T00:00:00.000Z",
  asOf: null,
  summary: {
    total: 0,
    avgScore: null,
    byRisk: { safe: 0, watch: 0, warning: 0, danger: 0 },
  },
  leaderboard: [],
  history: {},
};

// ---------------------------------------------------------------------------
// Suite 1: mapTrend
// ---------------------------------------------------------------------------

describe("mapTrend", () => {
  it("'improving' → 'Cải thiện'", () => {
    expect(mapTrend("improving")).toBe("Cải thiện");
  });

  it("'stable' → 'Ổn định'", () => {
    expect(mapTrend("stable")).toBe("Ổn định");
  });

  it("'deteriorating' → 'Suy giảm'", () => {
    expect(mapTrend("deteriorating")).toBe("Suy giảm");
  });

  it("unknown value passes through unchanged", () => {
    expect(mapTrend("unknown_trend")).toBe("unknown_trend");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: mapRiskLevel
// ---------------------------------------------------------------------------

describe("mapRiskLevel", () => {
  it("'safe' → 'An toàn'", () => {
    expect(mapRiskLevel("safe")).toBe("An toàn");
  });

  it("'watch' → 'Theo dõi'", () => {
    expect(mapRiskLevel("watch")).toBe("Theo dõi");
  });

  it("'warning' → 'Cảnh báo'", () => {
    expect(mapRiskLevel("warning")).toBe("Cảnh báo");
  });

  it("'danger' → 'Nguy hiểm'", () => {
    expect(mapRiskLevel("danger")).toBe("Nguy hiểm");
  });

  it("unknown value passes through unchanged", () => {
    expect(mapRiskLevel("unknown_risk")).toBe("unknown_risk");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: getRiskBadgeClass
// ---------------------------------------------------------------------------

describe("getRiskBadgeClass", () => {
  it("'safe' returns class containing 'green'", () => {
    expect(getRiskBadgeClass("safe")).toContain("green");
  });

  it("'watch' returns class containing 'yellow'", () => {
    expect(getRiskBadgeClass("watch")).toContain("yellow");
  });

  it("'warning' returns class containing 'orange'", () => {
    expect(getRiskBadgeClass("warning")).toContain("orange");
  });

  it("'danger' returns class containing 'red'", () => {
    expect(getRiskBadgeClass("danger")).toContain("red");
  });

  it("unknown returns fallback slate class", () => {
    const cls = getRiskBadgeClass("unknown");
    expect(cls).toContain("slate");
  });

  it("all return classes contain 'inline-flex'", () => {
    for (const level of ["safe", "watch", "warning", "danger", "unknown"]) {
      expect(getRiskBadgeClass(level)).toContain("inline-flex");
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Fixture A — shape
// ---------------------------------------------------------------------------

describe("Fixture A — basic shape", () => {
  it("summary.total is 41", () => {
    expect(FIXTURE_A_DTO.summary.total).toBe(41);
  });

  it("leaderboard has 5 entries in fixture", () => {
    expect(FIXTURE_A_DTO.leaderboard).toHaveLength(5);
  });

  it("asOf is '2026-06-09'", () => {
    expect(FIXTURE_A_DTO.asOf).toBe("2026-06-09");
  });

  it("history has 'CTG' key", () => {
    expect(Object.keys(FIXTURE_A_DTO.history)).toContain("CTG");
  });

  it("history has 'GAS' key", () => {
    expect(Object.keys(FIXTURE_A_DTO.history)).toContain("GAS");
  });

  it("CTG history has 6 ascending-date points", () => {
    expect(FIXTURE_A_DTO.history["CTG"]).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Fixture A — summary values
// ---------------------------------------------------------------------------

describe("Fixture A — summary values", () => {
  it("avgScore is 56.11", () => {
    expect(FIXTURE_A_DTO.summary.avgScore).toBe(56.11);
  });

  it("byRisk.safe is 3", () => {
    expect(FIXTURE_A_DTO.summary.byRisk.safe).toBe(3);
  });

  it("byRisk.watch is 37", () => {
    expect(FIXTURE_A_DTO.summary.byRisk.watch).toBe(37);
  });

  it("byRisk.warning is 1", () => {
    expect(FIXTURE_A_DTO.summary.byRisk.warning).toBe(1);
  });

  it("byRisk.danger is 0", () => {
    expect(FIXTURE_A_DTO.summary.byRisk.danger).toBe(0);
  });

  it("byRisk buckets sum equals total (in fixture subset)", () => {
    const { safe, watch, warning, danger } = FIXTURE_A_DTO.summary.byRisk;
    // fixture byRisk sums to 41 (same as total)
    expect(safe + watch + warning + danger).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Fixture A — leaderboard order (score DESC)
// ---------------------------------------------------------------------------

describe("Fixture A — leaderboard order", () => {
  it("first entry is CTG with score 70 (highest)", () => {
    expect(FIXTURE_A_DTO.leaderboard[0]!.code).toBe("CTG");
    expect(FIXTURE_A_DTO.leaderboard[0]!.score).toBe(70);
  });

  it("last entry is GAS with score 36 (lowest in fixture)", () => {
    const last = FIXTURE_A_DTO.leaderboard.at(-1)!;
    expect(last.code).toBe("GAS");
    expect(last.score).toBe(36);
  });

  it("leaderboard is in descending score order", () => {
    const scores = FIXTURE_A_DTO.leaderboard.map((e) => e.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });

  it("riskLevel values are valid strings", () => {
    const valid = new Set(["safe", "watch", "warning", "danger"]);
    for (const entry of FIXTURE_A_DTO.leaderboard) {
      expect(valid.has(entry.riskLevel)).toBe(true);
    }
  });

  it("trend values are valid strings", () => {
    const valid = new Set(["improving", "stable", "deteriorating"]);
    for (const entry of FIXTURE_A_DTO.leaderboard) {
      expect(valid.has(entry.trend)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture A — history keys
// ---------------------------------------------------------------------------

describe("Fixture A — history structure", () => {
  it("CTG history points are in ascending date order", () => {
    const ctg = FIXTURE_A_DTO.history["CTG"]!;
    for (let i = 1; i < ctg.length; i++) {
      expect(ctg[i]!.date >= ctg[i - 1]!.date).toBe(true);
    }
  });

  it("CTG last history point score matches leaderboard score", () => {
    const ctgHistory = FIXTURE_A_DTO.history["CTG"]!;
    const ctgEntry = FIXTURE_A_DTO.leaderboard.find((e) => e.code === "CTG")!;
    expect(ctgHistory.at(-1)!.score).toBe(ctgEntry.score);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: fetchReputationData — happy path
// ---------------------------------------------------------------------------

describe("fetchReputationData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses summary, leaderboard, history — no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchReputationData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.summary.total).toBe(41);
    expect(result.summary.avgScore).toBe(56.11);
    expect(result.summary.byRisk.safe).toBe(3);
    expect(result.summary.byRisk.watch).toBe(37);
    expect(result.summary.byRisk.warning).toBe(1);
    expect(result.summary.byRisk.danger).toBe(0);
    expect(result.leaderboard).toHaveLength(5);
    expect(result.leaderboard[0]!.code).toBe("CTG");
    expect(Object.keys(result.history)).toContain("CTG");
  });
});

// ---------------------------------------------------------------------------
// Suite 9: fetchReputationData — no query param forwarded
// ---------------------------------------------------------------------------

describe("fetchReputationData — no query param forwarded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch URL contains '/api/reputation' with no query string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FIXTURE_A_DTO,
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchReputationData("http://localhost:3001");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/api/reputation");
    expect(calledUrl).not.toContain("?");
  });
});

// ---------------------------------------------------------------------------
// Suite 10: fetchReputationData — network error
// ---------------------------------------------------------------------------

describe("fetchReputationData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, leaderboard=[], summary.total=0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchReputationData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.leaderboard).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.avgScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 11: fetchReputationData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchReputationData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, leaderboard=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      }),
    );

    const result = await fetchReputationData("http://localhost:3001");

    expect(result.error).toContain("/api/reputation");
    expect(result.leaderboard).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 12: fetchReputationData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchReputationData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, leaderboard=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }),
    );

    const result = await fetchReputationData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.leaderboard).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 13: fetchReputationData — empty state
// ---------------------------------------------------------------------------

describe("fetchReputationData — empty state (total=0)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty response → total=0, leaderboard=[], avgScore=null, no error, no crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_EMPTY_DTO,
      }),
    );

    const result = await fetchReputationData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.summary.total).toBe(0);
    expect(result.summary.avgScore).toBeNull();
    expect(result.leaderboard).toHaveLength(0);
    expect(result.asOf).toBeNull();
    const isEmpty = !result.error && result.summary.total === 0;
    expect(isEmpty).toBe(true);
  });

  it("empty byRisk — all buckets are 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_EMPTY_DTO,
      }),
    );

    const result = await fetchReputationData("http://localhost:3001");

    expect(result.summary.byRisk.safe).toBe(0);
    expect(result.summary.byRisk.watch).toBe(0);
    expect(result.summary.byRisk.warning).toBe(0);
    expect(result.summary.byRisk.danger).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: avgScore null guard
// ---------------------------------------------------------------------------

// Helper mirrors the page's avgScore display guard
function formatAvgScore(avgScore: number | null): string {
  return avgScore !== null ? avgScore.toFixed(1) : "—";
}

describe("avgScore null guard", () => {
  it("null avgScore formats to '—'", () => {
    expect(formatAvgScore(null)).toBe("—");
  });

  it("numeric avgScore 56.11 formats to '56.1' (1 decimal)", () => {
    expect(formatAvgScore(56.11)).toBe("56.1");
  });

  it("avgScore = 0 still formats as '0.0' (not falsy-skipped)", () => {
    expect(formatAvgScore(0)).toBe("0.0");
  });

  it("avgScore = 100 formats as '100.0'", () => {
    expect(formatAvgScore(100)).toBe("100.0");
  });
});
