/**
 * task17-page17-fedrates-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.fed-rates.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live 2026-06-09:
 *   generatedAt, asOf, effr, iorb, spread, trend30d, sampleCount, series[]
 *
 * Suites:
 *   1. formatRate — 2dp %, null→"—"
 *   2. formatSpread — 2dp %, rounds float noise, null→"—"
 *   3. mapTrend30d — label mapping for all 4 values
 *   4. formatDate — ISO→DD/MM/YYYY
 *   5. Fixture A — shape loaded correctly
 *   6. Fixture A — summary values correct
 *   7. Fixture A — series reverse for display (most-recent first, no mutation)
 *   8. fetchFedRatesData — happy path (Fixture A via mocked fetch)
 *   9. fetchFedRatesData — no query param forwarded
 *  10. fetchFedRatesData — network error → error string set, series=[]
 *  11. fetchFedRatesData — bad shape → error set
 *  12. fetchFedRatesData — upstream 502 → error set
 *  13. fetchFedRatesData — empty state (sampleCount=0, series=[])
 *  14. spread rounding — float noise -0.0299999 rounds to -0.03
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatRate,
  formatSpread,
  mapTrend30d,
  formatDate,
  fetchFedRatesData,
} from "../routes/dashboard.fed-rates";
import type { FedRatesDto } from "../routes/dashboard.fed-rates";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_SERIES = [
  { date: "2025-12-15", effr: 3.64, iorb: 3.65, spread: -0.01 },
  { date: "2025-12-16", effr: 3.63, iorb: 3.65, spread: -0.02 },
  { date: "2026-06-08", effr: 3.62, iorb: 3.65, spread: -0.03 },
  { date: "2026-06-09", effr: 3.62, iorb: 3.65, spread: -0.03 },
];

const FIXTURE_A_DTO: FedRatesDto = {
  generatedAt: "2026-06-09T00:00:00.000Z",
  asOf: "2026-06-09",
  effr: 3.62,
  iorb: 3.65,
  spread: -0.03,
  trend30d: "stable",
  sampleCount: 122,
  series: FIXTURE_A_SERIES,
};

const FIXTURE_EMPTY_DTO: FedRatesDto = {
  generatedAt: "2026-06-09T00:00:00.000Z",
  asOf: null,
  effr: null,
  iorb: null,
  spread: null,
  trend30d: null,
  sampleCount: 0,
  series: [],
};

// ---------------------------------------------------------------------------
// Suite 1: formatRate
// ---------------------------------------------------------------------------

describe("formatRate", () => {
  it("null → '—'", () => {
    expect(formatRate(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatRate(undefined)).toBe("—");
  });

  it("3.62 → '3.62%'", () => {
    expect(formatRate(3.62)).toBe("3.62%");
  });

  it("3.65 → '3.65%'", () => {
    expect(formatRate(3.65)).toBe("3.65%");
  });

  it("result ends with '%'", () => {
    expect(formatRate(5.0)).toMatch(/%$/);
  });

  it("shows 2 decimal places always", () => {
    expect(formatRate(5)).toBe("5.00%");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: formatSpread
// ---------------------------------------------------------------------------

describe("formatSpread", () => {
  it("null → '—'", () => {
    expect(formatSpread(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatSpread(undefined)).toBe("—");
  });

  it("-0.03 → '-0.03%'", () => {
    expect(formatSpread(-0.03)).toBe("-0.03%");
  });

  it("0 → '0.00%'", () => {
    expect(formatSpread(0)).toBe("0.00%");
  });

  it("rounds float noise -0.0299999 → '-0.03%'", () => {
    expect(formatSpread(-0.0299999)).toBe("-0.03%");
  });

  it("rounds float noise 0.0300001 → '0.03%'", () => {
    expect(formatSpread(0.0300001)).toBe("0.03%");
  });

  it("result ends with '%'", () => {
    expect(formatSpread(-0.01)).toMatch(/%$/);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: mapTrend30d
// ---------------------------------------------------------------------------

describe("mapTrend30d", () => {
  it("'widening' → 'Đang nới rộng'", () => {
    expect(mapTrend30d("widening")).toBe("Đang nới rộng");
  });

  it("'narrowing' → 'Đang thu hẹp'", () => {
    expect(mapTrend30d("narrowing")).toBe("Đang thu hẹp");
  });

  it("'stable' → 'Ổn định'", () => {
    expect(mapTrend30d("stable")).toBe("Ổn định");
  });

  it("null → '—'", () => {
    expect(mapTrend30d(null)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it("ISO date formats to DD/MM/YYYY", () => {
    expect(formatDate("2026-06-09T00:00:00.000Z")).toBe("09/06/2026");
  });

  it("date-only string formats correctly", () => {
    // "2025-12-15" → new Date parses as UTC midnight → 15/12/2025
    const result = formatDate("2025-12-15");
    // Accept either 14 or 15 depending on UTC offset — just assert format
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("empty string returns empty string", () => {
    expect(formatDate("")).toBe("");
  });

  it("returns original string for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Fixture A — shape
// ---------------------------------------------------------------------------

describe("Fixture A — basic shape", () => {
  it("sampleCount is 122", () => {
    expect(FIXTURE_A_DTO.sampleCount).toBe(122);
  });

  it("series has 4 entries in fixture", () => {
    expect(FIXTURE_A_DTO.series).toHaveLength(4);
  });

  it("effr is 3.62", () => {
    expect(FIXTURE_A_DTO.effr).toBe(3.62);
  });

  it("iorb is 3.65", () => {
    expect(FIXTURE_A_DTO.iorb).toBe(3.65);
  });

  it("spread is -0.03", () => {
    expect(FIXTURE_A_DTO.spread).toBe(-0.03);
  });

  it("trend30d is 'stable'", () => {
    expect(FIXTURE_A_DTO.trend30d).toBe("stable");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Fixture A — summary values formatted
// ---------------------------------------------------------------------------

describe("Fixture A — summary formatted values", () => {
  it("formatRate(effr) = '3.62%'", () => {
    expect(formatRate(FIXTURE_A_DTO.effr)).toBe("3.62%");
  });

  it("formatRate(iorb) = '3.65%'", () => {
    expect(formatRate(FIXTURE_A_DTO.iorb)).toBe("3.65%");
  });

  it("formatSpread(spread) = '-0.03%'", () => {
    expect(formatSpread(FIXTURE_A_DTO.spread)).toBe("-0.03%");
  });

  it("mapTrend30d(trend30d) = 'Ổn định'", () => {
    expect(mapTrend30d(FIXTURE_A_DTO.trend30d)).toBe("Ổn định");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: series reverse-for-display
// ---------------------------------------------------------------------------

describe("series reverse-for-display", () => {
  it("[...series].reverse() gives most-recent date first", () => {
    const reversed = [...FIXTURE_A_DTO.series].reverse();
    expect(reversed[0]!.date).toBe("2026-06-09");
    expect(reversed[reversed.length - 1]!.date).toBe("2025-12-15");
  });

  it("original series is NOT mutated by spread+reverse", () => {
    const original = [...FIXTURE_A_DTO.series];
    const reversed = [...FIXTURE_A_DTO.series].reverse();
    // Original first element unchanged
    expect(FIXTURE_A_DTO.series[0]!.date).toBe(original[0]!.date);
    expect(reversed[0]!.date).toBe("2026-06-09");
    expect(FIXTURE_A_DTO.series[0]!.date).toBe("2025-12-15");
  });

  it("reversed length equals original length", () => {
    const reversed = [...FIXTURE_A_DTO.series].reverse();
    expect(reversed).toHaveLength(FIXTURE_A_DTO.series.length);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: fetchFedRatesData — happy path
// ---------------------------------------------------------------------------

describe("fetchFedRatesData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses effr, iorb, spread, trend30d, sampleCount, series — no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchFedRatesData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.effr).toBe(3.62);
    expect(result.iorb).toBe(3.65);
    expect(result.spread).toBe(-0.03);
    expect(result.trend30d).toBe("stable");
    expect(result.sampleCount).toBe(122);
    expect(result.series).toHaveLength(4);
    expect(result.series[0]!.date).toBe("2025-12-15");
  });
});

// ---------------------------------------------------------------------------
// Suite 9: fetchFedRatesData — no query param forwarded
// ---------------------------------------------------------------------------

describe("fetchFedRatesData — no query param forwarded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch URL contains '/api/fed-rates' with no query string", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FIXTURE_A_DTO,
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchFedRatesData("http://localhost:3001");

    const calledUrl: string = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/api/fed-rates");
    expect(calledUrl).not.toContain("?");
  });
});

// ---------------------------------------------------------------------------
// Suite 10: fetchFedRatesData — network error
// ---------------------------------------------------------------------------

describe("fetchFedRatesData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, series=[], sampleCount=0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchFedRatesData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.series).toHaveLength(0);
    expect(result.sampleCount).toBe(0);
    expect(result.effr).toBeNull();
    expect(result.iorb).toBeNull();
    expect(result.spread).toBeNull();
    expect(result.trend30d).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 11: fetchFedRatesData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchFedRatesData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, series=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      }),
    );

    const result = await fetchFedRatesData("http://localhost:3001");

    expect(result.error).toContain("/api/fed-rates");
    expect(result.series).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 12: fetchFedRatesData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchFedRatesData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, series=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }),
    );

    const result = await fetchFedRatesData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.series).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 13: fetchFedRatesData — empty state
// ---------------------------------------------------------------------------

describe("fetchFedRatesData — empty state (sampleCount=0)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty response → sampleCount=0, series=[], no error, no crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_EMPTY_DTO,
      }),
    );

    const result = await fetchFedRatesData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.sampleCount).toBe(0);
    expect(result.series).toHaveLength(0);
    expect(result.effr).toBeNull();
    expect(result.iorb).toBeNull();
    expect(result.spread).toBeNull();
    expect(result.trend30d).toBeNull();
    const isEmpty = !result.error && result.sampleCount === 0;
    expect(isEmpty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: spread rounding — float noise
// ---------------------------------------------------------------------------

describe("spread rounding — float noise elimination", () => {
  it("-0.0299999... formats as '-0.03%'", () => {
    // Simulate the float noise the live endpoint may carry
    const noisy = -0.029999999999999805;
    expect(formatSpread(noisy)).toBe("-0.03%");
  });

  it("0.0299999... formats as '0.03%'", () => {
    const noisy = 0.029999999999999805;
    expect(formatSpread(noisy)).toBe("0.03%");
  });

  it("-0.01 formats as '-0.01%' (no noise case)", () => {
    expect(formatSpread(-0.01)).toBe("-0.01%");
  });
});
