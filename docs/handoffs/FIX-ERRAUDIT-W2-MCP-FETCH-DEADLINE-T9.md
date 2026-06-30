---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-9
title: DRY consolidate taOhlcvBackfillJob.ts:149-170 — replace inline AbortController with withDeadline
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: XS
zone: apps/mcp-server/
depends_on: [T-1]
blocks: []
---

## TLDR

Replace the inline `AbortController` + `setTimeout(15_000)` + `clearTimeout` pattern at lines 149-170 in `taOhlcvBackfillJob.ts` with a call to `withDeadline`. This is a DRY consolidation — the inline implementation is exactly what `withDeadline` encapsulates. Runtime behavior unchanged; only the internal implementation is refactored. Deadline remains **15_000ms** (15s, existing precedent).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts:149-170`
- **Dependencies:** T-1 (withDeadline must exist)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-4, DRY consolidation row

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` is opened and lines 149-170 located (inline AbortController pattern)
- [ ] The entire inline block (AbortController constructor, setTimeout, clearTimeout) is replaced with: `withDeadline(signal => fetch(url, { headers, signal }), 15_000, 'taOhlcvBackfill')`
- [ ] Import added: `import { withDeadline } from '../../infrastructure/fetchers'` (relative path from scheduler to infrastructure)
- [ ] Deadline value remains **15_000** (no behavior change, DRY consolidation only)
- [ ] The surrounding `try/catch` (if present) remains intact
- [ ] Runtime behavior is identical to pre-migration (the inline AbortController pattern and `withDeadline` produce the same abort-on-timeout behavior)
- [ ] `bun check` passes with zero TypeScript errors

## Files to read first

- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts:149-170` (the inline AbortController implementation to replace)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-4 (DRY consolidation details)

## Implementation Notes

1. **Exact behavior match:** The inline code at lines 149-170 creates an `AbortController`, arms a `setTimeout` to call `controller.abort()` after 15_000ms, passes `controller.signal` to fetch, and clears the timeout in a `finally` block. `withDeadline` does exactly this. The migration is pure refactoring — no behavior change.

2. **Label for observability:** Use the label `'taOhlcvBackfill'` so logs clearly identify which deadline fired.

3. **Import path:** From `scheduler/market-data/` to `infrastructure/fetchers/`, the relative path is `../../infrastructure/fetchers`.

4. **No new tests needed:** This is a DRY refactoring, not a behavior change. Existing tests for the backfill job should pass unchanged.

5. **Deadline value:** 15_000ms is the existing inline value and is safe (< 60_000 per NFR-2).

## Testing Strategy (for QA / code review)

- **Regression:** Run the OHLCV backfill job (or observe live cron tick) → behavior unchanged, same 15s timeout as before.
- **Code review:** Confirm that the inline block is completely replaced and no orphaned code remains.
- **Static check:** `bun check` passes.

## Blockers

Depends on T-1. No external blockers.

---

**Task ID:** W2-T-9
**Estimated Duration:** 1h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-3..T-8, T-10)
