---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-10
title: DRY consolidate deepFetchVpsJob.ts:96 — replace AbortSignal.timeout with withDeadline
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: XS
zone: apps/mcp-server/
depends_on: [T-1]
blocks: []
---

## TLDR

Replace the inline `AbortSignal.timeout(15_000)` at line 96 in `deepFetchVpsJob.ts` with a call to `withDeadline`. The existing `AbortSignal.timeout` approach is missing a `clearTimeout` call (timer leak). `withDeadline` adds this cleanup and consolidates the pattern. Runtime behavior is nearly identical (both timeout after 15s), but `withDeadline` closes the timer-leak gap. Deadline remains **15_000ms** (15s, existing precedent).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts:96`
- **Dependencies:** T-1 (withDeadline must exist)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-4 (DRY consolidation), BA spec line 116 note about `AbortSignal.timeout` timer leak

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts` is opened and line ~96 located (the `AbortSignal.timeout(15_000)` call)
- [ ] The line `AbortSignal.timeout(15_000)` inside the fetch call is replaced with a `withDeadline` wrapper: `withDeadline(signal => fetch(endpoint, { signal }), 15_000, 'deepFetchVps')`
- [ ] Import added: `import { withDeadline } from '../../infrastructure/fetchers'` (relative path from scheduler to infrastructure)
- [ ] Deadline value remains **15_000** (no visible behavior change, but timer leak is fixed)
- [ ] The surrounding `try/catch` (if present) remains intact
- [ ] `bun check` passes with zero TypeScript errors

## Files to read first

- `apps/mcp-server/src/scheduler/news-analysis/deepFetchVpsJob.ts:96` (the `AbortSignal.timeout(15_000)` to replace)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-4, line 116 (timer leak explanation)

## Implementation Notes

1. **Timer leak fix:** `AbortSignal.timeout(15_000)` creates an internal timer that fires after 15s, but it does NOT call `clearTimeout` if the fetch completes before the timeout. The timer fires ~15s later on a fast path, a benign but unnecessary abort attempt. Under Bun, pending timers also prevent graceful shutdown. `withDeadline` cleans up the timer in a `finally` block regardless of success/failure.

2. **Behavior nearly identical:** Both `AbortSignal.timeout(15_000)` and `withDeadline(signal => ..., 15_000)` abort the fetch after 15s if it hasn't completed. The only difference is timer cleanup on the fast path (success before timeout).

3. **Label for observability:** Use the label `'deepFetchVps'` so logs clearly identify which deadline fired.

4. **Import path:** From `scheduler/news-analysis/` to `infrastructure/fetchers/`, the relative path is `../../infrastructure/fetchers`.

5. **No behavior regression:** The existing code's 15s timeout is preserved. Users will not observe a change.

## Testing Strategy (for QA / code review)

- **Regression:** Run `deepFetchVpsJob` → behavior unchanged, same 15s timeout as before.
- **Timer cleanup:** Code review confirms `finally` block in `withDeadline` clears the timer (AC-7, static check).
- **Static check:** `bun check` passes.

## Blockers

Depends on T-1. No external blockers.

---

**Task ID:** W2-T-10
**Estimated Duration:** 1h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-3..T-9)
