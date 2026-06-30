---
parent_task: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
task_number: T-6
title: Migrate bctcPdfPullJob.ts:165 → withDeadline
sprint: FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE
size: S
zone: apps/mcp-server/
depends_on: [T-1]
blocks: []
---

## TLDR

Replace the unbounded `fetch` call inside `bctcPdfPullJob.ts:165` (the `makeProductionDeps().fetchPdf` function) with `withDeadline`. This is a background scheduled job (not a synchronous gateway call), so the 60s gateway timeout does not apply to it directly; however, the 45s deadline protects against a hung TCP connection. Recommended deadline: **45_000ms** (45s, background job, large PDF payload).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Files to modify:** `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts:165`
- **Dependencies:** T-1 (withDeadline must exist)
- **Knowledge needed:** `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § FR-3, mcp-domain-sched-03 row, EC-4 (45s deadline rationale for large PDF)

## Acceptance Criteria

- [ ] File `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` is opened and line ~165 located (fetch inside `makeProductionDeps().fetchPdf`)
- [ ] The `fetch(url, { headers })` call is wrapped: `withDeadline(signal => fetch(url, { headers, signal }), 45_000, 'bctcPdfPull')`
- [ ] Import added: `import { withDeadline } from '../../infrastructure/fetchers'` (relative path from scheduler to infrastructure)
- [ ] Existing error handling (if present) remains intact — `withDeadline` throws error, outer catch handles degrade
- [ ] `bun check` passes with zero TypeScript errors
- [ ] Deadline value is exactly **45_000** (< 60_000 per NFR-2; this is the ceiling for background jobs per architect)

## Files to read first

- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts:165` (locate the fetch inside `makeProductionDeps().fetchPdf`)
- `docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md` § mcp-domain-sched-03, EC-4 (45s is safe for background PDF download)

## Implementation Notes

1. **Background job, not gateway call:** This job runs on a cron schedule (not inside a gateway call). The 60s gateway timeout does not apply to it. However, a hung TCP connection can block the job indefinitely. The 45s deadline is a protective guard — if the PDF download stalls, the job aborts and logs `[withDeadline][bctcPdfPull] fetch aborted after 45000ms`, allowing the next cron tick to proceed.

2. **Large payload:** PDF downloads are large and can be slow. 45s is conservative and allows for a genuine large file + network latency. If production observation shows PDFs consistently download in <20s, ops can tune the deadline downward later (it is a parameter, not hardcoded).

3. **Label for observability:** Use the label `'bctcPdfPull'` in the deadline call for clarity in logs.

4. **Import path:** From `scheduler/financial-reports/` to `infrastructure/fetchers/`, the relative path is `../../infrastructure/fetchers`.

## Testing Strategy (for QA / code review)

- **Integration (forced-failure):** Block BCTC PDF host (firewall) → job runs → fetch aborts within 45s with `[withDeadline][bctcPdfPull]` log, job continues.
- **Regression:** BCTC host responding normally → PDF downloads complete within 45s (typically much faster), behavior unchanged.
- **Static check:** `bun check` passes.

## Blockers

Depends on T-1. No external blockers.

---

**Task ID:** W2-T-6
**Estimated Duration:** 1.5h
**Status:** TODO
**Owner:** dev-mcp-server
**Critical Path:** No (parallel with T-3..T-5, T-8..T-10)
