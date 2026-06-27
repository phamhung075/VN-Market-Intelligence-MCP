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

---

## router-A1 — DONE: diagnosis conclusive — refine_bctc_md is NOT broken; sprint premise falsified → PO disposition

**task-id:** BCTC-REFINE-A1
**date:** 2026-06-27T19:34:00Z
**agent:** dev-team (router STEP — DJ-GATE-1, diagnostic complete)

**RAW ground truth (router-verified, NOT agent self-report):**
- `get_bctc_refined{report_id: c765098b-…GVR}` → **49 units persisted in `bctc_refined_units`**, `unit-0000`→`unit-0048`, **ALL `window_status=DONE`** (confidence 0.73–0.95). The 7 the diagnostic claimed (`unit-0042`–`0048`) are all present + DONE.
- Units `0000`–`0041` (42 units) **pre-existed** this tick's probe — written by **prior cowork-dispatcher fires** (the diagnostic resumed from the skip-set at `0042`). Proof the dispatcher→agent→push path has been working all along.
- `get_agent_work_log{refine_bctc_md}` = `[]` → **`refine_bctc_md` does not call `log_agent_work`.** Empty work-log is NOT evidence of non-execution; the execution record lives in `bctc_refined_units`, not the work-log.
- `get_bctc_pending_refine` = 47 docs PENDING (GVR still PENDING) → `refine_status` only flips on `finalize_bctc_refine`, which gates on `total_pushed == windows.length` (49 < 70). Doc-level PENDING is **non-discriminating** — it means no doc has fully completed, not that nothing ran.

**conclusion:** BOTH sprint premises are **empirically FALSE** — architect's "dispatcher dark since 06-07" AND router-A1's re-scoped "agent dispatched yet never executes." The refine pipeline **executes correctly end-to-end**: dispatcher fires 2×/day, agent processes ≤7 windows/fire, pushes persist as DONE units, resumes via skip-set. There is **no bug**. The only real characteristic is **throughput**: 2 fires/day × 7 units = 14 units/day against many hundreds of pending windows (GVR alone = 70; 47 docs total) → slow drain that *looks* like a stall at the doc level.

**action:** (1) A1 (diagnostic) → **DONE** — question fully answered. (2) Route **sprint disposition** to **PO** (head.next_agent=po): the A2/B1/B2/C1 tasks were premised on a broken refine needing re-trigger machinery; with the premise falsified, PO decides — **close BCTC-REFINE-STALL-RETRIGGER as NO-BUG/phantom**, OR **re-scope to a throughput sprint** (e.g. raise `REFINE_CHUNK_SIZE`, add cowork refine slots/day). Router does NOT unilaterally cancel pm's planned tasks. (3) Memory lesson filed: verify `refine_bctc_md` execution via `bctc_refined_units` rows, never `get_agent_work_log` (it logs nothing) — prevents the next false "refine is dark" diagnosis.

**lesson (probe-the-right-table):** a "did agent X run?" check that keys on `get_agent_work_log` gives a false NEGATIVE for any agent that doesn't log there. The PO NO-GO's factual core ("zero executions ever") was a wrong-table inference — 42 DONE units already sat in `bctc_refined_units` at PO-probe time. RAW-verify execution at the **persistence layer the agent actually writes** ([[feedback_remediation_overclaims_derived_layer]], [[feedback_same_db_tools_diverge_rowcount]], [[feedback_passive_health_masks_dead_data]]).
