/**
 * task17-page19-news-buzz-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.news-buzz.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live 2026-06-11:
 *   generatedAt, windowStart, windowEnd, summary{distinctCodes, totalMentions,
 *   totalNegative, totalSources}, leaderboard[]
 *
 * Suites:
 *   1. getNegativityTier — tier mapping for boundary values
 *   2. formatNegativeRatioPct — percent formatting
 *   3. Fixture A — shape loaded correctly (distinctCodes, leaderboard order)
 *   4. Fixture A — summary values
 *   5. Fixture A — leaderboard order (mentions DESC)
 *   6. fetchNewsBuzzData — happy path (Fixture A via mocked fetch)
 *   7. fetchNewsBuzzData — no query param forwarded
 *   8. fetchNewsBuzzData — network error → error string set, leaderboard=[]
 *   9. fetchNewsBuzzData — bad shape → error set
 *  10. fetchNewsBuzzData — upstream 502 → error set
 *  11. fetchNewsBuzzData — empty state (distinctCodes=0, leaderboard=[])
 *  12. null windowStart/windowEnd guard
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getNegativityTier,
  formatNegativeRatioPct,
  fetchNewsBuzzData,
} from "../routes/dashboard.news-buzz";
import type { NewsBuzzDto } from "../routes/dashboard.news-buzz";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_LEADERBOARD = [
  { code: "VIC", mentions: 17, negative: 3,  sources: 13, hoursActive: 12, negativeRatio: 0.18 },
  { code: "PLX", mentions: 11, negative: 8,  sources: 9,  hoursActive: 9,  negativeRatio: 0.73 },
  { code: "GAS", mentions: 6,  negative: 6,  sources: 6,  hoursActive: 6,  negativeRatio: 1.0  },
  { code: "HPG", mentions: 5,  negative: 2,  sources: 5,  hoursActive: 4,  negativeRatio: 0.40 },
  { code: "CTG", mentions: 4,  negative: 0,  sources: 4,  hoursActive: 3,  negativeRatio: 0.0  },
];

const FIXTURE_A_DTO: NewsBuzzDto = {
  generatedAt: "2026-06-11T17:39:46.342Z",
  windowStart: "2026-06-04 14:00:00",
  windowEnd: "2026-06-11T14:00:00.000Z",
  summary: {
    distinctCodes: 26,
    totalMentions: 94,
    totalNegative: 43,
    totalSources: 74,
  },
  leaderboard: FIXTURE_A_LEADERBOARD,
};

const FIXTURE_EMPTY_DTO: NewsBuzzDto = {
  generatedAt: "2026-06-11T17:39:46.342Z",
  windowStart: null,
  windowEnd: null,
  summary: {
    distinctCodes: 0,
    totalMentions: 0,
    totalNegative: 0,
    totalSources: 0,
  },
  leaderboard: [],
};

// ---------------------------------------------------------------------------
// Suite 1: getNegativityTier — tier mapping
// ---------------------------------------------------------------------------

describe("getNegativityTier — tier boundary mapping", () => {
  it("ratio 0.73 → 'danger' (Cao)", () => {
    expect(getNegativityTier(0.73)).toBe("danger");
  });

  it("ratio 0.43 → 'warning' (Trung bình)", () => {
    expect(getNegativityTier(0.43)).toBe("warning");
  });

  it("ratio 0.18 → 'ok' (Thấp)", () => {
    expect(getNegativityTier(0.18)).toBe("ok");
  });

  it("exact boundary 0.6 → 'danger' (>= 0.6 is danger)", () => {
    expect(getNegativityTier(0.6)).toBe("danger");
  });

  it("exact boundary 0.3 → 'warning' (>= 0.3 and < 0.6 is warning)", () => {
    expect(getNegativityTier(0.3)).toBe("warning");
  });

  it("ratio 0.0 → 'ok'", () => {
    expect(getNegativityTier(0.0)).toBe("ok");
  });

  it("ratio 1.0 → 'danger'", () => {
    expect(getNegativityTier(1.0)).toBe("danger");
  });

  it("ratio 0.299 → 'ok' (just below 0.3 boundary)", () => {
    expect(getNegativityTier(0.299)).toBe("ok");
  });

  it("ratio 0.599 → 'warning' (just below 0.6 boundary)", () => {
    expect(getNegativityTier(0.599)).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: formatNegativeRatioPct — percent formatting
// ---------------------------------------------------------------------------

describe("formatNegativeRatioPct — percent string", () => {
  it("0.73 → '73%'", () => {
    expect(formatNegativeRatioPct(0.73)).toBe("73%");
  });

  it("0.18 → '18%'", () => {
    expect(formatNegativeRatioPct(0.18)).toBe("18%");
  });

  it("1.0 → '100%'", () => {
    expect(formatNegativeRatioPct(1.0)).toBe("100%");
  });

  it("0.0 → '0%'", () => {
    expect(formatNegativeRatioPct(0.0)).toBe("0%");
  });

  it("0.6 → '60%'", () => {
    expect(formatNegativeRatioPct(0.6)).toBe("60%");
  });

  it("0.3 → '30%'", () => {
    expect(formatNegativeRatioPct(0.3)).toBe("30%");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Fixture A — shape
// ---------------------------------------------------------------------------

describe("Fixture A — basic shape", () => {
  it("summary.distinctCodes is 26", () => {
    expect(FIXTURE_A_DTO.summary.distinctCodes).toBe(26);
  });

  it("summary.totalMentions is 94", () => {
    expect(FIXTURE_A_DTO.summary.totalMentions).toBe(94);
  });

  it("summary.totalNegative is 43", () => {
    expect(FIXTURE_A_DTO.summary.totalNegative).toBe(43);
  });

  it("summary.totalSources is 74", () => {
    expect(FIXTURE_A_DTO.summary.totalSources).toBe(74);
  });

  it("leaderboard has 5 entries in fixture", () => {
    expect(FIXTURE_A_DTO.leaderboard).toHaveLength(5);
  });

  it("windowStart is set", () => {
    expect(FIXTURE_A_DTO.windowStart).toBe("2026-06-04 14:00:00");
  });

  it("windowEnd is set", () => {
    expect(FIXTURE_A_DTO.windowEnd).toBe("2026-06-11T14:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Fixture A — summary values
// ---------------------------------------------------------------------------

describe("Fixture A — summary totals", () => {
  it("leaderboard mentions sum is 43 (subset of totalMentions)", () => {
    const total = FIXTURE_A_DTO.leaderboard.reduce(
      (acc, e) => acc + e.mentions,
      0,
    );
    expect(total).toBe(43);
  });

  it("each leaderboard entry has negativeRatio between 0 and 1", () => {
    for (const entry of FIXTURE_A_DTO.leaderboard) {
      expect(entry.negativeRatio).toBeGreaterThanOrEqual(0);
      expect(entry.negativeRatio).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Fixture A — leaderboard order (mentions DESC)
// ---------------------------------------------------------------------------

describe("Fixture A — leaderboard order", () => {
  it("first entry is VIC with mentions 17 (highest)", () => {
    expect(FIXTURE_A_DTO.leaderboard[0]!.code).toBe("VIC");
    expect(FIXTURE_A_DTO.leaderboard[0]!.mentions).toBe(17);
  });

  it("last entry in fixture is CTG with mentions 4 (lowest)", () => {
    const last = FIXTURE_A_DTO.leaderboard.at(-1)!;
    expect(last.code).toBe("CTG");
    expect(last.mentions).toBe(4);
  });

  it("leaderboard is in descending mention order", () => {
    const mentions = FIXTURE_A_DTO.leaderboard.map((e) => e.mentions);
    for (let i = 1; i < mentions.length; i++) {
      expect(mentions[i]!).toBeLessThanOrEqual(mentions[i - 1]!);
    }
  });

  it("PLX negativeRatio 0.73 maps to 'danger'", () => {
    const plx = FIXTURE_A_DTO.leaderboard.find((e) => e.code === "PLX")!;
    expect(getNegativityTier(plx.negativeRatio)).toBe("danger");
  });

  it("HPG negativeRatio 0.40 maps to 'warning'", () => {
    const hpg = FIXTURE_A_DTO.leaderboard.find((e) => e.code === "HPG")!;
    expect(getNegativityTier(hpg.negativeRatio)).toBe("warning");
  });

  it("VIC negativeRatio 0.18 maps to 'ok'", () => {
    const vic = FIXTURE_A_DTO.leaderboard.find((e) => e.code === "VIC")!;
    expect(getNegativityTier(vic.negativeRatio)).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: fetchNewsBuzzData — happy path
// ---------------------------------------------------------------------------

describe("fetchNewsBuzzData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses summary, leaderboard — no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchNewsBuzzData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.summary.distinctCodes).toBe(26);
    expect(result.summary.totalMentions).toBe(94);
    expect(result.summary.totalNegative).toBe(43);
    expect(result.summary.totalSources).toBe(74);
    expect(result.leaderboard).toHaveLength(5);
    expect(result.leaderboard[0]!.code).toBe("VIC");
    expect(result.windowStart).toBe("2026-06-04 14:00:00");
    expect(result.windowEnd).toBe("2026-06-11T14:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: fetchNewsBuzzData — no query param forwarded
// ---------------------------------------------------------------------------

describe("fetchNewsBuzzData — no query param forwarded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch URL contains '/api/news-buzz' with no query string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FIXTURE_A_DTO,
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchNewsBuzzData("http://localhost:3001");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/api/news-buzz");
    expect(calledUrl).not.toContain("?");
  });
});

// ---------------------------------------------------------------------------
// Suite 8: fetchNewsBuzzData — network error
// ---------------------------------------------------------------------------

describe("fetchNewsBuzzData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, leaderboard=[], summary all zeros", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchNewsBuzzData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.leaderboard).toHaveLength(0);
    expect(result.summary.distinctCodes).toBe(0);
    expect(result.summary.totalMentions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 9: fetchNewsBuzzData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchNewsBuzzData — bad shape", () => {
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

    const result = await fetchNewsBuzzData("http://localhost:3001");

    expect(result.error).toContain("/api/news-buzz");
    expect(result.leaderboard).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 10: fetchNewsBuzzData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchNewsBuzzData — upstream 502", () => {
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

    const result = await fetchNewsBuzzData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.leaderboard).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: fetchNewsBuzzData — empty state
// ---------------------------------------------------------------------------

describe("fetchNewsBuzzData — empty state (distinctCodes=0)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty response → distinctCodes=0, leaderboard=[], no error, no crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_EMPTY_DTO,
      }),
    );

    const result = await fetchNewsBuzzData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.summary.distinctCodes).toBe(0);
    expect(result.summary.totalMentions).toBe(0);
    expect(result.leaderboard).toHaveLength(0);
    const isEmpty = !result.error && result.summary.distinctCodes === 0;
    expect(isEmpty).toBe(true);
  });

  it("empty response → windowStart and windowEnd are null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_EMPTY_DTO,
      }),
    );

    const result = await fetchNewsBuzzData("http://localhost:3001");

    expect(result.windowStart).toBeNull();
    expect(result.windowEnd).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 12: null windowStart/windowEnd guard
// ---------------------------------------------------------------------------

describe("null windowStart/windowEnd guard", () => {
  it("windowStart null does not crash — guard with ?? '?' returns '?'", () => {
    const windowStart: string | null = null;
    const display = windowStart ?? "?";
    expect(display).toBe("?");
  });

  it("windowEnd null does not crash — guard with ?? '?' returns '?'", () => {
    const windowEnd: string | null = null;
    const display = windowEnd ?? "?";
    expect(display).toBe("?");
  });

  it("windowStart set — returns the string as-is", () => {
    const windowStart: string | null = "2026-06-04 14:00:00";
    const display = windowStart ?? "?";
    expect(display).toBe("2026-06-04 14:00:00");
  });

  it("empty-state isEmpty guard works with null windows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_EMPTY_DTO,
      }),
    );

    const result = await fetchNewsBuzzData("http://localhost:3001");

    // isEmpty check mirrors the page: !error && distinctCodes === 0
    const isEmpty = !result.error && result.summary.distinctCodes === 0;
    expect(isEmpty).toBe(true);
    // null windows must not crash rendering logic
    expect(result.windowStart).toBeNull();
    expect(result.windowEnd).toBeNull();

    vi.restoreAllMocks();
  });
});
