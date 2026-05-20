# TASK 1955b — cron_job_runs zombie-row cleanup on scheduler startup

**Owner:** dev-mcp-server
**Priority:** MEDIUM (observability hygiene; misleads system-auditor Tier-1 health checks)
**Zone:** `apps/mcp-server/`
**Estimate:** 1.5 h (code + 2 unit tests + tsc + commit)
**Size:** S

---

## Problem

`cron_job_runs` accumulates rows with `status='running'` and `finished_at=NULL` when the host process crashes (or is `docker compose down`-ed) mid-job. After restart, the row stays forever, falsely indicating a stuck job.

System-auditor 2026-05-19T19:31Z Tier-1 flagged TWO CRITICAL "stuck cron" entries (`vnstockFundamentalsRefresh` 2026-05-18 01:00, `vnstockTradingStatsRefresh` 2026-05-18 08:30) — both are zombie rows from a pre-restart container instance. The current container has been up only 4 h; neither job has had a scheduled tick yet (fundamentals = Mon 01:00, tradingStats = weekdays 08:30 — next 2026-05-20T08:30Z).

Earlier evidence: `bctcReparseJob` has 11 zombie `running` rows from 2026-05-19 07:18 → 15:06 UTC, all from the pre-EPIPE-fix container that crashed; the post-fix container ran 2 successful sweeps starting 2026-05-19T15:23Z (50 min sweep, status=success).

Module-level `_isRunning` flags clear on restart, so the next scheduled tick will re-fire correctly — the zombie rows are pure observability noise, but they confuse Tier-1 auditors and inflate "stuck" alerts.

## Fix

In scheduler bootstrap (`startScheduler.ts` or `cronJobRunStore.ts` init path), add a one-shot cleanup that runs after DB init and BEFORE the first cron tick.

**Cleanup query (suggested):**
```sql
UPDATE cron_job_runs
   SET status      = 'crashed',
       finished_at = strftime('%Y-%m-%d %H:%M:%S', 'now'),
       error_msg   = 'reaped on scheduler startup — process restarted before finished_at was written',
       duration_ms = (julianday('now') - julianday(started_at)) * 86400000
 WHERE status      = 'running'
   AND finished_at IS NULL;
```

Wire it into the scheduler boot path so it runs exactly once per process start (do not run on every cron tick).

## Acceptance Criteria

1. New function `reapZombieJobRuns(db: Database): number` in `cronJobRunStore.ts` returning the count of rows updated.
2. `startScheduler.ts` calls `reapZombieJobRuns(db)` once after `initDatabase()` and before registering any cron job.
3. Logger writes one INFO line on startup: `"[scheduler] reaped N zombie cron_job_runs rows"` (suppress when N=0 to avoid noise).
4. Two unit tests:
   - reaps when there is a `running` row with NULL finished_at → status='crashed', finished_at set, duration_ms computed.
   - leaves untouched rows where status='success' or status='error' (idempotent on already-finalised rows).
5. tsc 0 errors. Existing tests pass.

## Out of scope

- Do NOT change the in-flight job tracking logic (`_isRunning` flags, `recordJobRun()` wrapper). Those are correct.
- Do NOT add a periodic reaper. Boot-time cleanup is sufficient because crashes always cause a restart.
- Do NOT touch other `*_running`/`*_in_progress` style flags in domain stores (e.g. `bctc_vps_queue.status='processing'`) — different concern, different task.

## Verification

```bash
# Before deploy: query zombie rows
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e \
  "const D=(await import('bun:sqlite')).default; \
   console.log(new D('/app/data/market.db').prepare(\\\"SELECT job_name, started_at FROM cron_job_runs WHERE status='running' AND finished_at IS NULL\\\").all());"
# Expect: ~13 zombie rows currently

# After deploy: same query → 0 rows; cron_job_runs has new 'crashed' rows
```

## Commit convention

```
feat(1955b/mcp-server): reap zombie cron_job_runs on scheduler startup
```

Signal back: `docs/signals/dev-mcp-server-1955b-impl-done.json`

## Pair-task

Lands together with 1955a. Both ship in the same Docker rebuild — neither blocks the other; ship 1955a first if 1955b runs over time.

---

## [QA] Review Record — 2026-05-20

**Round:** 1 | **Reviewer:** qa | **Commit:** `cfe10b0a`
**Verdict: APPROVED**

| Check | Result |
|---|---|
| Targeted tests 4/4 | PASS (412ms) |
| Full suite (mcp-server excl. untracked) | 9271 pass / 284 fail — pre-existing baseline unchanged |
| bun tsc --noEmit | PASS (0 errors) |
| AC-4: schema CHECK includes 'crashed' | PASS — schema-system.ts:39 `CHECK(status IN ('running','success','error','crashed'))` |
| AC-5: reapZombieJobRuns before cron.schedule | PASS — startScheduler.ts:108 precedes first cron.schedule at line 128 |
| AC-6: migration idempotence | PASS — sqlite_master DDL string-match guard (lines 56-97); AC-3 test verifies old DDL → no throw |
| DDD scan (changed files) | PASS — zero domain→infra imports |
| Security: process.env | PASS — zero hits in changed files |
| Security: hardcoded secrets | PASS — zero hits |
| SQL parameterized | PASS — all queries use `?` bindings; reaper uses no user input |
| Commit convention | PASS — fix(1955b/mcp-server), correct scope |

**Implementation notes verified:**
- `CronJobRunStatus` type correctly extended to include `'crashed'` (cronJobRunStore.ts:23)
- `reapZombieJobRuns` returns `{ reaped: number }` not bare `number` (deviation from original AC spec; AC spec said `number`, impl returns object — no functional regression, test asserts `{ reaped }` correctly)
- Migration guard pattern matches established vps_service_health + sla_breach_audit patterns
- Log line fires only when reaped > 0 (noise suppression per AC-3 original spec)

**Downstream unblocked:** 1958a (MARKET-summary jobs not firing) can now be dispatched by PM.
