---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T8-QA-TEST-STRATEGY
size: L
zone: qa/
depends_on: [DESIGN-COWORK-FANOUT-T1, DESIGN-COWORK-FANOUT-T2, DESIGN-COWORK-FANOUT-T3, DESIGN-COWORK-FANOUT-T4, DESIGN-COWORK-FANOUT-T6]
blocks: []
gate: "All T1-T6 (and T7 optional) must be DONE or REVIEW before QA begins"
---

## TLDR
Execute the test strategy defined in brief § 7: nine test cases spanning unit tests (T-1), flow-fixture walkthroughs (T-2 through T-7, T-9), and regression verification (T-8). Verify the producer/consumer ordering fix and R3 fold-in are both correct and non-breaking.

## [PM] Planning Context

**Zone:** `qa/`

**Acceptance Criteria:**
- [ ] **T-1 (unit):** `getToolsForSkills(["alert_commander"])` resolves a `schedule_task` registration fn (mirrors `1872b-alert-commander-skill-manifest.test.ts` pattern)
- [ ] **T-2 (fixture):** Fixture `cycle-snapshot-HH:MM.json` with `won_slots` containing `parallel_group:"gatherers"` → `cycle-bootstrap/SKILL.md` Step -1 extraction yields non-empty `$CYCLE_SNAPSHOT.won_slots`
- [ ] **T-3 (fixture):** alert-commander cycle: empty bus + `CO_PRODUCERS` non-empty + `IS_RECHECK` unset → exactly one `schedule_task` call with correct `dedup_key`, `delay_seconds`, `prompt`
- [ ] **T-4 (fixture):** alert-commander cycle: empty bus + no co-dispatch this tick (no `won_slots` entry for "gatherers") → zero `schedule_task` calls (regression: quiet-tick cost-free case must stay cost-free)
- [ ] **T-5 (fixture):** alert-commander cycle: `IS_RECHECK == true` + still-empty bus → zero further `schedule_task` calls (bounding: no chain)
- [ ] **T-6 (fixture):** Recheck cycle fires later, producer HAS posted by then → normal Firing Gate evaluates and fires MARKET as usual, no special-case path
- [ ] **T-7 (fixture):** market-watcher: `slot=market-watcher-eod` invoked at wall-clock time far outside historical ±5min window → routes to `eod.md`, not `cycle.md`
- [ ] **T-8 (fixture):** market-watcher: no `slot=` param (manual/ad-hoc invocation) → existing wall-clock table governs unchanged (backward-compat)
- [ ] **T-9 (regression):** `cowork-match-slots.js` / `match-slots.md` Step 4b unchanged — existing collision-warn behavior for two legitimately different dish_types in one tick still WARNs, still does not BLOCK

**Rationale:**
- Comprehensive coverage of both the producer/consumer ordering fix (T1–T6) and the R3 fold-in (market-watcher slot routing, T6/T7)
- T-1 verifies the blocking prerequisite (tool grant)
- T-2 through T-5 verify alert-commander's recheck mechanism works correctly and is discriminating (only fires when needed)
- T-6 verifies the recheck actually solves the problem (late-posting producer still detected)
- T-7 / T-8 verify market-watcher's routing fix and backward-compat
- T-9 verifies no regression on Step 4b (no accidental BLOCK introduced)

**Files to read first:**
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § 7 (test strategy, detailed AC for each test)
- Handoff files for T1–T6 (for context on each subtask's scope)
- Existing test fixtures and patterns in `apps/mcp-server/src/__tests__/` (reference for new unit test T-1)

**Files to create / modify:**
- T-1: New or extended test in `apps/mcp-server/src/__tests__/` (following `1872b-alert-commander-skill-manifest.test.ts` pattern)
- T-2 through T-9: Flow-fixture walkthroughs (may be inline markdown or separate fixture files, per qa process)

**Dependencies:**
- GATE: All implementation tasks T1–T6 must be in DONE or REVIEW status before QA can fully execute
- T7 (optional) does not block QA entry; T-9 just becomes "regression: existing behavior unchanged"

**Knowledge needed:**
- Brief § 7 full test strategy table
- Flow-fixture walkthrough process (existing qa methodology)
- Unit test patterns in `apps/mcp-server/src/__tests__/`
- Alert-commander and market-watcher flow architecture
