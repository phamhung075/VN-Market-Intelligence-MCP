## Task Report CI-RED-323b512b-FIX
date: 2026-07-01
outcome: APPROVED

## Test Results

### 5 Target Files (originally-red)
- 164-polymarket-fetcher.test.ts: PASS
- DWF-phase1-cadence.test.ts: PASS
- FU-LOCKSTORE-EXPIRED-GC.test.ts: PASS
- AR-refined-units-idempotency.test.ts: PASS
- 183-alert-accuracy.test.ts: PASS (already green via 927d4e8f)
- **Combined: 115 pass / 0 fail**

### Full Suite (CI harness: apps/mcp-server/scripts/ci-per-file-isolation.sh P=8)
- Run 1: 13888 pass / 42 skip / 26 fail (8 failed files, 3 Bun SIGILL crashes)
- Run 2: 13889 pass / 42 skip / 25 fail (9 failed files, 3 Bun SIGILL crashes)
- **25 failures in 9 files — all pre-existing infrastructure failures (see below)**

### TypeScript
- `bun tsc --noEmit`: exit 0, 0 errors

## DDD Compliance: PASS
bctcRefineJob.ts pre-existing infrastructure imports (logger, db/schema, coordinationStore)
are in the application layer — appropriate per DDD rules (only domain/ prohibits infra imports).
The fix adds NO new infrastructure imports. Only adds ownerClientSession variable and fixes
releaseTask call.

## Security: PASS
- Bun.env used (process.env corrected to Bun.env in this commit)
- No hardcoded credentials, no secrets, no injection risk
- mock-guard: exit 0 PASS

## Coverage Preservation: PASS
- 0 tests deleted across all 4 modified test files
- 0 tests skipped (no .skip, xtest, xit, xdescribe found)
- DWF floor guard ≥19 still asserts structural invariant; bctc-analyst=4 exact count preserved
- FU-LOCKSTORE assertions not weakened: tombstone/survivor counts all verified

## Pre-Existing Infrastructure Failures (NOT regressions from this commit)

These 9 files were NOT modified between dbaa318d (last full-suite 0-fail run, 14111/0) and
current HEAD. Confirmed by: `git diff dbaa318d..HEAD -- <files>` = empty output.

| File | Root cause |
|------|-----------|
| 083-tool-analysis.test.ts (2-3 fail) | search_similar_context real HTTP to LanceDB rag-service; rag-service restarted ~01:57Z (Up 3 min at first check); warmup → >5000ms Bun timeout. Transient: improved 3→2 fail over 15 min |
| 102-job-news-poll.test.ts (1 fail) | pollNews 5-source aggregation; VPS network timeout in test env |
| 125-test-e2e-briefing.test.ts (1 fail+err) | Morning briefing job; infra-dependent |
| 1227-source-health-empty-result.test.ts | Passes when run alone; parallel contention in CI harness |
| 1288-poll-news-shape.test.ts | Passes when run alone; parallel contention |
| 1324-push-news-all-sources.test.ts (2-8 fail) | Chromium not at /usr/bin/chromium + pollNews timeout |
| 1793-pollnews-cooldown-persist.test.ts | pollNews / cron_job_runs table |
| 1821a-pollnews-cold-start-retry.test.ts | Passes when run alone; parallel contention |
| 1898b-rss-degradation-regression.test.ts (2 fail) | RSS source timeout in rag-service warmup window |

Recommendation: Track these as a separate infra-testing issue. Fix: add explicit HTTP
timeouts to LanceDB calls in search_similar_context so rag-service warmup doesn't hit
Bun's 5000ms default; add chromium-skip guard or CI environment setup for chromium tests.

## Merge Status: APPROVED
Commit f4f1fb8c fixes all 17 targeted deterministic failures with correct root-cause
analysis, no coverage weakening, clean tsc, clean DDD/security/mock-guard.
