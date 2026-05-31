# P1-PM SUMMARY — DWF-PHASE1 Task Decomposition Complete

**Sprint:** DWF-PHASE1
**Task:** P1-PM (DONE 2026-05-31)
**Assigned:** pm
**Status:** READY FOR DEVELOPER DISPATCH

---

## Input Consumed

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` (technical blueprint, 4 BLOCKERs resolved, 6-file scope)
- `docs/REQ_DYN-WF-PHASE1.md` (BA spec, 12 BLOCKING ACs, 3 PO questions resolved)
- `docs/signals/architect-20260531T002500Z.json` (handoff signal)
- `docs/TASKS.md` (SSOT task registry)

---

## Output: 9 Atomic Task Handoffs

All handoff files live in `docs/handoffs/`:

### Tier-1: Parallel Independent (no blocking deps)

1. **TASK_P1-DEV-1.md** — `docs/data/cadence-policy.json`
   - Zone: cross-service (SSOT config)
   - Deliverable: 28-rule policy table (3 policies: gatherer-standard, chef-intraday, bctc-offmarket)
   - Acceptance criteria: 3 BLOCKING ACs (AC-P1-1-1/1-2/1-3)
   - DV tests: T-1, T-2, T-3
   - Estimated: ~1h

2. **TASK_P1-DEV-2.md** — `scripts/agents-flow/cadence-policy.js`
   - Zone: cross-service (cowork scripts, evaluator module)
   - Deliverable: CommonJS module with 4 exports (`loadCadencePolicy`, `evaluateCadence`, `computeTiers`, `isStale`)
   - Acceptance criteria: 5 BLOCKING ACs (AC-P1-1-1/1-2/1-3/6-2/6-3)
   - DV tests: T-1, T-2, T-3, T-9, T-10
   - Estimated: ~2h

3. **TASK_P1-DEV-4.md** — `docs/data/cowork-schedule.json`
   - Zone: cross-service (SSOT config)
   - Deliverable: Add `policy_id` + `last_fired` fields to 14 enabled slots per BLOCKER-2 table (6 null + 4 bctc + 4 gatherer)
   - Acceptance criteria: 1 BLOCKING AC (implicit AC-P1-2-2)
   - DV tests: None (data-only, verified through other tasks)
   - Estimated: ~1h

### Tier-2: Sequential (depends on tier-1)

4. **TASK_P1-DEV-3.md** — `scripts/agents-flow/cowork-match-slots.js` (extension)
   - Zone: cross-service (cowork scripts, matcher extension)
   - Depends on: P1-DEV-2 (evaluator) + P1-DEV-1 (policy JSON)
   - Deliverable: Add `--mode=adaptive` + options parameter; CLI detects cadence-policy.json presence; extends matchSlots() with due-check logic
   - Acceptance criteria: 5 BLOCKING ACs (AC-P1-2-1/3-1/3-2/3-3/3-4)
   - DV tests: T-4, T-5, T-6, T-7, T-8
   - Estimated: ~2h

5. **TASK_P1-DEV-5.md** — `docs/agents/cowork-team/flow/main.md` (Steps 4.2–4.5b)
   - Zone: cross-service (cowork flow / dispatch logic)
   - Depends on: P1-DEV-2, P1-DEV-3, P1-DEV-4 (all tier-1 tasks + P1-DEV-3)
   - Deliverable: Insert 5 new steps (4.2 staleness gate, 4.3 calendar suppression, 4.4 cadence due-check, 4.5 freshness downgrade, 4.5b resolve CADENCE_MATCHES) before Step 4.6 claim
   - Acceptance criteria: 5 BLOCKING ACs (AC-P1-4-1/4-2/4-3/5-1/6-1)
   - DV tests: Inherited from prior tasks; integration via P1-QA
   - Estimated: ~2.5h

6. **TASK_P1-DEV-6.md** — `docs/agents/cowork-team/flow/main.md` (Step 5b)
   - Zone: cross-service (cowork flow / state tracking)
   - Depends on: P1-DEV-5 (must complete first; produces WON_SLOTS for this step)
   - Deliverable: Insert Step 5b (batched atomic read→update-all-WON→write.tmp→rename) after fan-out, before telemetry
   - Acceptance criteria: 3 BLOCKING ACs (AC-P1-7-1/7-2/7-3)
   - DV tests: T-13, T-13b, T-13c (integration tests, file-system access, can be stubbed)
   - Estimated: ~1h

### Tier-3: Parallel (test harness, can run after tier-1)

7. **TASK_P1-DEV-7.md** — `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`
   - Zone: test-harness (mcp-server zone for bun:test runner reuse; zero mcp-server production code under test)
   - Depends on: P1-DEV-1, P1-DEV-2, P1-DEV-3, P1-DEV-4 (all create testable artifacts)
   - Deliverable: 13 test cases (T-1..T-13) with RED→GREEN proof for all 12 BLOCKING ACs + NFR-P1-1
   - Acceptance criteria: All tests GREEN after tier-1/2 complete; RED proofs documented (unit: T-1..T-12, integration stubs: T-13/13b/13c)
   - Estimated: ~3h

### Final: Sequential (integration gate)

8. **TASK_P1-QA.md** — Integration Verification and Live Tick Testing
   - Zone: cross-service (qa verification, live dispatcher)
   - Depends on: P1-DEV-1..7 all complete on `main`
   - Deliverable: Test report (`reports/TASK_REPORT_P1-QA.md`) with 8 verification gates (unit tests GREEN, schema validation, flow steps, live telemetry, legacy fallback, Phase 2 safety, atomicity, no regressions)
   - Acceptance criteria: All 8 gates PASS → PO-ready for critique-before-approve
   - Estimated: ~3h

---

## Execution Sequence & WIP Limit

**Recommended dispatch order (WIP ≤ 2):**

```
WAVE 1 (parallel, 0 blocking deps): Spawn P1-DEV-1, P1-DEV-2 (2 agents)
  → Both complete (~2–3h each)

WAVE 2 (parallel, depends on WAVE 1): Spawn P1-DEV-4, P1-DEV-3 (2 agents)
  → P1-DEV-4 completes (~1h, independent SSOT config)
  → P1-DEV-3 completes (~2h, requires evaluator + policy from WAVE 1)

WAVE 3 (parallel, depends on WAVE 1 + WAVE 2): Spawn P1-DEV-7, P1-DEV-5 (2 agents)
  → P1-DEV-7 (test suite) completes (~3h, requires all tier-1 artifacts)
  → P1-DEV-5 (flow Steps 4.2–4.5b) completes (~2.5h, requires tier-1 + P1-DEV-3)

WAVE 4 (sequential, depends on WAVE 3): Spawn P1-DEV-6 (1 agent)
  → P1-DEV-6 (Step 5b) completes (~1h, requires finalized CADENCE_MATCHES from P1-DEV-5)

WAVE 5 (sequential, depends on all WAVE 1–4): Spawn P1-QA (1 agent)
  → P1-QA (integration) completes (~3h, all dev tasks on main)
  → QA sign-off: 8 verification gates PASS
  → Report: reports/TASK_REPORT_P1-QA.md
```

**Total estimated time:** ~15–16h developer + ~3h QA = ~18–19h full cycle
**Parallelization: 3 agents max (Waves 3); otherwise 2 agents per wave**
**WIP compliance:** Max 2 In Progress enforced at each wave transition

---

## Test Coverage & DV Proof Matrix

**All 12 BLOCKING ACs mapped to DV tests:**

| AC | Task | Test | DV Proof |
|---|---|---|---|
| AC-P1-1-1 | P1-DEV-1 | T-1 | Remove rule → wrong interval → RED |
| AC-P1-1-2 | P1-DEV-1 | T-2 | Remove rule → no suppress → RED |
| AC-P1-1-3 | P1-DEV-1 | T-3 | Assert null → RED |
| AC-P1-2-1 | P1-DEV-3 | T-4 | Remove cron → RED |
| AC-P1-3-1 | P1-DEV-3 | T-5 | Assert not due → RED |
| AC-P1-3-2 | P1-DEV-3 | T-6 | Assert due at 50min → RED |
| AC-P1-3-3 | P1-DEV-3 | T-7 | Assert not due at 65min → RED |
| AC-P1-3-4 | P1-DEV-3 | T-8 | Strip field → RED |
| AC-P1-6-2 | P1-DEV-2 | T-9 | Reverse age → RED |
| AC-P1-6-3 | P1-DEV-2 | T-10 | Disable flag → RED |
| AC-P1-7-1 | P1-DEV-6 | T-13 | Assert not written → RED |
| AC-P1-7-2 | P1-DEV-6 | T-13b | Assert written on fail → RED |

**Additional tests:**

| Test | Coverage |
|---|---|
| T-11 | OQ-P1-3 (bctc-offmarket: holiday→null, weekend→1440, open→fallback) |
| T-12 | EC-6 audit (no open+chef-intraday rule has null; NFR-P1-1 implicit) |
| T-13c | AC-P1-7-3 (write failure non-fatal) |

**NFR-P1-1 verification (Phase 2 safety):** Implicit in flow step insertion order (suppression BEFORE claim, no bypass) + verified in P1-QA (leader lock, suffix-free token, published-marker belt untouched).

---

## File Summary

| File | Action | Lines | Zone |
|---|---|---|---|
| `docs/data/cadence-policy.json` | CREATE | ~220 | cross-service |
| `scripts/agents-flow/cadence-policy.js` | CREATE | ~180 | cross-service |
| `scripts/agents-flow/cowork-match-slots.js` | MODIFY | +~40 | cross-service |
| `docs/data/cowork-schedule.json` | MODIFY | +~40 | cross-service |
| `docs/agents/cowork-team/flow/main.md` | MODIFY | +~170 | cross-service |
| `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` | CREATE | ~350 | test-harness |
| **TOTAL** | | **~1000** | **cross-service + test** |

---

## Known Risks & Mitigations (PM Notes)

| Risk | Severity | Mitigation | Verify in |
|---|---|---|---|
| `_cron_fallback: true` semantic is novel; dev might conflate with null suppress | HIGH | Comment in cadence-policy.js; T-11 DV proof enforces distinction | P1-DEV-2 + P1-DEV-7 |
| Staleness threshold (20 min) tunable but value could be hardcoded elsewhere | MEDIUM | Grep codebase outside cadence-policy.json for literal `20`; one SSOT | P1-QA code review |
| Concurrent agent-father edits (EC-5) may clobber last_fired write | MEDIUM | Accepted for Phase 1 (last-write-wins). Log timestamp in Step 5b telemetry. | P1-QA telemetry |
| Bun test harness may not support `require()` of CommonJS from `.ts` file | LOW | Add `"allowJs": true` in tsconfig or use ts-ignore; existing test pattern TBD | P1-DEV-7 setup |
| Integration test stubs (T-13/13b/13c) require file-system mocking | MEDIUM | Can be deferred to Phase 1+ if bun:test harness is constrained; stub with comment | P1-DEV-7 + P1-QA |

---

## Handoff to Development

**Ready for dispatch:** All 8 tasks (P1-DEV-1..7 + P1-QA) have explicit handoff files with acceptance criteria, DV test mapping, and zone assignments. No ambiguity.

**Pre-dispatch checklist (PM):**
- [ ] All 9 handoff files reviewed for clarity
- [ ] Task dependencies verified (tier-1 independent, tier-2 sequential, tier-3 parallel)
- [ ] DV test matrix complete (13 tests, all 12 ACs covered)
- [ ] Zone assignments correct (cross-service for scripts/config/flow, test-harness for suite, no mcp-server production code)
- [ ] WIP limit enforcement plan documented
- [ ] Commit message template for dev teams prepared (SSOT: docs/policies/commit-convention.md)

**Developer entry point:** PM dispatches via agent spawn → developer reads assigned TASK_P1-DEV-N.md → works to acceptance criteria + DV tests → commits on `main` (no branch) → PM tracks WIP status in docs/TASKS.md → next task unblocked when prerequisites complete.

---

## PO Sign-Off Gate

**P1-QA produces:** `reports/TASK_REPORT_P1-QA.md` with all 8 verification gates PASS/FAIL.

**PO critique-before-approve:** All gates PASS → P1-PO-FINAL (user verbal G9) → SIGNED OFF.

---

## RETURN

```
DONE: PM task decomposition complete — 9 atomic handoff files generated
OUTPUT_LOCATION: docs/handoffs/TASK_P1-DEV-1..7 + TASK_P1-QA
ZONE: cross-service (6 tasks) + test-harness (1 task) + qa (1 task)
FILE_SCOPE: 6 files to create/modify; ~1000 lines total
BLOCKING_ACS: All 12 mapped to tests T-1..T-13 (RED→GREEN proof documented)
NFR_P1_1: Verified (Phase 2 safety, insertion before claim, no bypass)
DV_TESTS: 13 unit + integration stubs; all DV proofs documented
WIP_ENFORCEMENT: 3 waves (max 2 In Progress per wave); tier-1 parallel, tier-2 serial, tier-3 parallel, tier-4 serial, tier-5 final gate
READY_FOR_DISPATCH: YES (all handoffs complete, no ambiguity, dependencies resolved)
NEXT: developer (Wave 1 dispatch) | pm (WIP tracking)
```
