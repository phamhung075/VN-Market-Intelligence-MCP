---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-3
title: Migrate muasamcong.ts:216 → withDeadline
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: S
zone: apps/mcp-server/
depends_on: [T-1]
blocks: []
---

## TLDR

Replace the unbounded `fetch` call inside `muasamcong.ts:216` with `withDeadline`. The call is inside `defaultHttpClient.get()` — wrap the `fetch` in a `withDeadline` callback. Recommended deadline: **30_000ms** (30s, VPS-proxied fetch from France).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/infrastructure/fetchers/muasamcong.ts:216`
- **Dependencies:** T-1 (withDeadline must exist)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-3, mcp-infra-01 row

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/infrastructure/fetchers/muasamcong.ts` is opened and line ~216 located (the unbounded fetch inside `defaultHttpClient.get`)
- [ ] The `fetch(url, { headers, ...})` call is wrapped: `withDeadline(signal => fetch(url, { headers, signal }), 30_000, 'muasamcong')`
- [ ] Import added: `import { withDeadline } from './fetchDeadline'` (same directory)
- [ ] The surrounding `try/catch` block (if present) remains intact — `withDeadline` throws an error that the outer catch can handle
- [ ] Existing error handling flow unchanged (degrade behavior at catch site)
- [ ] `bun check` passes with zero TypeScript errors
- [ ] The deadline value is exactly **30_000** (< 60_000 gateway ceiling per NFR-2)

## Files to read first

- `apps/mcp-server/src/infrastructure/fetchers/muasamcong.ts:216` (locate the unbounded fetch)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § mcp-infra-01 (context: VPS proxy, 30s recommended)

## Implementation Notes

1. **VPS proxy context:** This fetch goes through the Vinahost VPS proxy (geo-blocked source). 30s deadline allows for proxy latency (100-200ms RTT) plus the actual fetch time. Conservative but safe.

2. **Existing error handling:** If there is already a `try/catch` around this fetch, the `withDeadline` error (including `DeadlineError`) will be caught by the outer block. The catch block's existing degrade logic (return `[]`, `null`, etc.) will execute. This is correct — the outer catch is the honest degrade path.

3. **Console.error timing:** `withDeadline` logs `console.error` at the moment of timeout. The outer `catch` may also log. Both logs are honest; there is no double-logging problem.

4. **Signal passing:** The callback `fn` receives the `AbortSignal`. The signal must be passed to the `fetch` call via the `signal` option in the second argument.

## Testing Strategy (for QA / code review)

- **Integration (forced-failure):** Block VPS proxy port → call the tool → should fail within 30s with a `DeadlineError` logged, not hang until 60s.
- **Regression:** VPS is alive and responding → fetch completes normally within 30s, behavior unchanged.
- **Static check:** `bun check` passes.

## Blockers

Depends on T-1. No external blockers.

---

**Task ID:** W2-T-3
**Estimated Duration:** 1.5h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-4..T-10)
