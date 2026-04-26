# Task Report: FIX-1290/1305 — morningBriefing no stale fallback + review_market_message id coercion
date: 2026-04-25
outcome: APPROVED (second QA pass — 2026-04-25)

---

## QA Pass 2 (2026-04-25) — APPROVED

### Test Results
- FIX-1290-briefing-no-stale.test.ts: **5 pass / 0 fail**
- FIX-1305-review-id-coerce.test.ts: **6 pass / 0 fail**
- Full suite (main baseline): 6458 pass / 214 fail (214 are pre-existing, unchanged from baseline)
- TypeScript: **0 errors**

### Changed Files Verified on main
- `apps/mcp-server/src/scheduler/briefings/morningBriefingJob.ts:401-413` — catch block sends `sendTelegramWork()` error notice, returns without MARKET send (confirmed)
- `apps/mcp-server/src/interface/mcp/tools/briefings/marketMessageTools.ts:246` — `z.coerce.number().int().min(1)` (confirmed)
- `apps/mcp-server/src/__tests__/FIX-1290-briefing-no-stale.test.ts` — 5 tests, all AC covered
- `apps/mcp-server/src/__tests__/FIX-1305-review-id-coerce.test.ts` — 6 tests, all AC covered

### DDD Compliance: PASS
- `morningBriefingJob.ts` is scheduler (interface) layer — infrastructure imports permitted.
- `marketMessageTools.ts` is interface layer — infrastructure/db imports permitted.
- No domain→infrastructure violations.

### Security: PASS
- No `process.env` in modified files.
- No hardcoded credentials.
- SQL in FIX-1305 test uses parameterized bindings.

### Merge Status
Fix commit `7e2b4668` is present on main. Branch `fix/briefing-type-fixes` reviewed — fix confirmed in tree.
All 11 new tests (5+6) pass. No regressions introduced.

---

## QA Pass 1 (2026-04-25) — CHANGES_REQUESTED (historical)

### Test Results
- Unit tests (FIX-1290 / FIX-1305): NOT RUN — test files absent from HEAD tree
- Full suite: Bun runtime crash (OOM/C++ exception, pre-existing — unrelated to this branch)
- Partial regression (4 adjacent fix tests): 35 pass / 0 fail
- TypeScript: 18 errors total (all pre-existing in FIX-VPS-HEALTH-FRESHN.test.ts + 234-vps-health-sla.test.ts; zero in changed files)

### DDD Compliance: N/A — implementation changes not present in HEAD

### Security: N/A — implementation changes not present in HEAD

### Issues Found (now resolved)

**1. `apps/mcp-server/src/__tests__/FIX-1290-briefing-no-stale.test.ts` — FILE MISSING FROM HEAD TREE**
- File exists in git object store at commit `7e2b4668` (157 lines) but was NOT in HEAD tree (`30650873`).
- `git diff main HEAD` returned empty — HEAD tree was identical to main despite two commits in the log.
- The rebase that produced commit `30650873` (fix 1298/1299) overwrote the tree back to main state, making commit `7e2b4668` a ghost commit.

**2. `apps/mcp-server/src/__tests__/FIX-1305-review-id-coerce.test.ts` — FILE MISSING FROM HEAD TREE**
- Same root cause as above. File was 156 lines in git object store, not present in HEAD tree.

**3. `apps/mcp-server/src/scheduler/briefings/morningBriefingJob.ts:401-413` — FIX NOT PRESENT IN HEAD**
- HEAD still had the old catch block: `logger.error(...)` only, no `sendTelegramWork()`, no early return.

**4. `apps/mcp-server/src/interface/mcp/tools/briefings/marketMessageTools.ts:246` — FIX NOT PRESENT IN HEAD**
- HEAD still had `z.number().int().min(1)` instead of `z.coerce.number().int().min(1)`.

### Merge Status (Pass 1)
NOT MERGED — CHANGES_REQUESTED (fixes re-applied to main by Developer)
