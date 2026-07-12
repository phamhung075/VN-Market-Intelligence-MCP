/**
 * FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP.test.ts
 *
 * SPIKE-BCTC-CTG-BS-REALDATA-ROOT root-cause FIX-B (architecture brief
 * docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md §4/§7/§8):
 * `isBankFormFromRows` (bctcFormType.ts) required the ENTIRE `code` string
 * to equal a bare Roman numeral/letter — real agentic-refine markdown bolds
 * section/summary codes as its own convention ("**I**" … "**XV**", "__I__"),
 * so 0/451 of CTG's real codes matched pre-fix and the whole report was
 * misclassified CORPORATE.
 *
 * STATUS NOTE: by the time this task was dispatched, the composite commit
 * d69b13f41 ("fix(mcp-server/bctc): bank-form column-order + classifier +
 * section vocab (CTG real-data composite)") had already shipped this exact
 * fix (`stripEmphasis` in `isBankFormFromRows`, bctcFormType.ts lines 89-93)
 * as part of the combined FIX-A+FIX-B+FIX-C+FIX-D+FIX-E task
 * FIX-BCTC-BANK-BS-COLUMN-ORDER — this backlog row's independent scope
 * (FIX-B only, minted 2026-07-03T06:21:56Z, BEFORE the 10:03:47Z composite
 * commit) was absorbed but never itself marked done/superseded. The
 * composite commit's own FIX-D suite (FIX-BCTC-BANK-BS-COLUMN-ORDER.test.ts)
 * proves the fix end-to-end against REAL CTG markdown ("**I**" … "**XV**"
 * flip the report to BANK; a trailing "280" still vetoes to CORPORATE) but
 * has no ISOLATED, synthetic unit test of `isBankFormFromRows` itself, and
 * never exercises the `__bold__` (double-underscore) emphasis variant the
 * production regex (`/[*_]/g`) also strips. This file adds that missing
 * direct coverage — no production code change needed (the fix already
 * exists and already passes these assertions).
 *
 * @module __tests__/FIX-BCTC-BANK-FORM-CLASSIFIER-BOLD-STRIP
 */

import { describe, it, expect } from "bun:test";
import { isBankFormFromRows, type BctcCodeRow } from "../domain/services/financial-reports/bctcFormType.js";

function rows(...codes: (string | null)[]): BctcCodeRow[] {
  return codes.map((code) => ({ code }));
}

describe("FIX-B: isBankFormFromRows strips markdown emphasis before anchor matching", () => {
  it("a bold-wrapped Roman anchor code ('**I**') classifies as BANK", () => {
    expect(isBankFormFromRows(rows("**I**"))).toBe(true);
  });

  it("a bold-wrapped section-letter anchor code ('**A**') classifies as BANK", () => {
    expect(isBankFormFromRows(rows("**A**"))).toBe(true);
  });

  it("a double-underscore-wrapped anchor code ('__I__') classifies as BANK", () => {
    expect(isBankFormFromRows(rows("__I__"))).toBe(true);
  });

  it("a bold multi-char Roman anchor ('**XIII**') classifies as BANK", () => {
    expect(isBankFormFromRows(rows("**XIII**"))).toBe(true);
  });

  it("non-regression: a bare (non-bold) anchor code still classifies as BANK", () => {
    expect(isBankFormFromRows(rows("I"))).toBe(true);
    expect(isBankFormFromRows(rows("A"))).toBe(true);
    expect(isBankFormFromRows(rows("XIII"))).toBe(true);
  });

  it("non-regression: a bare 3-digit corporate balance code still vetoes to CORPORATE", () => {
    expect(isBankFormFromRows(rows("280"))).toBe(false);
    expect(isBankFormFromRows(rows("I", "280"))).toBe(false);
  });

  it("a bold-wrapped 3-digit corporate code ('**280**') still vetoes to CORPORATE (emphasis strip applies to the veto pattern too)", () => {
    expect(isBankFormFromRows(rows("**I**", "**280**"))).toBe(false);
  });

  it("VAS letter-suffix codes (411a, 420a) are unaffected by the emphasis strip — no false-positive veto or anchor match", () => {
    expect(isBankFormFromRows(rows("**I**", "411a", "420a"))).toBe(false);
  });

  it("empty/null codes mixed with a bold anchor do not break the strip (fail-safe on null)", () => {
    expect(isBankFormFromRows(rows(null, "**I**"))).toBe(true);
  });
});
