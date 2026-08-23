---
sprint: SPRINT-S
branch: none
size: S
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR

Fix the `buildLabel()` quarter-duplication bug in bctcInspectHandler.ts (affects all 255 quarterly rows, not just 2 HUT rows as BA initially flagged). Bug root cause: `period_type` already holds `'Q1'..'Q4'` on every row, but the function unconditionally appends a 2nd `Q${period_quarter}` token → `"VCB Q1 Q1 2025"` instead of `"VCB Q1 2025"`. Then update the hardcoded test assertion in PI3-bctc-inspect.test.ts:361 to match the corrected label.

## [PM] Planning Context

- **Zone:** `apps/mcp-server/src/interface/`
- **Acceptance Criteria:**
  - [ ] AC9: `buildLabel()` in `bctcInspectHandler.ts:167-171` applies normalizer so option label reads "HUT Q1 2024" (not "HUT Q1 QQ1 2024") — fixes all 255 normal rows + the 2 HUT edge cases
  - [ ] AC-14: `PI3-bctc-inspect.test.ts:361` assertion updated from `"VCB Q1 Q1 2025"` → `"VCB Q1 2025"` — in-scope test-value update, not a regression to preserve
  - [ ] No regression: other test files untouched (PI3-bctc-inspect-reopen2, 1271-bctc-inspect-md, 1976-page-nav, 1273-overlay all stay green without change)

- **Files to read first:**
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:141-171` (DocListItem type, LIST_SQL unchanged, buildLabel() current impl, output shape)
  - `apps/mcp-server/src/__tests__/PI3-bctc-inspect.test.ts:19,223-256,348-362` (export pattern for real unit tests + the frozen AC-14 assertion at line 361)

- **Files to modify:**
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — FR-3b / AC9 fix:
    - Add new EXPORTED function `normalizeQuarter()` (same pattern as existing `isDecimalShiftAnomaly`, `isValidUuid`):
      ```ts
      export function normalizeQuarter(periodQuarter: number | string | null): number | null {
        if (periodQuarter === null || periodQuarter === undefined) return null;
        const n = typeof periodQuarter === "number"
          ? periodQuarter
          : Number.parseInt(String(periodQuarter).replace(/^Q/i, ""), 10);
        return Number.isFinite(n) ? n : null;
      }
      ```
    - Fix `buildLabel()` (lines 167-171):
      - Add regex `const QUARTERLY_PERIOD_TYPE_RE = /^Q[1-4]$/i;` at module scope
      - Change logic: only append a quarter suffix when `period_type` does NOT already encode it (reserved for hypothetical future ANNUAL row that carries a period_quarter)
      - Implementation per architect D-1 spec:
        ```ts
        function buildLabel(row: FinancialReportRow): string {
          // period_type already holds 'Q1'..'Q4' for every live quarterly row (verified — never
          // the 'QUARTERLY'/'ANNUAL' literal this fn's original comment assumed). Only append a
          // quarter suffix when period_type does NOT already encode it (reserved for a future
          // ANNUAL row that also carries a period_quarter) — prevents the duplicate/garbled token.
          const q = QUARTERLY_PERIOD_TYPE_RE.test(row.period_type) ? null : normalizeQuarter(row.period_quarter);
          const quarter = q !== null ? ` Q${q}` : "";
          return `${row.action_code} ${row.period_type}${quarter} ${row.period_year}`;
        }
        ```
    - Verified output: normal row `{action_code:"VCB", period_type:"Q1", period_quarter:1, period_year:2025}` → `"VCB Q1 2025"` ✓
    - Verified output: HUT string row `{action_code:"HUT", period_type:"Q1", period_quarter:"Q1", period_year:2024}` → `"HUT Q1 2024"` ✓
    - Verified output: hypothetical ANNUAL + quarter `{action_code:"ABC", period_type:"ANNUAL", period_quarter:1, period_year:2025}` → `"ABC ANNUAL Q1 2025"` ✓

  - `apps/mcp-server/src/__tests__/PI3-bctc-inspect.test.ts` — test assertion + new unit tests:
    - Update line 361: `expect(body.items[0]!.label).toBe("VCB Q1 Q1 2025")` → `expect(body.items[0]!.label).toBe("VCB Q1 2025")`
    - Add new `describe("normalizeQuarter()")` block after existing `isDecimalShiftAnomaly`/`isValidUuid` blocks (same pattern — real EXPORTED function unit tests):
      - Case 1: number passthrough — `normalizeQuarter(1)` → `1`
      - Case 2: `"Q1"`-shaped string coercion — `normalizeQuarter("Q1")` → `1`, `normalizeQuarter("Q4")` → `4`
      - Case 3: `null` handling — `normalizeQuarter(null)` → `null`
      - Case 4: undefined handling — `normalizeQuarter(undefined)` → `null`
      - Case 5: malformed string defensive — `normalizeQuarter("ABC")` → `null` (not `NaN`)
      - Case 6: edge case — `normalizeQuarter("Q0")` → `null` (parseInt returns 0, Number.isFinite(0) is true, so this returns `0` — verify this is intended or add a range check 1-4)

- **Dependencies:** none

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (commit convention)
  - Architect spec [Architect] Brownfield Findings § D-1 (buildLabel() fix design + verified outputs)
  - BA spec FR-3 (normalizer contract), AC9 (literal target label)
  - Note: `period_quarter: number | null` type annotation does NOT match 2/257 live rows (string "Q1" on HUT) — pre-existing type/runtime mismatch, declared out of scope by BA; `normalizeQuarter()` is defensive regardless

---

## Why This Fix

**AC9 root cause (architect finding, broader than BA's initial framing):**

BA flagged the 2 HUT rows with string `period_quarter` as the source of the duplicate "Q1 Q1" label. Live testing (`node -e`) showed the bug affects ALL 255 rows:
- Normal row: `buildLabel({action_code:"VCB", period_type:"Q1", period_quarter:1, period_year:2025})` → `"VCB Q1 Q1 2025"` (duplicate Q1)
- HUT string row: `buildLabel({action_code:"HUT", period_type:"Q1", period_quarter:"Q1", period_year:2024})` → `"HUT Q1 QQ1 2024"` (garbled double-coerce)

Root cause: The function's original comment assumed `period_type` would hold literals like `"QUARTERLY"`/`"ANNUAL"`, but it actually holds `'Q1'..'Q4'` on every row. So the code that _was meant to_ append a quarter suffix (for a row lacking one) instead _always_ appends one, even when `period_type` already encodes it.

Fix: Only append a quarter suffix when `period_type` does NOT already match the quarterly pattern — the conditional logic in architect's D-1 implementation.

**BA's literal FR-3b prescription (parseInt-coerce `period_quarter` only) would NOT fix this** — it would only turn `"QQ1"` into `"Q1"`, leaving normal rows still showing `"VCB Q1 Q1 2025"`. The architect's revised mechanism (D-1) is the correct fix.

---

## Regression Test Coverage

AC-14 (`PI3-bctc-inspect.test.ts:361`) is the ONLY assertion in the entire test suite that hardcodes the label value. The other 4 test files (1976-page-nav, 1273-overlay, PI3-reopen2, 1271-md) do not touch labels at all and will stay green by construction.

---

## Related

- **Paired task:** TASK-BCTC-INSPECT-UI-FILTERS (client-side facet filter feature)
- **Parent:** FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER (decomposed from this parent, sibling of TASK-BCTC-INSPECT-UI-FILTERS)

## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts:167-190` — added `QUARTERLY_PERIOD_TYPE_RE` module-scope regex + exported `normalizeQuarter()` (defensive number|string coercion); `buildLabel()` now only appends a ` Q${n}` suffix when `period_type` does NOT already match `/^Q[1-4]$/`, per architect D-1
  - `apps/mcp-server/src/__tests__/PI3-bctc-inspect.test.ts` — AC-14 assertion at (former) line 361 corrected `"VCB Q1 Q1 2025"` → `"VCB Q1 2025"`; new `describe("TASK-BCTC-INSPECT-LABEL-FIX AC9 — normalizeQuarter()")` block (6 cases: number passthrough, `"Qn"` string coercion, null, undefined, malformed string, `"Q0"` edge case)
- **Tests written:** `apps/mcp-server/src/__tests__/PI3-bctc-inspect.test.ts` — 49 assertions total in file, 103 `expect()` calls, GREEN
- **Git commits:** `237fa6e26` fix(mcp-server/bctc-inspect): stop buildLabel() double-appending quarter token
- **Type check:** clean (`bun tsc --noEmit`, 0 errors)
- **bun test:** `PI3-bctc-inspect.test.ts` 49 pass / 0 fail; sibling regression files (`PI3-bctc-inspect-reopen2`, `1271-bctc-inspect-md`, `1976-bctc-inspector-page-nav`, `1273-bctc-inspect-overlay`) 60 pass / 0 fail, untouched
- **Tool count:** 183 tools — server boot healthy (`PORT=3099`, `/health` toolCount=183), no tool registration file touched by this change
- **Scheduler count:** 88 cron jobs (`gen-project-stats --dry-run`) — unchanged, no scheduler file touched
- **Live verification:** `curl :3099/api/bctc-inspect/docs` post-fix — 0/268 rows show a duplicated/garbled quarter token (was 255/257 rows pre-fix per architect's live-tested finding); HUT rows now render `"HUT Q1 2024"` etc. correctly. `/api/bctc-inspect` and `/dashboards/news-fetch/` both returned HTML (dashboard circular-dep check clean).
- **Docs updated:** NONE — pure interface-layer bug fix, no new endpoint/schema/domain concept; existing `docs/architecture/microservice/mcp-server/financial-reports.md` API description of `/api/bctc-inspect/docs` is unaffected by the label-value fix
- **Graphify:** skipped (no docs impacted)
- **Simplicity gate:** PASS — Q1 scope clean (regex + normalizer both explicitly required by AC9/D-1 spec), Q2 no single-use abstractions (`normalizeQuarter()` mirrors the existing exported-pure-function test pattern `isDecimalShiftAnomaly`/`isValidUuid`), Q3 senior-test clean (one guard + one helper, no indirection), Q4 ratio <50% overhead (all added lines directly satisfy AC9/AC-14)
