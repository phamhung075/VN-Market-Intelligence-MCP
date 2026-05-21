# QA — Notebook

**Last updated:** 2026-05-21 | **Task:** 1965c | **Session:** c225 — tasksMdJanitorJob ratification + soak kickoff — RATIFY_PASS

> Archive: `docs/archive/notebooks/qa-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Session 2026-05-21 c225 — Task 1965c RATIFY_PASS + soak kickoff

### TASK REPORT — 1965c (compact)

```
date: 2026-05-21
outcome: RATIFY_PASS
commit reviewed: fc398b8a
files: tasksMdJanitorJob.ts (NEW 571L), cronConfig.ts (+5L), startScheduler.ts (+wiring), scripts/smoke-tasks-md-janitor.ts (NEW 385L)
type: OBSERVE — static ratification + soak kickoff (Part A + Part B)
round: 1
zone: apps/mcp-server/src/scheduler/system/ + scripts/
```

#### Part A — Static Ratification

| Check | Result |
|-------|--------|
| smoke-tasks-md-janitor.ts exists | PASS — scripts/smoke-tasks-md-janitor.ts (14554 bytes, 2026-05-21) |
| Smoke 12/12 PASS (re-run live) | PASS — all AC-1×2, AC-2×3, AC-3×2, AC-4×2, AC-5×3 green |
| cronConfig.ts tasksMdJanitor: '0 3 * * *' | PASS — :162 CRON_TASKS_MD_JANITOR env override present |
| startScheduler.ts wires runTasksMdJanitorJob | PASS — :68 import, :896 cron.schedule(CRONS.tasksMdJanitor) via wrapRun |
| R-1..R-7 implemented per handlers.md | PASS — all 7 steps verified in tasksMdJanitorJob.ts |
| Zero new DB schema (Option A boundary) | PASS — coordinationStore.ts: task_locks only; no task_status_echo; zero migration files |
| DASHBOARD writer format matches SKILL | PASS — sau-{compact} id, system-auditor, system_issue, ≤40 chars, ## po insertion, _Updated: line |
| AC-1..AC-5 each map to ≥1 smoke check | PASS — AC-1(2 checks), AC-2(3), AC-3(2), AC-4(2), AC-5(3) |
| DDD scan | PASS — infra imports only (coordinationStore.js); zero domain/application imports |
| Security: process.env | PASS — zero hits; Bun.env in production path |
| Security: hardcoded secrets | PASS — none |

#### Part B — Soak Kickoff

- Soak window: 2026-05-21T18:00Z..2026-05-23T18:00Z (48h)
- Observation passes: 2026-05-22T03:00Z + 2026-05-23T03:00Z (±5min)
- Acceptable outcomes: divergence day (DASHBOARD + BUG) OR clean day (log only) — both confirm AC live
- Failure criteria: missing log entry, FATAL, unhandled BUG telegram, zero log evidence
- Follow-up: qa-1965c-soak-result.json emitted by next qa cron tick after 2026-05-23T18:00Z

#### Signals

- `docs/signals/qa-1965c-ratify-pass.json` (to=po)
- `docs/signals/qa-1965c-soak-kickoff.json` (to=po)

- **actions**: RATIFY_PASS. Task lock task:1965c claimed + in soak observation phase. Lock released post-ratify (soak observation is passive — no lock required). Gate: 1966a dispatch gated on qa-1965c-soak-result.json SOAK_PASS verdict.
- **next_cycle_hint**: po marks 1965c In Progress / Observing. After 2026-05-23T18:00Z, qa re-runs to emit soak result. No dev action needed — system observes autonomously.
- **estimated_tokens**: 3200

## Carry-over

- Ops agent: `docker-compose build mcp-server && docker-compose up -d mcp-server` — deploy 1945d fixes (disk scan unconditional + triggerPushBctcExtraction)
- Ops agent (from c188): `docker-compose build mcp-server && docker-compose up -d mcp-server` then `seedWatchlist` + verify PLX row in live DB
- Ops agent (from Sprint 1949): `docker-compose up -d mcp-server` — activate new cron schedule (foreignFlow 08:13, macroRefresh 19:13); no rebuild needed (cron config reload)
- 1965c soak window closes 2026-05-23T18:00Z — emit soak result signal after that
