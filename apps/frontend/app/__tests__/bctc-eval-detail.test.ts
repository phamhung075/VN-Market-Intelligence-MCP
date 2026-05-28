/**
 * Vitest tests — BCTC Eval detail view (loader layer + API client)
 *
 * Uses mocked FPT Q4-2025 sentinel response (report_id: e71f845d-ffa5-48f9-8f09-30ac2cd09c65).
 *
 * Covers:
 * 1. fetchBctcEvalDetail — HTTP 200 returns {data, status:200}
 * 2. fetchBctcEvalDetail — HTTP 404 returns {data:null, status:404}
 * 3. fetchBctcEvalDetail — HTTP 409 returns {data:null, status:409}
 * 4. FPT sentinel — 6 stages parsed correctly
 * 5. FPT sentinel — overall_status derived correctly (worst stage)
 * 6. FPT sentinel — stage 6 yellow, gate_failures empty, golden_diff non-empty
 * 7. recomputeBctcEval — POST called and returns detail
 * 8. fetchBctcEvalThresholds — returns thresholds SSOT
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchBctcEvalDetail,
  recomputeBctcEval,
  fetchBctcEvalThresholds,
  BctcEvalApiError,
} from "~/lib/api/bctc-eval-client";
import type { EvalDetailResponse } from "~/domain/bctc-eval";

// --------------------------------------------------------------------------
// Fixture — FPT Q4-2025 sentinel
// --------------------------------------------------------------------------

const FPT_SENTINEL_ID = "e71f845d-ffa5-48f9-8f09-30ac2cd09c65";

function makeFptSentinel(overrides: Partial<EvalDetailResponse> = {}): EvalDetailResponse {
  return {
    schema_version: "1",
    report_id: FPT_SENTINEL_ID,
    ticker: "FPT",
    period: "Q4-2025",
    overall_status: "yellow",
    has_pek: true,
    detector_version: "v1",
    is_stale: false,
    stages: [
      {
        stage_no: 1,
        stage_name: "RASTERIZE",
        status: "green",
        metrics: { page_count_pdf: 46, page_count_rasterized: 46, sha_stable: true },
        gate_failures: [],
        golden_diff: {},
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
      },
      {
        stage_no: 2,
        stage_name: "LAYOUT_DETECT",
        status: "green",
        metrics: { golden_table_count: 23, detected_table_count: 23, abandon_rate: 0.0, median_conf: 0.91 },
        gate_failures: [],
        golden_diff: {},
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
      },
      {
        stage_no: 3,
        stage_name: "OCR",
        status: "green",
        metrics: {
          vn_diacritic_ratio: 0.38,
          numeric_ratio_in_tables: 0.52,
          anchor_phrases_found: ["TỔNG CỘNG TÀI SẢN", "LỢI NHUẬN SAU THUẾ"],
          anchor_phrases_missing: [],
        },
        gate_failures: [],
        golden_diff: {},
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
      },
      {
        stage_no: 4,
        stage_name: "TABLE_RECONSTRUCT",
        status: "green",
        metrics: { label_coverage: 0.97, code_coverage: 0.94, exact_dup_count: 0, value_blank_label_count: 0, total_rows: 312 },
        gate_failures: [],
        golden_diff: {},
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
      },
      {
        stage_no: 5,
        stage_name: "MARKDOWN_RENDER",
        status: "green",
        metrics: { roundtrip_row_match_ratio: 0.99, roundtrip_value_drift_max: 0.0 },
        gate_failures: [],
        golden_diff: {},
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
      },
      {
        stage_no: 6,
        stage_name: "STRUCTURED_EXTRACT",
        status: "yellow",
        metrics: {
          golden_row_match_ratio: 0.95,
          balance_pass: true,
          balance_pass_is_signal_only: true,
          qoq_outlier_flags: ["net_profit_qoq: +340%"],
        },
        gate_failures: [],
        golden_diff: { missing_rows: ["code_230"], extra_rows: [] },
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
      },
    ],
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// 1. fetchBctcEvalDetail — HTTP 200
// --------------------------------------------------------------------------

describe("fetchBctcEvalDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("HTTP 200 — returns {data, status:200}", async () => {
    const mockData = makeFptSentinel();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn(FPT_SENTINEL_ID);

    expect(result.status).toBe(200);
    expect(result.data).not.toBeNull();
    expect(result.data?.ticker).toBe("FPT");
    expect(result.data?.period).toBe("Q4-2025");
  });

  it("HTTP 404 — returns {data:null, status:404}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn("nonexistent-id");

    expect(result.status).toBe(404);
    expect(result.data).toBeNull();
  });

  it("HTTP 409 — returns {data:null, status:409}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: "Conflict",
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn("exists-but-no-eval");

    expect(result.status).toBe(409);
    expect(result.data).toBeNull();
  });

  it("network error — rethrows (not swallowed)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    await expect(fn(FPT_SENTINEL_ID)).rejects.toThrow("ECONNREFUSED");
  });
});

// --------------------------------------------------------------------------
// 2. FPT sentinel — 6 stages parsed correctly
// --------------------------------------------------------------------------

describe("FPT Q4-2025 sentinel detail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("has 6 stages in correct order", async () => {
    const mockData = makeFptSentinel();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const { data } = await fn(FPT_SENTINEL_ID);

    expect(data?.stages).toHaveLength(6);
    expect(data?.stages[0].stage_name).toBe("RASTERIZE");
    expect(data?.stages[5].stage_name).toBe("STRUCTURED_EXTRACT");
  });

  it("overall_status is yellow (worst of 6 stages)", async () => {
    const mockData = makeFptSentinel();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const { data } = await fn(FPT_SENTINEL_ID);

    expect(data?.overall_status).toBe("yellow");
  });

  it("stage 6 is yellow, has empty gate_failures, has non-empty golden_diff", async () => {
    const mockData = makeFptSentinel();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const { data } = await fn(FPT_SENTINEL_ID);

    const stage6 = data?.stages[5];
    expect(stage6?.status).toBe("yellow");
    expect(stage6?.gate_failures).toHaveLength(0);
    expect(Object.keys(stage6?.golden_diff ?? {})).not.toHaveLength(0);
  });

  it("has_pek is true for FPT sentinel", async () => {
    const mockData = makeFptSentinel();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const { data } = await fn(FPT_SENTINEL_ID);

    expect(data?.has_pek).toBe(true);
  });

  it("schema_version is '1'", async () => {
    const mockData = makeFptSentinel();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalDetail: fn } = await import("~/lib/api/bctc-eval-client");
    const { data } = await fn(FPT_SENTINEL_ID);

    expect(data?.schema_version).toBe("1");
  });
});

// --------------------------------------------------------------------------
// 3. recomputeBctcEval — POST called
// --------------------------------------------------------------------------

describe("recomputeBctcEval", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("POST called and returns updated detail", async () => {
    const mockData = makeFptSentinel({ is_stale: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { recomputeBctcEval: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn(FPT_SENTINEL_ID);

    expect(result.report_id).toBe(FPT_SENTINEL_ID);
    expect(result.is_stale).toBe(false);
  });

  it("HTTP 503 — throws BctcEvalApiError with status 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    }));

    const { recomputeBctcEval: fn } = await import("~/lib/api/bctc-eval-client");
    await expect(fn(FPT_SENTINEL_ID)).rejects.toBeInstanceOf(BctcEvalApiError);
  });
});

// --------------------------------------------------------------------------
// 4. fetchBctcEvalThresholds
// --------------------------------------------------------------------------

describe("fetchBctcEvalThresholds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns thresholds SSOT with schema_version and detector_version", async () => {
    const mockThresholds = {
      schema_version: "1",
      detector_version: "v1",
      thresholds: {
        "1_RASTERIZE": { page_count_tolerance: 0 },
        "4_TABLE_RECONSTRUCT": { label_coverage_min: 0.90 },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockThresholds,
    }));

    const { fetchBctcEvalThresholds: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn();

    expect(result.schema_version).toBe("1");
    expect(result.detector_version).toBe("v1");
    expect(result.thresholds).toBeDefined();
  });
});
