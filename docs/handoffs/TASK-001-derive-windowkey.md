# TASK 001 — Shared Pure Function: derive_window_key()

**Parent:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1, plan_only, supervised)
**Acceptance Ratified By:** PO amendment 3 (2026-08-07T05:45Z)
**Zone:** cross-service/shared (domain layer utility)
**Size:** S (pure function + unit tests)
**Estimated Duration:** ~1.5h

---

## Acceptance Criteria

1. **Function Signature & Availability:**
   - Pure function `derive_window_key(prompt_text, slot_id, cowork_schedule_json, live_mcp_fetched_at)` defined
   - No I/O except a jq lookup against an already-loaded schedule file
   - Signature supports three branches (scheduled_utc, fallback slot→cron, ad-hoc)
   - Available for import/reuse by both bctc-analyst and chef flows

2. **Branch 1 (scheduled_utc):**
   - Detects `scheduled_utc=<ISO8601>` token in `prompt_text`
   - Rounds DOWN to HH:00Z
   - Returns compact-ISO form YYYYMMDDTHHMMSSZ (per `stage-log-notify.md` convention)
   - **Status:** Implementation deferred until `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` Component A ships

3. **Branch 2 (Slot→Cron Fallback) — ACTIVE PATH DAY 1:**
   - Detects `slot=<slot_id>` token in `prompt_text`
   - Looks up `SLOT_RECORD` from cowork_schedule_json using jq: `.slots[] | select(.slot_id==$s)`
   - Extracts CRON_HOUR_FLD: `split(" ")[1]` from the cron field (e.g., "15" for "0 15 * * *")
   - Computes TODAY_UTC as date portion of `live_mcp_fetched_at` (string parse, NO Bash `date` call)
   - **BINDING CORRECTION (Amendment 3):** Returns the occurrence of CRON_HOUR:00Z NEAREST to live_mcp_fetched_at
     - Evaluate candidates: {yesterday at CRON_HOUR:00Z, today at CRON_HOUR:00Z, tomorrow at CRON_HOUR:00Z}
     - Select by min |delta| (absolute difference in seconds)
     - Use same "nearest" rule for both early-fire and late-fire cases
   - Returns WINDOW_KEY in compact-ISO form YYYYMMDDTHHMMSSZ

4. **Branch 3 (Ad-Hoc/Manual):**
   - Fallback when neither Branch 1 nor Branch 2 tokens present
   - Rounds `live_mcp_fetched_at` DOWN to HH:00Z
   - Returns in compact-ISO form YYYYMMDDTHHMMSSZ
   - Matches system-auditor's AUDIT_TIER=4 manual-only precedent

5. **Unit Test Cases (mandatory, 4 cases minimum):**
   - **Case 1 (Branch 2 - Slot-4 early fire):** 
     - Input: prompt_text contains "slot=bctc-analyst-slot-4", live_mcp_fetched_at = "2026-08-01T23:57:00Z"
     - Expected: Window (2026-08-02)T0000Z (next day's 00:00Z is nearest)
   - **Case 2 (Branch 2 - Slot-3 late fire):**
     - Input: prompt_text contains "slot=bctc-analyst-slot-3", live_mcp_fetched_at = "2026-08-02T08:00:00Z"
     - Expected: Window (2026-08-01)T2100Z (previous day's 21:00Z is nearest)
   - **Case 3 (Branch 3 - Ad-hoc):**
     - Input: no slot/scheduled_utc token, live_mcp_fetched_at = "2026-08-02T15:47:30Z"
     - Expected: Window (2026-08-02)T1500Z (rounded down)
   - **Case 4 (Branch 2 - Same-hour exact):**
     - Input: prompt_text contains "slot=bctc-analyst-slot-3", live_mcp_fetched_at = "2026-08-01T21:15:00Z"
     - Expected: Window (2026-08-01)T2100Z (today's window is nearest)

6. **NFR-3 Compliance (Single Source of Truth):**
   - Function may be called only ONCE per cycle by any given writer (bctc-analyst, chef)
   - Result stored in session state and reused verbatim
   - No re-derivation downstream

7. **Implementation Location TBD by Developer:**
   - Options: new module in docs/policies/ or docs/standards/, or inlined in a shared script
   - MUST be importable/referable by both bctc-analyst and chef flows

---

## Test Strategy

- **Unit level:** Table-driven tests for the 4 cases above (pure function, no I/O mocking needed except cowork_schedule_json fixture)
- **Integration:** Verify both bctc-analyst and chef flows can locate and call the function without error
- **Regression:** Existing `stage-log-notify.md` §5d-1 tests (if any) for `cycle_tick_ISO` logic must still pass

---

## Files Touched

- **New file(s):** TBD by developer (shared utility module location)
- **Modified files:** None in this task (pure function definition only)

---

## Dependency Chain

- **Blocked by:** None
- **Blocks:** 
  - TASK-002 (bctc-analyst rekey — calls derive_window_key)
  - TASK-003 (chef-intraday filename — calls derive_window_key)

---

## Implementation Notes

- The "nearest window" logic is deterministic for both early and late fires: e.g., if the cron fires at 21:00Z every day and it's now 08:00Z the next morning, yesterday's 21:00Z is 11 hours back, today's 21:00Z is 13 hours forward — nearest is yesterday (min delta).
- The function must NOT depend on Bash `date` calls (respects bctc-analyst's no-Bash constraint)
- Amendment 3 explicitly corrects the architect brief's original fallback logic (which had concatenated today's UTC date + cron hour unconditionally)

---

## Decision Journal

- **Ratified 2026-08-07T05:45Z** by PO as binding amendment 3
- **Scope:** FR-1 pure function definition + unit tests; excludes implementation location (developer discretion)

## ACCEPTANCE HANDOFF

Checklist for developer before marking DONE:
- [ ] Function signature matches spec exactly
- [ ] All 3 branches implemented and documented
- [ ] Unit test cases 1-4 all pass
- [ ] No Bash shell dependencies introduced
- [ ] Importable/referable from both bctc-analyst and chef flows without error
- [ ] NFR-3 guidance documented in code (function called once per cycle, stored in session state)
