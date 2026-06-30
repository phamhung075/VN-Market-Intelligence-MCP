---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-8
title: Migrate server.ts:642 → withDeadline
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: S
zone: apps/mcp-server/
depends_on: [T-1]
blocks: []
---

## TLDR

Replace the unbounded `fetch` call inside `server.ts:642` (the `/api/trigger-pek-extract` route handler) with `withDeadline`. This handler calls the pdf-extractor:5001 service. The existing `try/catch` at lines 640-667 is preserved; `withDeadline` wraps only the `fetch` call, and the `DeadlineError` will be caught by the outer block. Recommended deadline: **30_000ms** (30s, local Docker network call to pdf-extractor).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/interface/mcp/server.ts:642`
- **Dependencies:** T-1 (withDeadline must exist)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-3, mcp-interface-05 row, RISK-3 (response body read safe after deadline wrap)

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/interface/mcp/server.ts` is opened and line ~642 located (unbounded fetch inside `/api/trigger-pek-extract` handler)
- [ ] The `fetch(pekUrl, { method:'POST', headers, body })` call is wrapped: `withDeadline(signal => fetch(pekUrl, { method:'POST', headers, body, signal }), 30_000, 'triggerPekExtract')`
- [ ] The surrounding `try/catch` block (lines 640-667) remains completely intact; `withDeadline` throws error into the existing catch
- [ ] Import added: `import { withDeadline } from '../../infrastructure/fetchers'` (relative path from interface/mcp to infrastructure)
- [ ] Deadline value is exactly **30_000** (< 60_000 per NFR-2)
- [ ] Any existing response body reads (e.g., `await pekResp.text()`) are safe — if deadline fires after response headers but before body read completes, the catch block will handle the error
- [ ] `bun check` passes with zero TypeScript errors

## Files to read first

- `apps/mcp-server/src/interface/mcp/server.ts:640-667` (the entire try/catch block, including the fetch at line 642 and any response body reads)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § mcp-interface-05, RISK-3 (body read safety)

## Implementation Notes

1. **Existing try/catch preserved:** The outer try/catch (lines 640-667) is NOT removed. It remains to catch the thrown `DeadlineError` (and any other errors). The existing error handling logic (response shape, logging, etc.) is executed when the catch block runs.

2. **Response body reads:** After `withDeadline` wraps the fetch, if the `Response` object is created successfully (headers received), the body can be read with `await pekResp.text()` or similar. If the deadline fires AFTER headers but BEFORE body is fully read, `pekResp.text()` will throw — this error is caught by the outer catch block. This is correct behavior (the catch block's existing degrade logic handles it).

3. **Label for observability:** Use the label `'triggerPekExtract'` in the deadline call.

4. **Import path:** From `interface/mcp/` to `infrastructure/fetchers/`, the relative path is `../../infrastructure/fetchers`.

5. **Post-body reads:** The handler may read `pekResp.status` or `pekResp.text()` after the fetch. These operations are safe; if the deadline fires, the error is thrown before the body read, or the body read throws (both caught by the outer catch).

## Testing Strategy (for QA / code review)

- **Integration (forced-failure):** Stop pdf-extractor:5001 → call `/api/trigger-pek-extract` → handler should fail within 30s with `[withDeadline][triggerPekExtract]` log, not hang.
- **Regression:** pdf-extractor:5001 healthy → call succeeds normally within 30s, behavior unchanged.
- **Static check:** `bun check` passes.

## Blockers

Depends on T-1. No external blockers.

---

**Task ID:** W2-T-8
**Estimated Duration:** 1.5h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-3..T-7, T-9..T-10)
