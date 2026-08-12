---
sprint: COWORK-RELIABILITY
branch: task/FIX-CHEF-MARKER-KEY-ANCHOR-2-match-slots-doc
size: S
zone: docs/agents/cowork-team/
depends_on:
  - FIX-CHEF-MARKER-KEY-ANCHOR-1
blocks:
  - FIX-CHEF-MARKER-KEY-ANCHOR-3
  - FIX-CHEF-MARKER-KEY-ANCHOR-4
---

# FIX-CHEF-MARKER-KEY-ANCHOR-2 — Document scheduled_utc_time in match-slots.md

**Parent:** FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (P0, COWORK-RELIABILITY)
**Architecture Brief:** docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md § Component A
**Related:** FIX-CHEF-PUBLISHED-MARKER-RELEASE, UC-CCA-P3 (ship together per PO ruling)

---

## TLDR

Update `docs/agents/cowork-team/flow/match-slots.md` to document the new `scheduled_utc_time` field on the MATCHES output, and cross-reference the equivalent field on `catchup_raw` to establish the symmetric contract.

---

## [PM] Planning Context

### Zone
- **Zone:** docs/agents/cowork-team/

### Acceptance Criteria

1. **Documentation Location:**
   - Locate the section in match-slots.md that documents the MATCHES output schema (currently line ~70-90, after the step description)
   - Add `scheduled_utc_time` to the field list alongside existing fields (`slot_id`, `agent`, `flow_path`, `cron`, `trigger_prompt`, `guaranteed`, etc.)

2. **Field Description:**
   - Brief: "ISO8601 representation of the most recent nominal cron-fire instant at-or-before the current tick, e.g., `2026-08-12T19:45:00.000Z`. Used by spawned agents to anchor published-marker keys to scheduled windows, not wall-clock time."
   - Note that this field is computed deterministically from the slot's cron expression, independent of when the agent actually runs (critical for catch-up/retry consistency)

3. **Cross-Reference:**
   - Link to the equivalent field on `catchup_raw` (already documented in the same file or a related catchup flow doc)
   - Clarify: "Both MATCHES and catchup_raw expose the same field name and format for symmetric consumption downstream"

4. **Scope:**
   - Document ONLY the live-matched MATCHES path (this task's scope)
   - Catch-up (`catchup_raw`) documentation already exists (from TASK-COWORK-CATCHUP-1/-2); verify it still correctly describes `scheduled_utc_time` and update if needed (but preferably defer non-critical updates to avoid churn)

5. **Files Read/Modified:**
   - Read: `docs/agents/cowork-team/flow/match-slots.md` (understand current schema docs)
   - Modify: Same file, schema documentation section

---

## Files to Read First

- `docs/agents/cowork-team/flow/match-slots.md` — entire file (find the MATCHES schema block)
- `scripts/agents-flow/cowork-catchup-predicate.js` line 189-191 (reference: the catchup schema definition, which already lists `scheduled_utc_time`)
- Architecture brief: `docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` § 2 (Component A: the field is exposed identically on both paths)

## Files to Modify

- `docs/agents/cowork-team/flow/match-slots.md` — add `scheduled_utc_time` to the MATCHES output schema documentation

---

## Dependencies

- **Blocked by:** FIX-CHEF-MARKER-KEY-ANCHOR-1 (the field must be implemented first)
- **Blocks:** 
  - FIX-CHEF-MARKER-KEY-ANCHOR-3 (spawn-fanout.md needs to reference this field in documentation)
  - FIX-CHEF-MARKER-KEY-ANCHOR-4 (chef.md documentation will reference spawn-fanout's usage)

---

## Implementation Notes

- This is documentation-only; no code changes to the flow itself
- If match-slots.md currently documents the output schema in a table or list, simply add one row for the new field
- Keep the description brief and link to the brief's Component A section for full context if needed
- Consistency check: verify the format description matches the actual output from cowork-match-slots.js (ISO8601 string)

---

## Test Strategy

- Read through the updated documentation and verify it clearly explains the field's purpose and format
- No functional test needed (documentation task)

---

## ACCEPTANCE HANDOFF

Checklist before marking DONE:
- [ ] `scheduled_utc_time` field documented in MATCHES schema section
- [ ] Description explains it is a deterministic ISO8601-formatted cron-anchor, not a wall-clock read
- [ ] Cross-reference to catchup_raw equivalent field present
- [ ] Documentation accurately reflects the actual output from FIX-CHEF-MARKER-KEY-ANCHOR-1
- [ ] No typos or broken links
