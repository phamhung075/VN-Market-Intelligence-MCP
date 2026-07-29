---
sprint: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
branch: task/idle-chain-test-fairness
size: M
zone: docs/agents/dev-team/flow/
depends_on: [FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION]
blocks: []
---

## TLDR
Extend `scripts/audits/devteam-dispatch-gate-satisfiability.sh` to test AC-1 fairness (rotation selects all 5 consumers fairly within 5 ticks) and AC-4 gate-firing proof (not just resolution) — same instrument, not forked (per PO's explicit AC-4 instruction).

## [PM] Planning Context

- **Architect Brief:** `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §7 (test strategy)
- **Acceptance Criteria:** AC-1 (fairness across all 5 consumers, bounded cadence) + AC-4 (satisfiability not just resolution, gate must FIRE and DRAIN each selected tick)
- **Failure Mode:** `bounded1-supervised-lane-report.sh` shipped GREEN while the gate was dead in production (tested resolution in isolation, not gate firing against real scripts) — must NOT repeat
- **Test Pattern:** Existing `devteam-dispatch-gate-satisfiability.sh` already builds a live-shaped saturated fixture (backlog>0, ready>0, review>0) and replays real promote/claim scripts — extend this, don't fork

### Extension Scope (scripts/audits/devteam-dispatch-gate-satisfiability.sh)

**Existing capability:** Builds fixture, asserts per-lane gate conditions (WIP limits, row eligibility)

**New capability (AC-1 + AC-4):**
1. Simulate N=6+ consecutive idle-fallthrough ticks (use fixture, call rotation_selected() + run each selected consumer's full promote/claim path)
2. Assert fairness properties:
   - Each of the 5 consumer ids (bounded1, sls, rlc, qa_drain, step1_triage) appears as `$SELECTED` at least once within first 5 ticks
   - No id is selected twice before all 5 have been selected once (strict round-robin within a 5-tick window)
   - For each selected tick: the consumer's existing promote/claim script actually fires (WIP gate passes, rows eligible, claim succeeds) — gate FIRES
   - For each selected tick: if eligible rows exist, they are drained (rows move from backlog/ready/review to in_progress/qa/terminal) — DRAIN happens
3. Repeat pattern across multiple 5-tick windows to verify fairness is sustained (not just the bootstrap window)

### Test Design

**Input:** Fixture with saturated board (backlog=300, ready=40, review=100, all with appropriate next_agent tags)

**Loop:**
```bash
for tick in {1..10}; do
  SELECTED=$(jq -r 'rotation_selected(.)' fixture.json)
  
  # Verify SELECTED is one of the 5 expected ids
  assert SELECTED in [bounded1, sls, rlc, qa_drain, step1_triage]
  
  # Run the selected consumer's promote/claim scripts
  case $SELECTED in
    bounded1)
      bash scripts/devteam-backlog-promote-bounded1.jq
      bash scripts/devteam-backlog-claim-bounded1.jq
      # Assert: if eligible row was found, now in in_progress[]
      ;;
    sls)
      bash scripts/devteam-ready-promote-supervised-lane-sweep.jq
      bash scripts/devteam-ready-claim-supervised-lane-sweep.jq
      # Assert: if eligible row, now in in_progress[]
      ;;
    # ... etc for rlc, qa_drain, step1_triage
  esac
  
  # Advance timestamp for next rotation_selected() call
  # (important: each tick must have a different $NOW so stamp write shows progress)
fi
```

**Fairness assertions:**
- First 5 ticks: each id appears exactly once (no repeats until all 5 consumed)
- Ticks 6-10: same pattern repeats
- No cascade: if tick N selected bounded1 but it found nothing, tick N+1 does NOT try bounded1 again (next consumer in chain, not cascade to sls)

### Acceptance Criteria (AC-1/AC-4 explicit list from brief §7)

- [ ] Extension (not fork) of existing devteam-dispatch-gate-satisfiability.sh
- [ ] Fixture saturated: backlog>0, ready>0, review>0, all rows marked with correct next_agent values
- [ ] Simulation runs N=6+ consecutive idle-fallthrough ticks (rotation_selected() called each tick)
- [ ] Assertion: each of 5 consumers selected at least once within first 5 ticks (AC-1 fairness bound)
- [ ] Assertion: no consumer selected twice before all 5 selected once (strict round-robin)
- [ ] Assertion: for each selected tick, the consumer's promote/claim script **fires** (WIP gate passes, rows move) — not just "resolves to a plausible id" (AC-4 gate-firing proof)
- [ ] Assertion: pattern sustained across multiple 5-tick windows (fairness does not degrade after bootstrap)
- [ ] No cascade: if selected consumer's block runs but finds nothing, next tick does NOT try the same consumer again
- [ ] Script Persistence: new test added to `docs/policies/dev-standards.md` pointer list

### Files to Read First

- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (understand existing test structure + fixture pattern)
- `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§7 test strategy, AC-1/AC-4 mapping)
- `scripts/devteam-backlog-promote-bounded1.jq` and siblings (understand what "fire" means for each lane)
- `scripts/lib/devteam-eligibility.jq` (understand rotation_selected() after S1 task)

### Files to Create

None (extending existing test)

### Files to Modify

- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — add rotation fairness + gate-firing test blocks
- `docs/policies/dev-standards.md` — add test pointer (same task or next)

### Dependencies

- **Depends on:** FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION (must run against final rotation code)
- **Blocks:** Nothing (parallel with TEST-DURABLE is OK)

### Knowledge Needed

- Bash test patterns (assert functions, loop structures)
- jq fixture/snapshot patterns (same as existing script)
- devteam lane gate logic (WIP limits, next_agent routing)
- Fairness proof concepts (round-robin, bounded latency)
- Why gate-firing (not just resolution) matters (reference: bounded1-supervised-lane-report.sh false GREEN lesson)

### Risk & Constraints

- **Test must exercise REAL promote/claim scripts:** Do not mock the lane behavior; run actual jq scripts against the fixture to prove gate fires
- **Timestamp progression critical:** Each simulated tick must have a different NOW timestamp, or stamp write does not advance and fairness bound collapses
- **Fixture freshness:** Must be live-shaped, not abstract (e.g., real next_agent values, real priority ranges, not made-up data)
- **Regression guarding:** If existing fixture already covers some gates, verify no regressions introduced by rotation wrapper
