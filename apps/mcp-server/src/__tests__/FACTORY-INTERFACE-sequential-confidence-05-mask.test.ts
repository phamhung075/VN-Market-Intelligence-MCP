// src/__tests__/FACTORY-INTERFACE-sequential-confidence-05-mask.test.ts
/**
 * FACTORY-INTERFACE-sequential-confidence-05-mask
 *
 * `sequential_market_analysis` used to fabricate a mid-point 0.5 confidence
 * whenever the caller stated a hypothesis but omitted `confidence`:
 *   result.confidence = input.confidence ?? 0.5
 *
 * "No stated confidence" is not the same fact as "confidence 0.5" — the fix
 * only assigns `result.confidence` when `input.confidence` was actually
 * supplied, and leaves it `undefined` otherwise (docs/architecture-briefs/
 * 2026-06-15-maintainability-factory-audit.md).
 *
 * `AnalysisResult` (including `confidence`) is internal per-session state —
 * it is never part of the `handle()` MCP response contract (only
 * `{status, thought, progress, nextSteps}` is returned). The tool exposes
 * `_analysisState` for test/introspection only so this fix is verifiable.
 */

import { describe, it, expect } from "bun:test";
import { createSequentialMarketAnalysisTool } from "../interface/mcp/tools/analysis/sequential-market-analysis.js";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    analysisType: "hypothesis_test",
    thought: "Testing confidence propagation",
    thoughtNumber: 1,
    totalThoughts: 1,
    nextThoughtNeeded: false,
    hypothesis: "VCB likely to rise on Q2 earnings beat",
    ...overrides,
  };
}

describe("FACTORY-INTERFACE-sequential-confidence-05-mask", () => {
  it("does NOT fabricate 0.5 confidence when input.confidence is omitted — stays undefined", async () => {
    const tool = createSequentialMarketAnalysisTool();

    // confidence intentionally omitted
    await tool.handle(baseInput() as never);

    const results = Array.from(tool._analysisState.values());
    expect(results.length).toBe(1);
    expect(results[0]!.confidence).toBeUndefined();
    // sanity: hypothesis itself is still recorded
    expect(results[0]!.finalHypothesis).toBe("VCB likely to rise on Q2 earnings beat");
  });

  it("assigns the real confidence value unchanged when input.confidence IS supplied", async () => {
    const tool = createSequentialMarketAnalysisTool();

    await tool.handle(baseInput({ confidence: 0.9 }) as never);

    const results = Array.from(tool._analysisState.values());
    expect(results.length).toBe(1);
    expect(results[0]!.confidence).toBe(0.9);
  });

  it("preserves an explicit confidence of 0 (falsy but stated) — not treated as omitted", async () => {
    const tool = createSequentialMarketAnalysisTool();

    await tool.handle(baseInput({ confidence: 0 }) as never);

    const results = Array.from(tool._analysisState.values());
    expect(results[0]!.confidence).toBe(0);
  });

  it("recommendations label an unstated confidence honestly instead of mislabeling it 'Low confidence'", async () => {
    const tool = createSequentialMarketAnalysisTool();

    await tool.handle(baseInput() as never);

    const results = Array.from(tool._analysisState.values());
    const recs = results[0]!.recommendations;
    expect(recs.some((r) => r.startsWith("No confidence stated:"))).toBe(true);
    expect(recs.some((r) => r.startsWith("Low confidence:"))).toBe(false);
  });

  it("handle() response contract is unchanged (status/thought/progress/nextSteps only)", async () => {
    const tool = createSequentialMarketAnalysisTool();

    const response = await tool.handle(baseInput() as never);

    expect(response.status).toBe("complete");
    expect(response.thought.thoughtNumber).toBe(1);
    expect(typeof response.progress).toBe("string");
    expect(response.nextSteps).toBeUndefined();
  });
});
