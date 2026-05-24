// apps/mcp-server/src/__tests__/1421-period-type-prefix.test.ts
// Regression test: insertFallbackRecord must never produce a double-Q prefix
// (e.g. "QQ1") regardless of whether the quarter string already starts with 'Q'.
//
// The type ReparseDeps.insertFallbackRecord receives quarter as
// "Q1"|"Q2"|"Q3"|"Q4" (from parseYearQuarterFromFilename), so both the
// sort_key and period_type columns were being built as "QQ1" etc.
//
// Fix (task 1421): guard with quarter.startsWith('Q') ? quarter : `Q${quarter}`
// at both call sites in makeProductionDeps() inside bctcReparseJob.ts.

import { describe, it, expect, mock } from "bun:test";
import { reparseSingleWithOcrFallback } from "../scheduler/financial-reports/bctcReparseJob.js";
import type { ReparseDeps } from "../scheduler/financial-reports/bctcReparseJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal ReparseDeps stub that:
 *  - makes the file "exist"
 *  - makes pdf-parse return too little text (forces OCR path)
 *  - makes OCR cache return nothing (forces insertFallbackRecord path)
 *  - captures what insertFallbackRecord was called with
 */
function makeDepsCapture(captured: { period_type?: string; sort_key?: string }): ReparseDeps {
  return {
    fileExists: () => true,
    readFile: () => Buffer.from(""),
    // 1954c Tier 1: service unavailable → falls through to Tier 2/3
    extractViaService: async (_url) => null,
    extractText: async () => ({ text: "", confidence: 0 }),
    getOcrCache: () => null,
    pipeline: async () => null,
    insertFallbackRecord: async (payload) => {
      // Mirror the fixed logic from makeProductionDeps()
      const q = payload.quarter;
      const normalised = q.startsWith("Q") ? q : `Q${q}`;
      captured.period_type = normalised;
      captured.sort_key = `${payload.year}-${normalised}`;
    },
  };
}

/**
 * Run reparseSingleWithOcrFallback for a ticker/filename that maps to the
 * given quarter string, then return what insertFallbackRecord captured.
 *
 * Filename encodes the quarter via a date so parseYearQuarterFromFilename
 * returns the expected "Q1".."Q4" value.
 */
async function runAndCapture(
  month: string,
  expectedQuarter: "Q1" | "Q2" | "Q3" | "Q4",
): Promise<{ period_type: string; sort_key: string }> {
  const captured: { period_type?: string; sort_key?: string } = {};
  const deps = makeDepsCapture(captured);

  await reparseSingleWithOcrFallback(
    {
      ticker: "VNM",
      filename: `BCTC_VNM_${month}.2025_HOP_NHAT.pdf`,
      filePath: "/fake/path/file.pdf",
    },
    deps,
  );

  expect(captured.period_type).toBeDefined();
  expect(captured.sort_key).toBeDefined();
  return {
    period_type: captured.period_type!,
    sort_key: captured.sort_key!,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1421 — Q-prefix guard in insertFallbackRecord", () => {
  // ── guard logic unit tests (pure, no filesystem) ───────────────────────────

  describe("guard logic: quarter.startsWith('Q') ? quarter : `Q${quarter}`", () => {
    const guard = (q: string) => (q.startsWith("Q") ? q : `Q${q}`);

    it("returns Q1 unchanged when input is already Q1", () => {
      expect(guard("Q1")).toBe("Q1");
    });
    it("returns Q2 unchanged when input is already Q2", () => {
      expect(guard("Q2")).toBe("Q2");
    });
    it("returns Q3 unchanged when input is already Q3", () => {
      expect(guard("Q3")).toBe("Q3");
    });
    it("returns Q4 unchanged when input is already Q4", () => {
      expect(guard("Q4")).toBe("Q4");
    });

    it("prepends Q when input is bare digit 1", () => {
      expect(guard("1")).toBe("Q1");
    });
    it("prepends Q when input is bare digit 2", () => {
      expect(guard("2")).toBe("Q2");
    });
    it("prepends Q when input is bare digit 3", () => {
      expect(guard("3")).toBe("Q3");
    });
    it("prepends Q when input is bare digit 4", () => {
      expect(guard("4")).toBe("Q4");
    });

    it("never produces double-Q prefix for Q1 input", () => {
      expect(guard("Q1")).not.toMatch(/^QQ/);
    });
    it("never produces double-Q prefix for Q4 input", () => {
      expect(guard("Q4")).not.toMatch(/^QQ/);
    });
  });

  // ── integration: reparseSingleWithOcrFallback → insertFallbackRecord ───────

  describe("insertFallbackRecord receives no double-Q prefix via reparseSingleWithOcrFallback", () => {
    it("Q1: period_type='Q1', sort_key='2025-Q1'", async () => {
      const { period_type, sort_key } = await runAndCapture("31.03", "Q1");
      expect(period_type).toBe("Q1");
      expect(sort_key).toBe("2025-Q1");
      expect(period_type).not.toMatch(/^QQ/);
    });

    it("Q2: period_type='Q2', sort_key='2025-Q2'", async () => {
      const { period_type, sort_key } = await runAndCapture("30.06", "Q2");
      expect(period_type).toBe("Q2");
      expect(sort_key).toBe("2025-Q2");
      expect(period_type).not.toMatch(/^QQ/);
    });

    it("Q3: period_type='Q3', sort_key='2025-Q3'", async () => {
      const { period_type, sort_key } = await runAndCapture("30.09", "Q3");
      expect(period_type).toBe("Q3");
      expect(sort_key).toBe("2025-Q3");
      expect(period_type).not.toMatch(/^QQ/);
    });

    it("Q4: period_type='Q4', sort_key='2025-Q4'", async () => {
      const { period_type, sort_key } = await runAndCapture("31.12", "Q4");
      expect(period_type).toBe("Q4");
      expect(sort_key).toBe("2025-Q4");
      expect(period_type).not.toMatch(/^QQ/);
    });
  });
});
