/**
 * task17-agm-plan-actual-loader.test.ts
 *
 * Tests the non-fatal loader behaviour for /dashboard/agm-plan-actual.
 *
 * CRITICAL regression guard: IN_PROGRESS rows (open year) MUST format as
 * "Đang thực hiện" / "—" — NEVER as "0" / "0%" / red BEHIND indicator.
 *
 * Strategy: import fetchAgmPlanActualData + formatTy + formatPct +
 * formatCompletion + statusLabel + statusColorClass directly (named exports).
 * Remix strips `loader` in jsdom; named helpers bypass that — same pattern
 * as task17-foreign-flow-loader.test.ts.
 *
 * Fixtures mirror production shape:
 *   - FPT 2024: EXCEEDED Doanh thu (plan 61850, actual 62962, 101.8%)
 *   - HPG 2023: BEHIND Doanh thu (plan 100000, actual 80200, 80.2%)
 *   - VCB 2026: IN_PROGRESS — actual_ty null, completion_pct null
 *
 * The IN_PROGRESS fixture is the REGRESSION GUARD — assert "—" and
 * "Đang thực hiện", assert NOT "0" and NOT "0%".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAgmPlanActualData,
  formatTy,
  formatPct,
  formatCompletion,
  statusLabel,
  statusColorClass,
} from "~/routes/dashboard.agm-plan-actual";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const GENERATED_AT = "2026-06-11T10:00:00.000Z";

/** FPT 2024 Doanh thu — EXCEEDED: plan 61850, actual 62962.652, 101.8% */
const METRIC_FPT_DT_EXCEEDED = {
  ptid: 5,
  label: "Doanh thu",
  plan_ty: 61850,
  actual_ty: 62962.652,
  completion_pct: 101.8,
  status: "EXCEEDED" as const,
  ytd_ty: null,
  ytd_term_id: null,
};

/** FPT 2024 LN sau thuế — ON_TRACK */
const METRIC_FPT_LNST_ON_TRACK = {
  ptid: 9,
  label: "Lợi nhuận sau thuế",
  plan_ty: 8000,
  actual_ty: 7800,
  completion_pct: 97.5,
  status: "ON_TRACK" as const,
  ytd_ty: null,
  ytd_term_id: null,
};

/** HPG 2023 Doanh thu — BEHIND: 80.2% */
const METRIC_HPG_DT_BEHIND = {
  ptid: 5,
  label: "Doanh thu",
  plan_ty: 100000,
  actual_ty: 80200,
  completion_pct: 80.2,
  status: "BEHIND" as const,
  ytd_ty: null,
  ytd_term_id: null,
};

/**
 * VCB 2026 Doanh thu — IN_PROGRESS: open year.
 * actual_ty null, completion_pct null — CRITICAL null tolerance fixture.
 */
const METRIC_VCB_DT_IN_PROGRESS = {
  ptid: 5,
  label: "Doanh thu",
  plan_ty: 90000,
  actual_ty: null,
  completion_pct: null,
  status: "IN_PROGRESS" as const,
  ytd_ty: 42000,
  ytd_term_id: 2,
};

/**
 * VCB 2026 LN sau thuế — IN_PROGRESS, no YTD data.
 */
const METRIC_VCB_LNST_IN_PROGRESS = {
  ptid: 9,
  label: "Lợi nhuận sau thuế",
  plan_ty: 25000,
  actual_ty: null,
  completion_pct: null,
  status: "IN_PROGRESS" as const,
  ytd_ty: null,
  ytd_term_id: null,
};

const ITEM_FPT_2024 = {
  stockCode: "FPT",
  year: 2024,
  metrics: [METRIC_FPT_DT_EXCEEDED, METRIC_FPT_LNST_ON_TRACK],
};

const ITEM_HPG_2023 = {
  stockCode: "HPG",
  year: 2023,
  metrics: [METRIC_HPG_DT_BEHIND],
};

const ITEM_VCB_2026 = {
  stockCode: "VCB",
  year: 2026,
  metrics: [METRIC_VCB_DT_IN_PROGRESS, METRIC_VCB_LNST_IN_PROGRESS],
};

const SUMMARY_2024 = {
  year: 2024,
  exceeded: 1,
  onTrack: 1,
  behind: 0,
  inProgress: 0,
  total: 2,
};

const SUMMARY_MIXED = {
  year: 2025,
  exceeded: 1,
  onTrack: 0,
  behind: 1,
  inProgress: 2,
  total: 4,
};

const DTO_SINGLE_CLOSED = {
  generatedAt: GENERATED_AT,
  defaultYear: 2025,
  availableYears: [2026, 2025, 2024, 2023],
  items: [ITEM_FPT_2024],
  summary: SUMMARY_2024,
  count: 1,
};

const DTO_MIXED = {
  generatedAt: GENERATED_AT,
  defaultYear: 2025,
  availableYears: [2026, 2025, 2024, 2023],
  items: [ITEM_FPT_2024, ITEM_HPG_2023, ITEM_VCB_2026],
  summary: SUMMARY_MIXED,
  count: 3,
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
// Suite 1 — Happy path: 200 valid DTO
// ---------------------------------------------------------------------------

describe("fetchAgmPlanActualData — 200 valid DTO", () => {
  it("returns items on a valid 200 response, error null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_SINGLE_CLOSED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].stockCode).toBe("FPT");
    expect(data.count).toBe(1);
  });

  it("defaultYear and availableYears propagated from DTO", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_SINGLE_CLOSED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.defaultYear).toBe(2025);
    expect(data.availableYears).toEqual([2026, 2025, 2024, 2023]);
  });

  it("summary counts propagated correctly (exceeded/onTrack/behind/inProgress)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_MIXED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.summary.exceeded).toBe(1);
    expect(data.summary.onTrack).toBe(0);
    expect(data.summary.behind).toBe(1);
    expect(data.summary.inProgress).toBe(2);
    expect(data.summary.total).toBe(4);
  });

  it("passes year and limit params in query string", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(DTO_SINGLE_CLOSED), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await fetchAgmPlanActualData(ORIGIN, { year: 2024, limit: 50 });

    expect(capturedUrl).toContain("year=2024");
    expect(capturedUrl).toContain("limit=50");
  });

  it("count falls back to items.length when DTO count absent", async () => {
    const noCount = { ...DTO_SINGLE_CLOSED, count: undefined };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noCount), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.count).toBe(1);
    expect(data.error).toBeNull();
  });

  it("metrics inside items are preserved correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_SINGLE_CLOSED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    const fpt = data.items[0];
    expect(fpt.metrics).toHaveLength(2);
    expect(fpt.metrics[0].ptid).toBe(5);
    expect(fpt.metrics[0].status).toBe("EXCEEDED");
    expect(fpt.metrics[0].plan_ty).toBe(61850);
    expect(fpt.metrics[0].actual_ty).toBeCloseTo(62962.652);
    expect(fpt.metrics[0].completion_pct).toBeCloseTo(101.8);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — IN_PROGRESS regression guard (CRITICAL)
// Assert: null actual/pct on open year → "—" / "Đang thực hiện", NEVER "0" / "0%"
// ---------------------------------------------------------------------------

describe("IN_PROGRESS regression guard — null actual/pct must NEVER render as 0/0%", () => {
  it("IN_PROGRESS metric has null actual_ty — preserved as null, not 0", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_MIXED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    const vcb = data.items.find((i) => i.stockCode === "VCB");
    expect(vcb).toBeDefined();
    const dtMetric = vcb!.metrics.find((m) => m.ptid === 5);
    expect(dtMetric).toBeDefined();
    expect(dtMetric!.actual_ty).toBeNull();
    expect(dtMetric!.completion_pct).toBeNull();
    expect(dtMetric!.status).toBe("IN_PROGRESS");
  });

  it("formatCompletion(null, IN_PROGRESS) → 'Đang thực hiện', NEVER '0' or '0%'", () => {
    const result = formatCompletion(null, "IN_PROGRESS");
    expect(result).toBe("Đang thực hiện");
    expect(result).not.toBe("0");
    expect(result).not.toBe("0%");
    expect(result).not.toBe("0.0%");
    expect(result).not.toMatch(/^0/); // must not start with "0"
  });

  it("formatCompletion(0, IN_PROGRESS) → 'Đang thực hiện', NOT '0.0%'", () => {
    // Even if pct is accidentally 0 but status is IN_PROGRESS → still show "Đang thực hiện"
    const result = formatCompletion(0, "IN_PROGRESS");
    expect(result).toBe("Đang thực hiện");
    expect(result).not.toBe("0.0%");
  });

  it("formatTy(null) → '—', NEVER '0' or '0 tỷ'", () => {
    const result = formatTy(null);
    expect(result).toBe("—");
    expect(result).not.toBe("0");
    expect(result).not.toContain("0 tỷ");
  });

  it("formatPct(null) → '—', NEVER '0' or '0%'", () => {
    const result = formatPct(null);
    expect(result).toBe("—");
    expect(result).not.toBe("0");
    expect(result).not.toBe("0%");
  });

  it("EXCEEDED metric still gets numeric completion (not clobbered by IN_PROGRESS guard)", () => {
    // The IN_PROGRESS guard should NOT affect EXCEEDED items
    const result = formatCompletion(101.8, "EXCEEDED");
    expect(result).toBe("101.8%");
    expect(result).not.toBe("Đang thực hiện");
  });

  it("BEHIND metric still gets numeric completion", () => {
    const result = formatCompletion(80.2, "BEHIND");
    expect(result).toBe("80.2%");
    expect(result).not.toBe("Đang thực hiện");
  });

  it("ytd_ty on IN_PROGRESS item is preserved (not null-zeroed)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_MIXED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    const vcb = data.items.find((i) => i.stockCode === "VCB");
    const dtMetric = vcb!.metrics.find((m) => m.ptid === 5);
    expect(dtMetric!.ytd_ty).toBe(42000);
    expect(dtMetric!.ytd_term_id).toBe(2);
  });

  it("IN_PROGRESS item with null ytd_ty — ytd_ty remains null, not 0", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_MIXED), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    const vcb = data.items.find((i) => i.stockCode === "VCB");
    const lnstMetric = vcb!.metrics.find((m) => m.ptid === 9);
    expect(lnstMetric!.ytd_ty).toBeNull();
    expect(lnstMetric!.ytd_term_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Empty state
// ---------------------------------------------------------------------------

describe("fetchAgmPlanActualData — empty state", () => {
  it("items:[] + count 0 → error null, no throw", async () => {
    const emptyDto = {
      generatedAt: GENERATED_AT,
      defaultYear: 2025,
      availableYears: [2026, 2025, 2024],
      items: [],
      summary: {
        year: 2025,
        exceeded: 0,
        onTrack: 0,
        behind: 0,
        inProgress: 0,
        total: 0,
      },
      count: 0,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyDto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toEqual([]);
    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Non-fatal: upstream HTTP errors
// ---------------------------------------------------------------------------

describe("fetchAgmPlanActualData — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/502/);
  });

  it("503 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toMatch(/503/);
  });

  it("summary is zeroed on upstream error", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", { status: 500, statusText: "Internal Server Error" })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.summary.exceeded).toBe(0);
    expect(data.summary.onTrack).toBe(0);
    expect(data.summary.behind).toBe(0);
    expect(data.summary.inProgress).toBe(0);
    expect(data.summary.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Non-fatal: network failure (fetch throws)
// ---------------------------------------------------------------------------

describe("fetchAgmPlanActualData — network failure (non-fatal)", () => {
  it("Error instance → message preserved, items empty, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("non-Error throw → fallback Vietnamese message, items empty", async () => {
    global.fetch = vi.fn().mockRejectedValue("unknown string error");

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBe(
      "Không thể kết nối tới máy chủ dữ liệu kế hoạch AGM"
    );
  });

  it("count is 0 on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Unexpected JSON shape guard — never throws
// ---------------------------------------------------------------------------

describe("fetchAgmPlanActualData — unexpected JSON shape (non-fatal)", () => {
  it("null body → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });

  it("object without items key → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "no items here" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAgmPlanActualData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — formatTy helper
// ---------------------------------------------------------------------------

describe("formatTy — TỶ ĐỒNG formatting", () => {
  it("null → '—', not '0' or '0 tỷ'", () => {
    expect(formatTy(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatTy(undefined as unknown as null)).toBe("—");
  });

  it("61850 → contains '61' and 'tỷ'", () => {
    const result = formatTy(61850);
    expect(result).toContain("tỷ");
    expect(result).toContain("61");
  });

  it("62962.652 → contains '62' and 'tỷ'", () => {
    const result = formatTy(62962.652);
    expect(result).toContain("tỷ");
    expect(result).toContain("62");
  });

  it("0 (explicit zero) → contains '0' and 'tỷ', not '—'", () => {
    const result = formatTy(0);
    expect(result).toContain("tỷ");
    expect(result).not.toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — formatPct helper
// ---------------------------------------------------------------------------

describe("formatPct — percentage formatting", () => {
  it("null → '—', not '0%'", () => {
    expect(formatPct(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatPct(undefined as unknown as null)).toBe("—");
  });

  it("101.8 → '101.8%'", () => {
    expect(formatPct(101.8)).toBe("101.8%");
  });

  it("80.2 → '80.2%'", () => {
    expect(formatPct(80.2)).toBe("80.2%");
  });

  it("0 (explicit zero) → '0.0%', not '—'", () => {
    expect(formatPct(0)).toBe("0.0%");
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — statusLabel helper
// ---------------------------------------------------------------------------

describe("statusLabel — Vietnamese label mapping", () => {
  it("EXCEEDED → 'Vượt KH'", () => {
    expect(statusLabel("EXCEEDED")).toBe("Vượt KH");
  });

  it("ON_TRACK → 'Đạt'", () => {
    expect(statusLabel("ON_TRACK")).toBe("Đạt");
  });

  it("BEHIND → 'Chưa đạt'", () => {
    expect(statusLabel("BEHIND")).toBe("Chưa đạt");
  });

  it("IN_PROGRESS → 'Đang thực hiện'", () => {
    expect(statusLabel("IN_PROGRESS")).toBe("Đang thực hiện");
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — statusColorClass — IN_PROGRESS is grey, BEHIND is red (not confused)
// ---------------------------------------------------------------------------

describe("statusColorClass — status → colour class", () => {
  it("EXCEEDED badge contains 'emerald'", () => {
    const { badge } = statusColorClass("EXCEEDED");
    expect(badge).toContain("emerald");
  });

  it("ON_TRACK badge contains 'teal'", () => {
    const { badge } = statusColorClass("ON_TRACK");
    expect(badge).toContain("teal");
  });

  it("BEHIND badge contains 'red'", () => {
    const { badge } = statusColorClass("BEHIND");
    expect(badge).toContain("red");
  });

  it("IN_PROGRESS badge contains 'slate' (grey), NOT 'red'", () => {
    const { badge } = statusColorClass("IN_PROGRESS");
    expect(badge).toContain("slate");
    expect(badge).not.toContain("red");
  });

  it("IN_PROGRESS bar is grey (slate), NOT red", () => {
    const { bar } = statusColorClass("IN_PROGRESS");
    expect(bar).toContain("slate");
    expect(bar).not.toContain("red");
  });

  it("BEHIND bar is red, NOT grey", () => {
    const { bar } = statusColorClass("BEHIND");
    expect(bar).toContain("red");
    expect(bar).not.toContain("slate");
  });
});
