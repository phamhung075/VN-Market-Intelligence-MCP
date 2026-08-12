---
sprint: COWORK-RELIABILITY
branch: task/FIX-CHEF-MARKER-KEY-ANCHOR-4-chef-parse
size: M
zone: docs/agents/unified-agent/
depends_on:
  - FIX-CHEF-MARKER-KEY-ANCHOR-1
  - FIX-CHEF-MARKER-KEY-ANCHOR-3
blocks: []
---

# FIX-CHEF-MARKER-KEY-ANCHOR-4 — Parse scheduled_utc= in chef.md Step 0.5

**Parent:** FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR (P0, COWORK-RELIABILITY)
**Architecture Brief:** docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md § Component A, step 3
**Related:** FIX-CHEF-PUBLISHED-MARKER-RELEASE, UC-CCA-P3 (ship together per PO ruling)

---

## TLDR

Modify chef.md Step 0.5 to parse the incoming `scheduled_utc=<ISO8601>` parameter from the invocation prompt and derive `CYCLE_DATE_UTC` from it (extracting the date portion). If absent (genuine ad-hoc/manual invocation), fall back to `date -u +%Y-%m-%d` unchanged. This is the final step that closes the retry-drift and key-derivation defects by anchoring the window-based key to the scheduled cron window, not wall-clock time.

---

## [PM] Planning Context

### Zone
- **Zone:** docs/agents/unified-agent/

### Acceptance Criteria

1. **Parse scheduled_utc Parameter:**
   - Extract `scheduled_utc=<ISO8601>` from the invocation prompt using the same technique already used for `slot=<slot_id>` (chef.md lines 67-70 reference the pattern)
   - Expected format: `"2026-08-12T19:45:00.000Z"` (ISO8601 string from spawn-fanout.md append)
   - Store as temporary variable (e.g., `SCHEDULED_UTC` or similar) if present

2. **Derive CYCLE_DATE_UTC:**
   - If `scheduled_utc` is present and parseable: extract date portion (e.g., `2026-08-12` from `2026-08-12T19:45:00.000Z`)
   - Assign `CYCLE_DATE_UTC = <date portion>` (e.g., `2026-08-12`)
   - If `scheduled_utc` is absent or unparseable: fall back to `date -u +%Y-%m-%d` exactly as today (unchanged)

3. **Scope — Single Canonical Derivation:**
   - `CYCLE_DATE_UTC` is already the CANONICAL date derivation point in chef.md (per comments at lines 49-71)
   - Pinned once at Step 0.5, reused verbatim (NEVER recomputed) at:
     - Step 7.6: synthesis JSON filepath + metadata.date_vn
     - Step 8b: session/notebook header
     - Step 0.5 single-fire published-marker key (line 105)
   - This fix changes the BASIS of derivation (scheduled window vs wall-clock) but preserves the CARDINALITY (one computation, reused everywhere)

4. **Generality:**
   - Apply the same parsing technique to ALL guaranteed-slot flows that inherit the `scheduled_utc=` parameter via spawn-fanout.md:
     - chef.md (primary task)
     - digest-daily, digest-sunday (AC5 requirement from parent task)
     - Other guaranteed slots as applicable (fb-daily, tnb-audit, etc.)
   - Per AC5, this fix is NOT chef-only; shepherd the generalization as part of this decomposition

5. **Backward Compat:**
   - Genuinely ad-hoc/manual invocations of chef (e.g., debugging or one-off manual spawns) may not have `scheduled_utc=`
   - Fall back to `date -u` silently; no error or warning needed (matches system-auditor's AUDIT_TIER=4 precedent: manual-only path)
   - This ensures the flow remains executable both from cowork-team's parameterized dispatch AND from manual testing

6. **RAW Verification:**
   - Execute chef.md with `scheduled_utc=2026-08-12T19:45:00.000Z` in the prompt → assert `CYCLE_DATE_UTC = 2026-08-12`
   - Execute chef.md WITHOUT `scheduled_utc=` in the prompt → assert `CYCLE_DATE_UTC` is derived from current `date -u` (fallback path)
   - Assert two concurrent executions of chef-evening with the SAME scheduled_utc derive identical CYCLE_DATE_UTC (determinism — the entire defect fix)
   - Assert two concurrent executions of chef-evening WITHOUT scheduled_utc may derive DIFFERENT CYCLE_DATE_UTC if they span a calendar boundary (expected, fallback path)

---

## Files to Read First

- `docs/agents/unified-agent/flow/chef.md` lines 49-107 (Step 0.5 entire block, including comments explaining CYCLE_DATE_UTC's canonical role)
- `docs/agents/unified-agent/flow/chef.md` lines 67-70 (pattern: how `SLOT_ID` is extracted from `slot=` parameter — reuse this technique)
- `docs/agents/cowork-team/flow/spawn-fanout.md` lines 334-338 (reference: the parameter appended by the dispatcher)
- Architecture brief: `docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` § 2 (Component A, step 3: parsing design)

## Files to Modify

- `docs/agents/unified-agent/flow/chef.md` — Step 0.5: add `scheduled_utc` parameter parsing and conditional CYCLE_DATE_UTC derivation
- `docs/agents/digest-predict/flow/main.md` and/or `docs/agents/digest-predict/flow/daily.md` — apply the same parsing (AC5 generality)
- Other guaranteed-slot flows as needed (check cowork-schedule.json `.slots[].guaranteed == true` for the full list)

---

## Dependencies

- **Blocked by:** 
  - FIX-CHEF-MARKER-KEY-ANCHOR-1 (the field must be live)
  - FIX-CHEF-MARKER-KEY-ANCHOR-3 (the parameter must be appended)
- **Blocks:** None (this is a leaf implementation task)

---

## Implementation Notes

- **Parsing Pattern:** Reuse the existing `SLOT_ID` extraction logic from chef.md lines 67-70:
  ```bash
  # Existing pattern (line 67-70 of chef.md):
  SLOT_ID = <extract from prompt "slot=" token>
  
  # New pattern (similar technique):
  SCHEDULED_UTC = <extract from prompt "scheduled_utc=" token>
  
  if SCHEDULED_UTC is present and parseable:
    CYCLE_DATE_UTC = <first 10 chars of SCHEDULED_UTC>  # YYYY-MM-DD from ISO8601
  else:
    CYCLE_DATE_UTC = date -u +%Y-%m-%d   # fallback (unchanged from today)
  ```

- **ISO8601 Date Extraction:** No date parsing logic needed — simply substring the first 10 characters (YYYY-MM-DD is always the first 10 chars of ISO8601)

- **NFR-3 (Single Source of Truth):** The variable `CYCLE_DATE_UTC` must be computed ONCE and pinned; every downstream reference (marker key, filepath, notebook header) reuses the SAME value. The fix does NOT change this invariant — it only changes what the one computation is based on.

- **Generality (AC5):** This task's primary file is chef.md, but the acceptance criteria requires the same pattern applied to all guaranteed slots. Consider whether to:
  - Implement all flows in this single task (larger, comprehensive), OR
  - Implement chef.md here and create follow-on tasks for digest/fb/tnb (smaller, parallel-able)
  - The brief's AC5 says "NOT a chef-only fix" — recommend implementing at least digest-daily in this task to establish the pattern, leaving other flows as optional fast-follow

---

## Test Strategy

- **Unit/Manual:**
  - Execute chef.md with prompt containing `scheduled_utc=2026-08-12T19:45:00.000Z` → log the derived `CYCLE_DATE_UTC` → verify it equals `2026-08-12`
  - Execute chef.md with prompt missing `scheduled_utc=` → log the derived `CYCLE_DATE_UTC` → verify it matches current UTC date (fallback)
  
- **Integration:**
  - After spawn-fanout.md (FIX-CHEF-MARKER-KEY-ANCHOR-3) is live, trigger a real chef-evening dispatch and inspect the flow's logs to confirm `CYCLE_DATE_UTC` is derived from the scheduled_utc parameter

- **Regression:**
  - Two concurrent chef-evening runs with identical prompt (same scheduled_utc parameter) → both must derive identical CYCLE_DATE_UTC (determinism)
  - No change to the synthesis filename structure, metadata fields, or notebook format (CYCLE_DATE_UTC is already used in all three places; only its basis changes)

---

## ACCEPTANCE HANDOFF

Checklist before marking DONE:
- [ ] `scheduled_utc=` parameter parsed from prompt in Step 0.5
- [ ] Date portion (first 10 chars, YYYY-MM-DD) extracted if present
- [ ] `CYCLE_DATE_UTC` assigned from scheduled_utc date if present, else from `date -u +%Y-%m-%d` fallback
- [ ] Same pattern applied to chef.md and at least one other guaranteed-slot flow (digest-daily recommended for AC5 coverage)
- [ ] No changes to synthesis filename, metadata, or notebook structure (only the basis of CYCLE_DATE_UTC changes, not its usage)
- [ ] RAW verification: two concurrent same-scheduled chef runs derive identical CYCLE_DATE_UTC
- [ ] RAW verification: fallback path (no scheduled_utc param) still works for manual invocations
- [ ] Documentation in chef.md updated to explain the parsing and fallback logic
