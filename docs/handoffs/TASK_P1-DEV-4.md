<!-- size-justification: 130L — task handoff for cowork-schedule.json modification; input arch blueprint + spec + BLOCKER-2 table; output JSON schema change (add policy_id + last_fired to 14 slots); acceptance criteria -->

# TASK P1-DEV-4 — Modify `docs/data/cowork-schedule.json` (Add `policy_id` and `last_fired` Fields)

**Sprint:** DWF-PHASE1
**Task ID:** P1-DEV-4
**Assigned zone:** cross-service (SSOT config)
**Estimated:** ~1h (schema extension + per-slot policy assignment)
**Status:** READY
**Precondition:** Architect design complete

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` § BLOCKER-2 RESOLUTION (14-slot policy_id table)
- `docs/REQ_DYN-WF-PHASE1.md` § FR-P1-2 (`policy_id` and `last_fired` fields)

---

## Deliverable

**File:** `docs/data/cowork-schedule.json` (modification)

Add two new optional fields to each slot:

1. **`policy_id`:** References a policy in `cadence-policy.json` or `null` (legacy cron fallback)
2. **`last_fired`:** ISO8601 UTC timestamp of last successful spawn, or `null` on first run

**Policy assignment for all 14 enabled slots (from BLOCKER-2 table):**

| slot_id | policy_id | Rationale |
|---|---|---|
| `chef-morning` | `null` | guaranteed=true; cron governs |
| `chef-intraday` | `"chef-intraday"` | Market-hours chef; 60 min cadence |
| `chef-eod` | `null` | guaranteed=true; cron governs |
| `chef-evening` | `null` | guaranteed=true; cron governs |
| `digest-sunday` | `null` | guaranteed=true; cron governs |
| `tnb-audit` | `null` | guaranteed=true; cron governs |
| `bctc-analyst-slot-1` | `"bctc-offmarket"` | OQ-P1-3: holiday→suppress, weekend→1440 |
| `bctc-analyst-slot-2` | `"bctc-offmarket"` | same |
| `bctc-analyst-slot-3` | `"bctc-offmarket"` | same |
| `bctc-analyst-slot-4` | `"bctc-offmarket"` | same |
| `news-scout-offhours` | `"gatherer-standard"` | Off-hours gatherer |
| `news-scout-sentiment` | `"gatherer-standard"` | Pre-market batch |
| `market-watcher-offhours` | `"gatherer-standard"` | Off-hours gatherer |
| `market-watcher-eod` | `"gatherer-standard"` | Post-close batch |

**For `last_fired` field:** Initialize all slots to `null` (first-run semantics). The dispatcher (Step 5b) updates this after each successful spawn.

---

## Acceptance Criteria

**AC-P1-2-1 (inherited from DEV-2):** Slot with `policy_id: null` uses legacy cron matching (no regression).
- Implies: all guaranteed slots have `policy_id: null` (6 slots)

**AC-P1-2-2 (BLOCKING, inherited from spec FR-P1-2):** `last_fired` field is atomic (write-to-tmp then rename by dispatcher). Initial value is `null`.
- Verified by Step 5b task (P1-DEV-6); here we just initialize to `null`

**Schema validation:**
- All 14 enabled slots have both `policy_id` and `last_fired` fields
- `policy_id` is either a string (policy name) or `null`
- `last_fired` is either an ISO8601 string or `null`
- All other existing fields unchanged (no field removal or renaming)
- File remains valid JSON

**Policy assignment verification:**
- 6 guaranteed slots (chef-morning, chef-eod, chef-evening, digest-sunday, tnb-audit, bctc-analyst-slot-1..4 are NOT guaranteed) have `policy_id: null`
- 4 bctc-analyst slots have `policy_id: "bctc-offmarket"`
- 4 gatherer slots have `policy_id: "gatherer-standard"`
- Count: 6 null + 4 bctc + 4 gatherer = 14 slots

---

## Files to Modify

**MODIFY:**
- `docs/data/cowork-schedule.json` (~40 lines; one field per slot per policy_id + last_fired)

---

## Implementation Notes

1. **Guaranteed slots determination:** Check the existing `guaranteed: true` field in the schedule. Only those 6 slots get `policy_id: null`.
2. **Field order:** Add `policy_id` and `last_fired` after existing fields (e.g., after `schedule_window` or at the end of the slot object). Field order doesn't affect logic, but keep JSON readable.
3. **Format:** ISO8601 UTC (e.g., `"2026-05-31T12:34:56Z"`). The `last_fired` field is read by Step 4.4 (evaluator compares against current time) and written by Step 5b. Use standard Node.js `new Date().toISOString()` format.
4. **Validation:** After modifying:
   - `jq '.slots | length'` → 14 (verify all 14 slots present)
   - `jq '.slots | map(.policy_id) | unique'` → should show 3 values: `null`, `"chef-intraday"`, `"bctc-offmarket"`, `"gatherer-standard"` (wait, that's 4 distinct values; null + 3 string values)
   - `jq '.slots | map(select(.guaranteed == true) | .policy_id) | unique'` → `[null]` (all guaranteed slots have null)
   - `jq '.slots | map(select(.guaranteed == false) | .policy_id) | unique'` → 3 policy names (no nulls among non-guaranteed)

---

## Zone & Dependencies

**Zone:** cross-service (SSOT config)
**Depends on:** None (independent)
**Blocks:** P1-DEV-5 (flow Step 4.3 reads this schedule), P1-DEV-7 (test harness)
**Parallel-run with:** P1-DEV-1, P1-DEV-2

---

## Success Criteria

- [ ] File `docs/data/cowork-schedule.json` modified
- [ ] All 14 slots have `policy_id` field (value = `null` or policy string)
- [ ] All 14 slots have `last_fired` field (value = `null` for initial state)
- [ ] Policy assignments match BLOCKER-2 table exactly
- [ ] Valid JSON (jq parse succeeds)
- [ ] Slot count = 14
- [ ] Committed to `main`

---

## RETURN

```
ZONE: cross-service
FILE_COUNT: 1 (MODIFY)
LINES: ~40 (two fields added per 14 slots)
BLOCKING_ACS: AC-P1-2-2 (implicit)
DV_TESTS: None (data-only, no logic to test; verification is in other tasks)
PARALLEL_WITH: P1-DEV-1, P1-DEV-2
SEQUENCE_BEFORE: P1-DEV-5 (flow reads this schedule), P1-DEV-7 (test uses this)
```
