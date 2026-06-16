---
task_id: FIX-ERRAUDIT-W3-FE-LOADERS-CLIENT-CALLS
type: sprint-task
title: Wave-3 Bound dashboard loaders calling client.ts typed functions (EC-8)
epic: FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH
zone: apps/frontend/
owner: ba
status: BACKLOG
priority: P2
created_at: 2026-06-16T07:00:00Z
created_by: pm
---

## Summary

**Out-of-scope for Wave-2.** Some dashboard loaders call typed functions from `client.ts` (e.g., `fetchGatewayHealth()`, `fetchReutersHeadlines()`, `fetchPriceHistory()`) instead of calling `fetch` directly. These loaders are NOT covered by Wave-2 Cluster A migration (which only migrated inline ~40-line try/fetch/parse blocks).

Wave-3 scope: bound dashboard loaders that call `client.ts` typed functions. This is a follow-on task for a future sprint. Architect and BA to scope the design.

## Affected Loaders (4 files)

- `dashboard.db.tsx` — calls `fetchPriceHistory()` + `fetchReutersHeadlines()` from `client.ts`
- `dashboard.services.tsx` — calls `fetchGatewayHealth()` from `client.ts`
- `dashboard.fetch.tsx` — unclear (inspect confirms no direct fetch; uses `client.ts` helpers or static data)
- `dashboard.analysis.tsx` — calls `fetchWatchlistPrices` from `client.ts` (the inline fetch in this file IS covered by T-4; this refers to the `client.ts` function call)

## Wave-2 Gap (Accepted)

Wave-2 successfully bounds:
- All direct `fetch()` calls in loaders (Cluster A, 28 files)
- All proxy routes (Cluster B, 29 files)
- Non-fatal client wrappers (Cluster C, 4 functions in client.ts)

Wave-2 does NOT bound:
- `client.ts` typed function calls from loaders (e.g., `fetchGatewayHealth()`, `fetchReutersHeadlines()`)
- These call `apiGet<T>` internally, which remains unbounded at the source

## Design Decision

Per ARCH-RATIFY-FE-1 in architect design: **`apiGet<T>` is NOT bounded internally in Wave-2.** Rationale:
- Adding a deadline inside `apiGet` would require an internal `AbortController` + `setTimeout`, which would conflict with any caller-supplied `AbortController` (no signal-merge logic exists)
- Creating duplicate abort controllers is a footgun the BA spec warns against

Wave-3 options (architect/BA to decide):
1. **Option A:** Migrate each loader that calls `client.ts` functions to use outer `safeFetch` wrapping, OR
2. **Option B:** Add deadline + signal-merge logic INSIDE `apiGet`, OR
3. **Option C:** Accept the gap as a known limitation of Wave-2 (lower priority fix for a future wave)

## Sprint Sequencing

- Wave-2 (this sprint, 2026-06-16): Cluster A + B + C (direct fetch sites bounded)
- Wave-3 (future sprint): Decide on `client.ts` function call bounding strategy

## Reference

- Architect ARCH-RATIFY-FE-1: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-architect-design.md` § lines 123–139
- BA spec EC-8: `docs/handoffs/FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH-BA-spec.md` § lines 420–422
