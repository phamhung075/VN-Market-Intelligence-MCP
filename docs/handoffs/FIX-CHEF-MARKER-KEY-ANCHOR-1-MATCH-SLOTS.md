---
sprint: COWORK-RELIABILITY
branch: task/FIX-CHEF-MARKER-KEY-ANCHOR-1-match-slots
size: S
zone: cross-service/
depends_on: []
blocks:
  - FIX-CHEF-MARKER-KEY-ANCHOR-2
  - FIX-CHEF-MARKER-KEY-ANCHOR-3
  - FIX-CHEF-MARKER-KEY-ANCHOR-4
---

# FIX-CHEF-MARKER-KEY-ANCHOR-1 — Expose scheduled_utc_time in cowork-match-slots.js

**Parent:** FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (P0, COWORK-RELIABILITY)
**Architecture Brief:** docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md § Component A
**Related:** FIX-CHEF-PUBLISHED-MARKER-RELEASE, UC-CCA-P3 (ship together per PO ruling)

---

## TLDR

Add `scheduled_utc_time` field to each live-matched slot in `cowork-match-slots.js` output, computed from the slot's cron expression and the current tick time. This mirrors the value already exposed on catch-up candidates by `cowork-catchup-predicate.js`, enabling consistent window-anchor derivation across both live-match and catch-up paths.

---

## [PM] Planning Context

### Zone
- **Zone:** cross-service/ (multi: scripts/agents-flow/, docs/agents/cowork-team/flow/, docs/agents/unified-agent/flow/chef.md)

### Acceptance Criteria

1. **Field Availability on MATCHES:**
   - Each slot object in the `slots` array of the JSON output carries a new `scheduled_utc_time: "<ISO8601>"` field
   - Value is ISO8601 format (e.g., `"2026-08-12T19:45:00.000Z"`), representing the most recent nominal cron-fire instant at-or-before the current tick
   - Mirrors the exact format already emitted by `cowork-catchup-predicate.js`'s `computeCatchupCandidates()` (line 228)

2. **Computation Logic:**
   - Reuse the existing `snapToCronBoundary()` function (already exported, lines 58-83) to snap the current `nowUnix` to the most recent cron boundary for each slot
   - For each cron-matched slot, call `new Date(snappedUnix * 1000).toISOString()` to produce the field value
   - Zero new computational complexity: the snap boundary is already used internally for dedup (line 113); expose its result as a field

3. **Integration:**
   - Live-path results (adaptive/legacy branches, lines 207-267) include the field on every matched slot
   - Catch-up results (`catchup_raw`, already present) are unchanged — they already carry `scheduled_utc_time` via `cowork-catchup-predicate.js`
   - Both paths now expose the same field name, same format → symmetric contract for downstream consumers (spawn-fanout.md, chef.md)

4. **Invariant — One Nominal Tick per Slot:**
   - No branching on `is_catchup` or `due_reason` — every slot gets exactly one `scheduled_utc_time`, sourced from `snapToCronBoundary()`
   - This is the canonical window anchor; it never changes for a given slot/cron/nowUnix tuple

5. **RAW Verification:**
   - Run the script live on a mixed batch containing at least one chef slot (e.g., chef-evening) and one multi-fire slot (e.g., chef-intraday)
   - Assert both `slots[]` and `catchup_raw[]` carry the `scheduled_utc_time` field
   - Assert two independent runs at the same Unix second derive identical `scheduled_utc_time` for the same slot (determinism — no wall-clock reread)
   - Assert `scheduled_utc_time` for a single-fire slot is never more than 24h in the past (sanity bound)

---

## Files to Read First

- `scripts/agents-flow/cowork-match-slots.js` lines 45-84 (`snapToCronBoundary` function)
- `scripts/agents-flow/cowork-match-slots.js` lines 207-267 (MATCHES result assembly)
- `scripts/agents-flow/cowork-catchup-predicate.js` line 228 (reference: how `scheduled_utc_time` is already computed)
- Architecture brief: `docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` § 2 (Component A: design rationale)

## Files to Modify

- `scripts/agents-flow/cowork-match-slots.js` — add `scheduled_utc_time` computation in the MATCHES assembly block (lines 207-267), reusing `snapToCronBoundary()`

---

## Dependencies

- **Blocked by:** None
- **Blocks:** 
  - FIX-CHEF-MARKER-KEY-ANCHOR-2 (documentation)
  - FIX-CHEF-MARKER-KEY-ANCHOR-3 (spawn-fanout.md integration)
  - FIX-CHEF-MARKER-KEY-ANCHOR-4 (chef.md parser)

---

## Implementation Notes

- `snapToCronBoundary(nowUnix, cron)` is already a pure function with no I/O — safe to call for each slot
- The value is deterministic: same input (nowUnix, cron) always produces the same output
- No change to the adaptive cadence logic (lines 225-263) — the new field is orthogonal to due-reason branching
- Update the JSON output comment/JSDoc at line 351 to document the new field in the output schema

---

## Test Strategy

- Unit: Call `cowork-match-slots.js` directly on a fixture with at least 3 slots (single-fire, multi-fire, guaranteed)
- Integration: Verify spawn-fanout.md and chef.md can reference the field downstream without errors
- Regression: Existing `cowork-match-slots.test.js` cases (if any) still pass

---

## ACCEPTANCE HANDOFF

Checklist before marking DONE:
- [ ] `scheduled_utc_time` field present on every slot in MATCHES output
- [ ] Field format is ISO8601 (matches `cowork-catchup-predicate.js` precedent)
- [ ] Computation reuses `snapToCronBoundary()` (no duplicated logic)
- [ ] Two identical nowUnix inputs produce identical `scheduled_utc_time` for the same slot (determinism verified)
- [ ] All scheduled times are ≤24h in the past for single-fire slots (sanity check)
- [ ] Catch-up path (`catchup_raw[]`) remains unchanged but still carries the field from its own predicate
- [ ] JSON output JSDoc/comment updated to reflect the new field schema
