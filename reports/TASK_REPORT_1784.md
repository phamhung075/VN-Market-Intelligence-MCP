# Task Report: 1784 — Sector Alert Label Rewrite + Same-Body Deduplication
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests (1784): 12 passed / 0 failed
- Full suite: 8317 passed / 25 failed / 38 skipped
- Baseline: 8305 pass / 25 fail — delta: +12 (new), 0 regressions
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS
- `franceSummaryJob.ts` lives in `src/scheduler/briefings/` (interface/scheduler layer)
- No domain→infrastructure imports introduced
- `formatAlertLines()` is a pure function with no DB or HTTP side-effects

## Security: PASS
- No `process.env` usage (uses `Bun.env` pattern via injected deps)
- No hardcoded secrets or API keys
- No SQL in changed files (pure formatting layer)

## Acceptance Criteria

### BUG-4: Sector label rewrite
- CONFIRMED. When alert body contains "Ngành", regex extracts sector name and renders `[Ngân hàng] Sector (CAO)` — not `ACB alert [HIGH]: price_drop —`.
- Test: "renders sector name in label when message body contains 'Ngành'" — PASS
- Test: "does not rewrite label for regular non-sector alerts" — PASS

### BUG-5: Same-body deduplication with count suffix
- CONFIRMED. `bodyGroups` Map collapses identical bodies. Count rendered as `(+N)` only when N > 1.
- Test: "collapses 3 same-body sector alerts to a single line" — PASS
- Test: "shows count suffix when collapsing multiple same-body alerts" — PASS
- Test: "does not collapse alerts with different body text" — PASS
- Test: "mixed: one sector group + one regular alert → 2 lines total" — PASS

### `formatAlertLines()` exported
- CONFIRMED. `export function formatAlertLines(alerts: AlertDisplayRow[]): string[]` at line 373.
- `AlertDisplayRow` interface also exported at line 348.

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
Merged to main via `git merge --no-ff task/1784-sector-alert-format`.
Branch deleted. TASKS.md updated to Done.
