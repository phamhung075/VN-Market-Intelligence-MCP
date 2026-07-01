# PO Notebook

_Last: 2026-07-01T16:09Z_

## Tick 2026-07-01T16:09Z — SELF-INITIATED sprint DASH-CRON-RECHECK-TABLE (user feature request, coord f981431d)

User asked: on /dashboard/orchestration add a CRON TABLE to RECHECK every scheduled cron vs its expected fire time (on-time/late/missed/stale/never). Scoped as a sprint + self-initiated the cascade.

**Live verification before scoping (did NOT trust the pointers):**
- `get_cron_health` (cronHealthTools.ts) exists but emits only last_run/last_status/success_rate — NO expected-vs-actual classification → that IS the gap (extend, don't rebuild).
- Layer A SSOT = `CRONS` map in `apps/mcp-server/src/scheduler/cronConfig.ts` (~80 crons via scheduleCron()); NEVER hardcode the count (project-stats cronJobCount=2 is a stale probe artifact — its own note says live≈81).
- Actual last-fire = `cronJobRunStore` `cron_job_runs` MAX(started_at)-per-job (double-log immune — same oracle schedulerWatchdogJob uses).
- Existing expected-vs-actual classifier = `schedulerWatchdogJob` WATCHDOG_MANIFEST (16 jobs, cadence×threshold) → GENERALIZE to all Layer-A, don't diverge.
- Data plane = frontend `/api/orchestration` proxy (api.orchestration.tsx) → mcp-server `orchestrationHandler.ts`. Mirror it: new `/api/cron-status` + `api.cron-status.tsx` + table on dashboard.orchestration.tsx.
- Two-layer honesty: Layer-B CLI-session crons (.claude/commands/crons/*.md) = SESSION_SCOPED, NEVER MISSED.

**Actions:** wrote sprint_goal entry + minted BA-DASH-CRON-RECHECK-TABLE → ready[] (next_agent=ba, zone=multi, SPRINT-M, user_prioritized) via scripts/po-s135 → orch-apply.sh (rc=0; entries 24→25, ready 1→2; 98 pre-existing SHG warnings, 0 new). Claimed sprint umbrella lock. Head untouched — dev-team cron adopts the ready BA task.

**RETURN: NEXT=ba** (write REQ spec + AC list for DASH-CRON-RECHECK-TABLE). PIPELINE: continue.

## Carry-over
- 3 active sprints now: MONEY-RADAR-P0, NARRATIVE-TRUTH-CCATO-GATE, DASH-CRON-RECHECK-TABLE. ready[] = CCATO-T1 (developer) + BA-DASH-CRON-RECHECK-TABLE (ba). WIP: dev-team loop drives.
- DASH-CRON-RECHECK-TABLE is READ-ONLY dashboard view — scope_out bars new always-on cron/alerting, auto-heal-from-UI, CRONS-map edits, Layer-B telemetry infra, and fixing individual broken crons (those are existing FIX-CRON-* tasks). Guard against BA/architect over-scoping into any of those.
- Reuse mandate is the sprint's main risk lever: if dev rebuilds a parallel classifier instead of generalizing WATCHDOG_MANIFEST, verdicts will diverge from schedulerWatchdog — qa gate MUST parity-test.
- do NOT "clean" docs/signals/price_anomaly_*.json — they feed CHEF dishes (market-watcher handoff).
