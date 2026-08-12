---
sprint: COWORK-RELIABILITY
branch: task/FIX-CHEF-MARKER-KEY-ANCHOR-3-spawn-fanout
size: S
zone: docs/agents/cowork-team/
depends_on:
  - FIX-CHEF-MARKER-KEY-ANCHOR-1
blocks:
  - FIX-CHEF-MARKER-KEY-ANCHOR-4
---

# FIX-CHEF-MARKER-KEY-ANCHOR-3 — Append scheduled_utc= to spawn-fanout.md trigger_prompt

**Parent:** FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (P0, COWORK-RELIABILITY)
**Architecture Brief:** docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md § Component A, step 2
**Related:** FIX-CHEF-PUBLISHED-MARKER-RELEASE, UC-CCA-P3 (ship together per PO ruling)

---

## TLDR

Modify spawn-fanout.md Step 5.2 (ENTRY_PROMPT assembly) to append `scheduled_utc=<scheduled_utc_time>` parameter to every spawned agent's trigger prompt. This parameter is sourced from the slot's newly-exposed `scheduled_utc_time` field and allows spawned agents (chef, digest, fb, etc.) to anchor their window-dependent behavior to the scheduled cron window, not the wall-clock.

---

## [PM] Planning Context

### Zone
- **Zone:** docs/agents/cowork-team/

### Acceptance Criteria

1. **Prompt Amendment Location:**
   - Locate Step 5.2 in spawn-fanout.md where ENTRY_PROMPT is assembled (currently lines 334-338)
   - Append `scheduled_utc=<slot.scheduled_utc_time>` to ENTRY_PROMPT BEFORE the SESSION_ID_LINE (which is appended last)
   - Format: newline + "scheduled_utc=" + the ISO8601 value, matching the precedent of `slot=<slot_id>` parameter

2. **Both Branches:**
   - When `slot.trigger_prompt` is present (line 334): append `scheduled_utc=` after slot.trigger_prompt
   - When fallback compose is used (line 338): append `scheduled_utc=` after the composed "run ... slot=..." string
   - Same field, same format, no branching — every spawned slot receives it

3. **Format & Example:**
   - If `slot.scheduled_utc_time = "2026-08-12T19:45:00.000Z"` and `slot.slot_id = "chef-evening"`
   - Spawned prompt includes: `run docs/agents/unified-agent/flow/chef.md  slot=chef-evening  scheduled_utc=2026-08-12T19:45:00.000Z`
   - No additional parsing or transformation; pass the value as-is from the slot object

4. **Scope — All Guaranteed Slots:**
   - Per AC5 of the parent task (FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR), this applies to ALL cowork guaranteed slots (chef-morning/intraday/eod/evening, digest-daily, digest-sunday, fb, etc.)
   - Single injection point in spawn-fanout.md Step 5.2 benefits every guaranteed-slot flow automatically via the unified ENTRY_PROMPT construction
   - No per-agent customization needed

5. **Verification:**
   - Inspect the generated ENTRY_PROMPT in a test run (enable debug logging if needed)
   - Assert all spawned prompts carry the `scheduled_utc=` parameter
   - Assert the value matches `slot.scheduled_utc_time` from the match-slots output (no transformation)

---

## Files to Read First

- `docs/agents/cowork-team/flow/spawn-fanout.md` lines 318-348 (ENTRY_PROMPT assembly, both branches)
- `scripts/agents-flow/cowork-match-slots.js` line 351 (reference: the JSON output that provides `slot.scheduled_utc_time`)
- Architecture brief: `docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` § 2 (Component A, step 2: explicit design)

## Files to Modify

- `docs/agents/cowork-team/flow/spawn-fanout.md` — Step 5.2, both ENTRY_PROMPT branches, append `scheduled_utc=` parameter

---

## Dependencies

- **Blocked by:** FIX-CHEF-MARKER-KEY-ANCHOR-1 (must be live first; the slot object must carry the field)
- **Blocks:** FIX-CHEF-MARKER-KEY-ANCHOR-4 (chef.md and other flows expect to receive this parameter in their spawn prompt)

---

## Implementation Notes

- The parameter name `scheduled_utc=` follows the existing convention of `slot=`, `trigger_id=`, and similar inline prompt parameters
- Append AFTER the trigger_prompt/composed flow path and BEFORE SESSION_ID_LINE (so SESSION_ID_LINE remains the last append, unchanged)
- No quoting needed — the ISO8601 format has no spaces or special characters
- This is a documentation change (flow pseudocode); actual prompt construction happens in spawn-fanout flow execution (no code file changes needed beyond the .md)

---

## Test Strategy

- Visual: Read the updated pseudocode in spawn-fanout.md and verify the amendment is clear
- Integration: After FIX-CHEF-MARKER-KEY-ANCHOR-4 lands, verify that chef.md and other spawned flows can successfully parse the `scheduled_utc=` parameter

---

## ACCEPTANCE HANDOFF

Checklist before marking DONE:
- [ ] `scheduled_utc=<value>` appended to both ENTRY_PROMPT branches (trigger_prompt present and fallback)
- [ ] Appended AFTER trigger_prompt/flow_path but BEFORE SESSION_ID_LINE
- [ ] Value sourced from `slot.scheduled_utc_time` (no transformation)
- [ ] Same parameter name and format used for all guaranteed slots
- [ ] Documentation/pseudocode is clear and matches the actual implementation pattern
- [ ] No breaking changes to existing parameters or structure
