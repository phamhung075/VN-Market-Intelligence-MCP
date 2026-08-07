# TASK 002 — bctc-analyst Filename Rekey & Sequencing (FR-2, FR-7)

**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1, plan_only, supervised)
**Acceptance Ratified By:** PO/Architect (2026-08-07, not contingent on amendments)
**Zone:** cross-service/bctc-analyst (four flow-doc files)
**Size:** M (four edits, cross-reference + sequencing)
**Estimated Duration:** ~2h

---

## Overview

This task rewrites the bctc-analyst signal filename pattern from date-keyed (`YYYYMMDD`) to window-keyed (`WINDOW_KEY`), which eliminates intra-day filename collisions across the agent's four daily slots (15:00Z, 18:00Z, 21:00Z, 00:00Z UTC). The same task pins the window-key derivation earlier in the agent's execution (Step 0c) so it is available when signal files are written in Stages 1-4 (not just at Stage 5 when the publish-marker guard runs).

---

## Acceptance Criteria

### AC-1: Filename Pattern Rekey
Files using the old pattern `docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json` are updated to the new pattern `docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_{mode}.json` in:
- `stage-analyze.md` line 114 (release-mode explicit emit line)
- `stage-analyze.md` new routine-mode emit line (FR-7, see AC-3 below)
- `stage-consolidate.md` line 64 (doc reference, cosmetic — this stage has no write instruction)

Example: `docs/signals/bctc_signal_HPG_20260807T2100Z_routine.json` (window-keyed, slot-3 21:00 UTC fire)

### AC-2: WINDOW_KEY Sequencing Pin (FR-2 proper)
- **Location:** `docs/agents/bctc-analyst/flow/cycle.md`, Step 0c (Calendar Gate + Mode Selection)
- **Action:** Add one line deriving `WINDOW_KEY` at this step (before Stages 1-4 write signal files)
- **Method:** Call the shared `derive_window_key()` function (from TASK-001) with:
  - `prompt_text`: the agent's invocation prompt (already available as `prompt_text` in cycle.md)
  - `slot_id`: the slot identifier (extract from prompt or pass as a known value)
  - `cowork_schedule_json`: load from `docs/data/cowork-schedule.json` (already loaded by caller or available via MCP)
  - `live_mcp_fetched_at`: the agent's session-state timestamp
- **Storage:** Store the result in a session variable (e.g., `WINDOW_KEY`) for reuse in Stages 1-4 and Stage 5

### AC-3: Explicit Routine-Mode Emit (FR-7)
- **Location:** `stage-analyze.md`, end of Step 4c (Evidence Fragment Recording, immediately before the `## Release Mode` header)
- **Current State:** Release-mode has explicit `Emit signal file: docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_release.json` line (line 114); routine-mode has no explicit emit line (inferred only from live output)
- **Action:** Add a new line exactly parallel to release:
  ```markdown
  Emit signal file: docs/signals/bctc_signal_{TICKER}_{WINDOW_KEY}_routine.json
  ```
- **Example:** Same pattern as release, just `_routine` instead of `_release`

### AC-4: Stage-5 Reuse (No Logic Change)
- **Location:** `stage-log-notify.md` §5d-1, the `task_claim()` guard that publishes the dedup marker
- **Current State:** Uses a locally-recomputed `cycle_tick_ISO` (described as "NOMINAL slot fire time from the cron schedule … round DOWN to `HH:00Z`")
- **Action:** Rename the variable reference from `cycle_tick_ISO` to the Step-0c-pinned `WINDOW_KEY`
- **Impact:** ZERO logic change; same value, just sourced from the earlier pin instead of re-deriving at Stage 5
- **Constraint:** Do NOT alter the guard's claim/skip logic itself (the logic is correct; only the value's source changes)

### AC-5: Cross-Reference Correction (§3.4 of architect brief)
- **Location:** `stage-consolidate.md` line 64, the `## Output` section
- **Current Text:** "merged into the `bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json` signal file **in `stage-log-notify.md` step 5**"
- **Problem:** Stale/incorrect — Stage 5 contains no signal-write instruction; the actual emit lines are in `stage-analyze.md` (R4 for release; new FR-7 line for routine)
- **Action:** Correct the cross-reference to point to the right file and location:
  - Release-mode: "merged into the signal file via `stage-analyze.md` R4 line"
  - Routine-mode: "merged into the signal file via `stage-analyze.md` Step 4c explicit emit line (added by FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING)"
- **Also update filename patterns** in this section to use `{WINDOW_KEY}` instead of `{YYYYMMDD}`

### AC-6: Filename Pattern Update (Cosmetic in stage-consolidate.md)
- Update any remaining references to the old pattern in `stage-consolidate.md` to the new `{WINDOW_KEY}` pattern
- Note: This stage performs no actual disk write (confirmed by architect); the update is doc-debt correction

---

## Files Modified

1. **`docs/agents/bctc-analyst/flow/cycle.md`**
   - Step 0c: Add WINDOW_KEY derivation line (call to derive_window_key function from TASK-001)
   - Store in session state for reuse across Stages 1-4 and Stage 5

2. **`docs/agents/bctc-analyst/flow/stage-analyze.md`**
   - Line 114: Update filename pattern in release-mode emit line
   - End of Step 4c: Add new explicit routine-mode emit line (FR-7)
   - Both lines substitute `{YYYYMMDD}` → `{WINDOW_KEY}`

3. **`docs/agents/bctc-analyst/flow/stage-consolidate.md`**
   - Line 64: Correct cross-reference (points to stage-analyze.md, not stage-log-notify.md Step 5)
   - Update filename patterns to `{WINDOW_KEY}`

4. **`docs/agents/bctc-analyst/flow/stage-log-notify.md`**
   - §5d-1: Rename variable reference from `cycle_tick_ISO` to `WINDOW_KEY`
   - No logic change to the guard's claim/skip behavior

---

## Test Strategy

- **Unit:** N/A (flow-doc edit, no code)
- **Integration:**
  - Run bctc-analyst cycle.md Step 0c → verify WINDOW_KEY is populated correctly
  - Run bctc-analyst Stages 1-4 → verify signal files written with correct WINDOW_KEY pattern
  - Run bctc-analyst Stage 5 → verify publish-marker guard uses the same WINDOW_KEY value (not re-derived)
  - Verify two different slots (e.g., slot-1 15:00Z and slot-2 18:00Z) produce two DISTINCT signal file paths on the same day
  - Verify same-slot re-run within the same fallback hour produces the SAME path (EC-1 expected collision, handled by publish-mutex)
- **Regression:**
  - Existing publish-marker guard logic (stage-log-notify.md) must still correctly skip if a dedup marker exists
  - All existing signal-routing logic must continue unchanged

---

## Dependency

- **Blocked by:** TASK-001 (derive_window_key function must exist)
- **Blocks:** TASK-004 (standards doc references these updated filenames)
- **Independent of:** TASK-003 (chef updates)

---

## Scope Clarifications

- **FR-4 (tran-ngoc-bau) is DESCOPED per Amendment 1** — this task touches ZERO tran-ngoc-bau files
- **EC-2 (chef-intraday UTC migration) is DESCOPED per Amendment 2** — this task is bctc-analyst only; chef has its own task
- **Does NOT touch:** bctc-analyst's actual analysis logic (Stages 1-4 computation), data fetches, or business logic — only filenames and sequencing pins

---

## Implementation Notes

1. **derive_window_key() call** in cycle.md Step 0c must pass the correct parameters:
   - `prompt_text`: extract from the agent's invocation context
   - `slot_id`: already known at this step (Calendar Gate already determined it)
   - `cowork_schedule_json`: load from docs/data/cowork-schedule.json once at the agent start (standard practice per chef.md)
   - `live_mcp_fetched_at`: available from session state (populated by bctc-analyst's bootstrap)

2. **NFR-2 compliance (no-Bash):** The derive_window_key function must return a pre-computed value; bctc-analyst must NOT shell-out to `date` to do any rounding itself

3. **Documentation tone:** When adding the routine-mode emit line, use the exact same phrasing/format as the existing release-mode emit line (line 114) for consistency

---

## Decision Journal

- **Ratified 2026-08-08 by Architect** as part of FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING Phase 1 design
- **Amendment notes:** None — this task carries no binding amendments; it is described in FR-2 and FR-7 of the architect brief, verbatim

## ACCEPTANCE HANDOFF

Checklist for developer before marking DONE:
- [ ] cycle.md Step 0c: WINDOW_KEY derivation added and stored in session state
- [ ] stage-analyze.md line 114: filename pattern updated to use {WINDOW_KEY}
- [ ] stage-analyze.md end of Step 4c: new routine-mode emit line added
- [ ] stage-consolidate.md line 64: cross-reference corrected (points to stage-analyze.md, not stage-log-notify.md Step 5)
- [ ] stage-consolidate.md: all filename patterns updated to {WINDOW_KEY}
- [ ] stage-log-notify.md §5d-1: variable reference changed from cycle_tick_ISO to WINDOW_KEY
- [ ] Integration test: two different slots on the same day produce distinct paths
- [ ] Integration test: same-slot re-run within same hour produces identical path (mutex collision as expected)
- [ ] Regression test: publish-marker guard logic unchanged
