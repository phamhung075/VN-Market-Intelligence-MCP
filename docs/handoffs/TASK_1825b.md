# TASK_1825b — FIX: GSO HTML Parser

**Assigned to:** developer
**Handoff to:** qa
**Branch:** `task/1825b-gso-html-parser`
**Priority:** High
**Type:** FIX
**Started:** 2026-05-02

---

## Context

Source 3 in `macroIndicatorFetcher.ts` fetches GSO HTML directly (without VPS proxy since Sprint 1824e). The result is raw HTML, not JSON. The current code calls `JSON.parse(result)` which always throws on HTML input, causing Source 3 to silently fail on every macro refresh cycle.

The fix is a pure `parseGsoHtml(html: string): MacroData` function that uses regex extraction — no new dependencies.

---

## Files to Change

```
apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts
apps/mcp-server/src/__tests__/239-macro-indicator-refresh.test.ts
```

---

## Changes Required

### 1. `macroIndicatorFetcher.ts`

- Add pure function `parseGsoHtml(html: string): MacroData` (~22 lines) that:
  - Uses regex to extract CPI and GDP values from GSO HTML
  - Returns a valid `MacroData` shape on success
  - Returns a fallback/empty `MacroData` (or throws a typed error) when HTML contains no recognisable data
- In the Source 3 block, replace the `JSON.parse(result)` call with `parseGsoHtml(result)`

### 2. `239-macro-indicator-refresh.test.ts`

- Remove existing AC-11 test case
- Add **AC-11a**: opaque/garbage HTML input → `result.success=false` (graceful fallback, no throw)
- Add **AC-11b**: CPI+GDP HTML fixture → `result.success=true`, `sourceUsed=gso`, `indicatorCount>=1`, DB row written

---

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-11a | `parseGsoHtml("<html>garbage</html>")` → result has `success=false` (no unhandled throw) |
| AC-11b | `parseGsoHtml(CPI_GDP_FIXTURE)` → `success=true`, `sourceUsed="gso"`, `indicatorCount>=1`, DB row written |
| AC-TS | `tsc --noEmit` → 0 errors |
| AC-NODEP | No new npm/bun dependencies added |
| AC-SUITE | `bun test apps/mcp-server/src/__tests__/239-macro-indicator-refresh.test.ts` → all pass |
| AC-BASELINE | Total passing tests >= 8582 (baseline at task start) |

---

## Baseline

- Tests passing at task start: **8582**
- Failing (pre-existing, unrelated): 0

---

## DDD Notes

- `parseGsoHtml` is a pure function — it belongs in `domain/services/macro/`. No infrastructure import needed.
- Domain layer must have zero imports from `infrastructure/`.

---

## Commit Format

```bash
git commit -m "$(cat <<'EOF'
task(1825b): replace JSON.parse with parseGsoHtml regex extractor for GSO Source 3

- Add parseGsoHtml(html: string): MacroData pure function
- Replace JSON.parse(result) in Source 3 block
- AC-11a: opaque HTML → success=false
- AC-11b: CPI+GDP fixture → success=true, sourceUsed=gso

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
