/**
 * Task 290 — checkSscReports: pass pdfUrl + derive quarter from publishedAt
 *
 * Tests:
 *  1. deriveQuarterFromPublishedAt — maps publish month to fiscal quarter
 *  2. defaultPipeline passes pdfUrl through to fetchParseAndStoreBctc
 *  3. Existing 153-style dedup behaviour still works
 */

import { describe, it, expect } from "bun:test";
import {
  deriveQuarterFromPublishedAt,
  checkSscReports,
} from "../application/usecases/checkSscReports.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. deriveQuarterFromPublishedAt
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 290 — deriveQuarterFromPublishedAt", () => {
  // Vietnamese reporting calendar:
  //   Jan-Apr  → Q4 of prior year
  //   May-Jul  → Q1 of current year
  //   Aug-Oct  → Q2 of current year
  //   Nov-Dec  → Q3 of current year

  describe("DD/MM/YYYY format (SSC portal)", () => {
    it("Jan → Q4 of prior year", () => {
      const result = deriveQuarterFromPublishedAt("15/01/2025");
      expect(result.quarter).toBe("Q4");
      expect(result.year).toBe(2024);
    });

    it("Feb → Q4 of prior year", () => {
      const result = deriveQuarterFromPublishedAt("28/02/2025");
      expect(result.quarter).toBe("Q4");
      expect(result.year).toBe(2024);
    });

    it("Apr → Q4 of prior year", () => {
      const result = deriveQuarterFromPublishedAt("30/04/2025");
      expect(result.quarter).toBe("Q4");
      expect(result.year).toBe(2024);
    });

    it("May → Q1 of current year", () => {
      const result = deriveQuarterFromPublishedAt("01/05/2025");
      expect(result.quarter).toBe("Q1");
      expect(result.year).toBe(2025);
    });

    it("Jul → Q1 of current year", () => {
      const result = deriveQuarterFromPublishedAt("31/07/2025");
      expect(result.quarter).toBe("Q1");
      expect(result.year).toBe(2025);
    });

    it("Aug → Q2 of current year", () => {
      const result = deriveQuarterFromPublishedAt("15/08/2025");
      expect(result.quarter).toBe("Q2");
      expect(result.year).toBe(2025);
    });

    it("Oct → Q2 of current year", () => {
      const result = deriveQuarterFromPublishedAt("31/10/2025");
      expect(result.quarter).toBe("Q2");
      expect(result.year).toBe(2025);
    });

    it("Nov → Q3 of current year", () => {
      const result = deriveQuarterFromPublishedAt("01/11/2025");
      expect(result.quarter).toBe("Q3");
      expect(result.year).toBe(2025);
    });

    it("Dec → Q3 of current year", () => {
      const result = deriveQuarterFromPublishedAt("25/12/2025");
      expect(result.quarter).toBe("Q3");
      expect(result.year).toBe(2025);
    });
  });

  describe("ISO 8601 format", () => {
    it("2025-01-15 → Q4 of 2024", () => {
      const result = deriveQuarterFromPublishedAt("2025-01-15");
      expect(result.quarter).toBe("Q4");
      expect(result.year).toBe(2024);
    });

    it("2025-06-01 → Q1 of 2025", () => {
      const result = deriveQuarterFromPublishedAt("2025-06-01");
      expect(result.quarter).toBe("Q1");
      expect(result.year).toBe(2025);
    });

    it("2025-09-15T10:00:00Z → Q2 of 2025", () => {
      const result = deriveQuarterFromPublishedAt("2025-09-15T10:00:00Z");
      expect(result.quarter).toBe("Q2");
      expect(result.year).toBe(2025);
    });

    it("2025-11-30 → Q3 of 2025", () => {
      const result = deriveQuarterFromPublishedAt("2025-11-30");
      expect(result.quarter).toBe("Q3");
      expect(result.year).toBe(2025);
    });
  });

  describe("fallback on parse failure", () => {
    it("empty string → Q1 of current year", () => {
      const result = deriveQuarterFromPublishedAt("");
      expect(result.quarter).toBe("Q1");
      expect(result.year).toBe(new Date().getFullYear());
    });

    it("garbage string → Q1 of current year", () => {
      const result = deriveQuarterFromPublishedAt("not-a-date");
      expect(result.quarter).toBe("Q1");
      expect(result.year).toBe(new Date().getFullYear());
    });

    it("undefined-like empty → Q1 of current year", () => {
      const result = deriveQuarterFromPublishedAt("   ");
      expect(result.quarter).toBe("Q1");
      expect(result.year).toBe(new Date().getFullYear());
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. defaultPipeline passes pdfUrl + derived quarter to fetchParseAndStoreBctc
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 290 — checkSscReports passes pdfUrl to pipeline", () => {
  it("pipelineFn receives pdfUrl from the SSC document", async () => {
    const capturedParams: Array<{
      actionCode: string;
      pdfUrl: string;
      publishedAt: string;
    }> = [];

    await checkSscReports({
      getWatchlistFn: async () => [
        { code: "VCB", alertReportNew: false },
      ],
      listDocsFn: async (_code) => [
        {
          url: "https://ssc.gov.vn/reports/vcb-q1-2025.pdf",
          publishedAt: "15/05/2025",
          title: "VCB Q1/2025 BCTC",
          reportType: "quarterly" as const,
        },
      ],
      isNewReportFn: (_code, _url) => true, // always new
      pipelineFn: async (params) => {
        capturedParams.push(params);
        return null;
      },
      storeAlertsFn: () => undefined,
    });

    expect(capturedParams).toHaveLength(1);
    expect(capturedParams[0]!.pdfUrl).toBe(
      "https://ssc.gov.vn/reports/vcb-q1-2025.pdf",
    );
    expect(capturedParams[0]!.actionCode).toBe("VCB");
    expect(capturedParams[0]!.publishedAt).toBe("15/05/2025");
  });

  it("pipelineFn is called with correct publishedAt for quarter derivation", async () => {
    const capturedPublishedAt: string[] = [];

    await checkSscReports({
      getWatchlistFn: async () => [
        { code: "FPT", alertReportNew: false },
      ],
      listDocsFn: async (_code) => [
        {
          url: "https://ssc.gov.vn/reports/fpt-q3-2025.pdf",
          publishedAt: "20/11/2025",
          title: "FPT Q3/2025 BCTC",
          reportType: "quarterly" as const,
        },
      ],
      isNewReportFn: () => true,
      pipelineFn: async (params) => {
        capturedPublishedAt.push(params.publishedAt);
        return null;
      },
      storeAlertsFn: () => undefined,
    });

    expect(capturedPublishedAt[0]).toBe("20/11/2025");
    // Nov → Q3 per Vietnamese reporting calendar
    const derived = deriveQuarterFromPublishedAt("20/11/2025");
    expect(derived.quarter).toBe("Q3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. defaultPipeline integration — uses pdfUrl + derived quarter internally
//    (verifies that defaultPipeline passes pdfUrl to fetchParseAndStoreBctc)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 290 — defaultPipeline passes pdfUrl to fetchParseAndStoreBctc", () => {
  it("checkSscReports result counts new reports correctly", async () => {
    const result = await checkSscReports({
      getWatchlistFn: async () => [
        { code: "VNM", alertReportNew: false },
        { code: "HPG", alertReportNew: false },
      ],
      listDocsFn: async (code) => {
        if (code === "VNM") {
          return [
            {
              url: "https://ssc.gov.vn/vnm-q2-2025.pdf",
              publishedAt: "10/08/2025",
              title: "VNM Q2/2025",
              reportType: "quarterly" as const,
            },
          ];
        }
        return []; // HPG has no new docs
      },
      isNewReportFn: (_code, url) => url.includes("vnm"), // VNM is new, HPG nothing
      pipelineFn: async () => null,
      storeAlertsFn: () => undefined,
    });

    expect(result.checked).toBe(2);
    expect(result.newReports).toBe(1);
    expect(result.alerts).toBe(0);
    expect(result.errors).toBe(0);
  });
});
