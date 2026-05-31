<!-- size-justification: 190L — task handoff for cowork-team flow modification; input arch blueprint + spec; output 4 new flow steps (4.2-4.5) + step-by-step pseudocode; acceptance criteria + integration with P1-DEV-6 -->

# TASK P1-DEV-5 — Add Steps 4.2–4.5b to `docs/agents/cowork-team/flow/main.md`

**Sprint:** DWF-PHASE1
**Task ID:** P1-DEV-5
**Assigned zone:** cross-service (cowork-team flow / dispatch logic)
**Estimated:** ~2.5h (flow pseudocode → markdown prose; 4 new steps + step rebinding; test integration)
**Status:** READY
**Precondition:** P1-DEV-2 (evaluator), P1-DEV-3 (matcher), P1-DEV-4 (schedule), P1-DEV-1 (policy JSON)

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` § Detailed Flow Changes (Steps 4.2–4.5b pseudocode)
- `docs/agents/cowork-team/flow/main.md` (brownfield flow; Steps 0–5 exist)

---

## Deliverable

**File:** `docs/agents/cowork-team/flow/main.md` (modification)

Insert four new steps between Step 4b (collision-detection) and Step 4.6 (per-work-item claim):

1. **Step 4.2 — Read and validate pressure-state.json**
   - Load `docs/data/pressure-state.json`
   - Check staleness: `emitted_at` ≤ 20 minutes old AND `stale_warning == false`
   - If missing/malformed/stale → `PRESSURE_MODE = "legacy"` and log WARN (no adaptive mode)
   - If pressure-policy.json missing → `PRESSURE_MODE = "legacy"`
   - Otherwise → `PRESSURE_MODE = "adaptive"` and parse tiers

2. **Step 4.3 — Calendar suppression**
   - Only runs if `PRESSURE_MODE = "adaptive"`
   - Read `CALENDAR_STATUS = PRESSURE_STATE.calendar_status`
   - If calendar_status in ["holiday", "weekend"]:
     - For each slot in MATCHES:
       - If guaranteed=true → skip (never suppress)
       - If policy_id="bctc-offmarket" AND calendar_status="holiday" → suppress
       - Else if policy_id != "bctc-offmarket" → suppress
     - Log each suppression reason
   - Set `CALENDAR_ALLOWED = MATCHES.filter(suppressed slots removed)`

3. **Step 4.4 — Cadence due-check (adaptive mode)**
   - Only runs if `PRESSURE_MODE = "adaptive"`
   - Compute `signal_backlog_tier` and `volatility_tier` from pressure_state
   - For each slot in CALENDAR_ALLOWED:
     - If policy_id=null → cron match (already passed filter); add with `due_reason: "cron"`
     - Else call `evaluateCadence(policy_id, calendar_status, backlog_tier, volatility_tier)`
     - If _cron_fallback=true → cron governs; add with `due_reason: "cron"`
     - If interval_minutes=null → suppress (log reason)
     - If last_fired=null → always due (first-run); add with `due_reason: "first_run"`
     - If elapsed_seconds >= interval_minutes*60 → due; add with `due_reason: "cadence"`
     - Else → skip (log cadence skip reason)
   - Set `CADENCE_MATCHES = [slots that passed all gates]`

4. **Step 4.5 — Freshness silent-downgrade for gatherer slots**
   - Only runs if `PRESSURE_MODE = "adaptive"`
   - Only if all three conditions true: `last_regime="unknown"` AND `signal_backlog=0` AND `calendar_status in ["holiday","weekend"]`
   - For each slot in CADENCE_MATCHES:
     - If slot_id in gatherer-set (4 slots: news-scout-offhours, news-scout-sentiment, market-watcher-offhours, market-watcher-eod)
       - Remove from CADENCE_MATCHES
       - Log downgrade reason
   - Set `FINAL_MATCHES = CADENCE_MATCHES after downgrade removal`

5. **Step 4.5b — Resolve final CADENCE_MATCHES**
   - Rebind `MATCHES = FINAL_MATCHES` (for Step 4.6 compatibility)
   - Pass MATCHES to Step 4.6 (unchanged behavior from this point on)

**Fallback path (PRESSURE_MODE = "legacy"):**
- If Step 4.2 decides legacy mode, skip Steps 4.3–4.5
- Use raw MATCHES from Steps 2+3 as input to Step 4.6 (no filtering, no suppression)
- This is the degradation contract: never worse than today

---

## Acceptance Criteria

**AC-P1-4-1 (BLOCKING):** On `calendar_status="holiday"`, exactly zero non-guaranteed slots spawn; guaranteed slots still spawn on cron.
- DV proof: T-12 in test suite (implicit: EC-6 audit also covers this)

**AC-P1-4-2 (BLOCKING, implicit):** On `calendar_status="unknown"`, no suppression (conservative).
- Verified by conditional: `if calendar_status in ["holiday", "weekend"]` (unknown does not match)

**AC-P1-4-3 (BLOCKING):** Suppressed slots never acquire per-work-item token (suppression BEFORE Step 4.6). No token release needed.
- Verified by step insertion point: Steps 4.2–4.5 run BEFORE Step 4.6 (per-work-item claim)

**AC-P1-5-1 (BLOCKING):** All three freshness conditions true → gatherer slots silently downgraded; telemetry records downgrade list.
- Verified by Step 4.5 logic with three-condition AND gate

**AC-P1-6-1 (BLOCKING, implied):** With `pressure-state.json` absent → all slots match via legacy cron (no behavioral difference from today).
- Verified by fallback path: missing pressure-state → PRESSURE_MODE="legacy" → use raw MATCHES

**NFR-P1-1 (BLOCKING, verified):** Leader lock (Step 0b) + suffix-free token (Step 4.6) + published-marker belt (Step 5) are untouched.
- Verified by step insertion: new steps 4.2–4.5 are additive between Step 4b and Step 4.6; no modifications to Step 0b, 4.6, or 5

**Flow invariants:**
- MATCHES input from Steps 2+3 (cron-matched slots)
- CALENDAR_ALLOWED = MATCHES after calendar suppression
- CADENCE_MATCHES = CALENDAR_ALLOWED after cadence due-check
- FINAL_MATCHES = CADENCE_MATCHES after freshness downgrade
- Step 4.6 receives FINAL_MATCHES (rebound as MATCHES)
- Fallback path: PRESSURE_MODE="legacy" → Step 4.6 receives raw MATCHES (skip 4.3–4.5)

---

## Files to Modify

**MODIFY:**
- `docs/agents/cowork-team/flow/main.md` (~120 lines added: 4 new steps in markdown pseudocode format)

---

## Implementation Notes

1. **Step insertion points:** Add the four steps after current Step 4b (collision-detection) and before current Step 4.6 (per-work-item claim). Renumber existing steps 4.6, 4.6b, etc. to reflect the insertion.

2. **Flow prose format:** Follow existing style in the flow file:
   - Use `###` (h3) for step headers
   - Pseudocode in code blocks (```pseudo``` or similar)
   - For/if/else logic clear and indented
   - Variable names match architecture brief (MATCHES, CALENDAR_ALLOWED, CADENCE_MATCHES, FINAL_MATCHES, PRESSURE_MODE, etc.)

3. **Logging requirements:**
   - Step 4.2: WARN on missing/stale pressure-state (rate-limited by staleness epoch)
   - Step 4.3: log each calendar suppression (`"[cowork] calendar suppress: <slot_id> reason=<holiday|weekend>"`)
   - Step 4.4: log cadence skips (`"[cowork] cadence skip: <slot_id> elapsed=<N>s cadence=<N>s"`) and suppressions
   - Step 4.5: log freshness downgrades (`"[cowork] freshness downgrade: <slot_id>"`)

4. **Tier computation:** Use `computeTiers(pressure_state)` from cadence-policy.js (P1-DEV-2) to get `signal_backlog_tier` and `volatility_tier`.

5. **Evaluation call:** Call `evaluateCadence(slot.policy_id, calendar_status, signal_backlog_tier, volatility_tier, policyObj)` inline or wrap in helper. Return `{interval_minutes, _cron_fallback}`.

6. **Timestamp parsing:** Parse `slot.last_fired` as ISO8601 UTC. Use `new Date().getTime()` for current time (milliseconds). Convert to seconds for elapsed calculation.

7. **Gatherer-set:** Hard-code the 4 slot names or read from a constant defined at flow top. Names are exactly: `["news-scout-offhours", "market-watcher-offhours", "news-scout-sentiment", "market-watcher-eod"]`.

8. **Fallback path:** If `PRESSURE_MODE = "legacy"` at end of Step 4.2, explicitly skip Steps 4.3–4.5 (use a conditional wrapper or go-to-step-4.6 comment). Make this clear in the flow.

---

## Test Mapping

| AC | DV Test | Description |
|---|---|---|
| AC-P1-4-1 | T-12 + EC-6 | holiday → guaranteed slot fires, non-guaranteed suppressed |
| AC-P1-4-2 | implicit | unknown → no suppression (conditional gate) |
| AC-P1-4-3 | implicit | suppression before claim (step insertion point) |
| AC-P1-5-1 | T-11 (implicit) | three-condition AND gate enforced |
| AC-P1-6-1 | implicit | missing pressure-state → legacy fallback (conditional) |

**Tests are primarily integration tests (Step 5b and P1-QA); unit tests in T-1..T-10 mock the individual evaluator functions.**

---

## Zone & Dependencies

**Zone:** cross-service (cowork-team flow / dispatch logic)
**Depends on:** P1-DEV-2 (evaluator), P1-DEV-3 (matcher), P1-DEV-4 (schedule), P1-DEV-1 (policy JSON)
**Blocks:** P1-DEV-6 (Step 5b batched write depends on CADENCE_MATCHES being finalized here)
**Parallel-run with:** None (depends on all prior DEV tasks)

---

## Success Criteria

- [ ] File `docs/agents/cowork-team/flow/main.md` modified
- [ ] Four new steps (4.2, 4.3, 4.4, 4.5, 4.5b) inserted between Step 4b and Step 4.6
- [ ] Existing steps 4.6, 4.6b, 4.7, 4.8, 5 renumbered (6, 6b, 7, 8, 5 → no, wait: Step 5 stays 5, steps between 4b and 4.6 get inserted, so Step 4.6→4.6 still but now it's after 4.5b; actually, the brief says "NEW Step 5b" which comes AFTER Step 5, so let me re-read... OK, the insertion is 4.2, 4.3, 4.4, 4.5, 4.5b between old 4b and old 4.6. Then old 4.6 stays 4.6, and Step 5b is a NEW step after Step 5 — created in P1-DEV-6. So in this task, just insert the five new steps and renumber nothing else.)
- [ ] Fallback path (legacy mode) clear and correct
- [ ] All pseudocode and logic from blueprint § Detailed Flow Changes match exactly
- [ ] Logging statements for each decision point
- [ ] Committed to `main`

---

## RETURN

```
ZONE: cross-service
FILE_COUNT: 1 (MODIFY)
LINES: ~120 added (4–5 new steps in markdown)
BLOCKING_ACS: 5 (AC-P1-4-1/4-2/4-3/5-1/6-1)
DV_TESTS: Inherited from prior tasks (T-1..T-12); integration via P1-QA
DEPENDS_ON: P1-DEV-1, P1-DEV-2, P1-DEV-3, P1-DEV-4
BLOCKS: P1-DEV-6 (Step 5b requires finalized CADENCE_MATCHES)
```
