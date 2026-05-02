# TASK 1833a — DRY: marketContextTools.ts delegate to marketContextBuilder.ts

**Sprint:** 1833
**Type:** DRY (JANITOR-020)
**Priority:** MEDIUM
**Owner:** developer
**Branch:** `task/1833a-dry-market-context-tools`
**Estimated effort:** ~1.5h
**Depends on:** none
**Blocks:** none

---

## Context

`marketContextTools.ts` (501 lines) contains ~340 lines of duplicated code — interfaces, helper
functions, and section builders — that already exist in `marketContextBuilder.ts`. The tools file
re-implements `buildWatchlistSection`, `buildMacroSection`, `buildAlertsSection`, and
`buildAnalysisSection` verbatim. The only non-mechanical delta is that the tools file calls
`buildSystemSection(db)` (local private) while the builder exports `buildSystemStatusText(db)`.

Net result after this task: ~-334 lines in `marketContextTools.ts`.

---

## Files to Change

### 1. `apps/mcp-server/src/domain/services/marketContextBuilder.ts`

Add `export` keyword to 4 currently private functions (lines ~149, ~195, ~267, ~305):

```
function buildWatchlistSection(...)  →  export function buildWatchlistSection(...)
function buildMacroSection(...)      →  export function buildMacroSection(...)
function buildAlertsSection(...)     →  export function buildAlertsSection(...)
function buildAnalysisSection(...)   →  export function buildAnalysisSection(...)
```

`buildSystemStatusText` is already exported — no change needed there.

### 2. `apps/mcp-server/src/interface/mcp/tools/market-data/marketContextTools.ts`

#### Step A — Verify before deleting
Confirm `tradingWindowLabel` is ONLY used inside the now-deleted `buildWatchlistSection` local copy,
not elsewhere in the file. (Grep the file for `tradingWindowLabel` — expect exactly 1 hit on line ~150.)
Same check for `sqlInClause` (expect 1 hit inside local `buildMacroSection`).

#### Step B — Remove duplicated code (lines ~68–437)
Delete these blocks entirely:
- `parseAffectedCodes()` — helper, lines ~68–89
- `parseSignalTypes()` — helper, lines ~90–113
- `formatPriceChange()` — helper, lines ~114–126
- `PRICE_STALE_THRESHOLD_MS` constant — line ~127
- `isPriceStale()` — helper, lines ~133–146
- `buildWatchlistSection()` — local copy, lines ~147–197
- `buildMacroSection()` — local copy, lines ~198–280
- `buildAlertsSection()` — local copy, lines ~281–327
- `buildAnalysisSection()` — local copy, lines ~328–380
- `buildSystemSection()` — local copy, lines ~381–437 (renamed in Step D)
- All local `interface MacroRow` / `interface WatchlistRow` etc. type definitions

#### Step C — Update imports
Remove now-unused imports:
```typescript
// REMOVE these lines:
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import { tradingWindowLabel } from "../../../../domain/services/tradingWindow.js";
import type { AnalysisRow, AlertCountRow, LastCycleRow } from "../../../../domain/services/marketContextBuilder.js";
import { MACRO_CODES } from "../../../../domain/services/marketContextBuilder.js";
```

Add consolidated import:
```typescript
import {
  buildWatchlistSection,
  buildMacroSection,
  buildAlertsSection,
  buildAnalysisSection,
  buildSystemStatusText,
  MACRO_CODES,
  type AnalysisRow,
  type AlertCountRow,
  type LastCycleRow,
} from "../../../../domain/services/marketContextBuilder.js";
```

Note: `MACRO_CODES`, `AnalysisRow`, `AlertCountRow`, `LastCycleRow` may still be referenced in the
`registerMarketContextTools` body — re-export them from the same import line rather than removing.

#### Step D — Rename call site (non-mechanical change)
In `registerMarketContextTools`, the assembler block calls `buildSystemSection(db)`. Rename to:
```typescript
buildSystemStatusText(db),
```

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | `tsc --noEmit` exits 0 with no errors |
| AC-2 | `bun test` passes all 8608 existing tests, 0 new failures |
| AC-3 | `marketContextTools.ts` is ≤170 lines after the change |
| AC-4 | `marketContextBuilder.ts` exports `buildWatchlistSection`, `buildMacroSection`, `buildAlertsSection`, `buildAnalysisSection`, `buildSystemStatusText` (all 5 section builders public) |
| AC-5 | No duplicated section-builder or helper function exists in `marketContextTools.ts` |
| AC-6 | `tradingWindowLabel` and `sqlInClause` are NOT imported in `marketContextTools.ts` |

---

## Test File

No new test file needed. Existing coverage:
`apps/mcp-server/src/__tests__/1360a-market-context-builder.test.ts` (16 tests) covers all section
builders. Run it explicitly if you want a targeted check:
```bash
bun test apps/mcp-server/src/__tests__/1360a-market-context-builder.test.ts
```

---

## Commit Message Template

```bash
git commit -m "$(cat <<'EOF'
task(1833a): DRY — marketContextTools delegates section builders to marketContextBuilder

- export 4 private fns in marketContextBuilder.ts
- remove ~334 duplicated lines from marketContextTools.ts
- rename buildSystemSection call → buildSystemStatusText
- tsc clean, 8608 pass / 0 fail

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Definition of Done

- [ ] AC-1 through AC-6 all pass
- [ ] Commit on branch `task/1833a-dry-market-context-tools`
- [ ] Report written to `reports/TASK_REPORT_1833a.md`
- [ ] Handoff back to PM / QA via caveman
