---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-5
title: Migrate newsHeadlinesRefreshJob.ts — both fetchFromNewsFetch:41 and pushToMcpServer:79
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: S
zone: apps/mcp-server/
depends_on: [T-1]
blocks: []
---

## TLDR

Two unbounded `fetch` calls in `newsHeadlinesRefreshJob.ts` need migration in one task. Line 41 (`fetchFromNewsFetch`) calls an external news service (20s deadline). Line 79 (`pushToMcpServer`) calls the local mcp-server `/api/push-news` endpoint (10s deadline, localhost-to-localhost). Both are in the same file and job; migrate both atomically. This scope change from BA is per architect's ARCH-RATIFY-W2-4 ratification.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` (two fetch sites: line 41 and line 79)
- **Dependencies:** T-1 (withDeadline must exist)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § ARCH-RATIFY-W2-4 (T-5 expanded scope), mcp-domain-sched-02 row

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` is opened
- [ ] **Line 41** (`fetchFromNewsFetch` — external news service): `fetch(url, { method:'POST', headers, body })` wrapped as `withDeadline(signal => fetch(url, { method:'POST', headers, body, signal }), 20_000, 'newsHeadlines')`
- [ ] **Line 79** (`pushToMcpServer` — local mcp-server `/api/push-news`): `fetch(endpoint, { method:'POST', ... })` wrapped as `withDeadline(signal => fetch(endpoint, { method:'POST', headers, body, signal }), 10_000, 'pushToMcpServer')`
- [ ] Import added: `import { withDeadline } from '../../infrastructure/fetchers'` (relative path from scheduler to infrastructure)
- [ ] Both deadline values are < 60_000: 20_000 and 10_000 (per ARCH-RATIFY-W2-4)
- [ ] Existing `try/catch` block(s) remain intact — thrown `DeadlineError` will be caught by outer error handler
- [ ] `bun check` passes with zero TypeScript errors

## Files to read first

- `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts:41` (external news fetch)
- `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts:79` (local mcp-server push)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § ARCH-RATIFY-W2-4 (architect's ratification: T-5 covers both :41 and :79)

## Implementation Notes

1. **Two sites, one task:** Both fetches are in the same job file, so they are migrated together in one task. The developer reads the file once and updates both sites.

2. **Different deadlines:** 
   - Line 41 (`fetchFromNewsFetch`): **20_000ms** — external service, internal network (fast path, conservative 20s)
   - Line 79 (`pushToMcpServer`): **10_000ms** — localhost-to-localhost (very fast, 10s is more than adequate; surfaces a hang faster)

3. **Label strings:** Use human-readable labels in the deadline calls: `'newsHeadlines'` for line 41, `'pushToMcpServer'` for line 79. These appear in the `console.error` log when a deadline fires.

4. **Import path:** From `scheduler/news-analysis/` to `infrastructure/fetchers/`, the relative path is `../../infrastructure/fetchers`. Verify the actual directory depth.

5. **Existing error handling:** If there is a `try/catch` at the job level, both `withDeadline` calls will throw `DeadlineError` (on timeout) or propagate other errors, and the outer catch will handle them. The existing degrade behavior (logging, retry, etc.) is preserved.

## Testing Strategy (for QA / code review)

- **Integration (forced-failure):** Block external news service → job runs → line 41 fetch aborts within 20s with `[withDeadline][newsHeadlines]` log.
- **Integration (forced-failure):** Block local mcp-server port / handler hangs → job runs → line 79 fetch aborts within 10s with `[withDeadline][pushToMcpServer]` log.
- **Regression:** All upstreams healthy → both fetches complete within their deadlines, job behavior unchanged.
- **Static check:** `bun check` passes.

## Blockers

Depends on T-1. No external blockers.

---

**Task ID:** W2-T-5
**Estimated Duration:** 1.5h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-3..T-4, T-6, T-8..T-10)
