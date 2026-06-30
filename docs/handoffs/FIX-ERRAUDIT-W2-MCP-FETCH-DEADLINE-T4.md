---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-4
title: Migrate sscInsider.ts:134 → withDeadline
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: S
zone: apps/mcp-server/
depends_on: [T-1]
blocks: []
---

## TLDR

Replace the unbounded `fetch` call inside `sscInsider.ts:134` with `withDeadline`. Similar to T-3: the call is inside `defaultHttpClient.get()` in a VPS-proxied fetcher. Recommended deadline: **30_000ms** (30s, same VPS proxy pattern as muasamcong).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts:134`
- **Dependencies:** T-1 (withDeadline must exist)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-3, mcp-infra-03 row

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts` is opened and line ~134 located (unbounded fetch inside `fetchInsiderTransactions`)
- [ ] The `fetch(url, { headers, ...})` call is wrapped: `withDeadline(signal => fetch(url, { headers, signal }), 30_000, 'sscInsider')`
- [ ] Import added: `import { withDeadline } from './fetchDeadline'` (same directory)
- [ ] Existing error handling flow unchanged (if a `try/catch` exists, it remains and catches the thrown `DeadlineError`)
- [ ] `bun check` passes with zero TypeScript errors
- [ ] Deadline value is exactly **30_000** (< 60_000 per NFR-2)

## Files to read first

- `apps/mcp-server/src/infrastructure/fetchers/sscInsider.ts:134` (locate the unbounded fetch inside `fetchInsiderTransactions`)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § mcp-infra-03 (VPS proxy, 30s)

## Implementation Notes

Same as T-3: VPS-proxied, 30s deadline, signal passed to fetch, existing catch block handles the error.

## Testing Strategy (for QA / code review)

- **Integration (forced-failure):** Block VPS proxy port → call tool → should fail within 30s, not hang until 60s.
- **Regression:** VPS responding normally → fetch completes within 30s, behavior unchanged.
- **Static check:** `bun check` passes.

## Blockers

Depends on T-1. No external blockers.

---

**Task ID:** W2-T-4
**Estimated Duration:** 1.5h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-3, T-5..T-10)
