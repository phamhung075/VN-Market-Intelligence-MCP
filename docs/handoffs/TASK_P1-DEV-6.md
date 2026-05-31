<!-- size-justification: 150L — task handoff for Step 5b implementation (last_fired atomic write); input arch blueprint + spec; output single-batch read→update→write logic in flow; acceptance criteria + DV test mapping -->

# TASK P1-DEV-6 — Add Step 5b to `docs/agents/cowork-team/flow/main.md` (Batched `last_fired` Write)

**Sprint:** DWF-PHASE1
**Task ID:** P1-DEV-6
**Assigned zone:** cross-service (cowork-team flow / state tracking)
**Estimated:** ~1h (pseudocode transcription + atomic write pattern)
**Status:** READY
**Precondition:** P1-DEV-5 (Steps 4.2–4.5b finalized; CADENCE_MATCHES available for Step 5b)

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` § BLOCKER-3 RESOLUTION (batched atomic write algorithm)
- `docs/REQ_DYN-WF-PHASE1.md` § FR-P1-7 (`last_fired` write after successful spawn)

---

## Deliverable

**File:** `docs/agents/cowork-team/flow/main.md` (modification)

Insert one new step **after Step 5 (fan-out) and before Step 6 (telemetry):**

**Step 5b — Batch `last_fired` write (after all fan-out attempts complete)**

Pseudocode from blueprint:

```
FIRED_AT = NOW_ISO  # use same timestamp for all WON_SLOTS in this tick

if WON_SLOTS is non-empty:
  SCHED_TMPFILE = "docs/data/cowork-schedule.json.tmp"

  # Single read
  schedule = JSON.parse(readFileSync("docs/data/cowork-schedule.json"))

  # Update in memory — only for WON_SLOTS
  for each slot in schedule.slots:
    if slot.slot_id in [s.slot_id for s in WON_SLOTS]:
      slot.last_fired = FIRED_AT

  # Atomic write: tmp then rename
  writeFileSync(SCHED_TMPFILE, JSON.stringify(schedule, null, 2))
  renameSync(SCHED_TMPFILE, "docs/data/cowork-schedule.json")

On write failure:
  log "[cowork-team] WARN: last_fired write failed: <error> — slot(s): <WON_SLOT_IDS>"
  # Non-fatal: spawn already happened. Next tick computes due from stale last_fired.
  # Conservative: under-suppress (slot may fire again at next tick) — never over-suppress.
  # Do NOT abort or roll back the spawn.
```

**Key details:**

1. **Precondition:** Step 5 completes and produces `WON_SLOTS` (slots that successfully spawned agents).
2. **Timestamp:** Use current UTC ISO8601 for all WON_SLOTS in the same tick (single `FIRED_AT` value).
3. **Only for WON_SLOTS:** Update `last_fired` ONLY for slots in WON_SLOTS. Failed spawns (in `errors[]`) do not update `last_fired`.
4. **Atomic pattern:** Write-to-tmp-then-rename (already used for pressure-state.json in Phase 0). Crash between write and rename leaves the previous value intact.
5. **Non-fatal on failure:** If the write fails, log warning and continue. Do NOT roll back or abort the spawn (FR-P1-7 AC-P1-7-3).
6. **Extend telemetry payload (Step 6):** Add fields to signal output (for observability):
   - `last_fired_timestamp: FIRED_AT` (ISO8601 of write)
   - `last_fired_slots: [slot_ids written]`
   - `last_fired_write_errors: [if any]`

---

## Acceptance Criteria

**AC-P1-7-1 (BLOCKING):** After a successful WON_SLOTS spawn, the slot's `last_fired` in `cowork-schedule.json` equals the dispatch timestamp (within 1 second).
- DV proof: T-13 (implicit in integration test for file-system write). Assert `last_fired` NOT updated → RED. With update → GREEN.

**AC-P1-7-2 (BLOCKING):** A spawn failure (agent tool returns error) does NOT update `last_fired` for that slot.
- DV proof: Mock spawn failure, assert `last_fired` written → RED. Failed spawn leaves `last_fired` untouched → GREEN.

**AC-P1-7-3 (BLOCKING):** `last_fired` write failure (file write error) is non-fatal: logs error, does NOT block or roll back the spawn.
- DV proof: Simulate write failure (e.g., read-only fs, permission denied), assert spawn already happened before the write. Write error logged, but no roll-back → GREEN.

**Write atomicity:**
- Single read: load entire schedule into memory
- In-memory update: loop through slots, update only WON_SLOTS
- Single write: JSON.stringify to .tmp file
- Single rename: atomic file replacement
- No per-slot writes (avoids lost-update race)

**Interaction with EC-5 (concurrent agent-father edits):**
- Accepted risk for Phase 1 (last-write-wins within a narrow window)
- Mitigation: log write timestamp in Step 5b telemetry
- Future Phase 1+ may add file-locking if concurrent edits observed

---

## Files to Modify

**MODIFY:**
- `docs/agents/cowork-team/flow/main.md` (~50 lines added: Step 5b + Step 6 telemetry extension)

---

## Implementation Notes

1. **Step placement:** Insert Step 5b AFTER Step 5 (fan-out completes) and BEFORE Step 6 (emit telemetry signal). Exact position: after all WON_SLOTS agents have been spawned.

2. **Node.js file operations:** Use:
   - `fs.readFileSync(path, 'utf8')` → string
   - `JSON.parse(string)` → object
   - Update object in memory
   - `JSON.stringify(object, null, 2)` → string with indentation
   - `fs.writeFileSync(tmpPath, string)` → write atomic temp
   - `fs.renameSync(tmpPath, finalPath)` → atomic rename (move)

3. **Error handling:** Wrap in try-catch:
   - Catch read error → log WARN, skip write, continue
   - Catch write error → log WARN, skip rename, continue
   - Catch rename error → log WARN, continue
   - Never throw → always proceed to Step 6

4. **Timestamp generation:** `new Date().toISOString()` (UTC, format: "2026-05-31T12:34:56.789Z"). Use same timestamp for all WON_SLOTS in this batch.

5. **WON_SLOTS source:** Step 5 fans out and tracks spawn success/failure. The result is typically a list of (slot_id, spawn_result) pairs. Extract slot_ids from successful spawns.

6. **Telemetry extension:** Step 6 signal already exists. Add these fields to the payload:
   ```json
   {
     "last_fired_timestamp": "<ISO8601>",
     "last_fired_slots": ["chef-intraday", "bctc-analyst-slot-1"],
     "last_fired_write_errors": null  // or error message if write failed
   }
   ```

7. **Non-fatal guarantee:** Even if write fails completely, the log entry is the only side-effect. The spawn already happened (Steps 0–5 complete). Step 6 telemetry records the failure.

---

## Test Mapping

| AC | DV Test | Description |
|---|---|---|
| AC-P1-7-1 | T-13 (integration) | last_fired written after successful spawn |
| AC-P1-7-2 | T-13b (implicit) | failed spawn → last_fired NOT written |
| AC-P1-7-3 | T-13c (integration) | write failure non-fatal, spawn succeeds |

**Tests T-13/T-13b/T-13c are integration tests (require file-system access). They belong in a separate block within `DWF-phase1-cadence.test.ts` or a companion integration test file. PM allocates these as distinct subtasks (noted in blueprint § Test Strategy, end of AC-P1-7-2 note).**

---

## Zone & Dependencies

**Zone:** cross-service (cowork-team flow / state tracking)
**Depends on:** P1-DEV-5 (Steps 4.2–4.5b finalize CADENCE_MATCHES, which flows to Step 5 and produces WON_SLOTS)
**Blocks:** None (Step 6 onwards unchanged)
**Parallel-run with:** P1-DEV-7 (test harness, which can mock file operations)

---

## Success Criteria

- [ ] File `docs/agents/cowork-team/flow/main.md` modified
- [ ] Step 5b inserted after Step 5, before Step 6
- [ ] Pseudocode matches blueprint § BLOCKER-3 RESOLUTION exactly
- [ ] Atomic write pattern: read → update in-memory → write .tmp → rename
- [ ] Error handling: non-fatal (log, continue, no roll-back)
- [ ] Telemetry extension fields added to Step 6 signal
- [ ] Only WON_SLOTS updated (failed spawns skipped)
- [ ] All three DV proofs (AC-P1-7-1/2/3) set up for integration test
- [ ] Committed to `main`

---

## RETURN

```
ZONE: cross-service
FILE_COUNT: 1 (MODIFY)
LINES: ~50 added (Step 5b + telemetry extension)
BLOCKING_ACS: 3 (AC-P1-7-1/7-2/7-3)
DV_TESTS: 3 (T-13/13b/13c — integration tests)
DEPENDS_ON: P1-DEV-5 (produces WON_SLOTS)
BLOCKS: None (Step 6 onwards)
PARALLEL_WITH: P1-DEV-7 (test harness)
```
