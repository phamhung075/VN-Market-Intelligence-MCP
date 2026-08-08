# FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW — Architect Spec (PLAN-ONLY)

**Row:** supervised+plan_only — this document is a ready-to-apply spec. No `apps/mcp-server`
source or flow-doc files were edited by architect. Author: architect (SLS dispatch,
2026-08-08). Source: `docs/spikes/SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION.md`.

---

## 1. Re-verification of the root cause (live-read, 2026-08-08)

All line-anchors below were re-read live against the current tree (not trusted from the
spike/task citations verbatim) — all confirmed accurate, no drift:

- `windowPartitioner.ts:92-101` — cap-hit branch: WARN-only, starts a brand-new window at
  the next unconsumed page (`i = j`), which is itself a page that matched
  `CONTINUATION_MARKER` against the page before it.
- `windowPartitioner.ts:50` — docstring literally claims a `truncated_continuation` flag
  exists. `grep -rn "truncated_continuation" apps/mcp-server/src` → 0 hits. **Confirmed
  comment≠code drift.**
- `refinedMarkdownParser.ts:386-393` (`resolveColumnLayout`) — reads the CURRENT call's own
  captured `headerCells`; falls back to hardcoded `"code-first"` when `headerCells === null`
  (line 387/391).
- `refinedMarkdownParser.ts:439` — `headerCells` is a `let` local, re-initialized `null` on
  every `parseRefinedMarkdown` invocation. No cross-call state.
- `refinedMarkdownParser.ts:404-419` + `finalizeBctcRefine.ts:162,174-175` — `statement_section`
  **is** threaded window-to-window (`initialSection` param / `finalSection` return /
  `carrySection` loop var). Column layout has no equivalent. This asymmetry is the actual bug.
- `getBctcPendingRefineTool.ts:319-335` — a window with `page_numbers.length > 1` is always
  classified `page_type: "continuation"`, dispatched to `continuation-stitch.md`.
- `continuation-stitch.md` Steps 1-4 — unconditionally treats `page_numbers[0]` as carrying the
  table's real header ("Parse page N: ... Collect header + data rows").
- `bctcScalarAggregator.ts:20-21,396-399` — label-preferred matching for headline scalars;
  `bctcSectionCompleteness.ts:27-60` (BEQ-7) — presence-only, does not catch a code/label swap.

**Additional finding not in the spike** — `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md:80`
and `windowPartitioner.ts:11-13` both state a "CRITICAL invariant": *"A continuation table
spanning page N and N+1 MUST land in ONE window — never split across two subagents."* The
`maxWindowPages` cap-hit branch **already silently violates this stated invariant** today (it
splits into ≥2 windows whenever a table exceeds the cap) — this is a second, deeper instance of
the same comment≠code drift class as the `truncated_continuation` docstring. The original design
brief's literal fallback (line 78: *"treated as one window capped at 3 pages, with a
`truncated_continuation` trust flag"*) reads as "drop the excess pages, flag low trust" — but
Finding 1 (spike) already established the SHIPPED implementation does NOT drop data (every page
lands in exactly one window). **Reverting to the brief's literal lossy design is rejected** — it
would regress a already-shipped, verifiably-good property (no data loss) to fix a property
(column-layout correctness) that has a lossless fix available (§3 below). The two docstrings
will be corrected to describe actual behavior, not the aspirational original design.

**Corroborating finding (increases confidence the fix's scope is complete):** the single-page
"last tail window" edge case (a truncation-tail window that happens to find no further
continuation marker on its own next page, so `page_numbers.length === 1`) is classified
`page_type: "table"` or `"prose"` by `getBctcPendingRefineTool.ts`, NOT `"continuation"` — so it
is dispatched to `table-page.md` or `prose-page.md` instead of `continuation-stitch.md`. Read
both docs: `table-page.md` Step 3 ("If continuation marker detected → flag
`wrong_subflow:use_continuation-stitch` → return FAILED") and `prose-page.md` Step 2 ("table
signals detected → `page_type_mismatch` → FAILED") **both already self-detect and fail loud**
rather than silently parse — because the truncation-tail's first page's raw OCR text does
contain the continuation-marker text (that's mechanically why `windowPartitioner` matched it in
the first place; verified via the WARN-triggering check at `windowPartitioner.ts:95`, which
tests that exact page). So the code/label-swap correctness hazard is **structurally confined to
windows dispatched as `page_type: "continuation"`** — exactly the path §3 fixes. No change to
`table-page.md`/`prose-page.md` is needed or recommended.

---

## 2. Decision — which of the 3 candidates, and why

| Candidate | Verdict | Rationale |
|---|---|---|
| **(2) Thread column-layout across windows** | **ADOPTED — primary fix** | Root-cause fix. Deterministically correct for ANY table length / any number of truncation-tail windows / any `maxWindowPages` value, with zero new tool calls, zero new agent-flow steps, zero wire-format additions on the critical path. Exact structural mirror of the already-shipped, already-proven `statement_section` threading (`FIX-BCTC-BANK-BS-SECTION-CLASSIFIER`) — same file, same function, same caller loop. Satisfies the acceptance criterion directly: tail-window rows get the correct code/label order regardless of how the windowing happened. |
| **(1) Raise/adapt `maxWindowPages`** | **REJECTED as a code change** | Does not fix the defect CLASS — any finite cap (raised or "adaptive") still eventually truncates a sufficiently long table, and real bank Mẫu B02a/TCTDHN tables are exactly the ones that "run long" (spike Finding 3). Raising the cap only lowers the FREQUENCY of hitting the hazard, at a real cost: more page images loaded into a single Haiku-model leaf-worker turn per window (this pipeline explicitly runs on `model: haiku`, `docs/agents/refine_bctc_md/main.md` frontmatter) — a token/quality tradeoff with no correctness benefit once (2) is in place. Not adopted, not even as a supplementary tweak — no incremental gain, non-zero cost. |
| **(3) Real `truncated_continuation` flag + on-demand head-window header fetch** | **PARTIALLY ADOPTED (flag only; fetch machinery rejected)** | Adopting the *flag* half is cheap, closes a real, separately-flagged doc-honesty defect (§1's "Additional finding"), and gives future health-recheck/triage tooling a real signal instead of an inferred one (`page_numbers.length > 1`) that — per the corroborating finding above — is not even a reliable proxy for "is this a truncation tail" in the single-page edge case. The *fetch-on-demand* half is rejected: it requires a new cross-window page lookup (which physical page carries window B's true head header), a new MCP-tool-call pattern for the Haiku leaf worker, and new steps in `continuation-stitch.md` — real design/build surface that (2) already makes unnecessary for correctness. Building it anyway would be speculative complexity with no acceptance-criteria requirement it satisfies. |

**Combination shipped: (2) full + (3) flag-only.** This is deliberately narrower than "implement
all 3" — see rejections above, both argued from the acceptance criteria and the pipeline's own
model/cost constraints, not merely asserted.

---

## 3. Code diffs (primary fix — Candidate 2)

### 3.1 `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts`

**A. New exported type**, placed immediately above `resolveColumnLayout`'s existing JSDoc block
(before the `function resolveColumnLayout` declaration, ~line 355):

```ts
// FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: named alias for the
// 3-state column-layout signal, now threaded cross-window the same way
// statement_section already is (see ParseResult.finalColumnLayout /
// parseRefinedMarkdown's initialColumnLayout param below).
export type ColumnLayout = "code-first" | "label-first" | "label-only";
```

**B. `resolveColumnLayout` signature + body** (replaces lines 386-393):

```ts
/**
 * FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: `inheritedLayout`
 * is the layout carried forward from a PRIOR window's own resolved header
 * (ParseResult.finalColumnLayout), exactly mirroring how initialSection/
 * finalSection thread statement_section across windows. windowPartitioner's
 * maxWindowPages cap can split ONE continuation table into a genuine head
 * window (with the real header) and one or more truncation-tail windows
 * whose first page is itself mid-table — those windows legitimately capture
 * NO header of their own (headerCells stays null). Previously that null case
 * always fell back to the hardcoded "code-first" default, silently swapping
 * code/label on every 4-column row of a label-first (bank) tail window. Now
 * it falls back to whatever REAL layout the head window resolved, if any —
 * "code-first" remains the final fallback ONLY when nothing was ever
 * inherited (first window in a report, or a captured-but-ambiguous header —
 * unchanged from pre-fix behavior in both cases: 0-diff for every existing
 * caller that does not pass inheritedLayout).
 */
function resolveColumnLayout(
  headerCells: string[] | null,
  inheritedLayout: ColumnLayout | null,
): ColumnLayout {
  if (!headerCells || headerCells.length < 2) return inheritedLayout ?? "code-first";
  const codeIdx = headerCells.findIndex((c) => /mã|code|stt/i.test(c));
  const labelIdx = headerCells.findIndex((c) => /mục|chỉ\s*tiêu|item/i.test(c));
  if (codeIdx === -1 && labelIdx !== -1) return "label-only";
  if (codeIdx === -1 || labelIdx === -1) return "code-first";
  return labelIdx < codeIdx ? "label-first" : "code-first";
}
```

**C. `ParseResult` interface** — add field after the existing `finalSection: string;` (~line 60):

```ts
  finalSection: string;
  /**
   * FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: the resolved
   * ColumnLayout this parse ended on — same threading pattern as
   * finalSection above, for the SAME structural reason (maxWindowPages can
   * split a continuation table so a tail window's markdown never carries its
   * own header row). Callers that parse a report's DONE windows in page
   * order (finalizeBctcRefine.ts's parseDoneUnitsToRows) thread this value
   * back in as the NEXT unit's initialColumnLayout.
   */
  finalColumnLayout: ColumnLayout;
}
```

**D. `parseRefinedMarkdown` signature** — add 5th param (~line 421-426), plus one `@param` line
in its existing JSDoc:

```ts
export function parseRefinedMarkdown(
  markdown: string,
  report_id: string,
  page_numbers: number[],
  initialSection: string = "general",
  initialColumnLayout: ColumnLayout | null = null,
): ParseResult {
```

(JSDoc addition, after the existing `@param initialSection` block: `@param initialColumnLayout
FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: ColumnLayout carried forward from the
prior unit's finalColumnLayout, defaulting to null (0-diff for every existing caller that omits
it) — see ParseResult.finalColumnLayout doc.`)

**E. The one `resolveColumnLayout` call site** inside the 4+-column branch (~line 575) — was
`resolveColumnLayout(headerCells)`, becomes:

```ts
      const layout = resolveColumnLayout(headerCells, initialColumnLayout);
```

**F. Return statement** (replaces the current single-line return, ~line 691):

```ts
  return {
    rows: repairCorruptedRows(rows, parseVnNumber),
    errors,
    finalSection: currentSection,
    finalColumnLayout: resolveColumnLayout(headerCells, initialColumnLayout),
  };
```

No other lines in this file change. `headerCells` does not mutate after its single capture point
(existing behavior, unchanged), so recomputing `resolveColumnLayout` once more at return time is
side-effect-free and yields the same value used by the loop.

### 3.2 `apps/mcp-server/src/application/usecases/finalizeBctcRefine/finalizeBctcRefine.ts`

**A. Import** (line 44):

```ts
import { parseRefinedMarkdown, type ColumnLayout } from "../../utils/refinedMarkdownParser.js";
```

**B. `parseDoneUnitsToRows`** (lines 160-175) — add `carryColumnLayout`, thread it, mirroring
`carrySection` exactly:

```ts
function parseDoneUnitsToRows(doneUnits: RefinedUnitRow[], report_id: string): FinalizeBctcTableRow[] {
  const allTableRows: FinalizeBctcTableRow[] = [];
  let carrySection = "general";
  // FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: same
  // cross-window threading pattern as carrySection above — a
  // maxWindowPages-truncated tail window's markdown carries no header row
  // of its own, so resolveColumnLayout() would otherwise silently default
  // to "code-first" and swap code/label on a label-first (bank) table.
  let carryColumnLayout: ColumnLayout | null = null;

  for (const unit of doneUnits) {
    if (!unit.markdown) continue;

    let pageNumbers: number[];
    try {
      pageNumbers = JSON.parse(unit.page_numbers_json) as number[];
    } catch {
      pageNumbers = [1];
    }

    const parseResult = parseRefinedMarkdown(unit.markdown, report_id, pageNumbers, carrySection, carryColumnLayout);
    carrySection = parseResult.finalSection;
    carryColumnLayout = parseResult.finalColumnLayout;
```

(Rest of the function body — the `errors.length > 0` logging block and the row-flattening loop —
unchanged verbatim.) Also extend the function's own docstring (the `FIX-BCTC-BANK-BS-SECTION-
CLASSIFIER` comment block above the function) with one sentence noting column-layout now threads
the same way, for future readers.

### 3.3 `apps/mcp-server/src/application/utils/windowPartitioner.ts`

**A. `Window` interface** (lines 28-33) — add field:

```ts
export interface Window {
  unit_id: string;
  page_numbers: number[];
  texts: string[];
  needsImage: boolean[];
  /**
   * FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: true when this
   * window's first page is ITSELF a continuation page whose true head window
   * (carrying the table's real header) was cut short by the maxWindowPages
   * cap on the PRECEDING iteration — i.e. this window exists BECAUSE OF
   * truncation, not because a new table genuinely starts here. This is the
   * flag the module docstring below (§ Algorithm) has claimed since
   * inception without ever being implemented (0 grep hits pre-fix — see
   * SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION Finding 0). Correctness does NOT
   * depend on any caller reading this field — refinedMarkdownParser.ts's
   * cross-window column-layout inheritance (initialColumnLayout /
   * finalColumnLayout) fixes the code/label-swap defect unconditionally.
   * This flag exists for observability/triage only (surfaced to callers as
   * RefineWindow.truncated_continuation in getBctcPendingRefineTool.ts).
   */
  truncated_continuation: boolean;
}
```

**B. `partitionIntoWindows` body** (lines 56-114) — track and stamp the flag:

```ts
export function partitionIntoWindows(
  pageTexts: PageText[],
  config: { maxWindowPages: number },
): Window[] {
  const windows: Window[] = [];
  let i = 0;
  // FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: true when the
  // window about to be built starts BECAUSE the previous window's
  // continuation table was cut short by the cap (see Window.truncated_continuation doc).
  let pendingTruncationTail = false;

  while (i < pageTexts.length) {
    // ... unchanged: page/ocrText/needsImage/pageNums/texts/needsImages/inner-while-loop ...

    // Check if we hit the cap mid-continuation
    let hitCapTruncation = false;
    if (j < pageTexts.length && pageNums.length === config.maxWindowPages) {
      const nextPage = pageTexts[j]!;
      if (CONTINUATION_MARKER.test(nextPage.text)) {
        logger.warn("[windowPartitioner] continuation window truncated at maxWindowPages", {
          startPage: page.page,
          maxWindowPages: config.maxWindowPages,
        });
        hitCapTruncation = true;
      }
    }

    windows.push({
      unit_id: `unit-${String(windows.length).padStart(4, "0")}`,
      page_numbers: pageNums,
      texts,
      needsImage: needsImages,
      truncated_continuation: pendingTruncationTail,
    });

    pendingTruncationTail = hitCapTruncation;
    i = j;
  }

  return windows;
}
```

**C. Module docstring corrections** — two separate, independently-true-today paragraphs need
updating, both flagged in §1:

Replace lines 11-13 (CRITICAL invariant paragraph):
```
 * INVARIANT (as actually implemented — corrected 2026-08-08, was previously
 * aspirational/inaccurate, see SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION Finding 2):
 * partitionIntoWindows() runs to completion before any subagent spawns, and
 * every page lands in exactly one window (no page is ever dropped). A
 * continuation table CAN legitimately span MULTIPLE windows when it exceeds
 * maxWindowPages — that split is safe because refinedMarkdownParser.ts
 * threads column-layout state across windows (see resolveColumnLayout's
 * inheritedLayout param), so a truncation-tail window's rows never get a
 * silently-wrong code/label order even though it has no header of its own.
```

Replace line 50 (Algorithm bullet):
```
 * - Multi-page windows capped at maxWindowPages. A cap-hit does NOT drop or
 *   merge pages — it starts a new window at the next page, which is itself
 *   still mid-continuation and carries NO header of its own. That new
 *   window is marked `truncated_continuation: true` (real field — see the
 *   Window interface below; this comment previously claimed the flag
 *   existed when it did not).
```

### 3.4 `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`

Not in the task's own `files` list, but a NECESSARY pass-through — this is the only place `Window`
objects cross the interface boundary into the wire payload the leaf-worker flow reads
(`windows[]` in `get_bctc_pending_refine`'s response). Flagged explicitly as an ADDED file.

**A. `RefineWindow` interface** (lines 82-89) — add field:

```ts
export interface RefineWindow {
  unit_id: string;
  page_numbers: number[];
  /** Derived from window content: multi-page → "continuation", needsImage → "table", else "prose" */
  page_type: "table" | "prose" | "continuation";
  /** True if any page in the window requires image loading (classifyPageForImageLoad). */
  needs_image: boolean;
  /**
   * FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: pass-through
   * of Window.truncated_continuation (windowPartitioner.ts) — true when this
   * window exists because a maxWindowPages cap cut off the true head
   * window's continuation table. See continuation-stitch.md for how the
   * leaf worker may use this (informational only — the server-side parser
   * already recovers correct column layout regardless of whether any caller
   * reads this field).
   */
  truncated_continuation: boolean;
}
```

**B. `windows.map(...)` body** (lines 319-335) — add the pass-through:

```ts
                windows = rawWindows.map((w) => {
                  const needsImage = w.needsImage.some(Boolean);
                  let page_type: RefineWindow["page_type"];
                  if (w.page_numbers.length > 1) {
                    page_type = "continuation";
                  } else if (needsImage) {
                    page_type = "table";
                  } else {
                    page_type = "prose";
                  }
                  return {
                    unit_id: w.unit_id,
                    page_numbers: w.page_numbers,
                    page_type,
                    needs_image: needsImage,
                    truncated_continuation: w.truncated_continuation,
                  };
                });
```

**Compatibility check performed (not just asserted):** `grep -n "toEqual\|toMatchObject" ` against
both existing `windowPartitioner`-consuming tests
(`AR-refined-units-idempotency.test.ts:349-373`, `FIX-REFINE-WINDOW-DB-PAGELIST.test.ts:100-144`)
confirms both only assert on `.page_numbers` subfields, never a full-object deep-equal — the new
field is additive/non-breaking for both. `AR-refined-units-idempotency.test.ts` imports
`partitionIntoWindows` via `bctcRefineJob.ts`'s re-export (`bctcRefineJob.ts:36,38`), which is a
straight `export { partitionIntoWindows } from "../../application/utils/windowPartitioner.js"` —
no separate implementation to update.

---

## 4. Flow-doc diffs (documentation correction, no leaf-worker behavior change required)

### 4.1 `docs/agents/refine_bctc_md/flow/continuation-stitch.md`

Add a new section after "STITCH RULES" (before "Worked Example"):

```markdown
## Truncation-Tail Windows (informational — no new step required)

Some windows dispatched here exist because a much longer continuation table exceeded
`maxWindowPages` and got split (`windows[].truncated_continuation === true` when the server
surfaces it). For such a window, Step 2's "collect header" may legitimately find NOTHING on
page N — that is expected, not an error; page N is itself a truncated mid-table continuation,
not the table's true first page. Do not fabricate a header. Proceed straight to data-row
collection (same as any window whose first page has no header line). The server-side parser
(`finalize_bctc_refine`) already recovers the correct code/label column order for these rows by
inheriting it from the true head window automatically — you do not need to fetch, guess, or
backfill it. Optional: add flag `truncation_tail_no_own_header` when this occurs, for triage
visibility only (does not affect confidence scoring).
```

### 4.2 `docs/agents/refine_bctc_md/flow/main.md`

Line 84 — update the window shape description:

```
`windows[]` from `get_bctc_pending_refine` is pre-partitioned (continuation-invariant
enforced server-side). Each: `{ unit_id, page_numbers, page_type, needs_image,
truncated_continuation }` — see `continuation-stitch.md` § Truncation-Tail Windows for the
last field's meaning.
```

This file carries a `size-justification` comment at line 1 pinned to its current line count —
whoever implements this diff should bump that count/justification per the file's own convention
if the final line delta changes it materially (this 1-line addition should not).

---

## 5. Regression fixture (new test file)

`apps/mcp-server/src/__tests__/FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW.test.ts`
— full verbatim content below. All expected values in the assertions were hand-traced against the
POST-FIX parser logic line-by-line (shown in the reasoning above, not just asserted); the file
is ready to run once §3's diffs land.

```ts
/**
 * FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW.test.ts
 *
 * Regression fixture for the maxWindowPages truncation → headless-tail-window →
 * code/label-swap defect (docs/spikes/SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION.md).
 *
 * No existing test exercises the actual >maxWindowPages split-across-two-windows path
 * end to end (partition → refine markdown → finalize) with a label-first (bank-form)
 * continuation table — AR-refined-units-idempotency.test.ts:346,369 and
 * FIX-REFINE-WINDOW-DB-PAGELIST.test.ts:128 both use maxWindowPages:3 with inputs that
 * never exceed the cap, or test a different bug (DB-driven page-list construction).
 *
 * SYNTHETIC per the task's own acceptance criteria (unlike FIX-BCTC-BANK-BS-COLUMN-ORDER's
 * mandatory-real-data provenance gate — this defect was NOT independently reproduced from a
 * live corrupted row within the spike's timebox, so a hand-authored, structurally faithful
 * bank Mẫu B02a/TCTDHN-shaped fixture is the explicitly sanctioned approach).
 *
 * Part 1: windowPartitioner — a 6-page synthetic continuation run with maxWindowPages:3
 *         truncates into exactly 2 windows; the tail window is correctly flagged
 *         truncated_continuation:true.
 * Part 2: parseRefinedMarkdown — label-first (bank) head window WITH header, tail window
 *         WITHOUT header, threaded via initialColumnLayout/finalColumnLayout: tail-window
 *         rows resolve code/label in the CORRECT order.
 * Part 3: Negative control — code-first (corporate) equivalent is 0-diff (inheritedLayout
 *         and the pre-existing hardcoded default are both "code-first" for this shape, so
 *         behavior is byte-identical with or without the fix).
 * Part 4: Full integration via the real finalize_bctc_refine handler (DB writes), proving
 *         the cross-window thread survives parseDoneUnitsToRows, not just the pure parser.
 *
 * @module __tests__/FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { partitionIntoWindows } from "../application/utils/windowPartitioner.js";
import { parseRefinedMarkdown } from "../application/utils/refinedMarkdownParser.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

// ═══════════════════════════════════════════════════════════════════════════
// Part 1 — windowPartitioner: cap-hit produces exactly 2 windows, tail flagged
// ═══════════════════════════════════════════════════════════════════════════

describe("windowPartitioner: maxWindowPages truncation produces a flagged tail window", () => {
  it("6-page continuation run, maxWindowPages:3 → 2 windows [1,2,3]+[4,5,6], only the tail flagged truncated_continuation", () => {
    const pageTexts = [
      { page: 1, text: "BÁO CÁO TÌNH HÌNH TÀI CHÍNH | Mục | Mã | table data" },
      { page: 2, text: "(tiếp theo) | more table data" },
      { page: 3, text: "(tiếp theo) | more table data" },
      { page: 4, text: "(tiếp theo) | more table data" },
      { page: 5, text: "(tiếp theo) | more table data" },
      { page: 6, text: "(tiếp theo) | more table data" },
    ];

    const windows = partitionIntoWindows(pageTexts, { maxWindowPages: 3 });

    expect(windows).toHaveLength(2);
    expect(windows[0]!.page_numbers).toEqual([1, 2, 3]);
    expect(windows[0]!.truncated_continuation).toBe(false);
    expect(windows[1]!.page_numbers).toEqual([4, 5, 6]);
    expect(windows[1]!.truncated_continuation).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 2 — label-first (bank) cross-window column-layout threading
// ═══════════════════════════════════════════════════════════════════════════

// Head window (window A) — pages [1,2,3], WITH its own label-first header.
const BANK_HEAD_MD =
  "# NGÂN HÀNG TMCP ABC — BÁO CÁO TÌNH HÌNH TÀI CHÍNH HỢP NHẤT\n\nMẫu số: B02a/TCTDHN\n\n## TÀI SẢN\n\n| Mục (Item) | Mã (Code) | Năm 2026 | Năm 2025 |\n|---|---|---:|---:|\n| I. Tiền mặt, vàng bạc, đá quý | | 1,000,000 | 900,000 |\n| II. Tiền gửi tại NHNN | 2 | 2,000,000 | 1,800,000 |\n";

// Tail window (window B) — pages [4,5,6], truncation-tail: NO header line,
// NO separator line — pure continuation data (the expected shape per
// SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION Finding 2).
const BANK_TAIL_MD =
  "| III. Tiền gửi và cho vay các TCTD khác | 3 | 5,000,000 | 4,500,000 |\n| IV. Chứng khoán kinh doanh | | 3,000,000 | 2,800,000 |\n| **TỔNG TÀI SẢN CÓ** | | **11,000,000** | **10,000,000** |\n";

describe("FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: label-first bank tail window", () => {
  it("head window resolves label-first from its own captured header", () => {
    const head = parseRefinedMarkdown(BANK_HEAD_MD, "bank-synth", [1, 2, 3]);
    expect(head.errors).toEqual([]);
    expect(head.finalColumnLayout).toBe("label-first");
  });

  it("tail window (no header of its own) INHERITS label-first from the head window — code/label NOT swapped", () => {
    const head = parseRefinedMarkdown(BANK_HEAD_MD, "bank-synth", [1, 2, 3]);
    const tail = parseRefinedMarkdown(
      BANK_TAIL_MD,
      "bank-synth",
      [4, 5, 6],
      head.finalSection,
      head.finalColumnLayout,
    );
    expect(tail.errors).toEqual([]);
    expect(tail.rows).toHaveLength(3);

    const populatedCodeRow = tail.rows.find((r) => r.label === "III. Tiền gửi và cho vay các TCTD khác");
    expect(populatedCodeRow).toBeDefined();
    // CORE ASSERTION — before the fix, code held the label text and label held "3" (swapped).
    expect(populatedCodeRow!.code).toBe("3");
    expect(populatedCodeRow!.value_current).toBe(5000000);
    expect(populatedCodeRow!.value_prior).toBe(4500000);

    const blankCodeRow = tail.rows.find((r) => r.label === "IV. Chứng khoán kinh doanh");
    expect(blankCodeRow).toBeDefined();
    expect(blankCodeRow!.code).toBeNull();
    expect(blankCodeRow!.value_current).toBe(3000000);

    const total = tail.rows.find((r) => r.label === "**TỔNG TÀI SẢN CÓ**");
    expect(total).toBeDefined();
    expect(total!.code).toBeNull();
    expect(total!.value_current).toBe(11000000);
    expect(total!.value_prior).toBe(10000000);
  });

  it("tail window parsed WITHOUT the inherited layout (old call shape, pre-fix simulation) DOES swap — proves the fixture is decisive, not a false positive", () => {
    // Simulates the pre-fix call site: no 5th argument at all.
    const tail = parseRefinedMarkdown(BANK_TAIL_MD, "bank-synth", [4, 5, 6]);
    const row = tail.rows.find((r) => r.value_current === 5000000);
    expect(row).toBeDefined();
    // Defaulted to code-first with no inherited layout: label text ends up in `code`,
    // "3" ends up in `label` — the exact corruption the spike describes.
    expect(row!.code).toBe("III. Tiền gửi và cho vay các TCTD khác");
    expect(row!.label).toBe("3");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 3 — negative control: code-first (corporate) continuation is 0-diff
// ═══════════════════════════════════════════════════════════════════════════

const CORP_HEAD_MD =
  "# CÔNG TY CỔ PHẦN ABC — BẢNG CÂN ĐỐI KẾ TOÁN\n\n| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |\n|---|---|---:|---:|\n| 100 | Tài sản ngắn hạn | 15,000,000 | 14,000,000 |\n";

const CORP_TAIL_MD =
  "| 220 | Tài sản dài hạn | 28,000,000 | 26,500,000 |\n| | **TỔNG CỘNG TÀI SẢN** | **43,000,000** | **40,500,000** |\n";

describe("Negative control: code-first (corporate) continuation table is unaffected (0-diff)", () => {
  it("head window resolves code-first (unchanged default)", () => {
    const head = parseRefinedMarkdown(CORP_HEAD_MD, "corp-synth", [1, 2, 3]);
    expect(head.finalColumnLayout).toBe("code-first");
  });

  it("tail window (no header) — inherited code-first === pre-existing hardcoded default: byte-identical result with or without the fix", () => {
    const head = parseRefinedMarkdown(CORP_HEAD_MD, "corp-synth", [1, 2, 3]);
    // Both calls pass the SAME initialSection (head.finalSection) so the
    // comparison isolates ONLY the columnLayout parameter under test — the
    // pre-existing, already-proven statement_section threading is not what
    // this negative control is about.
    const tailWithInheritance = parseRefinedMarkdown(
      CORP_TAIL_MD, "corp-synth", [4, 5, 6], head.finalSection, head.finalColumnLayout,
    );
    const tailWithoutInheritance = parseRefinedMarkdown(
      CORP_TAIL_MD, "corp-synth", [4, 5, 6], head.finalSection, // 5th arg omitted (defaults null)
    );

    expect(tailWithInheritance.rows).toEqual(tailWithoutInheritance.rows);

    const row = tailWithInheritance.rows.find((r) => r.code === "220");
    expect(row).toBeDefined();
    expect(row!.label).toBe("Tài sản dài hạn");
    expect(row!.value_current).toBe(28000000);

    const total = tailWithInheritance.rows.find((r) => r.label === "**TỔNG CỘNG TÀI SẢN**");
    expect(total).toBeDefined();
    expect(total!.code).toBeNull();
    expect(total!.value_current).toBe(43000000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 4 — full integration through the real finalize_bctc_refine handler
// ═══════════════════════════════════════════════════════════════════════════

function openFullDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

function seedReport(db: Database, id: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        total_assets, total_liabilities, equity_total,
        validation_status, validation_notes,
        refine_status, confirm_status)
     VALUES (?, 'ABC', 'Bank ABC', 'HOSE', 'other',
             2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.75,
             '{}', '{}', '{}', '{}',
             0, 0, 0,
             'pending', NULL,
             'PARTIAL', 'PENDING')`,
  ).run(id);
}

describe("Full pipeline: finalize_bctc_refine over a truncated (head+tail) bank-form window pair", () => {
  let db: Database;
  beforeEach(() => { db = openFullDb(); });
  afterEach(() => { db.close(); });

  it("tail-window rows land in bctc_table_rows with code/label in the CORRECT order — not just non-empty", async () => {
    const REPORT_ID = "bank-synth-e2e";
    seedReport(db, REPORT_ID);

    const units: Array<[string, string, number[]]> = [
      ["unit-0000", BANK_HEAD_MD, [1, 2, 3]],
      ["unit-0001", BANK_TAIL_MD, [4, 5, 6]],
    ];
    for (const [unitId, md, pages] of units) {
      db.prepare(
        `INSERT INTO bctc_refined_units
           (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
         VALUES (?, ?, ?, ?, 0, 0.8, 'DONE')`,
      ).run(REPORT_ID, unitId, JSON.stringify(pages), md);
    }

    const handler = buildFinalizeBctcRefineHandler(db);
    const raw = await handler({ report_id: REPORT_ID, report_status: "DONE" });
    const response = JSON.parse(raw.content[0]!.text) as { ok: boolean; rows_parsed: number };
    expect(response.ok).toBe(true);
    expect(response.rows_parsed).toBe(5); // 2 head rows + 3 tail rows

    interface RowShape { code: string | null; label: string; value_current: number | null; page_number: number }
    const rows = db
      .prepare<RowShape, [string]>(
        `SELECT code, label, value_current, page_number FROM bctc_table_rows WHERE report_id = ? ORDER BY row_order ASC`,
      )
      .all(REPORT_ID);

    const tailRow = rows.find((r) => r.value_current === 5000000);
    expect(tailRow).toBeDefined();
    expect(tailRow!.code).toBe("3");
    expect(tailRow!.label).toBe("III. Tiền gửi và cho vay các TCTD khác");
    expect(tailRow!.page_number).toBe(4); // stamped from the tail window's own page_numbers[0]
  });
});
```

---

**Implementer caveat:** every row-level assertion in §5 was hand-traced field-by-field against the
POST-FIX code paths (`resolveColumnLayout`'s branch logic, `parseVnNumber`'s VN/English
thousands-separator auto-detect, `isHeaderRow`'s numeric-cell-count heuristic, the
`is_summary_row` regex reused verbatim from the already-green `FIX-BCTC-BANK-BS-COLUMN-ORDER`
fixture for the identical `"**TỔNG TÀI SẢN CÓ**"` string) and the DT-2/DT-3 sanity-gate predicates
in `bctcMagnitudeValidator.ts` were checked to confirm this fixture cannot trip a `BLOCK` (no
`total_liabilities`/`equity_total`-labeled rows exist in it, so the forced-zero check's 3-way
`AND` never completes; no `income_statement` rows, so DT-2a/DT-3 both no-op) — this was traced by
reading, not executed (architect holds no Bash grant on this plan-only row). Run `bun test
FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW.test.ts` after applying §3's diffs;
if any assertion is off by a formatting nuance, fix the assertion, not the parser (the diffs in
§3 are the load-bearing part of this spec).

## 6. Acceptance-criteria verification table

| Acceptance clause | Satisfied by |
|---|---|
| Synthetic label-first (bank Mẫu B02a/TCTDHN-shaped) continuation table spanning > maxWindowPages pages | §5 Part 1 (6 pages, cap 3) + Part 2/4 markdown fixtures |
| Run through partitionIntoWindows → parseRefinedMarkdown (threaded) → finalizeBctcRefine's parseDoneUnitsToRows | §5 Part 1 (windowing) + Part 2 (pure-function threading) + Part 4 (real `buildFinalizeBctcRefineHandler` → `parseDoneUnitsToRows` → INSERT, DB read-back) |
| Tail-window rows: code/label CORRECT order, not just non-empty | §5 Part 2/4 explicit per-field assertions (`code`, `label`, both values) on 3 distinct row shapes (populated code, blank code, bold grand total) |
| Negative control: existing code-first (corporate) fixture 0-diff | §5 Part 3 — `toEqual` on the full parsed row array, with-vs-without inheritance |
| Health-recheck WARN wording corrected in the same change (or follow-up doc-only PR) | See §7 — finding: no live doc currently carries the wrong attribution (mechanism is dead); the one still-live inaccuracy (`truncated_continuation` docstring) is corrected in §3.3C as part of THIS change |

---

## 7. WARN severity/wording finding (no code change required beyond §3.3C)

Traced the misattribution's full lifecycle, not just its origin:

- The writer that produced the wrong "intelligence-cycle/news signal-drop" framing was a **cloud
  RemoteTrigger** (`trig_019Q8D5xttjZn6iytx2Ld9dW`), killed 2026-06-22 by the no-RemoteTrigger
  directive (`feedback_no_remote_trigger_all_local.md`) and silent since 2026-06-23
  (`docs/agents/agent-father/flow/team-tool-recheck.md:1-11`).
- The specific file the task cites
  (`docs/agent-memory/health/team-tool-recheck-2026-06-21-1605.md`) no longer exists on disk —
  pruned by a later janitor sweep (commit `8d9238257`, confirmed via `git log --all` on that
  path). It is archived git history, not a live document.
- The REPLACEMENT flow (`docs/agents/agent-father/flow/team-tool-recheck.md`, 2026-08-06, "REPLACE
  not retire") explicitly does **not** cover this WARN category at all — it re-scoped to a
  completely different check (tool-grant vs declared-write-boundary) and flags the old
  live-MCP-probe/BCTC-adjacent scope as **out of scope**, handed off separately
  (`docs/signals/2026-08-06-chore-team-tool-recheck-livescope-handoff.json`), not silently
  dropped.
- Repo-wide grep (`docs/`, `apps/`) for the misattributing phrase or any
  `maxWindowPages`↔`intelligenceCycleJob` linkage today returns **zero live hits** outside the
  spike document itself (which is correctly quoting the historical error, not perpetuating it).

**Conclusion: there is no live document to correct for the intelligence-cycle misattribution** —
the mechanism that produced it is dead and its outputs are gone. What IS live and wrong is the
`windowPartitioner.ts:50` docstring's false `truncated_continuation` claim, which §3.3C corrects
in this same change. The WARN's log level itself (`logger.warn`, `windowPartitioner.ts:96`)
already matches the spike's own recommendation ("severity should stay WARN, not downgraded to
INFO") — no severity change needed, it was never changed to begin with.

---

## 8. Explicitly out of scope (flagged for PO, not silently dropped)

- **No change to `bctcSectionCompleteness.ts`/BEQ-7.** It still won't catch a code/label swap
  (presence-only check) — that gap is real (spike Finding 2) but this fix eliminates the swap at
  its source; adding a correctness-shape gate as defense-in-depth is a legitimate SEPARATE
  follow-up (belt-and-suspenders), not required to close this task's acceptance criteria.
- **No change to `table-page.md`/`prose-page.md`.** §1's corroborating finding shows both already
  fail loud on a truncation-tail's continuation-marker text rather than silently corrupt.
- **No change to `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`** (the original
  design brief). Its line 78/80 wording is now historically inaccurate re: the "never split"
  invariant and the lossy-truncation intent (§1), but it's a point-in-time design record, not a
  live operational doc — a correction there is optional doc hygiene, not required for this fix.

## 9. Open question for PO

None blocking. One judgment call worth ratifying: the `truncated_continuation` flag (§3.3) is
named to match the pre-existing (false) docstring claim rather than a clearer name like
`is_truncation_tail`, on the theory that "making the claimed thing real" should keep the claimed
name. If PO/dev-mcp-server prefers a clearer name at implementation time, that's a pure rename
with no semantic risk — flagging so it's a deliberate choice, not an oversight.
