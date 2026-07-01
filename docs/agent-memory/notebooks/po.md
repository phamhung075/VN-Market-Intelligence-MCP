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

## 2026-07-01 triage (dev-team spawn, 9 pending signals; WIP=2 at limit)
- CTG Q1-2026 total_assets=0 (ESC-2 HIGH, bca-20260701T151500Z): DEDUP HIT — NO new task. Already owned by FIX-BCTC-BANK-SUMMARY-MAPPING (P1 BACKLOG, minted PO-s70 06-16, reconfirmed 06-21, zone apps/mcp-server/.../financial-reports/, co-owner dev-mcp-server). 3rd re-fire over 15 days. Enriched anchor cold-detail po_reconfirm_log (now 2 entries) with 06-01 evidence + guard_key + PROMOTE recommendation. Flagged URGENT next-dispatch to dispatcher.
- HPG ESC-3 data-coverage (bca...151800Z, LOW, to=ops): self-diagnosed NOT a bug — covered by BCTC-HIST-VPS-BACKFILL (DEFERRED); OCF-SQL leg already DONE (FIX-GET-BCTC-OCF-SQL-COLUMN). Archived, no task.
- cowork-fire 16:10:18Z: normal off-hours telemetry (errors:[], 3 slots won, legacy via stale_warning+age). Not a dev bug. Archived.
- FPT/HPG routine bctc: routine analysis outputs; FPT covered by ROUTE-BCTC-FPT-Q1-2026-ROUTINE. Archived, no task.
- price_anomaly 06-29/06-30: normal market (RE sector selloff, VNM oversold). Archived (dishes long done). 07-01T1609: FRESH EOD — LEFT LIVE in docs/signals/ for CHEF/market-watcher (no chef slot fired this tick; honors standing carry-over).
- orch-state-writer-audit.json: NOT malformed — valid completed SSOT audit (verdict PERIMETER CLOSED) misfiled into signals/. Reads all-null only under SignalRowSchema parse. Not trash, not a broken-writer FIX; systemic relocation already owned by CLEAN-SIGNALS-DIR-NONSIGNAL-ARTIFACTS. Archived.
- NET: 0 new tasks minted (all 9 dedup/normal); 8 archived, 1 left-live; anchor enriched. WIP untouched.
