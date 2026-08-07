# TASK 003 — chef/unified-agent Intraday Filename Extension (FR-3)

**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1, plan_only, supervised)
**Acceptance Ratified By:** Architect (2026-08-07, not contingent on amendments)
**Zone:** cross-service/unified-agent (two flow-doc files, intraday branch only)
**Size:** S (minimal scope — 1 filename edit per file, conditional on intraday)
**Estimated Duration:** ~1h

---

## Overview

This task extends the chef/unified-agent synthesis filename to include an hour component for the multi-fire intraday slot only. Single-fire slots (morning/eod/evening) are NOT affected — they already collapse to 1 file/window once the sibling row's CYCLE_DATE_UTC anchor lands. The hour component sourced from the SAME `VN_HOUR` value the intraday slot's multi-fire publish-mutex key already uses, ensuring filename and mutex key agree by construction (NFR-3).

**Context:** Chef-intraday fires up to 7 times/day (UTC hours 2-8, mapping to VN hours 9-15). Without an hour discriminator, all 7 fires collide on a single path. With the discriminator, each fire gets a distinct synthesis file, satisfying AC-4 (every non-silent intraday cycle surfaces on disk).

---

## Acceptance Criteria

### AC-1: Intraday Filename Extension (FR-3 main)
- **Current pattern:** `docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json` (no hour component)
- **New pattern:** `docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}-{HOUR_COMPONENT}.json` (intraday only)
- **Location:** `chef-dish.md` Step 7.6, FILEPATH line (lines 549–574)
- **Scope:** INTRADAY SLOT ONLY
  - Apply to: `if SLOT_ID == "intraday"` branch
  - Example: `docs/data/unified-agent-synthesis-2026-08-07-intraday-09.json` (VN_HOUR=09, UTC 02:13Z fire)
- **Single-fire slots (morning/eod/evening):** NO change
  - Already collapse to 1 file/window per the sibling row's scope (CYCLE_DATE_UTC anchor is sufficient)
  - Do NOT edit their FILEPATH lines

### AC-2: HOUR_COMPONENT Source (NFR-3 invariant)
- **Requirement:** The hour component MUST derive from the IDENTICAL upstream value as the multi-fire MARKER_KEY mutex key
- **Current live MARKER_KEY:** `"published:" + SLOT_ID + ":" + WORK_DATE + ":" + VN_HOUR` (chef.md Step 0.5, per architect brief §1 verification)
- **Phase 1 decision:** Use `VN_HOUR` verbatim (already computed in Step 0.5 for the mutex key)
- **Example value:** VN_HOUR = "09" (for a UTC 02:13Z intraday fire, which is 09:13 VN time)
- **Implementation:** Reference the already-computed `VN_HOUR` session variable; do NOT re-compute or derive independently
- **Comment in code:** Add an inline note in chef-dish.md Step 7.6 explaining why `VN_HOUR` is used (to match the MARKER_KEY basis per NFR-3)

### AC-3: Explicit Non-Promotion of cycle_id (PO caution, binding)
- **Requirement:** `metadata.cycle_id` (`<DISH_TYPE>-<CYCLE_START_UTC>`) must NOT be promoted into the filename or mutex key
- **Rationale (per architect brief §4.3):** cycle_id is run-start-keyed and diverges between two peers of the SAME scheduled window (double-publish hazard)
- **Action:** Add an explicit comment in chef-dish.md Step 7.6 stating:
  ```markdown
  NOTE: Do NOT use cycle_id (metadata.cycle_id) in the filename or mutex key. 
  cycle_id is run-start-keyed and diverges between peers of the same window (binding caution, 2026-07-22).
  WINDOW_KEY / VN_HOUR anchor the filename and mutex instead.
  ```
- **Also update the inline changelog comment** at the top of chef-dish.md Step 7.6 block (lines 556–558, which already names this row) to reflect that the Phase 1 landing has occurred

### AC-4: EC-2 Residual-Risk Comment (Transparency)
- **Location:** chef-dish.md Step 7.6, immediately after the FILEPATH line edit
- **Requirement:** Add an inline comment documenting the EC-2 timezone-basis hazard (per architect brief §4.2):
  ```markdown
  HAZARD (Phase 2 follow-on): this filename hour component uses VN_HOUR (Asia/Ho_Chi_Minh) 
  next to CYCLE_DATE_UTC (UTC calendar date). If chef-intraday's cron is ever widened beyond 
  UTC hours 2-8 to span 17:00 UTC (VN midnight), this will reproduce the daily-straddle bug 
  at hourly granularity. Phase 2 (FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION) 
  will migrate both MARKER_KEY and this filename hour to UTC basis once scheduled_utc_time 
  reaches the live-match path (depends_on FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR Component A).
  ```

### AC-5: chef.md Cross-Reference (verification only)
- **Location:** `chef.md` Step 0.5 (lines 73–106), where VN_HOUR is computed
- **Current state:** VN_HOUR is already computed here; used by multi-fire MARKER_KEY
- **Action:** Add or update an inline comment confirming VN_HOUR is the source for BOTH the mutex key AND the filename hour component:
  ```markdown
  VN_HOUR is sourced here once per cycle for both: (a) multi-fire MARKER_KEY (Step 0.5 published-mutex), 
  and (b) intraday filename hour component (chef-dish.md Step 7.6, FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING Phase 1).
  Do NOT re-derive it downstream; both consumers receive it via session state.
  ```
- **No logic change to the VN_HOUR derivation itself** (owned by the sibling ANCHOR row, not reopened here)

---

## Files Modified

1. **`docs/agents/unified-agent/flow/chef-dish.md`**
   - **Step 7.6, FILEPATH line (lines 549–574):**
     - Old: `FILEPATH = "docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json"`
     - New (intraday only): `FILEPATH = "docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}-{VN_HOUR}.json"`
     - Single-fire slots: unchanged
   - **Inline changelog comment at lines 556–558:** Update to reflect this Phase 1 landing
   - **Add note after FILEPATH:** Explicit non-promotion of cycle_id (AC-3)
   - **Add comment after FILEPATH:** EC-2 hazard documentation (AC-4)

2. **`docs/agents/unified-agent/flow/chef.md`**
   - **Step 0.5, VN_HOUR computation section (lines 73–106):**
     - No change to the logic
     - Add or update inline comment explaining VN_HOUR's dual role (mutex + filename)

---

## Test Strategy

- **Unit:** N/A (flow-doc edit, no code)
- **Integration:**
  - Run chef-intraday twice in the same VN day with different UTC fire times (e.g., 02:13Z fire-1 → VN 09:13, and 08:00Z fire-2 → VN 15:00)
  - Verify two DISTINCT `unified-agent-synthesis-*-intraday-{HH}.json` files are created (one with `-09`, one with `-15`)
  - Verify no first-write-wins or last-write-clobber occurs (per tnb-c112 fold-in AC-4)
  - Verify single-fire slots (morning/eod/evening) files are unchanged (no -HH extension added)
- **Regression:**
  - Existing chef-dish.md Step 7.6 logic for single-fire slots must be unchanged
  - Existing multi-fire MARKER_KEY logic must be unchanged

---

## Dependency

- **Blocked by:** TASK-001 (derive_window_key function must exist for reference in documentation, though this task does not directly call it)
- **Blocks:** TASK-004 (standards doc references these updated filenames)
- **Independent of:** TASK-002 (bctc-analyst updates)

---

## Scope Clarifications

- **Single-fire slots (morning/eod/evening):** Explicitly NOT modified in this task
- **CYCLE_DATE_UTC basis:** NOT changed in this task (already UTC-anchored per the sibling ANCHOR row)
- **VN_HOUR is Phase 1 only:** Phase 2 (separate row already minted: FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION) will migrate to UTC hour once scheduled_utc_time reaches live-match
- **Does NOT touch:** Chef's analysis logic, data fetches, or publish-marker logic — only the filename template

---

## Implementation Notes

1. **Conditional filename rendering:** If the code/template system supports it, the FILEPATH line should render as:
   ```
   FILEPATH = "docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}" + (if SLOT_ID == "intraday" then "-{VN_HOUR}" else "") + ".json"
   ```
   Or as a flow-doc decision/branch, whichever is clearer.

2. **VN_HOUR variable availability:** This variable must already be in session state by the time chef-dish.md Step 7.6 runs (it is computed in Step 0.5). Do NOT re-compute it.

3. **Change log note:** The inline changelog comment at the top of Step 7.6 (lines 556–558) already names this row ("per FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING"); update it to indicate Phase 1 has landed.

4. **Backwards compatibility:** Old files on disk (with the old `-{CYCLE_DATE}-intraday.json` pattern) will NOT be renamed or backfilled (NFR-1). Only new writes after this lands will use the new pattern.

---

## Decision Journal

- **Ratified 2026-08-07 by Architect** as part of FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING Phase 1 design
- **Amendment notes:** Amendment 2 confirms this Phase 1 design ships VN_HOUR verbatim; EC-2 hazard is documented and deferred to Phase 2

## ACCEPTANCE HANDOFF

Checklist for developer before marking DONE:
- [ ] chef-dish.md Step 7.6: FILEPATH updated for intraday only (added -VN_HOUR, single-fire slots untouched)
- [ ] chef-dish.md Step 7.6: inline changelog comment updated to reflect Phase 1 landing
- [ ] chef-dish.md Step 7.6: explicit non-promotion of cycle_id comment added (AC-3)
- [ ] chef-dish.md Step 7.6: EC-2 hazard documentation comment added (AC-4)
- [ ] chef.md Step 0.5: VN_HOUR dual-role comment added or updated (AC-5)
- [ ] Integration test: intraday fires produce distinct files (e.g., -09 and -15 on same day)
- [ ] Integration test: single-fire slots unchanged (no -HH extension added)
- [ ] Regression test: existing MARKER_KEY logic unchanged
