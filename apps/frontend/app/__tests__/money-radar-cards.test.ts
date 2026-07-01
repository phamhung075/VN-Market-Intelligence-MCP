/**
 * money-radar-cards.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.money-radar.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 * Mirrors app/__tests__/ind-p1-momentum-cards.test.ts (MONEY-RADAR-P0-T3-DASHBOARD).
 *
 * Tests the 4 Money Radar P0 gauge scalars surface:
 *   1. score                              — composite money-flow score
 *   2. components.foreign_accum_z_market  — foreign accumulation z-score
 *   3. components.rel_vol_z_20            — domestic relative-volume z-score
 *   4. divergence.flag                    — D1-D4 divergence engine
 *
 * Sprint: MONEY-RADAR-P0
 * Task:   MONEY-RADAR-P0-T3-DASHBOARD
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseMoneyRadarCompositeDto,
  formatScalar2,
  formatCompositeScoreBadge,
  formatForeignAccumBadge,
  formatRelVolBadge,
  formatDivergenceBadge,
  formatDivergenceScalar,
  fetchMoneyRadarComposite,
} from "~/routes/dashboard.money-radar";
import type { MoneyRadarCompositeDto } from "~/routes/dashboard.money-radar";

// ---------------------------------------------------------------------------
// Fixtures — modeled on the live sample from the brief (2026-07-01)
// ---------------------------------------------------------------------------

const GENERATED_AT = "2026-07-01T08:00:00Z";

const LIVE_SAMPLE_DTO: MoneyRadarCompositeDto = {
  score: -0.02,
  delta_5d: null,
  divergence: { flag: "AMBER", severity: 1, detectors: ["D4"] },
  coverage_pct: 0.769,
  source_tier: 2,
  is_estimate: false,
  null_reason: null,
  components: {
    foreign_net_direction: null,
    foreign_accum_z_market: -6.0e-18,
    foreign_outflow_z_5d: null,
    obv_slope: 0.081,
    rel_vol_z_20: -0.928,
    up_down_vol_ratio: null,
    degraded_vwap_proxy_z: null,
    carry_regime: null,
    credit_flow_direction: null,
    volatility_regime: null,
  },
  generated_at: GENERATED_AT,
};

const ALL_NULL_DTO: MoneyRadarCompositeDto = {
  score: null,
  delta_5d: null,
  divergence: { flag: "UNKNOWN", severity: 0, detectors: [], null_reason: "insufficient coverage" },
  coverage_pct: 0,
  source_tier: null,
  is_estimate: false,
  null_reason: "coverage_pct < 0.5",
  components: {
    foreign_net_direction: null,
    foreign_accum_z_market: null,
    foreign_outflow_z_5d: null,
    obv_slope: null,
    rel_vol_z_20: null,
    up_down_vol_ratio: null,
    degraded_vwap_proxy_z: null,
    carry_regime: null,
    credit_flow_direction: null,
    volatility_regime: null,
  },
  generated_at: GENERATED_AT,
};

// ---------------------------------------------------------------------------
// Suite 1 — parseMoneyRadarCompositeDto: null raw → honest-NULL state
// ---------------------------------------------------------------------------

describe("parseMoneyRadarCompositeDto — null raw → honest-NULL state", () => {
  it("returns non-null object with score/divergence null-equivalent", () => {
    const result = parseMoneyRadarCompositeDto(null);
    expect(result).not.toBeNull();
    expect(result.score).toBeNull();
    expect(result.delta_5d).toBeNull();
    expect(result.divergence.flag).toBe("UNKNOWN");
  });

  it("generated_at is a non-empty string on null raw", () => {
    const result = parseMoneyRadarCompositeDto(null);
    expect(typeof result.generated_at).toBe("string");
    expect(result.generated_at.length).toBeGreaterThan(0);
  });

  it("undefined raw → honest-NULL state", () => {
    const result = parseMoneyRadarCompositeDto(undefined);
    expect(result.score).toBeNull();
    expect(result.divergence.flag).toBe("UNKNOWN");
  });

  it("all component keys default to null", () => {
    const result = parseMoneyRadarCompositeDto(null);
    expect(result.components.foreign_accum_z_market).toBeNull();
    expect(result.components.rel_vol_z_20).toBeNull();
    expect(result.components.obv_slope).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — parseMoneyRadarCompositeDto: full valid DTO passes through
// ---------------------------------------------------------------------------

describe("parseMoneyRadarCompositeDto — live-sample DTO", () => {
  it("passes through generated_at and score", () => {
    const result = parseMoneyRadarCompositeDto(LIVE_SAMPLE_DTO);
    expect(result.generated_at).toBe(GENERATED_AT);
    expect(result.score).toBe(-0.02);
  });

  it("passes through divergence AMBER/D4", () => {
    const result = parseMoneyRadarCompositeDto(LIVE_SAMPLE_DTO);
    expect(result.divergence.flag).toBe("AMBER");
    expect(result.divergence.severity).toBe(1);
    expect(result.divergence.detectors).toEqual(["D4"]);
  });

  it("passes through non-null components (foreign_accum_z_market, rel_vol_z_20, obv_slope)", () => {
    const result = parseMoneyRadarCompositeDto(LIVE_SAMPLE_DTO);
    expect(result.components.foreign_accum_z_market).toBeCloseTo(-6.0e-18);
    expect(result.components.rel_vol_z_20).toBeCloseTo(-0.928);
    expect(result.components.obv_slope).toBeCloseTo(0.081);
  });

  it("passes through null components (credit_flow_direction, foreign_outflow_z_5d)", () => {
    const result = parseMoneyRadarCompositeDto(LIVE_SAMPLE_DTO);
    expect(result.components.credit_flow_direction).toBeNull();
    expect(result.components.foreign_outflow_z_5d).toBeNull();
  });

  it("passes through coverage_pct and source_tier", () => {
    const result = parseMoneyRadarCompositeDto(LIVE_SAMPLE_DTO);
    expect(result.coverage_pct).toBeCloseTo(0.769);
    expect(result.source_tier).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — parseMoneyRadarCompositeDto: invalid shape → graceful fallback
// ---------------------------------------------------------------------------

describe("parseMoneyRadarCompositeDto — invalid/unexpected shapes → graceful fallback", () => {
  it("string raw → honest-NULL, no throw", () => {
    expect(() => {
      const result = parseMoneyRadarCompositeDto("not-an-object");
      expect(result.score).toBeNull();
    }).not.toThrow();
  });

  it("array raw → honest-NULL, no throw", () => {
    expect(() => {
      const result = parseMoneyRadarCompositeDto([1, 2, 3]);
      expect(result.score).toBeNull();
    }).not.toThrow();
  });

  it("object without generated_at → honest-NULL, no throw", () => {
    expect(() => {
      const result = parseMoneyRadarCompositeDto({ message: "error" });
      expect(result.score).toBeNull();
      expect(result.divergence.flag).toBe("UNKNOWN");
    }).not.toThrow();
  });

  it("malformed divergence.flag → coerced to UNKNOWN, no throw", () => {
    const result = parseMoneyRadarCompositeDto({
      generated_at: GENERATED_AT,
      score: 0.1,
      delta_5d: null,
      divergence: { flag: "PURPLE", severity: 9, detectors: "not-an-array" },
      coverage_pct: 0.8,
      source_tier: 3,
      is_estimate: false,
      null_reason: null,
      components: {},
    });
    expect(result.divergence.flag).toBe("UNKNOWN");
    expect(result.divergence.detectors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — formatScalar2
// ---------------------------------------------------------------------------

describe("formatScalar2 — 2-decimal scalar formatting (brief §8)", () => {
  it("null → em dash '—'", () => {
    expect(formatScalar2(null)).toBe("—");
  });

  it("formats to exactly 2 decimal places", () => {
    expect(formatScalar2(-0.928)).toBe("-0.93");
    expect(formatScalar2(0.081)).toBe("0.08");
  });

  it("near-zero float (e.g. -6.0e-18) formats without throwing", () => {
    expect(() => formatScalar2(-6.0e-18)).not.toThrow();
    expect(typeof formatScalar2(-6.0e-18)).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — formatCompositeScoreBadge (Card 1 — Dòng Tiền)
// ---------------------------------------------------------------------------

describe("formatCompositeScoreBadge — MẠNH / YẾU / TRUNG TÍNH (brief §8)", () => {
  it("null → gray 'Chưa có dữ liệu'", () => {
    const { label, color } = formatCompositeScoreBadge(null);
    expect(color).toBe("gray");
    expect(label).toBe("Chưa có dữ liệu");
  });

  it("positive → green 'MẠNH'", () => {
    const { label, color } = formatCompositeScoreBadge(0.3);
    expect(color).toBe("green");
    expect(label).toBe("MẠNH");
  });

  it("negative → amber 'YẾU'", () => {
    const { label, color } = formatCompositeScoreBadge(-0.02);
    expect(color).toBe("amber");
    expect(label).toBe("YẾU");
  });

  it("zero → amber 'TRUNG TÍNH'", () => {
    const { label, color } = formatCompositeScoreBadge(0);
    expect(color).toBe("amber");
    expect(label).toBe("TRUNG TÍNH");
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — formatForeignAccumBadge (Card 2 — Dòng Vốn Ngoại)
// ---------------------------------------------------------------------------

describe("formatForeignAccumBadge — GOM HÀNG / XÃ HÀNG (brief §8)", () => {
  it("null → gray 'Chưa có dữ liệu'", () => {
    const { label, color } = formatForeignAccumBadge(null);
    expect(color).toBe("gray");
    expect(label).toBe("Chưa có dữ liệu");
  });

  it("negative z → green 'GOM HÀNG'", () => {
    const { label, color } = formatForeignAccumBadge(-1.2);
    expect(color).toBe("green");
    expect(label).toBe("GOM HÀNG");
  });

  it("positive/zero z → red 'XÃ HÀNG'", () => {
    expect(formatForeignAccumBadge(1.2).label).toBe("XÃ HÀNG");
    expect(formatForeignAccumBadge(0).label).toBe("XÃ HÀNG");
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — formatRelVolBadge (Card 3 — Khối Lượng Nội Địa)
// ---------------------------------------------------------------------------

describe("formatRelVolBadge — CAO / THẤP (brief §8)", () => {
  it("null → gray 'Chưa có dữ liệu'", () => {
    const { label, color } = formatRelVolBadge(null);
    expect(color).toBe("gray");
    expect(label).toBe("Chưa có dữ liệu");
  });

  it("positive/zero z → green 'CAO'", () => {
    expect(formatRelVolBadge(0.5).label).toBe("CAO");
    expect(formatRelVolBadge(0).label).toBe("CAO");
  });

  it("negative z → amber 'THẤP'", () => {
    const { label, color } = formatRelVolBadge(-0.928);
    expect(color).toBe("amber");
    expect(label).toBe("THẤP");
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — formatDivergenceBadge + formatDivergenceScalar (Card 4 — Phân Kỳ)
// ---------------------------------------------------------------------------

describe("formatDivergenceBadge — PHÂN KỲ / KHÔNG RÕ (brief §8, HN-4)", () => {
  it("UNKNOWN → gray 'Chưa có dữ liệu' (HN-4 honest-null equivalent)", () => {
    const { label, color } = formatDivergenceBadge("UNKNOWN");
    expect(color).toBe("gray");
    expect(label).toBe("Chưa có dữ liệu");
  });

  it("RED → red 'PHÂN KỲ'", () => {
    const { label, color } = formatDivergenceBadge("RED");
    expect(color).toBe("red");
    expect(label).toBe("PHÂN KỲ");
  });

  it("AMBER → amber 'PHÂN KỲ'", () => {
    const { label, color } = formatDivergenceBadge("AMBER");
    expect(color).toBe("amber");
    expect(label).toBe("PHÂN KỲ");
  });

  it("GREEN → green 'KHÔNG RÕ'", () => {
    const { label, color } = formatDivergenceBadge("GREEN");
    expect(color).toBe("green");
    expect(label).toBe("KHÔNG RÕ");
  });
});

describe("formatDivergenceScalar — flag text; '—' for UNKNOWN null-equivalent", () => {
  it("UNKNOWN → '—'", () => {
    expect(formatDivergenceScalar("UNKNOWN")).toBe("—");
  });

  it("AMBER/RED/GREEN → flag text as-is", () => {
    expect(formatDivergenceScalar("AMBER")).toBe("AMBER");
    expect(formatDivergenceScalar("RED")).toBe("RED");
    expect(formatDivergenceScalar("GREEN")).toBe("GREEN");
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — fetchMoneyRadarComposite: happy path (mocked fetch)
// ---------------------------------------------------------------------------

describe("fetchMoneyRadarComposite — happy path", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns parsed composite fields when upstream returns 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(LIVE_SAMPLE_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchMoneyRadarComposite("http://localhost:3001");
    expect(result.error).toBeNull();
    expect(result.score).toBe(-0.02);
    expect(result.divergence.flag).toBe("AMBER");
    expect(result.components.rel_vol_z_20).toBeCloseTo(-0.928);
  });

  it("calls the correct endpoint URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(ALL_NULL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await fetchMoneyRadarComposite("http://localhost:3001");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/money-radar"),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — fetchMoneyRadarComposite: upstream error (non-fatal)
// ---------------------------------------------------------------------------

describe("fetchMoneyRadarComposite — upstream error (non-fatal)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("502 → error string set, honest-NULL state, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Bad Gateway" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchMoneyRadarComposite("http://localhost:3001");
    expect(result.error).not.toBeNull();
    expect(result.score).toBeNull();
    expect(result.divergence.flag).toBe("UNKNOWN");
  });

  it("404 (REST endpoint not yet deployed by dev-mcp-server) → error set, honest-NULL, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    const result = await fetchMoneyRadarComposite("http://localhost:3001");
    expect(result.error).not.toBeNull();
    expect(result.score).toBeNull();
  });

  it("network failure → error set, honest-NULL, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );
    const result = await fetchMoneyRadarComposite("http://localhost:3001");
    expect(result.error).toBe("ECONNREFUSED");
    expect(result.score).toBeNull();
    expect(result.components.foreign_accum_z_market).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 11 — fetchMoneyRadarComposite: honest-NULL forwarding
// ---------------------------------------------------------------------------

describe("fetchMoneyRadarComposite — honest-NULL forwarding", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("all-null DTO (coverage_pct < 0.5) → score null, divergence UNKNOWN forwarded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(ALL_NULL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchMoneyRadarComposite("http://localhost:3001");
    expect(result.error).toBeNull();
    expect(result.score).toBeNull();
    expect(result.null_reason).toBe("coverage_pct < 0.5");
    expect(result.divergence.flag).toBe("UNKNOWN");
  });

  it("partial-null: score present but a component null → component stays honest-NULL", async () => {
    const partial: MoneyRadarCompositeDto = {
      ...LIVE_SAMPLE_DTO,
      components: { ...LIVE_SAMPLE_DTO.components, rel_vol_z_20: null },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(partial), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchMoneyRadarComposite("http://localhost:3001");
    expect(result.score).toBe(-0.02);
    expect(result.components.rel_vol_z_20).toBeNull();
  });
});
