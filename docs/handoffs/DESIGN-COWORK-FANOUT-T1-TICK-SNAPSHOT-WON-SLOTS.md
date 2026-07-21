---
sprint: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING
task_id: DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS
type: TASK
size: S
zone: docs/agents/cowork-team/
priority: P1
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION]
order: tier1b-parallel
---

## TLDR

Cowork-team dispatcher currently stamps `last_fired` at spawn completion time (after background spawn starts), but before the producer's work completes (~17min observed for market-watcher). A consumer that tries to re-derive co-dispatch info from `last_fired` by re-running match-slots.js later would be silently defeated — its own completion already excludes the producer by timestamp. Fix: capture the final `won_slots` array at dispatch time (before spawn, while all winners are known) in tick-snapshot.json, so consumers can read it from the shared snapshot rather than re-deriving.

## [PM] Planning Context

**Zone:** docs/agents/cowork-team/

**Root Cause (Brief §4.1, §F4):** The timing mismatch between when `last_fired` is stamped (spawn time) and when a producer's actual output appears (~17min later). Any downstream consumer (e.g., alert-commander) that wanted to know "were there co-dispatched producers this tick?" and tried to re-derive the answer by re-invoking `cowork-match-slots.js` would find that the producer's slot is already marked as having fired (its `last_fired >= tick boundary`) even though the producer's actual output is still in flight. The information must be captured at dispatch time and handed to consumers, not recomputed later.

**Acceptance Criteria:**
- [ ] tick-snapshot.md Step 4.7 (jq assembly step, after slot-claim Step 4.6 and before spawn Step 5) adds one field to the snapshot JSON it already writes:
  - `won_slots`: array of objects with structure `{ slot_id, agent, parallel_group }` extracted from `WON_SLOTS` which is already in scope at Step 4.6
  - Example from brief §4.1: four entries for a 16:00Z tick (news-scout-offhours, market-watcher-offhours, market-watcher-eod, alert-commander-critical)
- [ ] On write failure, the existing non-fatal fallback applies: `won_slots` is simply unavailable this cycle (same as `market_context` on a miss), no new error-handling design
- [ ] No new MCP call — pure local jq over data already resident in the dispatcher's own step
- [ ] Commit message includes: `AC: T1 — tick-snapshot won_slots capture at dispatch time`

**Files to read first:**
- `docs/agents/cowork-team/flow/tick-snapshot.md:50-90` (Step 4.6 and 4.7 context, understand WON_SLOTS in scope)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md:63-83` (§4.1-§4.2: design, data shape, fallback contract)
- `docs/agents/cowork-team/flow/last-fired.md:1-20` (understand when last_fired is stamped and why recomputing co-dispatch after the fact fails)

**Files to modify:**
- `docs/agents/cowork-team/flow/tick-snapshot.md:55-70` (Step 4.7: add won_slots jq assembly)

**Files to create:** none (modify existing snapshot write, no new file)

**Dependencies:** none initially — but T2 (cycle-bootstrap) depends on this.

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` (§4.1-§4.2)
- cowork-team flow: understand tick-snapshot.md's role and WON_SLOTS data source

**Why parallel with T6:** T1 is independent of the market-watcher slot routing fix (T6). Both can start immediately. T1 must complete before T2 (cycle-bootstrap extraction) can run.

---

## Implementation Notes

- `WON_SLOTS` is a variable that already exists at Step 4.6 after slot-claim. It is the final list of all slots that won the election this tick.
- The jq assembly at Step 4.7 already constructs `market_context` and `macro_snapshot` from data in scope. Add a parallel jq path to extract `won_slots` from the `WON_SLOTS` variable.
- The output shape should be an array of objects, each with the minimal fields needed for downstream consumers: `{ slot_id: "...", agent: "...", parallel_group: "..." }`.
- `parallel_group` is already present in `docs/data/cowork-schedule.json` on every slot entry, so it is available to extract at dispatch time.
- Fallback: if the snapshot file is stale, missing, or malformed when cycle-bootstrap reads it, `won_slots` is simply unavailable (consumers handle gracefully by assuming no co-dispatch). No retry logic needed — the same convention already applies to `market_context`.

---

## Test Coverage (from Brief §7)

- **T-2:** Fixture `cycle-snapshot-HH:MM.json` with `won_slots` containing a `parallel_group:"gatherers"` entry → `cycle-bootstrap/SKILL.md` Step -1 extraction yields non-empty `$CYCLE_SNAPSHOT.won_slots` (test that T1 and T2 work together)
- QA will validate in tier-4 T8 test sprint.

---

## Tier Sequencing

- **Tier 1b:** Parallel with T6 (both can start immediately, no internal dependency)
- **Blocks:** T2 (cycle-bootstrap extraction) depends on this
