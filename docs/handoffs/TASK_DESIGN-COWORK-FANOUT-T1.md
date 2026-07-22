---
sprint: DESIGN-COWORK-FANOUT
task_id: DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS
size: S
zone: docs/agents/cowork-team/
depends_on: []
blocks: [DESIGN-COWORK-FANOUT-T2]
---

## TLDR
Extend `docs/agents/cowork-team/flow/tick-snapshot.md` Step 4.7 to capture the final `WON_SLOTS` array (slot_id, agent, parallel_group for each matched slot in this tick) in the snapshot JSON written to `docs/data/cycle-snapshot-<HH:MM>.json`. This data is already available in the dispatcher's Step 4.6 local context; the change is purely additive to the JSON schema, with no new dependencies or failure modes.

## [PM] Planning Context

**Zone:** `docs/agents/cowork-team/`

**Acceptance Criteria:**
- [ ] `tick-snapshot.md` Step 4.7 jq assembly now includes a `won_slots` array field in the output JSON
- [ ] `won_slots` schema: `[{slot_id, agent, parallel_group}, ...]` — three fields, no additional nesting
- [ ] `won_slots` is populated from `WON_SLOTS` variable already in Step 4.6's scope (zero new tool calls)
- [ ] On snapshot write failure, existing degradation path already applies: agents fall back to direct `get_cycle_bootstrap()` call; no new error-handling logic needed
- [ ] AC T-2 fixture test passes: `cycle-snapshot-HH:MM.json` fixture with `won_slots` containing a `parallel_group:"gatherers"` entry → `cycle-bootstrap/SKILL.md` extraction succeeds

**Rationale:**
- Fixes F4 from brief: `last_fired` is stamped at spawn time, not completion time. Consumer (alert-commander) cannot reliably reconstruct "was a producer co-dispatched this tick" by re-invoking the dispatcher logic later. Information must be captured at dispatch time and shared via the snapshot.
- Design principle: fixes F5 (the dispatcher already has exact data + already has a channel to every cowork agent via shared bootstrap skill)
- Non-breaking: added field to JSON is safely ignored by any consumer that doesn't yet know about it; no schema migration risk

**Files to read first:**
- `docs/agents/cowork-team/flow/tick-snapshot.md` (Step 4.6/4.7: understand current snapshot assembly, WON_SLOTS variable scope)
- `docs/data/cycle-snapshot-HH:MM.json` (existing snapshot structure — confirm `won_slots` can be safely added)
- `docs/architecture-briefs/2026-07-21-cowork-fanout-producer-consumer-ordering.md` § F4 § F5 § 4.1 (design rationale)

**Files to modify:**
- `docs/agents/cowork-team/flow/tick-snapshot.md` (Step 4.7: add `won_slots` field to jq assembly)

**Files to create:**
- None

**Dependencies:**
- None (independent of T3, T5, T6)
- Blocks T2 (T2 reads `won_slots` from snapshot)

**Knowledge needed:**
- jq array assembly syntax (straightforward `WON_SLOTS` projection to the three-field schema)
- `docs/agents/cowork-team/flow/tick-snapshot.md` existing structure
- Brief § 4.1 (schema shape + rationale)
