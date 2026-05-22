## Task Report 1965d-JANITOR-PATHFIX
date: 2026-05-22
outcome: APPROVED (AC-5 PENDING_LIVE)

changed:
- apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts:28-32 (import swap) + :501 (local helper deleted)
- apps/mcp-server/src/__tests__/lint/no-local-project-root.test.ts (NEW)

tests: 9365 pass / 285 fail (285 pre-existing) | smoke: 12/12 PASS | lint: 1/1 PASS | tsc: 0 errors | ddd: PASS | security: PASS

### AC Matrix

| AC | Verdict | Detail |
|----|---------|--------|
| AC-1 | PASS | `getProjectRoot` imported at line 32; `listHeldTasks` + `getProjectRoot` are the only infrastructure imports; no local `resolve(import.meta.dir,...)` helper present anywhere in file |
| AC-2 | PASS | `no-local-project-root.test.ts` 1/1 GREEN — 0 anti-pattern occurrences in scheduler/ |
| AC-3 | PASS | `npx tsc --noEmit` exits 0 |
| AC-4 | PASS | `scripts/smoke-tasks-md-janitor.ts` 12/12 PASS (all AC-1..AC-5 smoke checks) |
| AC-5 | PENDING_LIVE | Next cron fire 2026-05-23T03:00Z — defer to ops + OBSERVE gate per 1960-DAILYDASH pattern |

### Regression
- Baseline (pre-fix): 9801/349 (older), 9365/285 (current session trend)
- Post-fix full suite: 9365 pass / 285 fail
- Zero new failures on tasksMdJanitorJob, projectRoot, or scheduler scope
- 285 failures are all pre-existing (Task 178 price-history, BCTC 291 frozen, network-dependent tests)

### DDD
- File layer: interface/scheduler — infrastructure imports permitted by DDD policy
- domain/ has zero infrastructure imports (not affected by this change)
- PASS

### Security
- No process.env — PASS
- No hardcoded credentials/secrets — PASS
- No SQL injection surface in this file — PASS

### Merge
- commit: db4931de (already on main — no separate branch, no merge commit needed)
- Signal emitted: docs/signals/qa-1965d-JANITOR-PATHFIX-done.json
