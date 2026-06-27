---
sprint: BCTC-REFINE-STALL-RETRIGGER
branch: task/BCTC-REFINE-A1-rearm-cowork
size: XS
zone: .claude/
type: OPS
priority: P1
depends_on: []
blocks: [BCTC-REFINE-A2, BCTC-REFINE-B1, BCTC-REFINE-C1]
route_to: po
---

## TLDR

Re-arm the cowork CronCreate dispatcher (session-scoped timer) via the `/cron-cowork-team` skill. The `refine_bctc_md` agent flow is fully implemented but was NOT re-dispatched after the main terminal session restarted ~2026-06-07. This unblocks the 47-doc refine queue immediately.

## [PM] Planning Context

- **Zone:** `.claude/` (skill invocation, no code changes)
- **Type:** OPS action (no dev sprint)
- **Priority:** P1 — blocks all downstream tracks; 47 BCTC docs stalled for 20 days
- **Critical Guard:** This is a **cowork ownership verification task**, NOT a blind dev-team dispatch. Per memory `feedback_router_cowork_defer_to_live_leader`, the dev-team router MUST NOT unilaterally arm cowork crons — a parallel terminal may own cowork, creating a double-fire risk. PO MUST verify that no other session currently holds the cowork dispatcher before re-arming.

### Acceptance Criteria

- [ ] **AC-1:** Verify no parallel terminal is currently running a cowork CronCreate dispatcher (check `cron_job_runs` for recent refine_bctc_md runs, or probe Telegram WORK channel for recent refine logs)
- [ ] **AC-2:** Run `/cron-cowork-team` skill to arm the CronCreate dispatcher (idempotent, safe to re-run)
- [ ] **AC-3:** Verify re-arm succeeded: check `docs/data/cowork-schedule.json` that `refine-bctc-slot-1` and `refine-bctc-slot-2` are `enabled: true` and re-arm logged to WORK channel
- [ ] **AC-4:** Wait for next scheduled slot (09:00 UTC or 14:00 UTC) and verify `cron_job_runs` logs refine_bctc_md completion
- [ ] **AC-5:** Probe `get_bctc_pending_refine` and confirm refine_status begins flipping from PENDING → IN_PROGRESS → COMPLETE (may take multiple slots to observe, but signal should be visible within 24h)

### Knowledge Needed

- `/cron-cowork-team` skill usage → `.claude/skills/cron-cowork-team/SKILL.md`
- Cowork ownership guard → memory `feedback_router_cowork_defer_to_live_leader.md`
- `refine_bctc_md` flow design → `docs/agents/refine_bctc_md/init.md` + `docs/agents/refine_bctc_md/flow/main.md`
- Current state → `docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md` § Track (a)

### Dependencies

- **Blocks:** BCTC-REFINE-A2 (staleness watchdog moot without live drain), BCTC-REFINE-B1 (VIC reset only works if queue is draining), BCTC-REFINE-C1 (cron_job_runs logging pointless if cron is dead)

---

## Risk & Notes

**Risk-1 (LOW):** The `/cron-cowork-team` skill is idempotent and has no side effects beyond scheduling. Re-arming a second time is safe.

**Risk-2 (MEDIUM — deferred to A2):** Re-arm alone is a band-aid. Without BCTC-REFINE-A2 (staleness watchdog) wired in, any future session restart will silently stall the queue again. A2 must land to close this gap permanently.

**Honest caveat (drain speed):** With 2 slots/day and 1 doc/slot, the 47-doc backlog takes ~23 days to clear. Router may optionally trigger additional manual `refine_bctc_md` invocations outside the cowork schedule to accelerate the drain (each invocation is idempotent with reset=true).

---

## Implementation Notes

1. **PO verification step (non-delegable):** Before running the skill, PO must manually verify via:
   - `jq '.task_board.done_verified[].id' docs/data/orch/orch-state.json | grep -i refine` — check recent done_verified refine tasks
   - `grep refine /var/log/cron-job-runs.log 2>/dev/null || echo "no local log"` — if VPS logs accessible
   - Telegram WORK channel history — any recent refine notifications?
   - If uncertain, ask in WORK channel: "anyone currently running cowork/refine?" before proceeding

2. **Skill invocation:** Run `/cron-cowork-team` at the terminal (skill is a CLI-only tool, returns status + counts)

3. **Verification cadence:**
   - Immediate: Check logs for "cowork-team CronCreate armed"
   - +10 min: Verify `docs/data/cowork-schedule.json` still has `enabled: true`
   - +30–90 min: Wait for next scheduled slot (09:00 UTC or 14:00 UTC) and probe cron_job_runs
   - +24h: Live-probe `get_bctc_pending_refine` for refine_status changes

4. **Rollback:** If issues observed, run `/cron-cowork-team` again with explicit disable flag (if available) or contact dev-team to patch the schedule. No data-layer impact; purely orchestration.

---

## Success Criteria (Done-Verified Gate)

✅ **DONE-VERIFIED when:**
- AC-1..AC-3 all checked (verified no conflict + re-armed + enabled)
- AC-4 passes: cron_job_runs shows refine_bctc_md entry within 24h of re-arm
- AC-5 passes: live `get_bctc_pending_refine` shows refine_status != PENDING on ≥1 doc (may lag by hours due to slot timing)
