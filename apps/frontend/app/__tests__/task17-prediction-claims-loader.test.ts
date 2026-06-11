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

  it("non-Error throw → fallback Vietnamese message, claims empty", async () => {
    global.fetch = vi.fn().mockRejectedValue("unknown string error");

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).toBe(
      "Không thể kết nối tới máy chủ dữ liệu dự báo AI"
    );
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
  it("null body → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchPredictionClaimsData(ORIGIN);

    expect(data.claims).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
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
// Suite 15 — outcomeFilter propagation
// ---------------------------------------------------------------------------

describe("fetchPredictionClaimsData — outcomeFilter propagation", () => {
  it("outcome param is echoed back in outcomeFilter field", async () => {
    global.fetch = vi.fn().mockResolvedValue(
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
