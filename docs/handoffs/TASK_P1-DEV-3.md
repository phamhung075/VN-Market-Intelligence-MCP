<!-- size-justification: 160L — task handoff for cowork-match-slots.js extension; input arch blueprint + spec + P1-DEV-2 evaluator; output CommonJS extension with --mode=adaptive + optional parameters; acceptance criteria + DV test mapping -->

# TASK P1-DEV-3 — Extend `scripts/agents-flow/cowork-match-slots.js` with Adaptive Mode

**Sprint:** DWF-PHASE1
**Task ID:** P1-DEV-3
**Assigned zone:** cross-service (shared script, cowork zone)
**Estimated:** ~2h (mode parameter + evaluator integration + cli entrypoint detection)
**Status:** READY
**Precondition:** P1-DEV-2 (cadence-policy.js) exists; P1-DEV-1 (cadence-policy.json) exists

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` § `scripts/agents-flow/cadence-policy.js` extension and § CLI entrypoint
- `docs/REQ_DYN-WF-PHASE1.md` § FR-P1-3 (due-based matching)
- `scripts/agents-flow/cadence-policy.js` (P1-DEV-2 export: `evaluateCadence`, `isStale`)

---

## Deliverable

**File:** `scripts/agents-flow/cowork-match-slots.js` (modification)

Extend the existing `matchSlots()` function to accept an `options` parameter with three new fields:

```javascript
function matchSlots(schedule, ctx, options = {}) {
  const mode = options.mode || 'legacy';                      // 'legacy' or 'adaptive'
  const pressureState = options.pressureState || null;       // pressure-state.json object
  const policyObj = options.policyObj || null;               // cadence-policy.json object
  // ... existing logic ...
}
```

**Behavior:**

1. **`mode = 'legacy'` (default):** Existing behavior unchanged. Return cron-matched slots exactly as before (backward compatible).

2. **`mode = 'adaptive'` (new):** For each cron-matched slot:
   - If `slot.policy_id === null` or slot has no policy_id field → treat as legacy cron match (already passed cron filter); add to output with `due_reason: "cron"`
   - If `slot.policy_id != null` → call `evaluateCadence(slot.policy_id, pressureState.calendar_status, backlog_tier, volatility_tier, policyObj)`
   - If result `_cron_fallback === true` → treat as cron fallback; add to output with `due_reason: "cron"`
   - If result `interval_minutes === null` → suppress (do not add to output)
   - Otherwise, compute elapsed time: `elapsed_seconds = now_unix - parse(slot.last_fired).unix()`
     - If `last_fired === null` → always due (first-run); add with `due_reason: "first_run"`
     - If `elapsed_seconds >= interval_minutes * 60` → due; add with `due_reason: "cadence"`
     - Otherwise → skip (do not add)
   - All output slots include new fields: `due_reason: "cadence|cron|first_run"` and `cadence_minutes: <N|null>`

3. **CLI entrypoint (if `require.main === module`):**
   ```javascript
   if (require.main === module) {
     let mode = 'legacy';
     let pressureState = null, policyObj = null;
     const policyPath = path.join(__dirname, '../..', 'docs/data/cadence-policy.json');
     const pressurePath = path.join(__dirname, '../..', 'docs/data/pressure-state.json');
     if (fs.existsSync(policyPath) && fs.existsSync(pressurePath)) {
       try {
         policyObj = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
         pressureState = JSON.parse(fs.readFileSync(pressurePath, 'utf8'));
         const { isStale, computeTiers } = require('./cadence-policy.js');
         const threshold = policyObj._staleness_threshold_minutes || 20;
         if (!isStale(pressureState, threshold)) mode = 'adaptive';
       } catch (e) { /* mode stays legacy */ }
     }
     const hits = matchSlots(sched, undefined, { mode, pressureState, policyObj });
     // ... output as JSON ...
   }
   ```

---

## Acceptance Criteria

**AC-P1-2-1 (BLOCKING):** Slot with `policy_id: null` matches identically to pre-Phase-1 cron matching (no regression).
- DV proof: T-4 — Remove `policy_id` field from a slot, assert it still fires on cron string; removing cron string from non-null-policy slot → RED.

**AC-P1-3-1 (BLOCKING):** Slot with `last_fired=null` and `policy_id` set → always included in adaptive output (first-run semantics).
- DV proof: T-5 — Assert first-run slot NOT included → RED. With `last_fired=null` → included → GREEN.

**AC-P1-3-2 (BLOCKING):** Slot with `last_fired=T-50min`, `cadence=60min` → NOT due (not included in output).
- DV proof: T-6 — Assert slot IS included → RED. At T-50min, not due → GREEN.

**AC-P1-3-3 (BLOCKING):** Slot with `last_fired=T-65min`, `cadence=60min` → IS due (included in output).
- DV proof: T-7 — Assert slot NOT included → RED. At T-65min, due → GREEN.

**AC-P1-3-4 (BLOCKING):** Output schema includes `due_reason` and `cadence_minutes` for each slot (observability).
- DV proof: T-8 — Strip `due_reason` from expected schema → parse fails → RED. Schema complete → GREEN.

**AC-P1-2-1 (implicit):** Script output format unchanged: `{"slots": [...], "drift_min": N}`. No existing field removed or renamed.

---

## Files to Modify

**MODIFY:**
- `scripts/agents-flow/cowork-match-slots.js` (~40 lines added; core logic extension + CLI entrypoint addition)

---

## Implementation Notes

1. **Backward compatibility:** Default `options = {}` ensures existing callers (if any) continue to work with legacy mode.
2. **Tier computation:** When `mode === 'adaptive'`, compute `signal_backlog_tier` and `volatility_tier` from `pressureState` using the `computeTiers()` helper from `cadence-policy.js`.
3. **UTC timestamps:** Parse `slot.last_fired` and current time as UTC (both ISO8601 format).
4. **Relative path from script location:** The script lives in `scripts/agents-flow/`, so policy files are at `../../docs/data/cadence-policy.json` relative to `__dirname`.
5. **Error handling on mode detection:** If either file missing or JSON parse fails, fall back to legacy mode (conservative). No exception thrown.
6. **Logging:** When suppressing a slot (cadence says no), log the decision (slot_id, elapsed_seconds, cadence_seconds, reason). This is for observability in Step 4.4 flow.

---

## Test Mapping

| AC | DV Test | Description |
|---|---|---|
| AC-P1-2-1 | T-4 | null policy_id → cron match, no regression |
| AC-P1-3-1 | T-5 | last_fired=null → always due (first-run) |
| AC-P1-3-2 | T-6 | last_fired=T-50min, cadence=60 → NOT due |
| AC-P1-3-3 | T-7 | last_fired=T-65min, cadence=60 → IS due |
| AC-P1-3-4 | T-8 | Output schema: due_reason + cadence_minutes present |

**Test suite:** `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (created in P1-DEV-7)

---

## Zone & Dependencies

**Zone:** cross-service (shared script, cowork zone)
**Depends on:** P1-DEV-2 (cadence-policy.js evaluator), P1-DEV-1 (cadence-policy.json)
**Blocks:** P1-DEV-5 (cowork-team/flow/main.md Step 4.4 calls matchSlots with adaptive mode)
**Parallel-run with:** None (depends on P1-DEV-1, P1-DEV-2)

---

## Success Criteria

- [ ] File `scripts/agents-flow/cowork-match-slots.js` modified (not replaced)
- [ ] `matchSlots()` function signature accepts `options` parameter
- [ ] `mode === 'adaptive'` logic present and correct
- [ ] `mode === 'legacy'` unchanged (backward compatible)
- [ ] CLI entrypoint detects `cadence-policy.json` presence and switches mode
- [ ] All five DV proofs (T-4, T-5, T-6, T-7, T-8) RED→GREEN
- [ ] No new npm dependencies
- [ ] Committed to `main`

---

## RETURN

```
ZONE: cross-service
FILE_COUNT: 1 (MODIFY)
LINES: ~40 added
BLOCKING_ACS: 5 (AC-P1-2-1/3-1/3-2/3-3/3-4)
DV_TESTS: 5 (T-4/5/6/7/8)
DEPENDS_ON: P1-DEV-1, P1-DEV-2
SEQUENCE_BEFORE: P1-DEV-5 (flow Step 4.4 requires adaptive matcher)
```
