# Task Report: FIX-MCP-CRASH-LOOP-A-1 — Restart-cadence alert guardrail
date: 2026-06-14
outcome: APPROVED (code-merge quality; live-verify gate pending)
commit: ef0ce87c

## Test Results
- Targeted (A-1 tests): 4 pass / 0 fail (14 expect() calls, 49ms, uncached)
- Full suite: 12837 pass / 51 fail / 1 error (exit 0; all failures pre-existing; MACD integration test unrelated to A-1)
- TypeScript: 0 errors (bun tsc --noEmit exit 0)

## DDD Compliance: PASS
- restartCadenceAlertJob.ts: interface/scheduler layer; lazy-imports from infrastructure (permitted)
- No domain→infrastructure imports (grep exit 1)
- No new domain services, no new MCP tools

## Security: PASS
- No process.env — Bun.env used in cronConfig.ts (correct)
- No hardcoded credentials, tokens, or API keys
- STARTUP_JOB_NAME and WINDOW_HOURS are TypeScript module constants; SQL template not parameterized but carries zero injection risk (non-user input) — style note, non-blocking
- Telegram payload built from SQLite constant strings only (no DRAIN-INJECTION risk)
- mock-guard.sh exit 0

## Zone: PASS
- All 5 files under apps/mcp-server/ only — no cross-zone changes

## Design Conformance: PASS
- Startup sentinel: insertCronJobRunStart + updateCronJobRunEnd (existing infra, no raw SQL, no new table)
- Cron stagger: '15,45 * * * *' vs WAL '*/30 * * * *' (:00/:30) — 15-min stagger confirmed
- Alert channel: WORK (not BUG) — matches design brief and walCheckpointAlert.ts pattern
- Threshold ≥2, window 4h — matches spec
- Generic: no per-ticker, no per-table coupling
- jobRunRepo.wrapRun pattern in startScheduler matches all peers
- ESM .js import paths throughout

## Issues Found
### Blocking
None.

### Non-Blocking
- composition-root.ts: step labeled "1c" appears before unlabeled "1b" (seed trade profiles at line 49) — comment numbering inconsistency only; functionality correct
- restartCadenceAlertJob.ts:94-101: SQL uses TypeScript constant string template rather than parameterized binding — zero injection risk (constants, not user input); style note only

## Remaining Gate
**Live-verify (PENDING — ops rebuild required):**
- After ops force-recreate container post-BC-1 deploy, verify:
  1. `cron_job_runs` row with `job_name='mcpServerStartup'` persists in named-volume DB
  2. On a second restart within 4h, WORK-channel Telegram alert fires at next :15/:45 tick with correct count and timestamps
  3. No false alert after single restart (count=1 → silent)
- Reference: `docs/handoffs/TASK-FIX-MCP-CRASH-LOOP-A-1.md § Live-Verify Recipe`
- Assignee: ops (next_agent)

## Merge Status
Code-merge quality: APPROVED for merge to main.
DO NOT promote to done_verified until live-verify gate passes (ops rebuild + sentinel persistence + alert fire confirmed).
