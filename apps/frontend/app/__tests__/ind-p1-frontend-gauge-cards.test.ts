/**
 * ind-p1-frontend-gauge-cards.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.indicator-gauges.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Tests the 6 P0 indicator gauge scalars surface:
 *   1. Volatility  — rv_20d_percentile + vol_regime
 *   2. Sentiment   — news_sentiment_z + history_quality
 *   3. Breadth     — breadth_z_score.value + history_quality
 *   4. ForeignRoom — foreign_outflow_z_5d + market_saturation_pct
 *   5. Liquidity   — omo_net_outstanding_bn_vnd + policy_refi_rate_pct
 *
 * Sprint: MARKET-INDICATOR-DEPTH-P0
 * Task:   IND-P1-FRONTEND-GAUGE-CARDS
 *
 * Suites:
 *   1.  parseIndicatorGaugesDto — null raw → all-null gauge sections
 *   2.  parseIndicatorGaugesDto — valid full DTO passes through
 *   3.  parseIndicatorGaugesDto — partial DTO (sections null) passes through
 *   4.  parseIndicatorGaugesDto — invalid non-object → null sections
 *   5.  formatVolatilityRegime — all regime values + null
 *   6.  formatHistoryQuality — SUFFICIENT / INSUFFICIENT / WARMUP / EMPTY / null
 *   7.  formatZScore — positive, negative, zero, null
 *   8.  formatOmoBn — positive/negative/null
 *   9.  fetchIndicatorGauges — happy path (mocked fetch)
 *  10.  fetchIndicatorGauges — upstream 502 → all-null gauges + error set
 *  11.  fetchIndicatorGauges — network failure → all-null gauges + error set
 *  12.  fetchIndicatorGauges — null sections in response → honest-NULL forwarded
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseIndicatorGaugesDto,
  formatVolatilityRegime,
  formatHistoryQuality,
  formatZScore,
  formatOmoBn,
  fetchIndicatorGauges,
} from "~/routes/dashboard.indicator-gauges";
import type { IndicatorGaugesDto } from "~/routes/dashboard.indicator-gauges";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENERATED_AT = "2026-06-30T08:00:00Z";

const VOLATILITY_GAUGE = {
  rv_20d_percentile: 0.62,
  rv_20d_pct: 14.3,
  vol_regime: "ELEVATED",
  vol_regime_pct: 0.62,
  asof: "2026-06-29",
  null_reason: null,
  source_tier: 3,
};

const SENTIMENT_GAUGE = {
  news_sentiment_z: 1.45,
  history_quality: "SUFFICIENT" as const,
  sentiment_ema_5d: 0.12,
  bull_ratio_5d: 0.55,
  bear_ratio_5d: 0.25,
  asof: "2026-06-29",
  null_reason: null,
  source_tier: 3,
};

const BREADTH_Z_SCORE = {
  value: -0.83,
  unit: "sigma",
  asof: "2026-06-29",
  confidence: 1.0,
  null_reason: null,
};

const BREADTH_GAUGE = {
  breadth_z_score: BREADTH_Z_SCORE,
  mclellan_osc: -22.5,
  history_quality: "SUFFICIENT" as const,
  asof: "2026-06-29",
  source_tier: 2,
};

const FOREIGN_ROOM_GAUGE = {
  market_saturation_pct: 38.4,
  foreign_outflow_z_5d: 1.92,
  as_of_date: "2026-06-29",
  null_reason: null,
  source_tier: 2,
};

const LIQUIDITY_GAUGE = {
  omo_net_outstanding_bn_vnd: 12500,
  policy_refi_rate_pct: 4.5,
  fetched_at: "2026-06-30T07:00:00Z",
  null_reason: null,
  source_tier: 3,
};

const FULL_DTO: IndicatorGaugesDto = {
  generated_at: GENERATED_AT,
  volatility: VOLATILITY_GAUGE,
  sentiment: SENTIMENT_GAUGE,
  breadth: BREADTH_GAUGE,
  foreign_room: FOREIGN_ROOM_GAUGE,
  liquidity: LIQUIDITY_GAUGE,
};

const ALL_NULL_DTO: IndicatorGaugesDto = {
  generated_at: GENERATED_AT,
  volatility: null,
  sentiment: null,
  breadth: null,
  foreign_room: null,
  liquidity: null,
};

// ---------------------------------------------------------------------------
// Suite 1 — parseIndicatorGaugesDto: null raw → all-null gauge sections
// ---------------------------------------------------------------------------

describe("parseIndicatorGaugesDto — null raw → honest-NULL state", () => {
  it("returns non-null object with all gauge sections null", () => {
    const result = parseIndicatorGaugesDto(null);
    expect(result).not.toBeNull();
    expect(result.volatility).toBeNull();
    expect(result.sentiment).toBeNull();
    expect(result.breadth).toBeNull();
    expect(result.foreign_room).toBeNull();
    expect(result.liquidity).toBeNull();
  });

  it("generated_at is a non-empty string on null raw", () => {
    const result = parseIndicatorGaugesDto(null);
    expect(typeof result.generated_at).toBe("string");
    expect(result.generated_at.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — parseIndicatorGaugesDto: valid full DTO passes through
// ---------------------------------------------------------------------------

describe("parseIndicatorGaugesDto — full valid DTO", () => {
  it("passes through generated_at", () => {
    const result = parseIndicatorGaugesDto(FULL_DTO);
    expect(result.generated_at).toBe(GENERATED_AT);
  });

  it("passes through volatility section", () => {
    const result = parseIndicatorGaugesDto(FULL_DTO);
    expect(result.volatility).not.toBeNull();
    expect(result.volatility!.rv_20d_percentile).toBe(0.62);
    expect(result.volatility!.vol_regime).toBe("ELEVATED");
  });

  it("passes through sentiment section", () => {
    const result = parseIndicatorGaugesDto(FULL_DTO);
    expect(result.sentiment).not.toBeNull();
    expect(result.sentiment!.news_sentiment_z).toBe(1.45);
    expect(result.sentiment!.history_quality).toBe("SUFFICIENT");
  });

  it("passes through breadth section with nested z-score", () => {
    const result = parseIndicatorGaugesDto(FULL_DTO);
    expect(result.breadth).not.toBeNull();
    expect(result.breadth!.breadth_z_score.value).toBe(-0.83);
    expect(result.breadth!.history_quality).toBe("SUFFICIENT");
  });

  it("passes through foreign_room section", () => {
    const result = parseIndicatorGaugesDto(FULL_DTO);
    expect(result.foreign_room).not.toBeNull();
    expect(result.foreign_room!.foreign_outflow_z_5d).toBe(1.92);
    expect(result.foreign_room!.market_saturation_pct).toBe(38.4);
  });

  it("passes through liquidity section", () => {
    const result = parseIndicatorGaugesDto(FULL_DTO);
    expect(result.liquidity).not.toBeNull();
    expect(result.liquidity!.omo_net_outstanding_bn_vnd).toBe(12500);
    expect(result.liquidity!.policy_refi_rate_pct).toBe(4.5);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — parseIndicatorGaugesDto: partial DTO (some sections null)
// ---------------------------------------------------------------------------

describe("parseIndicatorGaugesDto — partial DTO (honest-NULL sections)", () => {
  it("null volatility section remains null", () => {
    const dto: IndicatorGaugesDto = { ...FULL_DTO, volatility: null };
    const result = parseIndicatorGaugesDto(dto);
    expect(result.volatility).toBeNull();
  });

  it("null breadth section remains null — honest-NULL for fresh table", () => {
    const dto: IndicatorGaugesDto = { ...FULL_DTO, breadth: null };
    const result = parseIndicatorGaugesDto(dto);
    expect(result.breadth).toBeNull();
  });

  it("null sentiment section remains null", () => {
    const dto: IndicatorGaugesDto = { ...FULL_DTO, sentiment: null };
    const result = parseIndicatorGaugesDto(dto);
    expect(result.sentiment).toBeNull();
  });

  it("null sections coexist with populated ones", () => {
    const dto: IndicatorGaugesDto = {
      ...ALL_NULL_DTO,
      liquidity: LIQUIDITY_GAUGE,
    };
    const result = parseIndicatorGaugesDto(dto);
    expect(result.volatility).toBeNull();
    expect(result.liquidity).not.toBeNull();
    expect(result.liquidity!.policy_refi_rate_pct).toBe(4.5);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — parseIndicatorGaugesDto: invalid non-object → null sections
// ---------------------------------------------------------------------------

describe("parseIndicatorGaugesDto — invalid/unexpected shapes → graceful fallback", () => {
  it("string raw → all-null sections, no throw", () => {
    expect(() => {
      const result = parseIndicatorGaugesDto("not-an-object");
      expect(result.volatility).toBeNull();
    }).not.toThrow();
  });

  it("array raw → all-null sections, no throw", () => {
    expect(() => {
      const result = parseIndicatorGaugesDto([1, 2, 3]);
      expect(result.volatility).toBeNull();
    }).not.toThrow();
  });

  it("object without expected keys → all-null sections, no throw", () => {
    expect(() => {
      const result = parseIndicatorGaugesDto({ message: "error" });
      expect(result.volatility).toBeNull();
      expect(result.breadth).toBeNull();
    }).not.toThrow();
  });

  it("error payload {error: '...'} → all-null sections, no throw", () => {
    expect(() => {
      const result = parseIndicatorGaugesDto({ error: "upstream unavailable" });
      expect(result.volatility).toBeNull();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — formatVolatilityRegime
// ---------------------------------------------------------------------------

describe("formatVolatilityRegime — regime labels and colors", () => {
  it("LOW → green", () => {
    const { color } = formatVolatilityRegime("LOW");
    expect(color).toBe("green");
  });

  it("NORMAL → amber", () => {
    const { color } = formatVolatilityRegime("NORMAL");
    expect(color).toBe("amber");
  });

  it("ELEVATED → red", () => {
    const { color } = formatVolatilityRegime("ELEVATED");
    expect(color).toBe("red");
  });

  it("CRISIS → red", () => {
    const { color } = formatVolatilityRegime("CRISIS");
    expect(color).toBe("red");
  });

  it("null → gray", () => {
    const { color } = formatVolatilityRegime(null);
    expect(color).toBe("gray");
  });

  it("LOW → Vietnamese label", () => {
    const { label } = formatVolatilityRegime("LOW");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  it("unknown regime string → gray fallback", () => {
    const { color } = formatVolatilityRegime("UNKNOWN");
    expect(color).toBe("gray");
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — formatHistoryQuality
// ---------------------------------------------------------------------------

describe("formatHistoryQuality — quality labels and colors", () => {
  it("SUFFICIENT → green", () => {
    const { color } = formatHistoryQuality("SUFFICIENT");
    expect(color).toBe("green");
  });

  it("INSUFFICIENT → amber", () => {
    const { color } = formatHistoryQuality("INSUFFICIENT");
    expect(color).toBe("amber");
  });

  it("WARMUP → amber", () => {
    const { color } = formatHistoryQuality("WARMUP");
    expect(color).toBe("amber");
  });

  it("EMPTY → gray", () => {
    const { color } = formatHistoryQuality("EMPTY");
    expect(color).toBe("gray");
  });

  it("null → gray", () => {
    const { color } = formatHistoryQuality(null);
    expect(color).toBe("gray");
  });

  it("each quality returns a non-empty label string", () => {
    for (const q of ["SUFFICIENT", "INSUFFICIENT", "WARMUP", "EMPTY", null]) {
      const { label } = formatHistoryQuality(q);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — formatZScore
// ---------------------------------------------------------------------------

describe("formatZScore — z-score display", () => {
  it("null → em dash '—'", () => {
    expect(formatZScore(null)).toBe("—");
  });

  it("positive z → '+N.NN σ'", () => {
    const result = formatZScore(1.45);
    expect(result).toContain("+");
    expect(result).toContain("σ");
  });

  it("negative z → '−N.NN σ' or '-N.NN σ'", () => {
    const result = formatZScore(-0.83);
    expect(result).toContain("σ");
    // Must start with minus sign
    expect(result).toMatch(/^[−-]/);
  });

  it("zero → '0.00 σ'", () => {
    const result = formatZScore(0);
    expect(result).toContain("σ");
  });

  it("formats to 2 decimal places", () => {
    const result = formatZScore(1.456789);
    // Should have 2 decimal places
    const match = result.match(/\d+\.\d+/);
    expect(match).toBeTruthy();
    expect(match![0].split(".")[1]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — formatOmoBn
// ---------------------------------------------------------------------------

describe("formatOmoBn — OMO outstanding format", () => {
  it("null → em dash '—'", () => {
    expect(formatOmoBn(null)).toBe("—");
  });

  it("positive → contains number", () => {
    const result = formatOmoBn(12500);
    expect(result).toContain("12");
  });

  it("zero → contains '0'", () => {
    const result = formatOmoBn(0);
    expect(result).toContain("0");
  });

  it("negative → contains negative indicator or number", () => {
    const result = formatOmoBn(-5000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — fetchIndicatorGauges: happy path (mocked fetch)
// ---------------------------------------------------------------------------

describe("fetchIndicatorGauges — happy path", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns parsed dto sections when upstream returns 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(FULL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchIndicatorGauges("http://localhost:3001");
    expect(result.error).toBeNull();
    expect(result.volatility).not.toBeNull();
    expect(result.volatility!.vol_regime).toBe("ELEVATED");
    expect(result.sentiment).not.toBeNull();
    expect(result.breadth).not.toBeNull();
    expect(result.foreign_room).not.toBeNull();
    expect(result.liquidity).not.toBeNull();
  });

  it("calls the correct endpoint URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(ALL_NULL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await fetchIndicatorGauges("http://localhost:3001");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/indicator-gauges"),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — fetchIndicatorGauges: upstream 502 → all-null + error
// ---------------------------------------------------------------------------

describe("fetchIndicatorGauges — upstream error (non-fatal)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("502 → error string set, all gauges null, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Bad Gateway" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchIndicatorGauges("http://localhost:3001");
    expect(result.error).not.toBeNull();
    expect(result.volatility).toBeNull();
    expect(result.sentiment).toBeNull();
    expect(result.breadth).toBeNull();
    expect(result.foreign_room).toBeNull();
    expect(result.liquidity).toBeNull();
  });

  it("404 (backend not yet deployed) → error set, honest-NULL, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    const result = await fetchIndicatorGauges("http://localhost:3001");
    expect(result.error).not.toBeNull();
    expect(result.volatility).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 11 — fetchIndicatorGauges: network failure → all-null + error
// ---------------------------------------------------------------------------

describe("fetchIndicatorGauges — network failure (non-fatal)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("ECONNREFUSED → error string, all gauges null, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );
    const result = await fetchIndicatorGauges("http://localhost:3001");
    expect(result.error).toBe("ECONNREFUSED");
    expect(result.volatility).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 12 — fetchIndicatorGauges: null sections in response → honest-NULL forwarded
// ---------------------------------------------------------------------------

describe("fetchIndicatorGauges — honest-NULL forwarding", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("breadth:null in response → result.breadth is null (breadth table accruing)", async () => {
    const dtoNoBreadth: IndicatorGaugesDto = { ...FULL_DTO, breadth: null };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(dtoNoBreadth), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchIndicatorGauges("http://localhost:3001");
    expect(result.error).toBeNull();
    expect(result.breadth).toBeNull();
    // other sections still present
    expect(result.volatility).not.toBeNull();
  });

  it("liquidity.omo_net_outstanding_bn_vnd:null → liquidity section present but omo field null", async () => {
    const dtoNullOmo: IndicatorGaugesDto = {
      ...FULL_DTO,
      liquidity: { ...LIQUIDITY_GAUGE, omo_net_outstanding_bn_vnd: null },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(dtoNullOmo), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchIndicatorGauges("http://localhost:3001");
    expect(result.liquidity).not.toBeNull();
    expect(result.liquidity!.omo_net_outstanding_bn_vnd).toBeNull();
  });
});
