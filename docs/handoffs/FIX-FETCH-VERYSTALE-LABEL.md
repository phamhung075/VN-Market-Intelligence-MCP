# Handoff: FIX-FETCH-VERYSTALE-LABEL

**Task ID:** FIX-FETCH-VERYSTALE-LABEL
**Sprint:** Carry-forward FETCH-OPS-PAGE-TRUTH (F-3)
**Zone:** apps/frontend/
**Owner:** dev-frontend
**Priority:** low / size S

## Context

Carry-forward from FETCH-OPS-PAGE-TRUTH closeout 2026-06-06. On `/dashboard/fetch` the Source Freshness table rendered the raw `src.status` field in the status column. That field is an API enum (`"fresh" | "stale" | "no-data"`) and never contained the value `"very stale"`. As a result, sources older than 12 hours showed a red dot (from `sourceStatusColor`) but the text label still read `"stale"` — giving no visual distinction between 2h-stale and 24h-stale sources.

## Root Cause

`SourceFreshnessTable` in `dashboard.fetch.tsx` used `{src.status}` directly. `sourceStatusColor` already computed the red tier for ageMs > 12h, but the label was not derived from the colour tiers — it was read verbatim from the API field.

## Fix

Added `sourceStatusLabel(source: FetchSourceStatus): string` to `app/domain/market.ts`. The helper calls `sourceStatusColor()` and maps:
- grey → "no data"
- green → "fresh"
- amber → "stale"
- red → "very stale"

`SourceFreshnessTable` now calls `sourceStatusLabel(src)` instead of `src.status` so the text label is always consistent with the dot colour.

## [Developer] Implementation Record

- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 4 (domain helper + route component)
- **Files modified:**
  - `apps/frontend/app/domain/market.ts` — added `sourceStatusLabel()` export (16 lines)
  - `apps/frontend/app/routes/dashboard.fetch.tsx` — import `sourceStatusLabel`, use in `SourceFreshnessTable` (2-line change)
- **Tests written:** `apps/frontend/app/__tests__/fix-fetch-verystale-label.test.ts` — 13 assertions, 5 suites, GREEN
- **Git commits:** see below
- **Type check:** tsc --noEmit — 0 errors
- **Service tests:** 1501 pass / 21 fail (21 pre-existing nav-count failures — confirmed pre-existing, unrelated to this change)
- **Playwright:** 4/4 GREEN
- **Docs updated:** NONE (cosmetic label polish, no architecture change)
- **Graphify:** skipped (no docs impacted)

## Test Evidence

Vitest summary: `Test Files 57 passed (63) | Tests 1501 passed (1522)` — 21 failures are pre-existing nav-count tests from earlier sprints (confirmed in notebook).
Playwright summary: `4 passed (7.5s)`

## AC Verification

AC from orch-state: "live verify localhost:3001/dashboard/fetch post frontend rebuild"
NEXT: ops to rebuild frontend container — can batch with any pending frontend rebuild.
