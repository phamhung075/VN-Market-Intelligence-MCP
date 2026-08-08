---
sprint: BACKLOG
branch: task/runidle-5-verify-gate-measurement
size: S
zone: cross-service/observability/
depends_on: [TASK_RUNIDLE-2-REDESIGN, TASK_RUNIDLE-3-STALENESS, TASK_RUNIDLE-4-TEST]
blocks: []
---

## TLDR
After tasks 2, 3, and 4 ship and land in production, establish the verification gate for AC-3 compliance. Document baseline, schedule 7-day review, and verify that `consecutive_run_idle > 0` is observed on the first quiet dev-team tick, and that drain-signal commits drop below the 25-65/day band within 7 days.

## [PM] Planning Context
- **Zone:** cross-service/observability/
- **Acceptance Criteria:**
  - [ ] After tasks 2-4 ship to main, wait for the next dev-team tick with no drainable signals and no NEW signal_queue entries
  - [ ] Observe `docs/data/dev-team-idle-widen-state.json` and confirm `consecutive_run_idle > 0` (the counter has incremented)
  - [ ] Document the baseline timestamp and counter value in a verification log
  - [ ] Schedule a 7-day review: measure `git log --since='7 days ago' --grep='chore(signals): drain' --oneline | wc -l`
  - [ ] Verify the daily commit count is STRICTLY BELOW the pre-fix band of 25-65/day (measured 08-05 to 08-08)
  - [ ] If 7-day count is still in 25-65 band → escalate to po (guard did not work as intended)
  - [ ] If 7-day count drops → document success and add observation to this task's completion note
  - [ ] Update `docs/agent-memory/notebooks/pm.md` session log with verification results
  - [ ] Add or update a checklist/alert in `docs/agents/po/flow/sprint-signoff.md` if needed (so po watches for this in future closures)
- **Files to read first:**
  - `docs/data/dev-team-idle-widen-state.json` (structure and current state of idle tracking)
  - `docs/architecture-briefs/2026-07-04-systemic-remake.md` section 1.1 RC-IDLE-LOOPS AC-3 (verification criterion)
  - `docs/agents/po/flow/sprint-signoff.md` (where post-landing verification checks live)
- **Files to create:**
  - `docs/agent-memory/notebooks/verification-FIX-RUNIDLE-PREDICATE-D.md` (optional, separate verification log if needed)
- **Files to modify:**
  - `docs/agent-memory/notebooks/pm.md` — append verification results and observations
  - `docs/agents/po/flow/sprint-signoff.md` — add or reference a checklist item for this fix's 7-day review
- **Dependencies:**
  - Tasks 2, 3, 4 must ship to main before this can begin
  - This task does NOT block any other work; it is an observational verification only
- **Knowledge needed:**
  - How to run git log queries to measure drain-signal commits
  - Understanding of the idle-widen-state.json structure and the consecutive_run_idle counter
  - Familiarity with po's sprint-signoff flow for post-ship verification steps

## What This Task is Fixing
RC-IDLE-LOOPS was shipped with AC-3: "7 days after landing, git log --since='7 days ago' --grep='chore(signals): drain' daily count is strictly below the 08-05..08-08 band of 25-65/day." That measurement was never taken. The original acceptance criteria stated that before DONE_VERIFIED, the actual counter must move and the 7-day observation must show improvement. This task fulfills that verification obligation.

## Background
The verification_gate in the parent task board row is: "consecutive_run_idle > 0 observed in docs/data/dev-team-idle-widen-state.json on a genuinely quiet tick." This is a two-part verification:
1. **Immediate (after landing, within 1 tick):** On a quiet tick, RUN-IDLE fires and consecutive_run_idle increments
2. **Sustained (after 7 days):** Drain-signal commits drop below the pre-fix 25-65/day baseline

Po explicitly required BOTH checks before accepting DONE_VERIFIED. This task tracks the execution of those checks.

## Measurement Plan
```bash
# Immediate check (after landing, trigger a quiet dev-team tick):
jq '.consecutive_run_idle' docs/data/dev-team-idle-widen-state.json
# Should show a number > 0 (was always 0 before the fix)

# Scheduled check (7 days after landing):
git log --since='7 days ago' --grep='chore(signals): drain' --oneline | wc -l
# Should be < 25 (was 25-65 before, indicates guard is now firing)
```

## Success Criteria
- ✅ consecutive_run_idle observed > 0 on the first quiet tick after landing
- ✅ git log count measured at day 7, strictly below 25/day baseline
- ✅ No regressions or other side effects observed in the 7-day window

## Related Rows (for reference)
- FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR (parent, backlog)
- SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (related: this is one instance of that class)
- P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT (original RC-IDLE-LOOPS task, DONE_VERIFIED, archive/2026-07.json)
