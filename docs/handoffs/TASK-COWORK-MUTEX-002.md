---
sprint: COWORK-DISPATCH-ROUTER-INTENT-MUTEX
task_id: TASK-COWORK-MUTEX-002
branch: task/cowork-mutex-002-test-harness
size: M
zone: cross-service/
depends_on: [TASK-COWORK-MUTEX-001]
blocks: []
---

## TLDR

Implement FR-7 live test harness: `scripts/agents-flow/cowork-dispatch-collision-probe.test.sh` (mirrors `cowork-guaranteed-slot-firer.test.sh` naming convention). Three cases: (1) reproduce occurrence 3 (must now block, previously claimed:true); (2) ambiguous multi-slot agent (both slots held, probe detects collision); (3) negative control (no collision, non-cowork agent bypasses probe). Cleanup via trap. Uses live coordination store, not mocked.

## [PM] Planning Context

- **Zone:** cross-service/ (test infrastructure, matches task 001)
- **Acceptance Criteria:**
  - [ ] New file: `scripts/agents-flow/cowork-dispatch-collision-probe.test.sh` created (executable, follows shebang `#!/bin/bash` + set -e pattern)
  - [ ] Case 1 (reproduce occurrence 3): Claim `published:tnb-audit:<today>` as sim-cowork-A via `task_claim`, then invoke Step 2.4 logic as sim-router-B for intent-key=tnb-audit, assert collision is detected and Step 2.4 exits WITHOUT calling Phase B claim
  - [ ] Case 2 (ambiguous multi-slot): Claim `cowork-slot:market-watcher-eod`, invoke Step 2.4 with intent-key="market-watcher" (ambiguous), assert TARGET_SLOTS resolves both `market-watcher-eod` and `market-watcher-offhours`, and collision blocks dispatch
  - [ ] Case 3 (negative control): (a) no collision held → probe finds nothing, Step 2.4 returns success, Phase B proceeds normally; (b) non-cowork agent (e.g., `ba`) invokes router, Step 2.4 short-circuits and never runs
  - [ ] Cleanup: `finally` trap or explicit cleanup releases all simulated claims via `task_release` (no orphaned locks after test)
  - [ ] No hardcoded task_ids in test — all values (`slot_id`, `periodKey`, `session_id`) computed dynamically or read from config
  - [ ] Test passes against live coordination store (tests run against real `docs/data/cowork-schedule.json`, real `task_list_held` calls to MCP server)
  - [ ] Output is TAP-compatible or bash-assert style (consistent with `cowork-guaranteed-slot-firer.test.sh` format — check that file for exact style)
  - [ ] Test can run standalone: `bash scripts/agents-flow/cowork-dispatch-collision-probe.test.sh` succeeds or fails cleanly

- **Files to read first:**
  - `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md` § FR-7 verification harness
  - `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` (existing test harness, exact style + cleanup pattern to mirror)
  - `scripts/agents-flow/cowork-match-slots.test.js` (if bash version not found, use as reference for cases structure)
  - TASK-COWORK-MUTEX-001 handoff (this task's dependency — understand Step 2.4's exact interface)
  - `docs/data/cowork-schedule.json` (agent→slot_id mapping for case 2)
  - Board row occurrence-3 raw timestamps (2026-07-21T20:24:33Z cowork + 20:25:14Z router) — validates test scenario is real

- **Files to create:**
  - `scripts/agents-flow/cowork-dispatch-collision-probe.test.sh` — new test file

- **Files to modify:** None

- **Dependencies:** TASK-COWORK-MUTEX-001 (Step 2.4 must exist and be callable from test; likely exposed as a bash function or shell snippet that test invokes)

- **Knowledge needed:**
  - `docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md` § Requirement (FR-7)
  - `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md` § §4 (3 test cases)
  - Board row `.po_corroboration_20260729T0858` field (4-sided concrete evidence from 2026-07-29)
  - `docs/agents/tools/list/task_claim.md`, `task_list_held.md`, `task_release.md` (MCP tool contracts)
  - `docs/policies/dev-standards.md` § Test Standards (script location, format, cleanup)

## Test Cases in Detail

**Case 1 (reproduce occurrence 3):**
```
# Simulated cowork dispatcher session: claim published:tnb-audit:<date>
task_claim(
  task_id="published:tnb-audit:2026-07-30",
  task_kind="cowork-slot",
  owner_agent="tran-ngoc-bau",
  owner_client_session="sim-cowork-A",
  ttl_seconds=100800
) → assert claimed:true

# Simulated router session: run Step 2.4 for agent=tran-ngoc-bau, intent-key=tnb-audit
# Expected: collision detected on "published:tnb-audit:" prefix match
# Step 2.4 must exit WITHOUT invoking Phase B's task_claim(task_id="intent:tran-ngoc-bau:tnb-audit")
# Assert: log contains "[router] collision detected: cowork-slot agent tran-ngoc-bau"
# Assert: Step 2.4 returns error/EXIT status (not success proceeding to Phase B)
```

**Case 2 (ambiguous multi-slot):**
```
# Claim one of market-watcher's slots: cowork-slot:market-watcher-eod
task_claim(
  task_id="cowork-slot:market-watcher-eod",
  task_kind="cowork-slot",
  owner_client_session="sim-cowork-A"
) → assert claimed:true

# Invoke Step 2.4 with agent=market-watcher, intent-key="market-watcher" (not a real slot_id)
# FR-2 resolution: intent-key not in AGENT_SLOTS → TARGET_SLOTS = all market-watcher slots
# Step 2.4 must check BOTH market-watcher-offhours and market-watcher-eod via probe
# Assert: collision detected on market-watcher-eod (the held one)
# Assert: Step 2.4 logs "cowork-slot agent market-watcher matches multiple slots: [market-watcher-offhours, market-watcher-eod]"
```

**Case 3 (negative control):**
```
# 3a: No collision held, probe should fall through to Phase B
task_list_held(kind="cowork-slot", expired=false) → returns empty or no matching keys
# Invoke Step 2.4 for a real cowork agent with no collision
# Assert: Step 2.4 returns success (no log line about collision)
# Assert: Phase B proceeds (or would proceed; test can mock the Phase B part)

# 3b: Non-cowork agent (ba) → Step 2.4 short-circuits
# Invoke router intent dispatch for agent=ba, intent-key=anything
# Assert: Step 2.4 never runs (log shows "ba is not a cowork-slot agent, skipping Step 2.4")
# Assert: Phase B proceeds normally (old behavior unchanged)
```

## Edge Cases

**Multi-slot case 2 requires jq to resolve agent→slots dynamically:** Don't hardcode slot_ids. Read from `cowork-schedule.json` live in the test, same as Step 2.4 will.

**Cleanup invariant:** Even if a case fails mid-way, cleanup trap must run and release the simulated claims. Use `trap 'cleanup_function' EXIT` to ensure all claimed locks are released.

**Session IDs:** Use deterministic strings like `sim-cowork-A`, `sim-router-B` for clarity in logs. Do NOT use real UUIDs from actual sessions (test should be repeatable).

## Test Strategy Notes

- Test runs AGAINST live coordination store (not mocked), so it will actually claim/release real locks. This is intentional per BA's own requirement: "the bug is fundamentally about live cross-session state, per BA's own framing."
- Test is fast: one claim, one probe, one release per case = ~3 `task_claim`/`task_list_held`/`task_release` calls per case = <1 second total.
- No fixture setup needed beyond the cowork-schedule.json (which is already live in the repo).
- Test is idempotent: multiple runs in sequence should all pass (cleanup ensures no state leaks).

## RETURN
DONE: Test harness validates all 3 cases from occurrence-3 reproduction to negative control. Cleanup via trap. Matches existing test script conventions.
NEXT: TASK-COWORK-MUTEX-003 (cross-reference annotation, optional, can run parallel after task 001).
