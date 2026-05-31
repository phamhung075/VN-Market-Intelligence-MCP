<!-- size-justification: 160L — QA task handoff for Phase 1 integration + live verification; input architect blueprint + spec + all 7 dev tasks + test suite; output test report + live cowork tick trace; no code -->

# TASK P1-QA — Integration Verification and Live Tick Testing

**Sprint:** DWF-PHASE1
**Task ID:** P1-QA
**Assigned zone:** cross-service (qa verification, live cowork dispatcher)
**Estimated:** ~3h (unit test suite verification + integration test stubs + live tick trace + sign-off)
**Status:** READY
**Precondition:** All P1-DEV-1..7 tasks complete and committed to `main`

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` (complete blueprint + all BLOCKERs resolved)
- `docs/REQ_DYN-WF-PHASE1.md` (12 BLOCKING ACs + NFR-P1-1)
- All seven developer handoffs: P1-DEV-1..7
- Test suite: `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (P1-DEV-7)
- Live system: cowork-team dispatcher running with Phase 1 code

---

## Acceptance Criteria

**Test execution (QA-1):** All 13 unit tests in `DWF-phase1-cadence.test.ts` PASS with zero failures.
- Command: `bun test apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`
- Expected: 13/13 GREEN
- If any RED: investigate failure, root-cause in dev task, developer re-opens task

**RED proof validation (QA-2):** For each of the 13 tests, manually verify the DV proof (RED case) by temporarily breaking the rule/logic in the corresponding dev task. Restore after verification.
- Example: T-1 `gatherer-standard open/medium → 60` — remove the rule from cadence-policy.json, run test, expect RED, restore.
- Spot-check: run RED proofs for 3 critical tests (T-2, T-8, T-12). Document findings.
- If RED proof fails to fail (test still GREEN after deliberate break) → logic is incomplete, reopen dev task

**Schema validation (QA-3):** Verify all 14 slots in `cowork-schedule.json` have both `policy_id` and `last_fired` fields.
- Command: `jq '.slots | map({slot_id, policy_id, last_fired}) | .[]' docs/data/cowork-schedule.json`
- Expected: 14 rows, no nulls in structure (values can be null, but fields must exist)
- If missing: reopen P1-DEV-4

**Policy table validation (QA-4):** Verify `cadence-policy.json` structure and rule count.
- Command: `jq '.policies | length' docs/data/cadence-policy.json`
- Expected: 28 rules
- Command: `jq '.policies | map(.policy_id) | unique' docs/data/cadence-policy.json`
- Expected: 4 distinct policy IDs: `null` (none; policy_id is never null in the table), `"chef-intraday"`, `"bctc-offmarket"`, `"gatherer-standard"`
- If mismatch: reopen P1-DEV-1

**Integration test stubs (QA-5):** Verify `DWF-phase1-cadence.test.ts` includes test blocks T-13/13b/13c (last_fired write integration).
- T-13: Successful spawn → last_fired written
- T-13b: Failed spawn → last_fired NOT written
- T-13c: Write failure → non-fatal, spawn already happened
- These can be skipped or stubbed for Phase 1 if file-system access is constrained in test harness
- Document status: "STUBBED for Phase 1, full integration in Phase 1+"

**Flow step insertion (QA-6):** Verify `cowork-team/flow/main.md` has new Steps 4.2–4.5b and Step 5b correctly placed.
- Visual inspection: steps between Step 4b and Step 4.6 (original Step 4.6 → still 4.6 after insertion? Or numbering changed?)
- Verify pseudocode matches blueprint § Detailed Flow Changes (line-by-line comparison for critical steps 4.3 & 4.4)
- Verify fallback path (PRESSURE_MODE="legacy") is clear and leads to Step 4.6 bypass
- If malformed: reopen P1-DEV-5

**Live tick trace (QA-7, HIGH PRIORITY):** Run a live cowork dispatcher tick with Phase 1 active and capture telemetry.
- Precondition: `docs/data/cadence-policy.json` and `docs/data/pressure-state.json` both present and valid
- Command: Trigger cowork-team flow manually (or wait for next scheduled cron tick)
- Capture: Step 6 telemetry signal (JSON)
- Verify telemetry includes new Phase 1 fields:
  - `pressure_mode: "adaptive" | "legacy"`
  - `calendar_status: <status>`
  - `suppressed_calendar: [slot_ids]`
  - `suppressed_cadence: [slot_ids]`
  - `downgraded: [slot_ids]`
  - `due_reasons: {slot_id: reason}`
  - `cadence_minutes: {slot_id: N}`
  - `last_fired_timestamp: ISO8601`
  - `last_fired_slots: [slot_ids]`
- If telemetry missing fields: flow modification incomplete, reopen P1-DEV-5/6
- If telemetry fields present: GREEN

**14-slot dispatch verification (QA-8):** On a live tick, verify all 14 enabled slots match expected suppression/cadence behavior.
- Set calendar_status = "open" (normal market hours)
- Verify: all 14 slots are in MATCHES after Steps 2+3 (cron match)
- Verify: no calendar suppression (calendar_status="open" → no suppression)
- Verify: cadence due-check runs (PRESSURE_MODE="adaptive")
- Expected: some slots in CADENCE_MATCHES (due), some skipped (not due based on last_fired)
- If all 14 still in output after suppression/cadence: verify last_fired values are old enough or null
- Document count: "X slots matched, Y suppressed by calendar, Z skipped by cadence, final M slots in CADENCE_MATCHES"

**Legacy fallback verification (QA-9):** Delete `pressure-state.json` or `cadence-policy.json` and run a cowork tick.
- Verify: telemetry shows `pressure_mode: "legacy"`
- Verify: all cron-matched slots proceed normally (no cadence filtering)
- Verify: one WORK-channel WARN logged ("cadence fallback to legacy cron")
- Restore both files after test
- If fallback doesn't trigger: reopen P1-DEV-2 or P1-DEV-5

**Phase 2 safety verification (QA-10, NFR-P1-1):** Verify leader lock (Step 0b) and per-work-item token (Step 4.6) are still present and unchanged.
- Visual: cowork-team/flow/main.md still has Step 0b and Step 4.6 (now maybe 4.6+ after insertions)
- Verify: no `task_claim`/`task_release` calls added in Steps 4.2–4.5b (suppression before claim)
- Verify: Step 4.6 still acquires `cowork-slot:<slot_id>` suffix-free token
- Verify: published-marker belt (Step 5) still writes after spawn
- If any modifications detected: reopen P1-DEV-5

**Write atomicity verification (QA-11):** Verify Step 5b uses write-to-tmp-then-rename pattern (not direct write).
- Visual: `cowork-team/flow/main.md` Step 5b includes temp file path and rename call
- Verify: no intermediate `.tmp` files left on disk after normal tick (cleanup is atomic)
- Document: "Atomic write pattern verified; no partial-write risk"
- If direct write detected: reopen P1-DEV-6

---

## Files / Test Artifacts to Check

**Unit test output:**
- `bun test apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` → 13/13 PASS

**Data files validation:**
- `docs/data/cadence-policy.json` → valid JSON, 28 rules
- `docs/data/cowork-schedule.json` → valid JSON, 14 slots with policy_id + last_fired
- `docs/data/pressure-state.json` → present and fresh (< 20 min old)

**Flow files validation:**
- `docs/agents/cowork-team/flow/main.md` → Steps 4.2–4.5b + 5b inserted, fallback path clear

**Live telemetry:**
- Cowork dispatcher signal (Step 6) → all Phase 1 fields present
- WORK channel warnings → log when pressure-state missing/stale
- Slot trace → suppression/cadence skip reasons logged

---

## Test Report Output

Create or update `reports/TASK_REPORT_P1-QA.md` with:

1. **Test Execution Summary**
   - Unit tests: 13/13 PASS (or list any failures)
   - RED proof spot-check: T-2, T-8, T-12 verified or deferred
   - Integration stubs: T-13/13b/13c status (STUBBED, FULL, or PARTIAL)

2. **Schema Validation Summary**
   - cowork-schedule.json: 14 slots with policy_id + last_fired ✓
   - cadence-policy.json: 28 rules, 3 policy types ✓
   - pressure-state.json: 9 fields, < 20 min old ✓

3. **Flow Validation Summary**
   - Steps 4.2–4.5b inserted before Step 4.6 ✓
   - Step 5b inserted after Step 5 ✓
   - Fallback path (legacy mode) verified ✓
   - Phase 2 safety (leader lock, token, marker) untouched ✓

4. **Live Tick Verification Summary**
   - Telemetry fields present (pressure_mode, calendar_status, suppressed_calendar, suppressed_cadence, downgraded, due_reasons, cadence_minutes, last_fired_timestamp, last_fired_slots) ✓
   - 14-slot dispatch count and suppression/cadence reasons logged ✓
   - Legacy fallback tested (pressure-state.json deletion) ✓

5. **Blocking Issues (if any)**
   - List any RED findings → reopen corresponding dev tasks
   - If all PASS → PO-ready for sign-off

6. **Verification Checklist**
   - [ ] All 13 unit tests GREEN
   - [ ] 3 RED proofs spot-checked (T-2, T-8, T-12)
   - [ ] Schema validation PASS (14 slots, 28 rules)
   - [ ] Flow steps correctly inserted and fallback path verified
   - [ ] Live tick telemetry complete
   - [ ] 14-slot dispatch traced
   - [ ] Legacy fallback triggered (pressure-state.json deletion test)
   - [ ] Phase 2 safety (NFR-P1-1) verified
   - [ ] Write atomicity (Step 5b) verified
   - [ ] No regressions detected

---

## Risk Flags & Mitigations

| Risk | Severity | Mitigation | QA Check |
|---|---|---|---|
| Test suite mocks may not match live behavior (unit vs integration) | MEDIUM | Run live cowork tick with tracing (QA-7) | Telemetry capture |
| `_cron_fallback` logic novel; dev might misinterpret null as suppress | HIGH | T-11 DV proof checks this | T-11 RED→GREEN |
| Staleness threshold (20 min) is a tunable SSOT; if value is hardcoded elsewhere | MEDIUM | Grep for `20` in codebase outside cadence-policy.json | Code review |
| Concurrent agent-father edits (EC-5) may clobber last_fired write | MEDIUM | Accepted for Phase 1; log timestamp (QA-11) | Telemetry inspection |
| Stale-pressure warning Telegram spam | MEDIUM | Rate-limit by staleness epoch (Step 4.2) | WORK channel monitoring |

---

## Sign-Off Criteria

**QA signs off only if:**
1. All 13 unit tests PASS
2. 3 RED proofs verified (T-2, T-8, T-12)
3. All 5 schema validations PASS
4. Live tick trace complete with telemetry
5. 14-slot dispatch verified
6. Legacy fallback tested
7. Phase 2 safety (NFR-P1-1) confirmed
8. No blocking issues discovered

**On sign-off:** create commit `QA: P1-QA all gates GREEN (cycle-NNN)` and notify PO for final critique-before-approve.

---

## Zone & Dependencies

**Zone:** cross-service (qa verification, live dispatcher)
**Depends on:** P1-DEV-1..7 (all tasks complete on `main`)
**Blocks:** None (QA is final gate before PO sign-off)
**Parallel-run with:** None (QA is sequential final step)

---

## Success Criteria

- [ ] All 13 unit tests PASS
- [ ] 3 RED proofs verified (T-2, T-8, T-12)
- [ ] Test report created: `reports/TASK_REPORT_P1-QA.md`
- [ ] Live tick trace captured with Phase 1 telemetry
- [ ] Legacy fallback tested (pressure-state deletion)
- [ ] Phase 2 safety verified (NFR-P1-1)
- [ ] Write atomicity verified (Step 5b)
- [ ] No blocking issues → PO-ready

---

## RETURN

```
ZONE: cross-service
BLOCKING_ACS: All 12 BLOCKING ACs verified through unit + integration + live tests
NFR-P1-1: Verified (Phase 2 safety untouched)
TEST_REPORT: reports/TASK_REPORT_P1-QA.md (to be created)
SIGN_OFF_CRITERIA: 8 gates (unit tests, RED proofs, schema, live tick, fallback, Phase 2 safety, atomicity, no issues)
PARALLEL_WITH: None (sequential final gate)
NEXT: PO critique-before-approve (P1-PO-FINAL)
```
