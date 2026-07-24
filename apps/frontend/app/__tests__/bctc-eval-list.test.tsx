/**
 * Vitest component tests — BCTC Eval list view
 *
 * Covers:
 * 1. loadBctcEvalListData — HTTP 200 valid response — resolves ok:true with reports
 * 2. loadBctcEvalListData — upstream 4xx/5xx and network error — resolves ok:false,
 *    NEVER throws (FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX regression lock: this is the
 *    JSDoc contract the route violated before the fix — "do NOT throw")
 * 3. loadBctcEvalListData — partial stage_statuses (live contract: a report only
 *    carries keys for stages actually computed) — resolves ok:true, no throw
 * 4. Schema version mismatch — resolves ok:false
 * 5. fetchBctcEvalList — HTTP 200 valid response maps correctly
 * 6. fetchBctcEvalList — API error is caught and bubbled as BctcEvalApiError
 * 7. StatusBadge — missing/unrecognized status renders a neutral placeholder
 *    instead of throwing (FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX: this is the actual
 *    live root cause of the 500 — TypeError destructuring STATUS_CONFIG[undefined]
 *    when a report's stage_statuses omits a not-yet-computed stage key)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  fetchBctcEvalList,
  BctcEvalApiError,
} from "~/lib/api/bctc-eval-client";
import { loadBctcEvalListData } from "~/routes/dashboard.bctc-eval._index";
import { StatusBadge } from "~/components/bctc-eval/StatusBadge";
import type { EvalListResponse } from "~/domain/bctc-eval";

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

function makeListResponse(overrides: Partial<EvalListResponse> = {}): EvalListResponse {
  return {
    schema_version: "1",
    generated_at: "2026-05-28T08:00:00Z",
    sort: "trust_ascending",
    thresholds_version: "v1",
    reports: [
      {
        report_id: "aaaaaaaa-0001-0001-0001-000000000001",
        ticker: "VHM",
        period: "Q1-2025",
        overall_status: "red",
        stage_statuses: {
          "1_RASTERIZE": "green",
          "2_LAYOUT_DETECT": "green",
          "3_OCR": "red",
          "4_TABLE_RECONSTRUCT": "red",
          "5_MARKDOWN_RENDER": "green",
          "6_STRUCTURED_EXTRACT": "green",
        },
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
        is_stale: false,
      },
      {
        report_id: "bbbbbbbb-0002-0002-0002-000000000002",
        ticker: "MWG",
        period: "Q2-2025",
        overall_status: "yellow",
        stage_statuses: {
          "1_RASTERIZE": "green",
          "2_LAYOUT_DETECT": "green",
          "3_OCR": "green",
          "4_TABLE_RECONSTRUCT": "yellow",
          "5_MARKDOWN_RENDER": "green",
          "6_STRUCTURED_EXTRACT": "yellow",
        },
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
        is_stale: true,
      },
      {
        report_id: "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
        ticker: "FPT",
        period: "Q4-2025",
        overall_status: "green",
        stage_statuses: {
          "1_RASTERIZE": "green",
          "2_LAYOUT_DETECT": "green",
          "3_OCR": "green",
          "4_TABLE_RECONSTRUCT": "green",
          "5_MARKDOWN_RENDER": "green",
          "6_STRUCTURED_EXTRACT": "yellow",
        },
        detector_version: "v1",
        computed_at: "2026-05-28T07:00:00Z",
        is_stale: false,
      },
    ],
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// 1. fetchBctcEvalList — HTTP 200 valid response
// --------------------------------------------------------------------------

describe("fetchBctcEvalList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("HTTP 200 — returns EvalListResponse with 3 reports", async () => {
    const mockData = makeListResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn();

    expect(result.schema_version).toBe("1");
    expect(result.reports).toHaveLength(3);
    expect(result.sort).toBe("trust_ascending");
    expect(result.thresholds_version).toBe("v1");
  });

  it("HTTP 200 — reports preserve server sort order (red, yellow, green)", async () => {
    const mockData = makeListResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn();

    expect(result.reports[0].overall_status).toBe("red");
    expect(result.reports[1].overall_status).toBe("yellow");
    expect(result.reports[2].overall_status).toBe("green");
  });

  it("HTTP 200 — stale flag preserved per report", async () => {
    const mockData = makeListResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn();

    expect(result.reports[0].is_stale).toBe(false);  // red, not stale
    expect(result.reports[1].is_stale).toBe(true);   // yellow, stale
    expect(result.reports[2].is_stale).toBe(false);  // green, not stale
  });

  it("HTTP 500 — throws BctcEvalApiError with status 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    await expect(fn()).rejects.toBeInstanceOf(BctcEvalApiError);
  });

  it("network error — throws (not swallowed)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Network failure")));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    await expect(fn()).rejects.toThrow("Network failure");
  });
});

// --------------------------------------------------------------------------
// 1b. loadBctcEvalListData (route loader helper) — graceful degradation
//     contract: fetchBctcEvalList (above) throws on upstream error, but the
//     loader layer MUST catch it and resolve ok:false — never let it bubble
//     to the Remix root error boundary (that bubble is what produced the
//     live 500 the PO reported before this fix; see StatusBadge suite below
//     for the ACTUAL crash site that caused it).
// --------------------------------------------------------------------------

describe("loadBctcEvalListData — loader never throws on upstream error", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("HTTP 200 valid response — resolves ok:true with reports", async () => {
    const mockData = makeListResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const data = await loadBctcEvalListData();

    expect(data.ok).toBe(true);
    if (data.ok) {
      expect(data.reports).toHaveLength(3);
      expect(data.sort).toBe("trust_ascending");
    }
  });

  it("upstream 404 — resolves { ok: false, error } — does NOT throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }));

    const data = await loadBctcEvalListData();

    expect(data.ok).toBe(false);
    if (!data.ok) {
      expect(data.error).toMatch(/404/);
    }
  });

  it("upstream 500 — resolves { ok: false, error } — does NOT throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }));

    const data = await loadBctcEvalListData();

    expect(data.ok).toBe(false);
    if (!data.ok) {
      expect(data.error).toMatch(/500/);
    }
  });

  it("network error (fetch rejects) — resolves { ok: false, error } — does NOT throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")));

    const data = await loadBctcEvalListData();

    expect(data.ok).toBe(false);
    if (!data.ok) {
      expect(data.error).toContain("ECONNREFUSED");
    }
  });

  it("schema_version mismatch — resolves { ok: false, error } — does NOT throw", async () => {
    const mockData = makeListResponse({ schema_version: "99" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const data = await loadBctcEvalListData();

    expect(data.ok).toBe(false);
  });

  it("HTTP 200 — report with PARTIAL stage_statuses (live payload shape: only " +
    "stages 4-6 computed, mirrors verified MBB/Q1-2026 row) resolves ok:true, no throw", async () => {
    const mockData = makeListResponse({
      reports: [
        {
          report_id: "1d94c902-a6b6-460b-a995-0f9cdb42e445",
          ticker: "MBB",
          period: "Q1-2026",
          overall_status: "red",
          stage_statuses: {
            "4_TABLE_RECONSTRUCT": "red",
            "5_MARKDOWN_RENDER": "yellow",
            "6_STRUCTURED_EXTRACT": "yellow",
          },
          detector_version: "v1",
          computed_at: "2026-07-20 09:06:41",
          is_stale: false,
        },
      ],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const data = await loadBctcEvalListData();

    expect(data.ok).toBe(true);
    if (data.ok) {
      expect(data.reports[0].stage_statuses["1_RASTERIZE"]).toBeUndefined();
      expect(data.reports[0].stage_statuses["4_TABLE_RECONSTRUCT"]).toBe("red");
    }
  });
});

// --------------------------------------------------------------------------
// 2. Schema version validation
// --------------------------------------------------------------------------

describe("schema_version contract", () => {
  it("schema_version='1' is accepted", async () => {
    const mockData = makeListResponse({ schema_version: "1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn();
    expect(result.schema_version).toBe("1");
  });

  it("a mismatched schema_version is returned as-is (loader checks)", async () => {
    const mockData = makeListResponse({ schema_version: "99" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn();
    // API client passes through; loader is responsible for schema_version check
    expect(result.schema_version).toBe("99");
  });
});

// --------------------------------------------------------------------------
// 3. Stage statuses shape
//    NOTE: keys are OPTIONAL on the wire (see domain/bctc-eval.ts). This
//    fixture happens to populate all 6 for the "fully computed" case; the
//    partial-key case (some reports only have 3 of 6) is covered above in
//    "loadBctcEvalListData" and below in "StatusBadge".
// --------------------------------------------------------------------------

describe("stage_statuses shape", () => {
  it("all 6 stage keys present on a fully-computed report", async () => {
    const mockData = makeListResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    }));

    const { fetchBctcEvalList: fn } = await import("~/lib/api/bctc-eval-client");
    const result = await fn();

    const expectedKeys = [
      "1_RASTERIZE",
      "2_LAYOUT_DETECT",
      "3_OCR",
      "4_TABLE_RECONSTRUCT",
      "5_MARKDOWN_RENDER",
      "6_STRUCTURED_EXTRACT",
    ];

    for (const report of result.reports) {
      for (const key of expectedKeys) {
        expect(Object.keys(report.stage_statuses)).toContain(key);
      }
    }
  });
});

// --------------------------------------------------------------------------
// 4. BctcEvalApiError
// --------------------------------------------------------------------------

describe("BctcEvalApiError", () => {
  it("has correct status and name", () => {
    const err = new BctcEvalApiError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.name).toBe("BctcEvalApiError");
    expect(err.message).toBe("Not found");
    expect(err instanceof Error).toBe(true);
  });
});

// --------------------------------------------------------------------------
// 5. StatusBadge — missing/unrecognized status (FE-PG-BCTC-EVAL-_INDEX-FUNC-FIX)
//
// Live-verified root cause of the reported 500: EvalTable iterates all 6
// STAGE_KEYS and reads r.stage_statuses[key]; for a report whose pipeline
// only ran stages 4-6 (real production data — see docker logs, MBB Q1-2026),
// keys 1-3 are absent → status is undefined → the OLD StatusBadge did
// `STATUS_CONFIG[status]` and crashed on destructuring `undefined`, which
// bubbled through SSR render to the Remix root error boundary (500).
// StatusBadge is a leaf component with no Remix router hooks, so it can be
// rendered directly here without a Router/RemixStub wrapper.
// --------------------------------------------------------------------------

describe("StatusBadge — missing status (live contract: stage not yet computed)", () => {
  it("status=undefined does NOT throw", () => {
    expect(() => render(<StatusBadge status={undefined} />)).not.toThrow();
  });

  it("status=undefined renders a neutral em-dash placeholder, not a crash", () => {
    render(<StatusBadge status={undefined} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("valid status still renders its label (regression guard — fix must not break the happy path)", () => {
    render(<StatusBadge status="red" />);
    expect(screen.getByText("Red")).toBeTruthy();
  });

  it("green/yellow statuses still render correct labels (regression guard)", () => {
    const { unmount } = render(<StatusBadge status="green" />);
    expect(screen.getByText("Green")).toBeTruthy();
    unmount();
    render(<StatusBadge status="yellow" />);
    expect(screen.getByText("Yellow")).toBeTruthy();
  });
});
