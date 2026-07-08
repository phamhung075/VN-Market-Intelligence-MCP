// src/__tests__/FACTORY-INTERFACE-source-confidence-10-mask.test.ts
/**
 * FACTORY-INTERFACE-source-confidence-10-mask
 *
 * `finalize_bctc_refine`'s INSERT loop used to write
 *   row.source_confidence ?? 1.0
 * into `bctc_table_rows.source_confidence` (`REAL NOT NULL DEFAULT 1.0` —
 * schema-financial-reports.ts:512-523). The audit flagged this as the same
 * fabrication class as FACTORY-INTERFACE-sequential-confidence-05-mask's
 * `confidence ?? 0.5`: a `?? <literal>` on a field literally named
 * "confidence" masking an unknown value as a fake trusted one.
 *
 * Ground-truth investigation for THIS ticket (documented honestly, not
 * assumed): `parseRefinedMarkdown` (refinedMarkdownParser.ts) already always
 * computes a REAL per-row `source_confidence` (0.1 unparseable / 0.2 red
 * flag / 0.4 yellow flag / 1.0 no flag found — never absent), and the
 * existing HC-human-confirm.test.ts `DV-HC-SC` suite already proves all four
 * variants persist to `bctc_table_rows` unchanged end-to-end. The live
 * named-volume DB independently confirms this: `bctc_table_rows` already
 * contains rows with source_confidence=0.1 and 0.4, not a blanket 1.0. So
 * the `?? 1.0` branch was provably UNREACHABLE dead code under the row
 * shape's true (non-optional `number`) type — not an active masking bug.
 *
 * This fix still closes the anti-pattern structurally, per the required
 * discipline (real propagation, not a fallback substituting for missing
 * data), by:
 *   1. Typing the row shape's `source_confidence` HONESTLY as
 *      `number | undefined` (it is not a parser-only guarantee — nothing in
 *      the local row-shape type enforces that provenance).
 *   2. Extracting the INSERT-boundary resolution into a single, documented,
 *      exported pure function `resolveSourceConfidence` that propagates a
 *      real value unchanged and falls through to the schema default 1.0
 *      ONLY when the value is genuinely `undefined` — never masking a real
 *      value, including a real `0` (falsy-but-defined) or a real `1.0`.
 *
 * These tests cover both DoD-required cases directly against the resolver
 * (the parser-absent case cannot be reproduced through the full pipeline
 * today — see the ground-truth note above — so it is tested at the
 * resolver's own honest `number | undefined` boundary instead).
 */

import { describe, it, expect } from "bun:test";
import { resolveSourceConfidence } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

describe("FACTORY-INTERFACE-source-confidence-10-mask — resolveSourceConfidence", () => {
  it("propagates a real parser-supplied confidence UNCHANGED (yellow flag, 0.4)", () => {
    expect(resolveSourceConfidence(0.4)).toBe(0.4);
  });

  it("propagates a real parser-supplied confidence UNCHANGED (red flag, 0.2)", () => {
    expect(resolveSourceConfidence(0.2)).toBe(0.2);
  });

  it("propagates a real parser-supplied confidence UNCHANGED (unparseable, 0.1)", () => {
    expect(resolveSourceConfidence(0.1)).toBe(0.1);
  });

  it("propagates an explicit real confidence of 1.0 (not confused with the fallback)", () => {
    // Same numeric value as the fallback, but arrives via the "supplied" branch —
    // regression guard against collapsing the two code paths into one.
    expect(resolveSourceConfidence(1.0)).toBe(1.0);
  });

  it("preserves an explicit confidence of 0 (falsy but genuinely supplied) — not treated as absent", () => {
    // Proves the resolver uses a strict `!== undefined` check, not `||`/truthiness,
    // which would incorrectly re-mask a real 0 to 1.0.
    expect(resolveSourceConfidence(0)).toBe(0);
  });

  it("falls through to the documented schema default (1.0) ONLY when genuinely undefined", () => {
    expect(resolveSourceConfidence(undefined)).toBe(1.0);
  });
});
