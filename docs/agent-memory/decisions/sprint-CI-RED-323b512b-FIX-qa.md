# Decision Journal — CI-RED-323b512b-FIX

**task-id:** CI-RED-323b512b-FIX
**date:** 2026-07-01
**agent:** qa
**sprint:** CI-RED-323b512b-FIX
**verdict:** APPROVED

## What was considered

- Commit f4f1fb8c fixes 4 test files + 1 production source file targeting 17 deterministic failures
- Full CI harness run (apps/mcp-server/scripts/ci-per-file-isolation.sh P=8) performed twice:
  - Run 1: 13888 pass / 42 skip / 26 fail — 8 failed files (3 Bun SIGILL crashes)
  - Run 2: 13889 pass / 42 skip / 25 fail — 9 failed files (3 Bun SIGILL crashes)
- 5 target files ran separately: 115 pass / 0 fail (all originally-red failures fixed)
- tsc --noEmit: exit 0, clean
- Investigated all 9 failing files in full suite

## Full suite failures root cause

All 9 failing files are infrastructure-dependent, pre-existing failures not introduced by f4f1fb8c:
- 083-tool-analysis.test.ts: search_similar_context calls real LanceDB HTTP endpoint; rag-service
  just restarted (Up 3 min at first check); warmup causes > 5000ms Bun default timeout → transient
  (improved from 3 fail to 2 fail as rag-service warmed up over ~15 min)
- 102-job-news-poll.test.ts, 1227, 125, 1288, 1324, 1793, 1821a, 1898b: pollNews/VPS network
  timeouts + Chromium not found at /usr/bin/chromium + cron_job_runs table missing in :memory: DB
- None of these files were modified between dbaa318d (last full-suite 0-fail run) and current HEAD
- git diff dbaa318d..HEAD -- apps/mcp-server/src/__tests__/<failing files> = zero output (unchanged)
- Only mcp-server src changes since dbaa318d: 927d4e8f (bctc scalar) + f4f1fb8c (this fix)
- Neither touches any of the 9 failing files → failures are pre-existing environmental issues

## Fix quality assessment

### 164-polymarket-fetcher.test.ts
- Default end_date_iso changed 2026-06-30 → 2099-12-31: correct hermetic fix for date-bomb
- All 8 CLOB market tests now pass (expiry guard no longer filters all markets)

### DWF-phase1-cadence.test.ts
- toBe(19) → toBeGreaterThanOrEqual(19): root-cause fix; exact-count is not an invariant
- bctc-analyst=4 exact count preserved (line 797: .toBe(4))
- 4 specific gatherer slots still checked by name (lines 802-808)
- policy_id / last_fired structural invariants preserved for all enabled slots
- No tests deleted or skipped

### FU-LOCKSTORE-EXPIRED-GC.test.ts
- countRows WHERE task_kind != 'orphan-signal': adapts to P1.5-MCP-2 GC side-effect
- TC-5 listHeldTasks({kind:"cowork-slot"}): correctly scopes to operational locks
- Orphan-adoption suite is the designated home for orphan-signal assertions
- Assertions NOT weakened: all tombstone/survivor counts still verified

### bctcRefineJob.ts (production fix)
- ownerClientSession var uses Bun.env (dev-standards) not process.env (security fix bundled)
- Single var used for both claimTask and releaseTask → matches contract of P1-FINAL releaseTask
- No zombie lock possible post-fix
- No new infrastructure imports added
- mock-guard: exit 0 PASS
- No hardcoded secrets, no injection risk

## Why APPROVED (not CHANGES_REQUESTED)

The QA gate evaluates whether this commit introduces regressions. f4f1fb8c:
1. Reduces the full suite from 17+ deterministic failures to 0 targeted failures
2. Does not introduce any new code failures
3. The 25 remaining failures are infrastructure-dependent (rag-service warmup, chromium absent,
   VPS network) — they existed at 323b512b and were not part of the "17 deterministic" target set
4. All checks (tsc, DDD, security, mock-guard, coverage) PASS

Recommendation: track the 9 infrastructure-dependent test files as a separate issue
(LanceDB HTTP timeout tests should either mock the HTTP call or use a longer explicit timeout;
chromium-dependent tests need a skip-guard or a proper CI environment).

what-considered: full harness x2 + 5-file targeted run + tsc + DDD + security + mock-guard + coverage + pre-existing-failure verification via git diff
why-change: no change from plan — all targeted checks green; pre-existing infra failures documented
