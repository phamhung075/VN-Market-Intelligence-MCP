# Decision Journal — BCTC-REFINE-STALL-RETRIGGER router A1 re-scope

## router-A1 — NO-GO on /cron-cowork-team + re-scope to diagnose refine_bctc_md non-execution

**task-id:** BCTC-REFINE-A1
**date:** 2026-06-27T19:16:49Z
**agent:** dev-team (router STEP — DJ-GATE-1, acting on RAW-verified PO verdict)

**decision:** PO BCTC-REFINE-A1 ownership verification (agent a728db2d0da5ccd85, commit `8d3ba910`, 1 file = po.md) returned **NO-GO** on re-arming the cowork dispatcher. Router RAW-verified every PO claim before acting (never relay a sub-agent badge):

- Commit `8d3ba910` scoped to `docs/agent-memory/notebooks/po.md` only ✓
- `docs/data/cowork-schedule.json`: `refine-bctc-slot-1.last_fired` = `2026-06-27T09:04:08Z`, `refine-bctc-slot-2.last_fired` = `2026-06-27T14:04:06Z` — **fired TODAY** → the cowork dispatcher is ALIVE, not dark ✓
- `get_agent_work_log{agent_name:"refine_bctc_md"}` = `[]` — **zero executions ever** ✓
- `get_bctc_pending_refine` = **47 docs, all PENDING** ✓
- Board unmutated, WIP=1 preserved ✓

**Root cause re-frame:** the architect blueprint's premise ("cowork CronCreate dispatcher dark since ~2026-06-07, never re-armed") is **empirically FALSE**. The dispatcher fires the refine slots 2×/day. The real defect is that dispatched `refine_bctc_md` **never executes the drain** — the "spawn narrates ≠ executes" failure class ([[feedback_cowork_spawn_narrates_not_executes]]) at the AGENT layer, not a dispatcher-arming problem. Arming a second dispatcher via `/cron-cowork-team` would create a double-fire hazard ([[feedback_router_cowork_defer_to_live_leader]]) and fix nothing.

**action:** (1) Did **NOT** run `/cron-cowork-team`. (2) Re-scoped BCTC-REFINE-A1 from "Re-arm cowork CronCreate" → "Diagnose why dispatched refine_bctc_md never executes" (title + status IN_PROGRESS + owner dev-team + note), and neutralized the now-stale head `next_action` (was "PO executes /cron-cowork-team re-arm"), via `scripts/orch-apply.sh` (both validators exit 0). (3) Spawned ONE diagnostic `refine_bctc_md` (agent a2447dc9c64735014, backgrounded) on the oldest pending doc, baseline pending=47.

**next:** RAW-verify the diagnostic via `get_agent_work_log` + `get_bctc_pending_refine` (NOT the agent's self-report). If it **drains** (pending<47 + work-log row) → defect is in the cowork dispatcher→agent spawn path (slot fires but spawn never truly invokes the agent). If it yields **zero drain** → agent flow/spawnability defect (gateway-blind? silent early-exit?) → route to **agent-father** ([[feedback_agent_md_factory]]). A2/B1 stay closed until A1 resolves (WIP=1).
