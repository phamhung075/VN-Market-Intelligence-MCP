/**
 * ind-p1-momentum-cards.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.momentum.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Tests the 4 P1 momentum gauge scalars surface:
 *   1. ROC              — momentum_factor_z
 *   2. RelativeStrength — market_rs_composite
 *   3. Proximity52W     — net_new_highs + pct_above_ma50/ma200
 *   4. ForeignAccum     — foreign_accum_z_market
 *
 * Sprint: BA-IND-P1-MOMENTUM-FRONTEND
 * Task:   TASK-502-MOMENTUM-FRONTEND AC-5
 *
 * Suites:
 *   1.  parseMomentumIndicatorsDto — null raw → all-null sections
 *   2.  parseMomentumIndicatorsDto — full valid DTO passes through
 *   3.  parseMomentumIndicatorsDto — partial DTO (sections null) → honest-NULL forwarded
 *   4.  parseMomentumIndicatorsDto — invalid non-object → graceful fallback
 *   5.  formatZScore               — positive / negative / zero / null (imported from P0)
 *   6.  formatRSComposite          — positive / negative / zero / null (new, local)
 *   7.  fetchMomentumIndicators    — happy path (mocked fetch)
 *   8.  fetchMomentumIndicators    — upstream 502 → all-null + error set
 *   9.  fetchMomentumIndicators    — network failure → all-null + error set
 *  10.  fetchMomentumIndicators    — null sections → honest-NULL forwarded
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseMomentumIndicatorsDto,
  formatRSComposite,
  fetchMomentumIndicators,
} from "~/routes/dashboard.momentum";
import type { MomentumIndicatorsDto } from "~/routes/dashboard.momentum";
import { formatZScore } from "~/routes/dashboard.indicator-gauges";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENERATED_AT = "2026-06-30T08:00:00Z";

const ROC_SECTION = {
  momentum_factor_z: 1.72,
  computed_as_of: "2026-06-29",
  null_reason: null,
  source_tier: 3,
};

const RS_SECTION = {
  market_rs_composite: 0.45,
  low_sample_warning: false,
  computed_as_of: "2026-06-29",
  null_reason: null,
  source_tier: 3,
};

const W52_SECTION = {
  net_new_highs: 12,
  pct_above_ma50: 0.61,
  pct_above_ma200: 0.48,
  computed_as_of: "2026-06-29",
  null_reason: null,
  source_tier: 3,
};

const FA_SECTION = {
  foreign_accum_z_market: -1.35,
  computed_as_of: "2026-06-29",
  null_reason: null,
  source_tier: 3,
};

const FULL_DTO: MomentumIndicatorsDto = {
  generated_at: GENERATED_AT,
  source_tier: 3,
  roc: ROC_SECTION,
  relative_strength: RS_SECTION,
  proximity_52w: W52_SECTION,
  foreign_accum: FA_SECTION,
};

const ALL_NULL_DTO: MomentumIndicatorsDto = {
  generated_at: GENERATED_AT,
  roc: null,
  relative_strength: null,
  proximity_52w: null,
  foreign_accum: null,
};

// ---------------------------------------------------------------------------
// Suite 1 — parseMomentumIndicatorsDto: null raw → all-null sections
// ---------------------------------------------------------------------------

describe("parseMomentumIndicatorsDto — null raw → honest-NULL state", () => {
  it("returns non-null object with all sections null", () => {
    const result = parseMomentumIndicatorsDto(null);
    expect(result).not.toBeNull();
    expect(result.roc).toBeNull();
    expect(result.relative_strength).toBeNull();
    expect(result.proximity_52w).toBeNull();
    expect(result.foreign_accum).toBeNull();
  });

  it("generated_at is a non-empty string on null raw", () => {
    const result = parseMomentumIndicatorsDto(null);
    expect(typeof result.generated_at).toBe("string");
    expect(result.generated_at.length).toBeGreaterThan(0);
  });

  it("undefined raw → all-null sections", () => {
    const result = parseMomentumIndicatorsDto(undefined);
    expect(result.roc).toBeNull();
    expect(result.relative_strength).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — parseMomentumIndicatorsDto: full valid DTO passes through
// ---------------------------------------------------------------------------

describe("parseMomentumIndicatorsDto — full valid DTO", () => {
  it("passes through generated_at", () => {
    const result = parseMomentumIndicatorsDto(FULL_DTO);
    expect(result.generated_at).toBe(GENERATED_AT);
  });

  it("passes through roc section with momentum_factor_z", () => {
    const result = parseMomentumIndicatorsDto(FULL_DTO);
    expect(result.roc).not.toBeNull();
    expect(result.roc!.momentum_factor_z).toBe(1.72);
    expect(result.roc!.computed_as_of).toBe("2026-06-29");
  });

  it("passes through relative_strength section", () => {
    const result = parseMomentumIndicatorsDto(FULL_DTO);
    expect(result.relative_strength).not.toBeNull();
    expect(result.relative_strength!.market_rs_composite).toBe(0.45);
    expect(result.relative_strength!.low_sample_warning).toBe(false);
  });

  it("passes through proximity_52w section", () => {
    const result = parseMomentumIndicatorsDto(FULL_DTO);
    expect(result.proximity_52w).not.toBeNull();
    expect(result.proximity_52w!.net_new_highs).toBe(12);
    expect(result.proximity_52w!.pct_above_ma50).toBe(0.61);
  });

  it("passes through foreign_accum section", () => {
    const result = parseMomentumIndicatorsDto(FULL_DTO);
    expect(result.foreign_accum).not.toBeNull();
    expect(result.foreign_accum!.foreign_accum_z_market).toBe(-1.35);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — parseMomentumIndicatorsDto: partial DTO → honest-NULL forwarded
// ---------------------------------------------------------------------------

describe("parseMomentumIndicatorsDto — partial DTO (honest-NULL sections)", () => {
  it("null roc section remains null", () => {
    const dto: MomentumIndicatorsDto = { ...FULL_DTO, roc: null };
    const result = parseMomentumIndicatorsDto(dto);
    expect(result.roc).toBeNull();
    expect(result.relative_strength).not.toBeNull();
  });

  it("null relative_strength section remains null", () => {
    const dto: MomentumIndicatorsDto = { ...FULL_DTO, relative_strength: null };
    const result = parseMomentumIndicatorsDto(dto);
    expect(result.relative_strength).toBeNull();
  });

  it("null proximity_52w section remains null", () => {
    const dto: MomentumIndicatorsDto = { ...FULL_DTO, proximity_52w: null };
    const result = parseMomentumIndicatorsDto(dto);
    expect(result.proximity_52w).toBeNull();
  });

  it("null sections coexist with populated ones", () => {
    const dto: MomentumIndicatorsDto = {
      ...ALL_NULL_DTO,
      roc: ROC_SECTION,
    };
    const result = parseMomentumIndicatorsDto(dto);
    expect(result.roc).not.toBeNull();
    expect(result.relative_strength).toBeNull();
    expect(result.proximity_52w).toBeNull();
    expect(result.foreign_accum).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — parseMomentumIndicatorsDto: invalid non-object → graceful fallback
// ---------------------------------------------------------------------------

describe("parseMomentumIndicatorsDto — invalid/unexpected shapes → graceful fallback", () => {
  it("string raw → all-null sections, no throw", () => {
    expect(() => {
      const result = parseMomentumIndicatorsDto("not-an-object");
      expect(result.roc).toBeNull();
    }).not.toThrow();
  });

  it("array raw → all-null sections, no throw", () => {
    expect(() => {
      const result = parseMomentumIndicatorsDto([1, 2, 3]);
      expect(result.roc).toBeNull();
    }).not.toThrow();
  });

  it("object without generated_at → all-null sections, no throw", () => {
    expect(() => {
      const result = parseMomentumIndicatorsDto({ message: "error" });
      expect(result.roc).toBeNull();
      expect(result.relative_strength).toBeNull();
    }).not.toThrow();
  });

  it("error payload {error: '...'} → all-null sections, no throw", () => {
    expect(() => {
      const result = parseMomentumIndicatorsDto({ error: "upstream unavailable" });
      expect(result.roc).toBeNull();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — formatZScore (imported from P0, regression guard)
// ---------------------------------------------------------------------------

describe("formatZScore — z-score display (P0 helper used by P1 page)", () => {
  it("null → em dash '—'", () => {
    expect(formatZScore(null)).toBe("—");
  });

  it("positive z → '+N.NN σ'", () => {
    const result = formatZScore(1.72);
    expect(result).toContain("+");
    expect(result).toContain("σ");
  });

  it("negative z → '−N.NN σ'", () => {
    const result = formatZScore(-1.35);
    expect(result).toContain("σ");
    expect(result).toMatch(/^[−-]/);
  });

  it("zero → '0.00 σ'", () => {
    const result = formatZScore(0);
    expect(result).toContain("σ");
  });

  it("formats to 2 decimal places", () => {
    const result = formatZScore(1.456789);
    const match = result.match(/\d+\.\d+/);
    expect(match).toBeTruthy();
    expect(match![0].split(".")[1]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — formatRSComposite (AC-M2 helper)
// ---------------------------------------------------------------------------

describe("formatRSComposite — RS composite formatting (AC-M2)", () => {
  it("null → gray 'Chưa có dữ liệu'", () => {
    const { label, color } = formatRSComposite(null);
    expect(color).toBe("gray");
    expect(label).toBe("Chưa có dữ liệu");
  });

  it("undefined → gray", () => {
    // @ts-expect-error testing undefined input
    const { color } = formatRSComposite(undefined);
    expect(color).toBe("gray");
  });

  it("positive value → green 'MẠNH'", () => {
    const { label, color } = formatRSComposite(0.45);
    expect(color).toBe("green");
    expect(label).toBe("MẠNH");
  });

  it("negative value → amber 'YẾU'", () => {
    const { label, color } = formatRSComposite(-0.3);
    expect(color).toBe("amber");
    expect(label).toBe("YẾU");
  });

  it("zero → amber 'TRUNG TÍNH'", () => {
    const { label, color } = formatRSComposite(0);
    expect(color).toBe("amber");
    expect(label).toBe("TRUNG TÍNH");
  });

  it("returns non-empty string label in all cases", () => {
    for (const v of [1.5, -1.5, 0, null]) {
      const { label } = formatRSComposite(v);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — fetchMomentumIndicators: happy path (mocked fetch)
// ---------------------------------------------------------------------------

describe("fetchMomentumIndicators — happy path", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns parsed dto sections when upstream returns 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(FULL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(result.error).toBeNull();
    expect(result.roc).not.toBeNull();
    expect(result.roc!.momentum_factor_z).toBe(1.72);
    expect(result.relative_strength).not.toBeNull();
    expect(result.proximity_52w).not.toBeNull();
    expect(result.foreign_accum).not.toBeNull();
  });

  it("calls the correct endpoint URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(ALL_NULL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await fetchMomentumIndicators("http://localhost:3001");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/momentum-indicators"),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — fetchMomentumIndicators: upstream 502 → all-null + error
// ---------------------------------------------------------------------------

describe("fetchMomentumIndicators — upstream error (non-fatal)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("502 → error string set, all sections null, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Bad Gateway" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(result.error).not.toBeNull();
    expect(result.roc).toBeNull();
    expect(result.relative_strength).toBeNull();
    expect(result.proximity_52w).toBeNull();
    expect(result.foreign_accum).toBeNull();
  });

  it("404 (backend not yet deployed) → error set, honest-NULL, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(result.error).not.toBeNull();
    expect(result.roc).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — fetchMomentumIndicators: network failure → all-null + error
// ---------------------------------------------------------------------------

describe("fetchMomentumIndicators — network failure (non-fatal)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("ECONNREFUSED → error string, all sections null, no throw", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );
    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(result.error).toBe("ECONNREFUSED");
    expect(result.roc).toBeNull();
    expect(result.relative_strength).toBeNull();
  });

  it("network error → error set, no throw for any section", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(typeof result.error).toBe("string");
    expect(result.proximity_52w).toBeNull();
    expect(result.foreign_accum).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — fetchMomentumIndicators: null sections → honest-NULL forwarded
// ---------------------------------------------------------------------------

describe("fetchMomentumIndicators — honest-NULL forwarding", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("roc:null in response → result.roc is null", async () => {
    const dtoNoRoc: MomentumIndicatorsDto = { ...FULL_DTO, roc: null };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(dtoNoRoc), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(result.error).toBeNull();
    expect(result.roc).toBeNull();
    expect(result.relative_strength).not.toBeNull();
  });

  it("all sections null → all-null forwarded (fresh endpoint accruing)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(ALL_NULL_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(result.error).toBeNull();
    expect(result.roc).toBeNull();
    expect(result.relative_strength).toBeNull();
    expect(result.proximity_52w).toBeNull();
    expect(result.foreign_accum).toBeNull();
  });

  it("proximity_52w.net_new_highs:null → section present but field null", async () => {
    const dtoNullHighs: MomentumIndicatorsDto = {
      ...FULL_DTO,
      proximity_52w: { ...W52_SECTION, net_new_highs: null },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(dtoNullHighs), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchMomentumIndicators("http://localhost:3001");
    expect(result.proximity_52w).not.toBeNull();
    expect(result.proximity_52w!.net_new_highs).toBeNull();
  });
});
