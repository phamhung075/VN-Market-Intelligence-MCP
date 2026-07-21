---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T8-QA-TEST-STRATEGY
type: QA
size: L
priority: P1
zone: qa/
depends_on: [DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS, DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION, DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC, DESIGN-COWORK-FANOUT-T6-MARKET-WATCHER-SLOT-ROUTING]
blocks: []
order: tier4-qa-final
---

## TLDR

Execute the 9-point test strategy from the architecture brief (§7, tests T-1 through T-9) to validate that the bounded-async producer/consumer recheck mechanism and the market-watcher slot routing fix work correctly in isolation and together. Tests cover: unit (tool grant), flow fixtures (snapshot extraction, alert-commander recheck gate, bootstrap extraction, market-watcher slot routing), and end-to-end (recheck fires and producer has posted).

## [PM] Planning Context

**Zone:** qa/

**Test Scope (Brief §7, Full Strategy):**

| Test | Type | Coverage |
|---|---|---|
| **T-1** | unit | `getToolsForSkills(["alert_commander"])` resolves a `schedule_task` registration fn (mirrors existing `1872b-alert-commander-skill-manifest.test.ts` pattern) |
| **T-2** | flow-fixture | Fixture `cycle-snapshot-HH:MM.json` with `won_slots` containing `parallel_group:"gatherers"` entry → `cycle-bootstrap/SKILL.md` Step -1 extraction yields non-empty `$CYCLE_SNAPSHOT.won_slots` |
| **T-3** | flow-fixture | alert-commander cycle: empty bus + `CO_PRODUCERS` non-empty + `IS_RECHECK` unset → exactly one `schedule_task` call, correct dedup_key/delay_seconds/prompt |
| **T-4** | flow-fixture | alert-commander cycle: empty bus + `CO_PRODUCERS` empty (no co-dispatch this tick) → zero `schedule_task` calls (regression: quiet case must stay cost-free) |
| **T-5** | flow-fixture | alert-commander cycle: `IS_RECHECK == true` + still-empty bus → zero further `schedule_task` calls (bounding — no chain) |
| **T-6** | flow-fixture | alert-commander cycle: recheck fires and producer HAS posted by then → normal Firing Gate evaluates and fires MARKET as usual, no special-cased path |
| **T-7** | flow-fixture | market-watcher: `slot=market-watcher-eod` invoked at wall-clock time far outside historical ±5min window → routes to eod.md, not cycle.md (regression for F7) |
| **T-8** | flow-fixture | market-watcher: no `slot=` param (manual/ad-hoc invocation) → wall-clock table governs unchanged (backward-compat) |
| **T-9** | regression | `cowork-match-slots.js`/`match-slots.md` Step 4b unchanged — existing collision-warn behavior for two legitimately different dish_types in one tick still WARNs, never blocks |

**Acceptance Criteria:**
- [ ] All 9 tests (T-1 through T-9) pass
- [ ] T-1 (unit test) added to apps/mcp-server/ test suite
- [ ] T-2 through T-6 (alert-commander + bootstrap) implemented as flow-fixture walkthroughs (can be in a shared test file or per-agent test suite — QA's choice)
- [ ] T-7, T-8 (market-watcher routing) implemented as flow-fixture walkthroughs
- [ ] T-9 (regression) verified by inspecting match-slots.md Step 4b code and confirming WARN logic is unchanged
- [ ] Test coverage summary documented in a QA report (brief, per brief §7 test list)
- [ ] Commit message includes: `AC: T8 — QA full test strategy T-1 through T-9 PASS`

**Files to read first:**
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:160-173` (§7: full test strategy, all 9 tests defined)
- Test fixtures from T1-T6 (once each is completed):
  - T1: tick-snapshot.md Step 4.7 output (sample cycle-snapshot-HH:MM.json with won_slots)
  - T2: cycle-bootstrap/SKILL.md Step -1 extraction (verify $CYCLE_SNAPSHOT.won_slots is available)
  - T4: alert-commander cycle behavior with/without co-producers
  - T6: market-watcher main.md routing by slot= parameter
- Existing test patterns:
  - `apps/mcp-server/src/__tests__/1872b-alert-commander-skill-manifest.test.ts` (unit test pattern for T-1)
  - Flow-fixture pattern from other agents (where available)

**Files to create/modify:**
- `apps/mcp-server/src/__tests__/<name>-T1-schedule-task-grant.test.ts` (T-1 unit test)
- Alert-commander test suite (T-2 through T-6 flow fixtures, if not already in place)
- Market-watcher test suite (T-7, T-8 flow fixtures, if not already in place)
- QA report summary (brief document naming test results)

**Dependencies:** All of T1, T2, T4, T6 must be complete and merged before QA can run full integration tests. T3, T5 do not have direct test coverage (T3 is tested by T-1 unit test; T5 is configuration and tested indirectly via T4's use of producer_settle_wait_seconds).

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (§7: test strategy, all test definitions)
- Test fixture patterns (flow-fixture walkthroughs, mocking techniques for bus reads, schedule_task mocking if needed)
- Brief context: understand what each test is validating (why it matters, failure mode if the feature breaks)

**Why Tier 4, Final, Depends on T1/T2/T4/T6:** QA cannot run until the implementers have completed T1, T2, T4, T6 (the main functional changes). T3 (tool grant) is tested separately via T-1 (unit test, can run once T3 is done). T5 (config) is not directly tested but is validated indirectly via T4.

---

## Test Priorities & Sequencing

- **Must-have (blocking):** T-1 (unit), T-3/T-4 (alert-commander discrimination), T-7/T-8 (market-watcher routing)
- **High-value (verify correctness):** T-2 (bootstrap extraction), T-5 (no chain), T-6 (recheck success)
- **Regression (keep existing behavior):** T-9 (match-slots unchanged)

---

## Notes

- Flow-fixture tests can be written as markdown walkthroughs (given → when → then) if integration test infrastructure is not yet mature, or as code-based fixtures if it is.
- Brief §7 intentionally specifies observable outcomes, not implementation details. QA has latitude in *how* to test (unit vs integration vs fixture), as long as the observable behavior matches the spec.
- Dedup_key uniqueness (T-3): verify that two separate quiet cycles with the same (slot, tick) do NOT double-schedule a recheck.
- Recheck bounding (T-5): verify that a recheck cycle itself, even if empty, does NOT recursively schedule another recheck.

---

## Signal Reference

This test strategy exists because:
- **2026-07-21T16:00Z incident:** Alert-commander was dispatched with market-watcher but read the bus before market-watcher posted, missing GAS −6.98%, BSR −6.49%, GEX −5.16% selloff.
- **Root cause:** Dispatcher has no producer/consumer ordering. Consumer (alert-commander) exited silently before producer (market-watcher) posted.
- **Design solution:** Bounded-async recheck (not multi-wave dispatch, not synchronous wait). Requires T1–T6 to work together.
- **This test strategy validates:** All six pieces (snapshot capture, bootstrap extraction, alert logic, market-watcher routing, tool grant, config) work correctly in isolation and together.
