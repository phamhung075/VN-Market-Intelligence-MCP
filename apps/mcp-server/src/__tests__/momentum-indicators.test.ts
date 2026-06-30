/**
 * momentum-indicators.test.ts
 *
 * Sprint: BA-IND-P1-MOMENTUM-FRONTEND
 * Task: TASK-501-MOMENTUM-API-HANDLER
 *
 * Tests for GET /api/momentum-indicators handler and aggregation logic.
 *
 * Coverage:
 *   REG-1:   handleGetMomentumIndicators + aggregateMomentumIndicators are exported
 *   GEN-1:   generated_at ALWAYS a valid ISO string regardless of section state
 *   200-1:   HTTP handler returns 200 even on section failures
 *   ISO-1:   Partial failure — one source throws → that section null, others populated
 *   ISO-2:   All 4 sources fail → still 200 with all-null sections
 *   ROC-1:   buildRocSection — momentum_factor_z null → null_reason set
 *   RS-1:    buildRelativeStrengthSection — low_sample_warning passthrough
 *   RS-2:    buildRelativeStrengthSection — market_rs_composite null → null_reason set
 *   PROX-1:  buildProximity52WSection — denominator_ma200=0 → null_reason set
 *   PROX-2:  buildProximity52WSection — no tickers[] in output
 *   FA-1:    buildForeignAccumSection — foreign_accum_z_market null → null_reason set
 *   FA-2:    buildForeignAccumSection — no tickers[] in output
 *   TIER-1:  source_tier = 3 for all sections (ARCH-RATIFY M3)
 *
 * Honest-NULL discipline: every null scalar carries null_reason; never fabricated.
 * Mock-guard: no real TA service / stock-price service URLs in test fixtures (NFR-8).
 *
 * Run: bun test src/__tests__/momentum-indicators.test.ts
 */

import { describe, it, expect } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleGetMomentumIndicators,
  aggregateMomentumIndicators,
  buildRocSection,
  buildRelativeStrengthSection,
  buildProximity52WSection,
  buildForeignAccumSection,
  type MomentumIndicatorsDto,
  type MomentumIndicatorsDeps,
} from "../interface/mcp/routes/momentumIndicatorsHandler.js";
import type {
  ComputeROCMomentumResponse,
  ComputeRelativeStrengthResponse,
  Compute52WProximityResponse,
  ComputeForeignAccumRankResponse,
} from "../infrastructure/microservices/clients.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal fake res for HTTP handler assertions */
function makeRes() {
  const res = {
    statusCode: 0,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(code: number, headers: Record<string, string> = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(data = "") {
      this.body += data;
    },
  };
  return res;
}

const fakeReq = {} as IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Fixture data — minimal valid shapes for each section
// ─────────────────────────────────────────────────────────────────────────────

const mockRoc: ComputeROCMomentumResponse = {
  tickers: [],
  factor_return_buckets: [],
  momentum_factor_z: 1.42,
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

const mockRocNullZ: ComputeROCMomentumResponse = {
  tickers: [],
  factor_return_buckets: [],
  momentum_factor_z: null,
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

const mockRS: ComputeRelativeStrengthResponse = {
  tickers: [],
  market_rs_composite: 0.65,
  low_sample_warning: false,
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

const mockRSNullComposite: ComputeRelativeStrengthResponse = {
  tickers: [],
  market_rs_composite: null,
  low_sample_warning: true,
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

const mockProximity: Compute52WProximityResponse = {
  tickers: [],
  aggregate: {
    new_highs_count: 12,
    new_lows_count: 3,
    net_new_highs: 9,
    pct_above_ma50: 0.58,
    pct_above_ma200: 0.42,
    denominator_ma200: 50,
  },
  net_new_highs: 9,
  denominator_ma200: 50,
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

const mockProximityZeroDenominator: Compute52WProximityResponse = {
  tickers: [],
  aggregate: {
    new_highs_count: 0,
    new_lows_count: 0,
    net_new_highs: 0,
    pct_above_ma50: null,
    pct_above_ma200: null,
    denominator_ma200: 0,
  },
  net_new_highs: 0,
  denominator_ma200: 0,
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

const mockForeignAccum: ComputeForeignAccumRankResponse = {
  tickers: [],
  foreign_accum_z_market: -0.87,
  adtv_unit: "vnd_bn",
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

const mockForeignAccumNullZ: ComputeForeignAccumRankResponse = {
  tickers: [],
  foreign_accum_z_market: null,
  adtv_unit: "vnd_bn",
  computed_as_of: "2026-06-30T04:00:00.000Z",
};

/** Build a deps object with all 4 sources mocked to valid data */
function allGoodDeps(): MomentumIndicatorsDeps {
  return {
    computeRoc: () => Promise.resolve(mockRoc),
    computeRS: () => Promise.resolve(mockRS),
    compute52W: () => Promise.resolve(mockProximity),
    computeForeignAccum: () => Promise.resolve(mockForeignAccum),
  };
}

/** All 4 sources reject */
function allFailDeps(): MomentumIndicatorsDeps {
  return {
    computeRoc: () => Promise.reject(new Error("TA service down")),
    computeRS: () => Promise.reject(new Error("TA service down")),
    compute52W: () => Promise.reject(new Error("TA service down")),
    computeForeignAccum: () => Promise.reject(new Error("price service down")),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REG-1: exports exist
// ─────────────────────────────────────────────────────────────────────────────

describe("momentum-indicators — registration", () => {
  it("REG-1a: handleGetMomentumIndicators is a function", () => {
    expect(typeof handleGetMomentumIndicators).toBe("function");
  });

  it("REG-1b: aggregateMomentumIndicators is a function", () => {
    expect(typeof aggregateMomentumIndicators).toBe("function");
  });

  it("REG-1c: section builders are exported as functions", () => {
    expect(typeof buildRocSection).toBe("function");
    expect(typeof buildRelativeStrengthSection).toBe("function");
    expect(typeof buildProximity52WSection).toBe("function");
    expect(typeof buildForeignAccumSection).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GEN-1: generated_at always set
// ─────────────────────────────────────────────────────────────────────────────

describe("momentum-indicators — generated_at invariant", () => {
  it("GEN-1a: generated_at is an ISO string when all sources succeed", async () => {
    const result = await aggregateMomentumIndicators(allGoodDeps());
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("GEN-1b: generated_at set even when all sources fail", async () => {
    const result = await aggregateMomentumIndicators(allFailDeps());
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 200-1: HTTP 200 always (AC-3)
// ─────────────────────────────────────────────────────────────────────────────

describe("momentum-indicators — HTTP 200 contract", () => {
  it("200-1a: HTTP 200 when all sources succeed", async () => {
    const fakeServerRes = makeRes();
    await handleGetMomentumIndicators(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      allGoodDeps(),
    );
    expect(fakeServerRes.statusCode).toBe(200);
  });

  it("200-1b: HTTP 200 when all sources fail", async () => {
    const fakeServerRes = makeRes();
    await handleGetMomentumIndicators(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      allFailDeps(),
    );
    expect(fakeServerRes.statusCode).toBe(200);
  });

  it("200-1c: response body is valid JSON", async () => {
    const fakeServerRes = makeRes();
    await handleGetMomentumIndicators(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      allGoodDeps(),
    );
    expect(() => JSON.parse(fakeServerRes.body)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ISO-1/ISO-2: Section isolation (Promise.allSettled) (AC-2)
// ─────────────────────────────────────────────────────────────────────────────

describe("momentum-indicators — all 4 sections fulfilled → full DTO", () => {
  it("ISO-0: all 4 sources succeed → all sections non-null", async () => {
    const result = await aggregateMomentumIndicators(allGoodDeps());
    expect(result.roc).not.toBeNull();
    expect(result.relative_strength).not.toBeNull();
    expect(result.proximity_52w).not.toBeNull();
    expect(result.foreign_accum).not.toBeNull();
  });
});

describe("momentum-indicators — one rejected → that section null, others populated", () => {
  it("ISO-1a: roc source throws → roc=null, other sections populated", async () => {
    const deps: MomentumIndicatorsDeps = {
      ...allGoodDeps(),
      computeRoc: () => Promise.reject(new Error("TA service down")),
    };
    const result = await aggregateMomentumIndicators(deps);
    expect(result.roc).toBeNull();
    expect(result.relative_strength).not.toBeNull();
    expect(result.proximity_52w).not.toBeNull();
    expect(result.foreign_accum).not.toBeNull();
  });

  it("ISO-1b: relative_strength source throws → relative_strength=null, others populated", async () => {
    const deps: MomentumIndicatorsDeps = {
      ...allGoodDeps(),
      computeRS: () => Promise.reject(new Error("TA service down")),
    };
    const result = await aggregateMomentumIndicators(deps);
    expect(result.relative_strength).toBeNull();
    expect(result.roc).not.toBeNull();
    expect(result.proximity_52w).not.toBeNull();
    expect(result.foreign_accum).not.toBeNull();
  });

  it("ISO-1c: proximity_52w source throws → proximity_52w=null, others populated", async () => {
    const deps: MomentumIndicatorsDeps = {
      ...allGoodDeps(),
      compute52W: () => Promise.reject(new Error("TA service down")),
    };
    const result = await aggregateMomentumIndicators(deps);
    expect(result.proximity_52w).toBeNull();
    expect(result.roc).not.toBeNull();
    expect(result.relative_strength).not.toBeNull();
    expect(result.foreign_accum).not.toBeNull();
  });

  it("ISO-1d: foreign_accum source throws → foreign_accum=null, others populated", async () => {
    const deps: MomentumIndicatorsDeps = {
      ...allGoodDeps(),
      computeForeignAccum: () => Promise.reject(new Error("price service down")),
    };
    const result = await aggregateMomentumIndicators(deps);
    expect(result.foreign_accum).toBeNull();
    expect(result.roc).not.toBeNull();
    expect(result.relative_strength).not.toBeNull();
    expect(result.proximity_52w).not.toBeNull();
  });
});

describe("momentum-indicators — all rejected → all-null DTO, generated_at present", () => {
  it("ISO-2: all 4 sources fail → generated_at set, all sections null", async () => {
    const result = await aggregateMomentumIndicators(allFailDeps());
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.roc).toBeNull();
    expect(result.relative_strength).toBeNull();
    expect(result.proximity_52w).toBeNull();
    expect(result.foreign_accum).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROC-1: buildRocSection — honest-NULL (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildRocSection — momentum_factor_z null → null_reason set", () => {
  it("ROC-1a: null_reason set when momentum_factor_z is null", () => {
    const gauge = buildRocSection(mockRocNullZ);
    expect(gauge.momentum_factor_z).toBeNull();
    expect(typeof gauge.null_reason).toBe("string");
    expect(gauge.null_reason).toContain("≥13 bars");
  });

  it("ROC-1b: null_reason is null when momentum_factor_z has a value", () => {
    const gauge = buildRocSection(mockRoc);
    expect(gauge.momentum_factor_z).toBe(1.42);
    expect(gauge.null_reason).toBeNull();
  });

  it("ROC-1c: computed_as_of preserved from response", () => {
    const gauge = buildRocSection(mockRoc);
    expect(gauge.computed_as_of).toBe("2026-06-30T04:00:00.000Z");
  });

  it("ROC-1d: no tickers[] or factor_return_buckets[] in output (NEVER forward arrays)", () => {
    const gauge = buildRocSection(mockRoc) as unknown as Record<string, unknown>;
    expect("tickers" in gauge).toBe(false);
    expect("factor_return_buckets" in gauge).toBe(false);
  });

  it("TIER-1a: roc source_tier = 3 (ARCH-RATIFY M3)", () => {
    const gauge = buildRocSection(mockRoc);
    expect(gauge.source_tier).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RS-1/RS-2: buildRelativeStrengthSection — honest-NULL + low_sample_warning (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildRelativeStrengthSection — low_sample_warning passthrough", () => {
  it("RS-1a: low_sample_warning=false passthrough when sample adequate", () => {
    const gauge = buildRelativeStrengthSection(mockRS);
    expect(gauge.low_sample_warning).toBe(false);
    expect(gauge.market_rs_composite).toBe(0.65);
    expect(gauge.null_reason).toBeNull();
  });

  it("RS-1b: low_sample_warning=true passthrough when sample small", () => {
    const gauge = buildRelativeStrengthSection(mockRSNullComposite);
    expect(gauge.low_sample_warning).toBe(true);
  });

  it("RS-2a: null_reason set when market_rs_composite is null", () => {
    const gauge = buildRelativeStrengthSection(mockRSNullComposite);
    expect(gauge.market_rs_composite).toBeNull();
    expect(typeof gauge.null_reason).toBe("string");
    expect(gauge.null_reason).toContain("N ≥ 5 tickers");
  });

  it("RS-2b: no tickers[] in output (NEVER forward arrays)", () => {
    const gauge = buildRelativeStrengthSection(mockRS) as unknown as Record<string, unknown>;
    expect("tickers" in gauge).toBe(false);
  });

  it("TIER-1b: relative_strength source_tier = 3 (ARCH-RATIFY M3)", () => {
    const gauge = buildRelativeStrengthSection(mockRS);
    expect(gauge.source_tier).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROX-1/PROX-2: buildProximity52WSection — honest-NULL (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildProximity52WSection — denominator_ma200=0 → null_reason set", () => {
  it("PROX-1a: null_reason set when denominator_ma200 = 0 (pct_above_ma200 null)", () => {
    const gauge = buildProximity52WSection(mockProximityZeroDenominator);
    expect(gauge.pct_above_ma200).toBeNull();
    expect(typeof gauge.null_reason).toBe("string");
    expect(gauge.null_reason).toContain("denominator_ma200 = 0");
  });

  it("PROX-1b: null_reason is null when pct_above_ma200 has a value", () => {
    const gauge = buildProximity52WSection(mockProximity);
    expect(gauge.pct_above_ma200).toBe(0.42);
    expect(gauge.null_reason).toBeNull();
  });

  it("PROX-1c: scalars projected correctly (net_new_highs, denominator_ma200, pct_above_ma50)", () => {
    const gauge = buildProximity52WSection(mockProximity);
    expect(gauge.net_new_highs).toBe(9);
    expect(gauge.denominator_ma200).toBe(50);
    expect(gauge.pct_above_ma50).toBe(0.58);
    expect(gauge.computed_as_of).toBe("2026-06-30T04:00:00.000Z");
  });

  it("PROX-2: no tickers[] in output (NEVER forward arrays)", () => {
    const gauge = buildProximity52WSection(mockProximity) as unknown as Record<string, unknown>;
    expect("tickers" in gauge).toBe(false);
  });

  it("TIER-1c: proximity_52w source_tier = 3 (ARCH-RATIFY M3)", () => {
    const gauge = buildProximity52WSection(mockProximity);
    expect(gauge.source_tier).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FA-1/FA-2: buildForeignAccumSection — honest-NULL (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildForeignAccumSection — foreign_accum_z_market null → null_reason set", () => {
  it("FA-1a: null_reason set when foreign_accum_z_market is null", () => {
    const gauge = buildForeignAccumSection(mockForeignAccumNullZ);
    expect(gauge.foreign_accum_z_market).toBeNull();
    expect(typeof gauge.null_reason).toBe("string");
    expect(gauge.null_reason).toContain("≥5 days of flow data");
  });

  it("FA-1b: null_reason is null when foreign_accum_z_market has a value", () => {
    const gauge = buildForeignAccumSection(mockForeignAccum);
    expect(gauge.foreign_accum_z_market).toBe(-0.87);
    expect(gauge.null_reason).toBeNull();
  });

  it("FA-1c: adtv_unit and computed_as_of preserved from response", () => {
    const gauge = buildForeignAccumSection(mockForeignAccum);
    expect(gauge.adtv_unit).toBe("vnd_bn");
    expect(gauge.computed_as_of).toBe("2026-06-30T04:00:00.000Z");
  });

  it("FA-2: no tickers[] in output (NEVER forward arrays)", () => {
    const gauge = buildForeignAccumSection(mockForeignAccum) as unknown as Record<string, unknown>;
    expect("tickers" in gauge).toBe(false);
  });

  it("TIER-1d: foreign_accum source_tier = 3 (ARCH-RATIFY M3)", () => {
    const gauge = buildForeignAccumSection(mockForeignAccum);
    expect(gauge.source_tier).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full HTTP handler integration test
// ─────────────────────────────────────────────────────────────────────────────

describe("momentum-indicators — HTTP handler integration", () => {
  it("handles full success: 200 + valid DTO body", async () => {
    const fakeServerRes = makeRes();
    await handleGetMomentumIndicators(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      allGoodDeps(),
    );

    expect(fakeServerRes.statusCode).toBe(200);
    const body = JSON.parse(fakeServerRes.body) as MomentumIndicatorsDto;
    expect(body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.roc).not.toBeNull();
    expect(body.relative_strength).not.toBeNull();
    expect(body.proximity_52w).not.toBeNull();
    expect(body.foreign_accum).not.toBeNull();
  });

  it("handles partial failure: 200 + some sections null", async () => {
    const fakeServerRes = makeRes();
    await handleGetMomentumIndicators(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      {
        computeRoc: () => Promise.reject(new Error("TA service down")),
        computeRS: () => Promise.resolve(mockRS),
        compute52W: () => Promise.reject(new Error("TA service down")),
        computeForeignAccum: () => Promise.resolve(mockForeignAccum),
      },
    );

    expect(fakeServerRes.statusCode).toBe(200);
    const body = JSON.parse(fakeServerRes.body) as MomentumIndicatorsDto;
    expect(body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.roc).toBeNull();
    expect(body.relative_strength).not.toBeNull();
    expect(body.proximity_52w).toBeNull();
    expect(body.foreign_accum).not.toBeNull();
  });

  it("handles all failures: 200 + all sections null + generated_at set", async () => {
    const fakeServerRes = makeRes();
    await handleGetMomentumIndicators(
      fakeReq,
      fakeServerRes as unknown as ServerResponse,
      allFailDeps(),
    );

    expect(fakeServerRes.statusCode).toBe(200);
    const body = JSON.parse(fakeServerRes.body) as MomentumIndicatorsDto;
    expect(body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.roc).toBeNull();
    expect(body.relative_strength).toBeNull();
    expect(body.proximity_52w).toBeNull();
    expect(body.foreign_accum).toBeNull();
  });
});
