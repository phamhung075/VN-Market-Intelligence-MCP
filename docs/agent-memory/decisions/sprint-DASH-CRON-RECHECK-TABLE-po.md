# Decision Journal — Sprint DASH-CRON-RECHECK-TABLE · po

**Sprint goal:** Add a Cron Recheck Table to /dashboard/orchestration so the user can RECHECK every scheduled cron and see per-cron expected schedule -> last actual fire -> honest status (ON_TIME/LATE/MISSED/STALE/NEVER_FIRED), truthful about the two cron layers.
**Agent:** po
**Started:** 2026-07-01T16:07:51Z

---

### STEP po-S1 · po · 2026-07-01T16:09Z
**task-id:** BA-DASH-CRON-RECHECK-TABLE
**what-done:** Self-initiated the sprint from the user feature request — wrote the sprint_goal vision + minted the BA cascade-kickoff to ready[] (next_agent=ba, zone=multi) via scripts/po-s135 → orch-apply.sh; claimed sprint umbrella lock.
**what-considered:**
- Build a fresh cron-status subsystem vs REUSE the four existing surfaces — chose REUSE (CRONS map SSOT, cronJobRunStore MAX(started_at), schedulerWatchdogJob WATCHDOG_MANIFEST classifier, get_cron_health, orchestrationHandler/api.orchestration pattern). Verified live: get_cron_health emits last_run/last_status but NO expected-vs-actual classification → that IS the gap.
- backlog[] vs ready[] for the BA task — chose ready[] (po-s134 precedent: user-prioritized dashboard-surfacing → immediate cascade-kickoff; dev-team cron adopts).
**why-decision:** Reuse-before-build keeps the sprint a thin status-compute + REST + table layer over proven infra; ready[] advances the chain this tick without a second promote.
**why-change:** no change from plan — user asked to scope + self-initiate; did exactly that, PO does not spawn.
