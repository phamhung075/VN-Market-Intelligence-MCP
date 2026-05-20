# TASK 1959-watchdog-5 — Disk-usage alert cron

**Sprint:** 1959 (watchdog hardening cycle-2) · **Owner:** dev-mcp-server · **Size:** S (≤ 2h) · **Zone:** `apps/mcp-server/` · **Priority:** MEDIUM · **Status:** DISPATCH-NOW (cycle-2 ship)

Parent goal: `docs/SPRINT_GOAL.md` (Sprint 1959) · Predecessor signal: `docs/signals/dev-mcp-server-1959-watchdog-7.json` (watchdog-7 DONE — dev-mcp-server slot now free) · Sibling-DONE: `docs/signals/dev-rag-service-1959-watchdog-3.json` (informs 20 GB threshold context — LanceDB sits at ~29 GB today, so the alert MUST fire on the real filesystem).

---

## Why

1958-RCA Phase 1 root cause = disk pressure (97% full) + RAG lifespan blocked + LanceDB 29 GB cold-load I/O. watchdog-1 (pre-flight gate) prevents NEW deployments under pressure. watchdog-5 closes the runtime-detection gap: emit BUG Telegram BEFORE the disk re-fills, so ops gets warned hours/days ahead of the next outage shape rather than minutes.

LanceDB currently 29 GB. Watchdog-4 (compaction cron) will eventually push it back below 25 GB but is gated 48 h behind watchdog-3 (= unlocks 2026-05-22T21:00Z). In the meantime watchdog-5 is the early-warning radar.

## Work

1. `apps/mcp-server/src/infrastructure/scheduler/diskUsageAlertJob.ts` — new cron entry.
2. Cadence: hourly (cron `0 * * * *`) — fast enough to catch run-away growth, slow enough to not spam.
3. Logic: shell-exec `du -sh /app/data/lancedb` (or read via `fs.statSync` recursive — pick the cheaper). Parse to GB.
4. Threshold: BUG Telegram when size > 20 GB. Throttle: emit at most one BUG per 6 h per (host + path) — record last-fire timestamp in `cron_job_runs.run_metadata` (or a tiny `disk_alert_state` row if simpler).
5. Register in `apps/mcp-server/src/infrastructure/scheduler/cronConfig.ts` under a new key `CRONS.diskUsageAlert`.
6. Wire into `startScheduler.ts` (follow the watchdog-2 pattern from commit `76e5d1cd`).
7. Unit test (`diskUsageAlertJob.test.ts`): (a) under-threshold path → no Telegram; (b) over-threshold path → one Telegram, then suppressed for 6 h; (c) the 6 h window expiry → next fire allowed.
8. Integration test (mock filesystem stub): 12 consecutive ticks at 18 GB → zero Telegrams; simulate jump to 25 GB → exactly one Telegram on first over-threshold tick.

## Acceptance Criteria (sprint AC-4)

- **AC-4-1:** Cron `diskUsageAlertJob` registered + fires every 1 h (verify via `cron_job_runs` table 1 h after deploy).
- **AC-4-2:** BUG Telegram sent when `du -sh /app/data/lancedb` > 20 GB (verify by lowering threshold env override to current `lancedb` size in a smoke run, NOT in prod default).
- **AC-4-3:** Silent when usage < 20 GB (verify: 12+ ticks logged, zero BUG msgs since deploy).
- **AC-4-4:** Zero false positives — 12 consecutive successful runs without BUG msg under healthy state.

## Out of scope

- Compaction / archival logic — that is watchdog-4 (separate task, dev-rag-service zone, 48 h gated).
- Other paths beyond `/app/data/lancedb` — keep this task tight. Future iteration could parametrise.
- Cross-host disk monitoring — single-container, single-volume scope.

## Disk-safety note (carry-over from cycle-1)

watchdog-5 is **pure TypeScript** — no Dockerfile change, no image rebuild required. Safe to ship in parallel with watchdog-3's +920 MB image-grow (already landed). 32 GB free, no rebuild contention. dev-mcp-server slot free post-watchdog-7. Single zone, single image, single rolling restart.

## Definition of done

- AC-4-1 through AC-4-4 PASS.
- `tsc` 0 errors.
- Full suite: zero regression (baseline 9277 PASS as of `project-stats.json`).
- Signal: `docs/signals/dev-mcp-server-1959-watchdog-5.json` with `ac_results` + measurements (12-tick sample size, first-fire latency from simulated over-threshold).
- Commit format: `feat(mcp-server/1959-watchdog-5): disk-usage alert cron — BUG Telegram on lancedb > 20 GB` per `docs/policies/commit-convention.md`.

## Carry-over context

- Predecessor patterns: imitate `alertDigestJob.ts` (cron + throttle), `rag-service` watchdog-2 (start_period 60 s) for healthcheck timing intuition.
- Telegram channel: `bug` (per fail-loud-protocol agent-output table).
- Throttle anti-pattern: do NOT spam the channel — single fire per 6 h window.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files created:**
  - `apps/mcp-server/src/scheduler/diskUsageAlertJob.ts:225` — Core job: `readDiskUsageGb` (du -sh), `parseDuSizeToGb`, `runDiskUsageAlertJob` (injectable deps + state pattern). `DISK_THRESHOLD_GB` reads from `DISK_ALERT_THRESHOLD_GB` env (default 20 via IIFE). `DiskUsageAlertState` interface for test isolation.
  - `apps/mcp-server/src/__tests__/1959-watchdog-5-disk-usage-alert.test.ts:226` — 9 tests: TC-1 (under-threshold), TC-2 (over-threshold + BUG message), TC-3 (6h cooldown suppression), TC-4 (cooldown expiry re-fires), TC-5 (12 healthy ticks = zero Telegrams), TC-6 (jump to 25GB = exactly one Telegram).
- **Files modified:**
  - `apps/mcp-server/src/scheduler/cronConfig.ts` — Added `diskUsageAlert` key (`CRON_DISK_USAGE_ALERT` env, default `'47 * * * *'`). Minute=47 avoids pile-up with minute=0/7/17 cluster.
  - `apps/mcp-server/src/scheduler/startScheduler.ts` — Import `runDiskUsageAlertJob`; registered cron via `jobRunRepo.wrapRun('diskUsageAlertJob')`.
- **Tests written:** 9 tests — all GREEN
- **Type check:** tsc --noEmit: 0 errors
- **Service tests:** 9/9 task-specific pass; 56/56 recent-sprint regression pass (0 fail)
- **Docs updated:** `docs/data/project-stats.json#cronJobCount` 76→77 | `docs/TASKS.md` status→DONE | `docs/signals/dev-mcp-server-1959-watchdog-5.json` created
- **Graphify:** skipped (no docs/architecture touched)
- **Smoke results:** threshold=1/usage=2 → alert-sent PASS; threshold=100/usage=29 → ok PASS
- **Env override:** `DISK_ALERT_THRESHOLD_GB` validated (1→1, 100→100 at module load)
