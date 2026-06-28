---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P1.5
branch: task/1988-p15-regression-acceptance-tests
size: L
zone: apps/mcp-server/
depends_on: [TASK_1982, TASK_1983, TASK_1984, TASK_1985, TASK_1986, TASK_1987]
blocks: []
---

## TLDR

Comprehensive acceptance test suite for P1.5 liveness detection + orphan work takeover. Verify all 6 PO-locked DoD requirements and all 9 failure-mode scenarios from the brief §7.P1.5. Tests must use REAL adoption cycles (not hand-set counters) and RAW-verify against the live coordination.db in the Docker named volume.

## [PM] Planning Context

**Architect Brief Section:** §7.P1.5 (Phased Rollout: P1.5 failure-mode tests)

**Zone:** apps/mcp-server/ (test suite: `apps/mcp-server/src/__tests__/coordination/p15-liveness-*.test.ts`)

**Acceptance Criteria — DoD Compliance Tests:**

- [ ] **DoD-P15-1 (tree-hygiene):** test("sprint-task adoption: dead session's uncommitted edits reverted before resume")
  - Create a sprint-task lock, claim it
  - Simulate work: create a live-effect file (e.g., a hook script), commit it, then modify it without committing
  - Session dies (stops heartbeat, lock expires)
  - Reaper emits orphan-signal
  - New dev-team session adopts: calls `git status --porcelain`, runs `git checkout -- <file>`, verifies file reverted
  - Resume from last commit SHA proceeds cleanly (file edits no longer corrupt the state)

- [ ] **DoD-P15-2 (read-only marker probe):** test("cowork-slot adoption: published artifact dedup via task_list_held, not task_heartbeat")
  - Create a cowork-slot lock for a period (e.g., `cowork-slot:daily:2026-06-28`)
  - Publish sub-step 1: emit `published:market-post:2026-06-28` (session owns it)
  - Session dies before publishing sub-steps 2+
  - Reaper emits orphan-signal for the cowork-slot
  - New cowork session adopts: calls `task_list_held(task_id="published:market-post:2026-06-28")`
  - Finds it exists (read-only, no create-if-absent side-effect)
  - Skips sub-step 1, resumes from sub-step 2 only
  - Verify: sub-step 1 is NOT re-published (dedup works, no double-post)

- [ ] **DoD-P15-3 (carry-forward redispatch_count + escalation idempotency):** test("poison-task: redispatch_count chains across 3 real adopt→die cycles, escalates on 4th, BUG telegram fires once")
  - Cycle 1: adopt orphan-signal with `redispatch_count=1`, re-claim, simulate a crash (stop heartbeat), wait for reaper
  - Reaper emits new orphan-signal with `redispatch_count=2`
  - Cycle 2: adopt with `redispatch_count=2`, re-claim, crash again, wait for reaper
  - Reaper emits orphan-signal with `redispatch_count=3`
  - Cycle 3: adopt with `redispatch_count=3`, re-claim, crash again, wait for reaper
  - Reaper emits orphan-signal with `redispatch_count=4` (or sees it already at 3 and escalates inline)
  - Cycle 4 (adoption attempt): router step 2.5 reads the signal, sees `redispatch_count >= 3`, emits BUG telegram ONCE (payload.status set to ESCALATED)
  - Later adoption attempts: read same ESCALATED signal, skip telegram (idempotency verified)
  - Assertion: BUG telegram logged exactly once, not 3× (no spam)

- [ ] **DoD-P15-4 (ALLOW-LIST scan predicate):** test("reaper scan: emits orphan-signals ONLY for adoptable kinds, not commit-mutex/intent/cron-fire-claims")
  - Create locks of multiple kinds: sprint-task, cowork-slot, commit-mutex, intent:*, cron:* fire-claims, published:*, session-presence
  - Expire all locks (exceed TTL + grace window)
  - Trigger reaper (`gcExpiredLocks`)
  - Verify orphan-signal rows exist ONLY for: sprint-task, cowork-slot, dashboard-row (if present), cron-tick-with-published-checkpoint
  - Verify NO orphan-signal rows for: commit-mutex, intent:*, cron:* fire-claims, published:*, session-presence
  - Adopter behavior undefined for un-adoptable kinds (test proves they are not emitted → no undefined behavior)

- [ ] **DoD-P15-5 (reaper timer self-heal):** test("600s setInterval survives transient DB-busy, keeps firing")
  - Mock gcExpiredLocks to throw a transient DB-busy error on the first call
  - Verify the error is caught and logged (not swallowed silently; fail-loud per feedback_silent_swallow_serial_bugs)
  - Verify the setInterval closure continues running (does NOT kill the timer)
  - Verify the next 600s tick fires and gcExpiredLocks succeeds
  - Assertion: timer fires at t=0, errors logged, timer fires at t=600s (success), timer fires at t=1200s (success)

- [ ] **DoD-P15-6 (honest-bound doc-repeat):** test("all P1.5-AF docs carry verbatim honest-bound line: zero live sessions = zero execution; reaper only makes work ADOPTABLE")
  - Grep for the string "zero live sessions" in:
    - `docs/agents/agent-father/flow/main.md` (step 2.5 adoption probe section)
    - `docs/agents/dev-team/flow/main.md` (Step 0a adoption section)
    - Any orphan-signal mechanism docs (coordinationStore doc strings, SKILL docs)
  - Assertion: exact line appears verbatim in each doc (no paraphrasing)

**Acceptance Criteria — Brief §7.P1.5 Failure-Mode Tests:**

- [ ] test("crash mid-sprint-task → reaped + re-dispatched + RESUMED not restarted")
  - Claim sprint-task, commit step 1, crash before step 2
  - Reaper detects, emits orphan-signal
  - New session adopts from git SHA checkpoint, does NOT re-run step 1, continues from step 2

- [ ] test("crash mid-cowork → period artifact dedup prevents double-publish")
  - Claim cowork-slot, publish sub-step 1, crash
  - New session adopts, checks for published artifact (read-only), skips sub-step 1, publishes sub-steps 2+
  - Verify no double-post

- [ ] test("slow-not-dead → NOT orphaned within grace window")
  - Claim sprint-task with TTL=3600s, heartbeat cadence=≤1200s
  - Miss ONE heartbeat tick (up to 1200s stale)
  - Total silence = up to 1200s + 1200s + 300s (grace) = ~2700s, well within TTL
  - Verify NO orphan-signal emitted (reaper scans after expires_at + grace; row has not expired yet)
  - Session renews just before expires_at + grace, stays alive

- [ ] test("all sessions dead → state adoptable on next online")
  - Simulate all sessions dying (no heartbeats for 600s + grace)
  - Orphan-signal rows exist with 2h TTL
  - New session reads `task_list_held(kind="orphan-signal")` and adopts
  - Verify: orphan-signals are visible even after all-sessions-dead period

- [ ] test("poison-task → escalates after N_MAX=3, stops re-queuing")
  - Perform 3 real adopt→die cycles (see DoD-P15-3 test above)
  - On 4th cycle: adopter sees `status==ESCALATED`, stops re-dispatch
  - Orphan-signal row persists 24h (visible for human inspection)

- [ ] test("orphan-signal itself expires → no adopter within 2h, silent cleanup")
  - Emit orphan-signal, do NOT adopt it
  - Wait 2h + grace
  - Reaper runs: orphan-signal row expires and is GC'd
  - Verify: no further adoption attempts (signal gone)
  - Board retains stale `in_progress` (acceptable fallback per §6.5.5)

- [ ] test("orphan-signal adoption: wrong-role session ignores it")
  - Emit orphan-signal for `owner_agent="dev-team"`
  - Simulate `digest-predict` session reading orphan-signals
  - Call `task_list_held(kind="orphan-signal", owner_agent="digest-predict")` → no match
  - Adopter does not adopt (correct: wrong role's signal)

- [ ] test("mcp-server rebuild: orphan-signal survives, old lock doesn't")
  - Claim a lock, stop heartbeat, allow it to expire and be reaped
  - Orphan-signal row exists with NULL owner_client_session (can be adopted by any session)
  - Rebuild mcp-server (rotates owner_session UUID)
  - Verify orphan-signal still has the ORIGINAL dead session's owner_client_session (not rotated — lives in the payload)
  - Adopter reads it and correctly attributes the work to the dead session
  - No zombie locks from the rebuild

**Test Organization:**
- `apps/mcp-server/src/__tests__/coordination/p15-liveness-unit.test.ts` (unit tests for DoD compliance)
- `apps/mcp-server/src/__tests__/coordination/p15-liveness-integration.test.ts` (integration tests for failure-mode scenarios)
- All tests use REAL session UUIDs (not mocked), REAL coordination.db transactions, and RAW-verify against live DB state

**DoD Locks Baked (PO-S6..S9):**
- All 6 DoD requirements verified via corresponding tests above
- Brief §7.P1.5 failure-mode matrix (9 scenarios) all tested

**Files to read first:**
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§7.P1.5` (all failure-mode scenarios)
- Precedent test: `apps/mcp-server/src/__tests__/coordination/coordination.test.ts` (existing pattern for coordination tests)

**Files to create:**
- `apps/mcp-server/src/__tests__/coordination/p15-liveness-unit.test.ts` (unit tests)
- `apps/mcp-server/src/__tests__/coordination/p15-liveness-integration.test.ts` (integration tests)

**Files to modify:**
- None (tests are new, not modifying existing code)

**Dependencies:**
- All other P1.5 tasks completed (TASK_1982..TASK_1987)

**Knowledge needed:**
- Jest test framework + async/await patterns
- SQLite transaction semantics for test fixtures
- Mock/spy patterns for timer testing (setInterval injection)
- Brief failure-mode matrix (all 9 scenarios in §7.P1.5)

## Context

Acceptance testing is the proof that P1.5 works as designed. Without this, we ship a complex liveness mechanism blind. The tests must be REAL adoption cycles (no hand-set counters), must exercise EVERY DoD lock, and must RAW-verify against live coordination.db to rule out schema drift.

## Success Signal

- All tests pass on main (green CI)
- Each DoD lock has at least one corresponding test (traceability)
- Each failure-mode scenario from brief §7.P1.5 has a test
- Manual verification: perform a real cross-session handoff (session A crashes mid-task, session B adopts and resumes), confirm all DoD gates fire correctly, confirm tree-hygiene worked, confirm board flipped
