# Architect Session — 2026-04-28

## Task 1406 — server.ts + jobs.ts Factory Decomposition

**Status:** Design complete. Handoff written.

### Files audited
- `apps/mcp-server/src/interface/mcp/server.ts` — 2,449 lines, 24 routes, 3 extractable blocks identified
- `apps/mcp-server/src/scheduler/jobs.ts` — 893 lines, 3 extractable sections

### Key decisions made

1. **PO line-count target corrected:** server.ts cannot reach ≤350 lines from extracting only the 3 named handlers. After extraction, target is ≤1,600 lines. The DI/testability goal is still achieved. Flagged to PO in handoff.

2. **ESM live-binding fix:** `_staleTickers_lastNotifiedDate` is a mutable module-level `let`. ESM importers cannot write back to it via alias. Solution: expose `_setStaleTickers_lastNotifiedDate(v)` setter in server-startup.ts.

3. **Re-export contract:** `server.ts` must re-export `isVnTradingWindowUtc`, `_staleTickers_lastNotifiedDate`, `_resetStaleTickers_lastNotifiedDate` from `./server-startup.js` so 14 existing test files require zero import changes.

4. **jobs.ts barrel covers all 17 test importers:** All named exports (`CRONS`, `startScheduler`, `shouldRunCatchup`, `scheduleForeignFlowCbReset`, all 6 `run*WithDb` wrappers) re-exported from barrel.

5. **log() helper exported from startupHelpers.ts** so startScheduler.ts can import it.

6. **parseMultipartFields stays in server.ts** — only used by `/api/push-bctc-pdf` inline route, out of scope.

### Risks flagged
- ESM live-binding (HIGH) — handled by setter pattern
- Unstaged bctcQueueEnricherJob.ts — 1406e must not touch job files
- cronConfig.ts must have zero side-effects (Bun.env reads only, no imports)
