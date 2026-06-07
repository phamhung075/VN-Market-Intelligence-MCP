/**
 * TSU-DEV-U3-weak-claim-tools.test.ts
 *
 * Sprint TOOL-SURFACE-UPGRADE — Unit U3
 * Verifies: 5 tools DEREGISTERED from source, 7 tools INTEGRATE with updated descriptions.
 *
 * Tests:
 *   T-U3-1  read_bctc_pdf NOT in source (reports.ts)
 *   T-U3-2  backfill_bctc_scalars NOT in source (backfillBctcScalarsTool.ts)
 *   T-U3-3  compute_accruals NOT in source (computeAccrualsTool.ts)
 *   T-U3-4  get_accuracy_context NOT in source (getAccuracyContextTool.ts)
 *   T-U3-5  is_trading_day NOT in source (isTradingDayTool.ts)
 *   T-U3-6  mark_alert_outcome description contains lifecycle + package destination
 *   T-U3-7  get_market_foreign_flow description clarifies aggregate vs per-ticker
 *   T-U3-8  diagnose_foreign_flow_circuit_breaker description clarifies ops/debug use
 *   T-U3-9  reset_foreign_flow_circuit_breaker description clarifies ops/debug use
 *   T-U3-10 get_label_accuracy_report description clarifies label-level vs calibration curve
 *   T-U3-11 list_flagged_bctc_cells description mentions bctc-analyst / inspect
 *   T-U3-12 submit_bctc_correction description mentions human correction entry point
 *
 * @module __tests__/TSU-DEV-U3-weak-claim-tools
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "../../../..");
const TOOLS_DIR = join(PROJECT_ROOT, "apps/mcp-server/src/interface/mcp/tools");

function readTool(relPath: string): string {
  return readFileSync(join(TOOLS_DIR, relPath), "utf-8");
}

// ─── Tests: Deregister block (5 tools) ───────────────────────────────────────

describe("TSU-DEV-U3 — Deregister block", () => {
  it("T-U3-1: read_bctc_pdf is NOT registered in financial-reports/reports.ts", () => {
    const content = readTool("financial-reports/reports.ts");
    // Must not contain server.tool("read_bctc_pdf", ...
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']read_bctc_pdf["']/);
  });

  it("T-U3-2: backfill_bctc_scalars is NOT registered in its tool file", () => {
    const content = readTool("financial-reports/backfillBctcScalarsTool.ts");
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']backfill_bctc_scalars["']/);
  });

  it("T-U3-3: compute_accruals is NOT registered in its tool file", () => {
    const content = readTool("financial-reports/computeAccrualsTool.ts");
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']compute_accruals["']/);
  });

  it("T-U3-4: get_accuracy_context is NOT registered in its tool file", () => {
    const content = readTool("news-analysis/getAccuracyContextTool.ts");
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']get_accuracy_context["']/);
  });

  it("T-U3-5: is_trading_day is NOT registered in its tool file", () => {
    const content = readTool("system/isTradingDayTool.ts");
    expect(content).not.toMatch(/server\.tool\s*\(\s*["']is_trading_day["']/);
  });
});

// ─── Tests: Integrate block (7 tools) ────────────────────────────────────────

describe("TSU-DEV-U3 — Integrate block: description updates", () => {
  it("T-U3-6: mark_alert_outcome description clarifies lifecycle and package destination", () => {
    const content = readTool("alerts/alertAccuracy.ts");
    // Must mention post-hoc, write_alert_verdict lifecycle distinction, and package
    expect(content).toMatch(/mark_alert_outcome/);
    expect(content).toMatch(/post.hoc/i);
    expect(content).toMatch(/write_alert_verdict/);
    expect(content).toMatch(/ops\/alert/i);
  });

  it("T-U3-7: get_market_foreign_flow description clarifies market-wide aggregate vs per-ticker", () => {
    const content = readTool("market-data/marketWideForeignFlowTool.ts");
    expect(content).toMatch(/get_market_foreign_flow/);
    expect(content).toMatch(/market.wide/i);
    expect(content).toMatch(/get_foreign_flow/);
    expect(content).toMatch(/per.ticker/i);
  });

  it("T-U3-8: diagnose_foreign_flow_circuit_breaker description mentions ops/debug", () => {
    const content = readTool("market-data/foreignFlowTools.ts");
    expect(content).toMatch(/diagnose_foreign_flow_circuit_breaker/);
    expect(content).toMatch(/ops|debug/i);
  });

  it("T-U3-9: reset_foreign_flow_circuit_breaker description mentions ops/debug pairing", () => {
    const content = readTool("market-data/foreignFlowTools.ts");
    expect(content).toMatch(/reset_foreign_flow_circuit_breaker/);
    expect(content).toMatch(/ops|debug/i);
  });

  it("T-U3-10: get_label_accuracy_report description clarifies label-level vs calibration curve", () => {
    const content = readTool("macro/calibrationTools.ts");
    expect(content).toMatch(/get_label_accuracy_report/);
    expect(content).toMatch(/label/i);
    expect(content).toMatch(/get_calibration_report/);
  });

  it("T-U3-11: list_flagged_bctc_cells description mentions bctc-analyst inspect path", () => {
    const content = readTool("financial-reports/listFlaggedBctcCellsTool.ts");
    expect(content).toMatch(/list_flagged_bctc_cells/);
    expect(content).toMatch(/bctc.analyst|inspect/i);
  });

  it("T-U3-12: submit_bctc_correction description mentions human correction entry point", () => {
    const content = readTool("financial-reports/submitBctcCorrectionTool.ts");
    expect(content).toMatch(/submit_bctc_correction/);
    expect(content).toMatch(/human/i);
    expect(content).toMatch(/bctc.analyst|BCTC-HUMAN-CONFIRM/i);
  });
});
