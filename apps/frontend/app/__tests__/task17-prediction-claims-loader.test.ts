/**
 * task17-prediction-claims-loader.test.ts
 *
 * Regression guards for /dashboard/prediction-claims.
 *
 * CRITICAL guards:
 *   - formatHitRate(null) === "Chưa có"  — NEVER "0%"
 *   - formatBrier(null) === "—"          — NEVER "0"
 *   - formatPrice(null) === "—"          — NEVER "0"
 *   - pending outcome → outcomeColorClass contains "slate", NOT "red"
 *   - directionLabel("bullish") === "Tăng" / ("bearish") === "Giảm" / ("neutral") === "Trung lập"
 *   - calibration with resolved=0, hitRate=null → loader returns hitRate:null (not 0)
 *     and formatHitRate renders "Chưa có" — divide-by-zero display guard
 *
 * Strategy: import named helpers directly (Remix strips loader in jsdom).
 * Same pattern as task17-agm-plan-actual-loader.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchPredictionClaimsData,
  formatHitRate,
  formatBrier,
  formatPrice,
  formatConfidence,
  directionLabel,
  directionColorClass,
  outcomeLabel,
  outcomeColorClass,
  computeLastScoredAt,
  formatHitRateDenominator,
  formatDispositionBreakdown,
  describeStaleness,
  resolveExclusionReason,
  STALE_THRESHOLD_DAYS,
  GENERIC_EXCLUSION_REASON,
  type PredictionClaim,
} from "~/routes/dashboard.prediction-claims";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const GENERATED_AT = "2026-06-11T10:00:00.000Z";

/** Calibration block with data (4 resolved, hitRate 0.75) */
const CALIBRATION_WITH_DATA = {
  total: 7,
  resolved: 4,
  correct: 3,
  wrong: 1,
  pending: 3,
  hitRate: 0.75,
  avgBrier: 0.137875,
};

/** Calibration block — zero resolved, hitRate null (divide-by-zero guard) */
const CALIBRATION_ZERO_RESOLVED = {
  total: 3,
  resolved: 0,
  correct: 0,
  wrong: 0,
  pending: 3,
  hitRate: null,
  avgBrier: null,
};

const CLAIM_CORRECT: {
  id: string;
  stock: string;
  agentId: string;
  claimText: string;
  direction: "bullish";
  targetPrice: number | null;
  creationPrice: number | null;
  confidence: number;
  resolutionDate: string;
  outcome: "correct";
  actualPrice: number | null;
  brierScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
} = {
  id: "pred-001",
  stock: "FPT",
  agentId: "analyst-agent",
  claimText: "FPT sẽ tăng 5% trong 2 tuần tới do kết quả kinh doanh tốt",
  direction: "bullish",
  targetPrice: 126000,
  creationPrice: 120000,
  confidence: 0.8,
  resolutionDate: "2026-06-25",
  outcome: "correct",
  actualPrice: 127500,
  brierScore: 0.04,
  createdAt: "2026-06-11T08:00:00.000Z",
  resolvedAt: "2026-06-25T15:00:00.000Z",
};

const CLAIM_PENDING: {
  id: string;
  stock: string;
  agentId: string;
  claimText: string;
  direction: "bearish";
  targetPrice: number | null;
  creationPrice: number | null;
  confidence: number;
  resolutionDate: string;
  outcome: "pending";
  actualPrice: number | null;
  brierScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
} = {
  id: "pred-002",
  stock: "VCB",
  agentId: "analyst-agent",
  claimText: "VCB có thể giảm nhẹ trước áp lực từ lãi suất",
  direction: "bearish",
  targetPrice: null,
  creationPrice: 88000,
  confidence: 0.55,
  resolutionDate: "2026-07-01",
  outcome: "pending",
  actualPrice: null,
  brierScore: null,
  createdAt: "2026-06-11T08:00:00.000Z",
  resolvedAt: null,
};

const CLAIM_WRONG: {
  id: string;
  stock: string;
  agentId: string;
  claimText: string;
  direction: "neutral";
  targetPrice: number | null;
  creationPrice: number | null;
  confidence: number;
  resolutionDate: string;
  outcome: "wrong";
  actualPrice: number | null;
  brierScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
} = {
  id: "pred-003",
  stock: "HPG",
  agentId: "analyst-agent",
  claimText: "HPG ổn định trong ngắn hạn",
  direction: "neutral",
  targetPrice: 32000,
  creationPrice: 31000,
  confidence: 0.6,
  resolutionDate: "2026-06-20",
  outcome: "wrong",
  actualPrice: 28500,
  brierScore: 0.36,
  createdAt: "2026-06-05T08:00:00.000Z",
  resolvedAt: "2026-06-20T15:00:00.000Z",
};

const DTO_WITH_DATA = {
  generatedAt: GENERATED_AT,
  calibration: CALIBRATION_WITH_DATA,
  claims: [CLAIM_CORRECT, CLAIM_PENDING, CLAIM_WRONG],
  count: 3,
};

const DTO_ZERO_RESOLVED = {
  generatedAt: GENERATED_AT,
  calibration: CALIBRATION_ZERO_RESOLVED,
  claims: [CLAIM_PENDING],
  count: 1,
};

const DTO_EMPTY = {
  generatedAt: GENERATED_AT,
  calibration: CALIBRATION_ZERO_RESOLVED,
  claims: [],
  count: 0,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Suite 1 — formatHitRate (CRITICAL null guard)
// ---------------------------------------------------------------------------

describe("formatHitRate — CRITICAL: null must render 'Chưa có', NEVER '0%'", () => {
  it("null → 'Chưa có'", () => {
    expect(formatHitRate(null)).toBe("Chưa có");
  });

  it("null → NOT '0%'", () => {
    expect(formatHitRate(null)).not.toBe("0%");
  });

  it("null → NOT '0'", () => {
    expect(formatHitRate(null)).not.toBe("0");
  });

  it("0.75 → '75%'", () => {
    expect(formatHitRate(0.75)).toBe("75%");
  });

  it("1.0 → '100%'", () => {
    expect(formatHitRate(1.0)).toBe("100%");
  });

  it("0 (explicit zero hitRate) → '0%', not 'Chưa có'", () => {
    // An explicit 0 (0 correct out of N resolved) is a real value, not null
    expect(formatHitRate(0)).toBe("0%");
    expect(formatHitRate(0)).not.toBe("Chưa có");
  });

  it("0.5 → '50%'", () => {
    expect(formatHitRate(0.5)).toBe("50%");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — formatBrier (null guard)
// ---------------------------------------------------------------------------

describe("formatBrier — null → '—', NEVER '0'", () => {
  it("null → '—'", () => {
    expect(formatBrier(null)).toBe("—");
  });

  it("null → NOT '0'", () => {
    expect(formatBrier(null)).not.toBe("0");
  });

  it("0.137875 → '0.1379'", () => {
    expect(formatBrier(0.137875)).toBe("0.1379");
  });

  it("0.04 → '0.0400'", () => {
    expect(formatBrier(0.04)).toBe("0.0400");
  });

  it("0.36 → '0.3600'", () => {
    expect(formatBrier(0.36)).toBe("0.3600");
  });

  it("0 (explicit zero) → '0.0000', not '—'", () => {
    expect(formatBrier(0)).toBe("0.0000");
    expect(formatBrier(0)).not.toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — formatPrice (null guard)
// ---------------------------------------------------------------------------

describe("formatPrice — null → '—', NEVER '0'", () => {
  it("null → '—'", () => {
    expect(formatPrice(null)).toBe("—");
  });

  it("null → NOT '0'", () => {
    expect(formatPrice(null)).not.toBe("0");
  });

  it("120000 → contains '120'", () => {
    const result = formatPrice(120000);
    expect(result).toContain("120");
  });

  it("0 (explicit zero) → NOT '—'", () => {
    expect(formatPrice(0)).not.toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — formatConfidence
// ---------------------------------------------------------------------------

describe("formatConfidence — 0-1 range to percentage", () => {
  it("0.8 → '80%'", () => {
    expect(formatConfidence(0.8)).toBe("80%");
  });

  it("0.55 → '55%'", () => {
    expect(formatConfidence(0.55)).toBe("55%");
  });

  it("1.0 → '100%'", () => {
    expect(formatConfidence(1.0)).toBe("100%");
  });

  it("0.0 → '0%'", () => {
    expect(formatConfidence(0.0)).toBe("0%");
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — directionLabel
// ---------------------------------------------------------------------------

describe("directionLabel — VN labels", () => {
  it("'bullish' → 'Tăng'", () => {
    expect(directionLabel("bullish")).toBe("Tăng");
  });

  it("'bearish' → 'Giảm'", () => {
    expect(directionLabel("bearish")).toBe("Giảm");
  });

  it("'neutral' → 'Trung lập'", () => {
    expect(directionLabel("neutral")).toBe("Trung lập");
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — directionColorClass
// ---------------------------------------------------------------------------

describe("directionColorClass — colour mapping", () => {
  it("'bullish' badge contains 'emerald' (green)", () => {
    expect(directionColorClass("bullish").badge).toContain("emerald");
  });

  it("'bearish' badge contains 'red'", () => {
    expect(directionColorClass("bearish").badge).toContain("red");
  });

  it("'neutral' badge contains 'slate' (grey)", () => {
    expect(directionColorClass("neutral").badge).toContain("slate");
  });

  it("'neutral' badge does NOT contain 'red'", () => {
    expect(directionColorClass("neutral").badge).not.toContain("red");
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — outcomeLabel
// ---------------------------------------------------------------------------

describe("outcomeLabel — VN labels", () => {
  it("'correct' → 'Đúng'", () => {
    expect(outcomeLabel("correct")).toBe("Đúng");
  });

  it("'wrong' → 'Sai'", () => {
    expect(outcomeLabel("wrong")).toBe("Sai");
  });

  it("'pending' → 'Đang chờ'", () => {
    expect(outcomeLabel("pending")).toBe("Đang chờ");
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — outcomeColorClass (CRITICAL: pending must be slate, NOT red)
// ---------------------------------------------------------------------------

describe("outcomeColorClass — CRITICAL: pending is slate/grey, NOT red", () => {
  it("'pending' badge contains 'slate'", () => {
    expect(outcomeColorClass("pending").badge).toContain("slate");
  });

  it("'pending' badge does NOT contain 'red'", () => {
    expect(outcomeColorClass("pending").badge).not.toContain("red");
  });

  it("'correct' badge contains 'emerald' (green)", () => {
    expect(outcomeColorClass("correct").badge).toContain("emerald");
  });

  it("'wrong' badge contains 'red'", () => {
    expect(outcomeColorClass("wrong").badge).toContain("red");
  });

  it("'wrong' badge does NOT contain 'slate'", () => {
    expect(outcomeColorClass("wrong").badge).not.toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — fetchPredictionClaimsData: happy path
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — 200 valid DTO", () => {
  it("returns claims and calibration, error null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_DATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.claims).toHaveLength(3);
    expect(data.count).toBe(3);
  });

  it("calibration block is parsed correctly (hitRate 0.75, avgBrier 0.137875)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_DATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.calibration.total).toBe(7);
    expect(data.calibration.resolved).toBe(4);
    expect(data.calibration.correct).toBe(3);
    expect(data.calibration.wrong).toBe(1);
    expect(data.calibration.pending).toBe(3);
    expect(data.calibration.hitRate).toBeCloseTo(0.75);
    expect(data.calibration.avgBrier).toBeCloseTo(0.137875);
  });

  it("forwards limit and outcome in query string", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(DTO_WITH_DATA), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await fetchPredictionClaimsData(ORIGIN, { limit: 50, outcome: "pending" });

    expect(capturedUrl).toContain("limit=50");
    expect(capturedUrl).toContain("outcome=pending");
  });

  it("claim fields preserved: stock, agentId, direction, outcome, confidence", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_DATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    const fpt = data.claims.find((c) => c.stock === "FPT");
    expect(fpt).toBeDefined();
    expect(fpt!.direction).toBe("bullish");
    expect(fpt!.outcome).toBe("correct");
    expect(fpt!.confidence).toBeCloseTo(0.8);
  });

  it("null prices preserved as null (not coerced to 0)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_DATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    const vcb = data.claims.find((c) => c.stock === "VCB");
    expect(vcb).toBeDefined();
    expect(vcb!.targetPrice).toBeNull();
    expect(vcb!.actualPrice).toBeNull();
    expect(vcb!.brierScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — CRITICAL: calibration with resolved=0, hitRate=null
// Divide-by-zero display guard — hitRate must stay null, not become 0
// ---------------------------------------------------------------------------

describe("CRITICAL: calibration with resolved=0 and hitRate=null", () => {
  it("hitRate remains null when resolved=0 (not coerced to 0)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_ZERO_RESOLVED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.calibration.resolved).toBe(0);
    expect(data.calibration.hitRate).toBeNull();
  });

  it("avgBrier remains null when resolved=0 (not coerced to 0)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_ZERO_RESOLVED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.calibration.avgBrier).toBeNull();
  });

  it("formatHitRate on null hitRate from loader → 'Chưa có', NEVER '0%'", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_ZERO_RESOLVED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    const rendered = formatHitRate(data.calibration.hitRate);
    expect(rendered).toBe("Chưa có");
    expect(rendered).not.toBe("0%");
    expect(rendered).not.toBe("0");
  });

  it("formatBrier on null avgBrier from loader → '—', NEVER '0'", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_ZERO_RESOLVED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    const rendered = formatBrier(data.calibration.avgBrier);
    expect(rendered).toBe("—");
    expect(rendered).not.toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Suite 11 — Empty state
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — empty state", () => {
  it("claims:[] + count 0 → error null, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_EMPTY), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.claims).toEqual([]);
    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 12 — Non-fatal: upstream HTTP errors
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → claims empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/502/);
  });

  it("503 upstream → claims empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).toMatch(/503/);
  });

  it("calibration is zeroed on upstream error", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", { status: 500, statusText: "Internal Server Error" })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.calibration.total).toBe(0);
    expect(data.calibration.resolved).toBe(0);
    expect(data.calibration.hitRate).toBeNull();
    expect(data.calibration.avgBrier).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 13 — Non-fatal: network failure
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — network failure (non-fatal)", () => {
  it("Error instance → message preserved, claims empty, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("non-Error throw → error string set, claims empty", async () => {
    global.fetch = vi.fn().mockRejectedValue("unknown string error");

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).not.toBeNull();
  });

  it("count is 0 on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14 — Unexpected JSON shape guard
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — unexpected JSON shape (non-fatal)", () => {
  it("null body 200 → empty claims, error null (parse(null) returns empty-shape)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).toBeNull();
  });

  it("object without 'claims' key → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "no claims here" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });
});

// ---------------------------------------------------------------------------
// Suite 14b — outcomeLabel("excluded") + outcomeColorClass("excluded")
// FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY: excluded claims must render
// "Loại trừ", NOT "Đang chờ", with a distinct zinc badge (not slate).
// ---------------------------------------------------------------------------

describe('outcomeLabel — excluded outcome (FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY)', () => {
  it('"excluded" → "Loại trừ"', () => {
    expect(outcomeLabel("excluded")).toBe("Loại trừ");
  });

  it('"excluded" → NOT "Đang chờ"', () => {
    expect(outcomeLabel("excluded")).not.toBe("Đang chờ");
  });

  it('"excluded" → NOT "Đúng"', () => {
    expect(outcomeLabel("excluded")).not.toBe("Đúng");
  });

  it('"excluded" → NOT "Sai"', () => {
    expect(outcomeLabel("excluded")).not.toBe("Sai");
  });
});

describe('outcomeColorClass — excluded is zinc (distinct from pending slate)', () => {
  it('"excluded" badge contains "zinc"', () => {
    expect(outcomeColorClass("excluded").badge).toContain("zinc");
  });

  it('"excluded" badge does NOT contain "slate" (distinct from pending)', () => {
    expect(outcomeColorClass("excluded").badge).not.toContain("slate");
  });

  it('"excluded" badge does NOT contain "red" (not an error state)', () => {
    expect(outcomeColorClass("excluded").badge).not.toContain("red");
  });

  it('"excluded" badge does NOT contain "emerald" (not a success state)', () => {
    expect(outcomeColorClass("excluded").badge).not.toContain("emerald");
  });

  it('"pending" badge still contains "slate" (unchanged by excluded addition)', () => {
    expect(outcomeColorClass("pending").badge).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 14c — calibration.excluded parsing
// ---------------------------------------------------------------------------

describe('calibration.excluded field — FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY', () => {
  it('parses excluded:3 from calibration block', async () => {
    const dtoWithExcluded = {
      generatedAt: GENERATED_AT,
      calibration: {
        total: 10,
        resolved: 4,
        correct: 3,
        wrong: 1,
        pending: 3,
        excluded: 3,
        hitRate: 0.75,
        avgBrier: 0.137875,
      },
      claims: [],
      count: 0,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(dtoWithExcluded), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.calibration.excluded).toBe(3);
  });

  it('defaults excluded to 0 when backend omits the field (backward-compat)', async () => {
    const dtoWithoutExcluded = {
      generatedAt: GENERATED_AT,
      calibration: {
        total: 7,
        resolved: 4,
        correct: 3,
        wrong: 1,
        pending: 3,
        hitRate: 0.75,
        avgBrier: 0.137875,
      },
      claims: [],
      count: 0,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(dtoWithoutExcluded), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.calibration.excluded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15 — outcomeFilter propagation
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — outcomeFilter propagation", () => {
  it("outcome param is echoed back in outcomeFilter field", async () => {
    // FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY: an outcome filter now triggers
    // TWO fetches (unfiltered context + filtered display) — mockImplementation
    // constructs a fresh Response per call (a single reused Response instance
    // would throw "Body already read" on the second .json() call).
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify(DTO_WITH_DATA), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );

    const data = await fetchPredictionClaimsData(ORIGIN, { outcome: "pending" });

    expect(data.outcomeFilter).toBe("pending");
  });

  it("no outcome param → outcomeFilter is null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_DATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.outcomeFilter).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 16 — formatHitRateDenominator (FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY a)
// ---------------------------------------------------------------------------

describe("formatHitRateDenominator — inline denominator text (a)", () => {
  it("resolved=0 → empty string (no redundant '0 đúng / 0 sai trên 0')", () => {
    expect(
      formatHitRateDenominator({
        total: 3,
        resolved: 0,
        correct: 0,
        wrong: 0,
        pending: 3,
        excluded: 0,
        hitRate: null,
        avgBrier: null,
      })
    ).toBe("");
  });

  it("live-shaped calibration (4/2/6) → '4 đúng / 2 sai trên 6 dự báo đã chấm điểm'", () => {
    expect(
      formatHitRateDenominator({
        total: 17,
        resolved: 6,
        correct: 4,
        wrong: 2,
        pending: 5,
        excluded: 6,
        hitRate: 0.6666666666666666,
        avgBrier: 0.2135,
      })
    ).toBe("4 đúng / 2 sai trên 6 dự báo đã chấm điểm");
  });

  it("no hardcoded numbers — tracks whatever calibration fields say", () => {
    expect(
      formatHitRateDenominator({
        total: 40,
        resolved: 20,
        correct: 12,
        wrong: 8,
        pending: 9,
        excluded: 11,
        hitRate: 0.6,
        avgBrier: 0.1,
      })
    ).toBe("12 đúng / 8 sai trên 20 dự báo đã chấm điểm");
  });
});

// ---------------------------------------------------------------------------
// Suite 17 — formatDispositionBreakdown (FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY d)
// ---------------------------------------------------------------------------

describe("formatDispositionBreakdown — buckets always sum to total (d)", () => {
  it("live-shaped calibration (17=4+2+5+6)", () => {
    expect(
      formatDispositionBreakdown({
        total: 17,
        resolved: 6,
        correct: 4,
        wrong: 2,
        pending: 5,
        excluded: 6,
        hitRate: 0.6666666666666666,
        avgBrier: 0.2135,
      })
    ).toBe("17 tổng = 4 đúng + 2 sai + 5 đang chờ + 6 loại trừ");
  });

  it("mutated fixture — excluded=11, hitRate=null still renders an honest breakdown", () => {
    expect(
      formatDispositionBreakdown({
        total: 20,
        resolved: 0,
        correct: 0,
        wrong: 0,
        pending: 9,
        excluded: 11,
        hitRate: null,
        avgBrier: null,
      })
    ).toBe("20 tổng = 0 đúng + 0 sai + 9 đang chờ + 11 loại trừ");
  });

  it("all-zero calibration renders '0 tổng = 0 đúng + 0 sai + 0 đang chờ + 0 loại trừ'", () => {
    expect(
      formatDispositionBreakdown({
        total: 0,
        resolved: 0,
        correct: 0,
        wrong: 0,
        pending: 0,
        excluded: 0,
        hitRate: null,
        avgBrier: null,
      })
    ).toBe("0 tổng = 0 đúng + 0 sai + 0 đang chờ + 0 loại trừ");
  });
});

// ---------------------------------------------------------------------------
// Suite 18 — computeLastScoredAt (FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY b)
// ---------------------------------------------------------------------------

function claim(overrides: Partial<PredictionClaim>): PredictionClaim {
  return {
    id: "pred-x",
    stock: "FPT",
    agentId: "agent",
    claimText: "text",
    direction: "neutral",
    targetPrice: null,
    creationPrice: null,
    confidence: 0.5,
    resolutionDate: "2026-06-01",
    outcome: "pending",
    actualPrice: null,
    brierScore: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

describe("computeLastScoredAt — most recent SCORED (correct/wrong) resolvedAt", () => {
  it("picks the max resolvedAt among correct/wrong claims", () => {
    const claims = [
      claim({ outcome: "correct", resolvedAt: "2026-05-03T15:00:00.000Z" }),
      claim({ outcome: "wrong", resolvedAt: "2026-06-21T16:35:00.852Z" }),
      claim({ outcome: "correct", resolvedAt: "2026-04-27T10:00:00.000Z" }),
    ];
    expect(computeLastScoredAt(claims)).toBe("2026-06-21T16:35:00.852Z");
  });

  it("REGRESSION GUARD: ignores 'excluded' resolvedAt even when it is the latest timestamp", () => {
    // excludeClaim() sets resolved_at=now on exclusion (predictionClaimStore.ts) —
    // that is NOT a scoring event and must never be read as "last scored".
    const claims = [
      claim({ outcome: "correct", resolvedAt: "2026-06-21T16:35:00.852Z" }),
      claim({ outcome: "excluded", resolvedAt: "2026-07-24T16:35:00.852Z" }),
    ];
    expect(computeLastScoredAt(claims)).toBe("2026-06-21T16:35:00.852Z");
  });

  it("ignores 'pending' claims (resolvedAt is null by definition)", () => {
    const claims = [claim({ outcome: "pending", resolvedAt: null })];
    expect(computeLastScoredAt(claims)).toBeNull();
  });

  it("empty claims array → null", () => {
    expect(computeLastScoredAt([])).toBeNull();
  });

  it("no correct/wrong claims present → null", () => {
    const claims = [
      claim({ outcome: "pending", resolvedAt: null }),
      claim({ outcome: "excluded", resolvedAt: "2026-06-21T16:35:00.852Z" }),
    ];
    expect(computeLastScoredAt(claims)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 19 — describeStaleness (FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY b)
// ---------------------------------------------------------------------------

describe("describeStaleness — data-driven marker, never hardcoded", () => {
  it("lastScoredAt=null → null (nothing to render; 'Chưa có' badge already covers it)", () => {
    expect(describeStaleness(null)).toBeNull();
  });

  it("unparseable date string → null (defensive, never throws)", () => {
    expect(describeStaleness("not-a-date")).toBeNull();
  });

  it("fresh (1 day old) → isStale=false, neutral label", () => {
    const now = new Date("2026-06-22T00:00:00.000Z");
    const result = describeStaleness("2026-06-21T16:35:00.852Z", now);
    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(false);
    expect(result!.label).toContain("Lần chấm điểm gần nhất");
  });

  it(`stale (> ${STALE_THRESHOLD_DAYS} days old, live root_cause scenario) → isStale=true, warning label`, () => {
    // Live scenario: last scored 2026-06-21, "now" is 2026-07-25 (34 days) —
    // exactly the frozen-for-over-a-month case that motivated this task.
    const now = new Date("2026-07-25T13:15:00.000Z");
    const result = describeStaleness("2026-06-21T16:35:00.852Z", now);
    expect(result).not.toBeNull();
    expect(result!.isStale).toBe(true);
    expect(result!.label).toContain("Chưa có dự báo nào được chấm điểm");
    expect(result!.label).toMatch(/\d+ ngày trước/);
  });

  it(`boundary — exactly ${STALE_THRESHOLD_DAYS} days old → NOT stale (uses '>' not '>=')`, () => {
    const lastScored = "2026-06-21T00:00:00.000Z";
    const now = new Date(
      new Date(lastScored).getTime() + STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
    );
    const result = describeStaleness(lastScored, now);
    expect(result!.isStale).toBe(false);
  });

  it("label always derives the date from the input — no hardcoded date string", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const r1 = describeStaleness("2026-06-01T00:00:00.000Z", now);
    const r2 = describeStaleness("2026-07-15T00:00:00.000Z", now);
    expect(r1!.label).not.toBe(r2!.label);
  });
});

// ---------------------------------------------------------------------------
// Suite 20 — resolveExclusionReason (FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY c)
// ---------------------------------------------------------------------------

describe("resolveExclusionReason — consume machine-readable reason where present (c)", () => {
  it("uses claim.exclusionReason when present and non-empty", () => {
    const reason = "Không có dữ liệu giá OHLCV cho mã này vào ngày tạo dự báo.";
    expect(resolveExclusionReason({ exclusionReason: reason })).toBe(reason);
  });

  it("falls back to GENERIC_EXCLUSION_REASON when exclusionReason is undefined", () => {
    expect(resolveExclusionReason({})).toBe(GENERIC_EXCLUSION_REASON);
  });

  it("falls back to GENERIC_EXCLUSION_REASON when exclusionReason is null", () => {
    expect(resolveExclusionReason({ exclusionReason: null })).toBe(GENERIC_EXCLUSION_REASON);
  });

  it("falls back to GENERIC_EXCLUSION_REASON when exclusionReason is an empty string", () => {
    expect(resolveExclusionReason({ exclusionReason: "" })).toBe(GENERIC_EXCLUSION_REASON);
  });

  it("falls back to GENERIC_EXCLUSION_REASON when exclusionReason is whitespace-only", () => {
    expect(resolveExclusionReason({ exclusionReason: "   " })).toBe(GENERIC_EXCLUSION_REASON);
  });

  it("does NOT assume the field is present on every row (mixed population)", () => {
    const withReason = resolveExclusionReason({ exclusionReason: "custom reason" });
    const withoutReason = resolveExclusionReason({});
    expect(withReason).not.toBe(withoutReason);
  });
});

// ---------------------------------------------------------------------------
// Suite 21 — fetchPredictionClaimsData: lastScoredAt survives outcome filtering
// (the core correctness fix — CalibrationBanner is rendered on EVERY filter
// tab, so lastScoredAt must reflect the full population, not the filtered
// display list).
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — lastScoredAt derived from unfiltered context, not the filtered display list", () => {
  const FULL_DTO = {
    generatedAt: GENERATED_AT,
    calibration: {
      total: 17,
      resolved: 6,
      correct: 4,
      wrong: 2,
      pending: 5,
      excluded: 6,
      hitRate: 0.6666666666666666,
      avgBrier: 0.2135,
    },
    claims: [
      { ...CLAIM_CORRECT, resolvedAt: "2026-06-21T16:35:00.852Z" },
      { ...CLAIM_PENDING, outcome: "pending", resolvedAt: null },
    ],
    count: 2,
  };

  const PENDING_ONLY_DTO = {
    generatedAt: GENERATED_AT,
    calibration: FULL_DTO.calibration,
    claims: [{ ...CLAIM_PENDING, outcome: "pending", resolvedAt: null }],
    count: 1,
  };

  it("outcome=pending view still reports the true lastScoredAt from the unfiltered context fetch", async () => {
    const capturedUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      const body = url.includes("outcome=pending") ? PENDING_ONLY_DTO : FULL_DTO;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const data = await fetchPredictionClaimsData(ORIGIN, { outcome: "pending" });

    // Display list respects the active filter (pending only).
    expect(data.claims).toHaveLength(1);
    expect(data.claims[0]!.outcome).toBe("pending");

    // But lastScoredAt is NOT null — it came from the unfiltered context call,
    // which still has the correct/wrong rows the filtered response lacks.
    expect(data.lastScoredAt).toBe("2026-06-21T16:35:00.852Z");

    // Two calls were made: first unfiltered (no "outcome="), second filtered.
    expect(capturedUrls).toHaveLength(2);
    expect(capturedUrls[0]).not.toContain("outcome=");
    expect(capturedUrls[1]).toContain("outcome=pending");
  });

  it("unfiltered ('Tất cả') view makes exactly one fetch call", async () => {
    const capturedUrls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify(FULL_DTO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(capturedUrls).toHaveLength(1);
    expect(data.lastScoredAt).toBe("2026-06-21T16:35:00.852Z");
  });
});
