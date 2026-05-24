---
task_id: P2-KD-N
title: "G10 AI-Fixability Proof (≤2 Cycles) + G11 2-Trial Coupling Proof"
owner: "dev-kinh-dich (fix) + qa (cycle count + Trial-2)"
phase: 2
goal_advanced: ["G10", "G11"]
date_created: 2026-05-24
blocked_by: P2-KD-M
blocks: P2-KD-Z
est_hours: 1.5
ac_count: 5
---

# TASK_P2-KD-N: G10 AI-Fixability Proof (≤2 Cycles) + G11 2-Trial Coupling Proof

**Owner:** dev-kinh-dich (fix) + qa (cycle count + Trial-2)  
**Blocked by:** P2-KD-M DONE (bug injected, dashboard RED)  
**Blocks:** P2-KD-Z  
**Est:** 1.5h  
**ACs:** 5  

---

## Background

G10 and G11 are proven in sequence within this task. A single-literal bug was injected in Phase-2 P2-KD-M and committed as a real defect. The sandbox is currently RED (some scenarios failing). Dev-kinh-dich diagnoses from the RED dashboard + failing sandbox, fixes the single-literal bug in ≤2 dispatch cycles, verifies sandbox GREEN. QA then proves the regression-alarm coupling (G11) via 2-trial mutation + fix sequence.

**Key constraints:**
- Dev stays BLIND to the bug's file/line/literal — rediscover from RED symptoms only
- ≤2 dispatch cycles (1 cycle = one dev-kinh-dich dispatch; QA counts from P2-KD-M DONE signal to sandbox-exit-0)
- Single-edit fix restores all coupled RED scenarios to GREEN simultaneously (regression alarm)
- G12 DoD applies: sandbox must exit 0 + ≥17 scenarios PASS before dev declares DONE

---

## RED Sandbox Symptom

**Current state (after P2-KD-M injection):**

```
[FAIL] hao-encoder-edge.json | result[4].state: expected LAO_DUONG but got THIEU_DUONG
[PASS] hao-encoder-failure.json
[FAIL] hao-encoder-golden.json | result[0].state: expected LAO_DUONG but got THIEU_DUONG
[PASS] ... (14 other scenarios PASS)

[sandbox] FAIL 15/17 scenarios (2 failed, 0 skipped)
SANDBOX_EXIT=1
```

**Dashboard state:** hao-encoder card shows FAIL/RED. At least one coupled scenario (e.g., reading-composer) that depends on hao-encoder output may also be affected.

**Your task:** Fix the defect that causes this failure pattern, restore sandbox to all-GREEN (≥17/17 PASS, exit 0), within ≤2 cycles.

---

## Acceptance Criteria

### AC-1 (G10): Sandbox Exits 0 After Fix

After identifying and fixing the bug:

```bash
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all
```

Must exit 0. Paste full output to handoff `§Evidence — G10 Fix Complete`. Output must show ≥17 scenarios PASS (all primitives + module scenarios). The exact scenarios that were FAIL before fix must now show PASS.

---

### AC-2 (G10): Dashboard GREEN After Fix

After the fix, run the dashboard and verify the hao-encoder card shows GREEN (all 3 hao-encoder scenarios passing). Description or screenshot pasted to handoff `§Evidence — G10 Dashboard GREEN`.

---

### AC-3 (G10): Cycle Count ≤2

QA records cycle count in the handoff evidence section:

- Cycle 1 received: P2-KD-M DONE signal + RED sandbox symptom
- Cycle 1 return: dev-kinh-dich submits fix (1 dispatch)
- If not GREEN after Cycle 1 → Cycle 2 return allowed (1 more dispatch)
- Max total: 2 cycles

If sandbox does NOT reach exit 0 within ≤2 cycles, **PM escalates to architect** before Phase 3 (this blocks phase2 close).

**Evidence:** QA records cycle count and any diagnostic notes in handoff.

---

### AC-4 (G12 DoD Gate): Sandbox-Green Proof in Handoff

Dev-kinh-dich pastes the full sandbox output (all ≥17 scenarios PASS, exit 0) to the handoff before declaring DONE. This is the G12 DoD gate requirement for every Phase-2 dev task.

---

### AC-5 (G11): 2-Trial Regression Alarm Coupling Proof

QA runs two separate mutation + fix trials to prove the regression alarm (coupled scenario failure + single-edit restoration):

#### Trial-1 (uses completed G10 fix)

QA verifies: during the G10 bug injection (now fixed), at least ONE other scenario (a primitive or module scenario that depends on hao-encoder indirectly — e.g., `reading-composer-golden.json` uses encoded haos) went RED alongside the hao-encoder scenarios.

**Outcome-(a):** ≥1 coupled scenario went RED during injection; the single-edit fix (reverting the one literal) restored all coupled REDs to GREEN simultaneously. **PASS.**

If no coupled scenario went RED, QA updates the module scenario to exercise the hao-encoder path, then re-runs Trial-1 with corrected scenario.

#### Trial-2 (different primitive mutation)

1. QA injects a DIFFERENT one-literal mutation into `ngu-hanh-classifier/index.ts` (e.g., swap one return value in the GENERATION table, causing classifier to return wrong `dynamic` for that trigram pair).
2. Confirm: `ngu-hanh-classifier-golden.json` fails AND ≥1 module-level scenario also fails (coupling proof).
3. Dev-kinh-dich reverts the mutation in 1 edit.
4. Sandbox exits 0 after fix. All coupled REDs resolved to GREEN.
5. QA decides: Trial-2 injection is committed-then-reverted OR local-only (either is acceptable per grading rubric as long as git is clean at P2-KD-N completion).

**Outcome-(a):** ≥1 coupled scenario went RED from ngu-hanh-classifier mutation; single-edit fix restored all. **PASS.**

**Evidence:** QA records both trials in handoff `§Evidence — G11 Coupling Proof`:
- `trial_1_outcome: outcome-(a)` (coupled REDs + single-edit fix)
- `trial_2_outcome: outcome-(a)` (different mutation, coupled REDs + single-edit fix)
- `g11_verdict: PASS`

---

## Files to Touch

**Dev-kinh-dich:**
- `apps/kinh-dich-service/src/primitive/hao-encoder/index.ts` (or whichever primitive has the bug — fix the ONE literal that was wrong)

**QA:**
- `docs/handoffs/TASK_P2-KD-N.md` — This handoff, evidence sections filled

---

## Commit Pattern

**ONE commit per cycle** (if needed):

```bash
# Cycle 1: dev fixes bug + pastes sandbox evidence
git add apps/kinh-dich-service/src/primitive/<primitive>/index.ts
git add docs/handoffs/TASK_P2-KD-N.md
git commit -m "fix(kinh-dich): P2-KD-N — blind-fix G10 injected bug, sandbox 17/17 GREEN (G10 + G11 coupling trial-1)"

# If Cycle 2 needed (rare):
# (repeat above, update handoff with cycle 2 evidence)
```

---

## Anchor & SSOT Integrity

**Anchor remains INTACT:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```
Must return non-empty.

**SSOT untouched:**
- `docs/data/pilot-status-kinh-dich.json` must NOT be edited by this task
- `goalsEarned` stays 0
- No goal state flips
- `phase2.current_task` = P2-KD-N (PM-set; dev/qa do NOT edit SSOT)

---

## G-Goal Posture

**NO goal flips.** §4.5 SSOT untouched. G10 and G11 evidence are complete but do NOT flip goal states. PO-only authorship at 12/12 terminal Phase 3.

---

## Next

**next_actor: pm** — receive G10+G11 DONE signal, verify ≤2 cycles met, update SSOT current_task→P2-KD-Z, sequence QA for close-gate.

---

## Evidence Sections

### Evidence — G10 Fix Complete

```
[To be filled by dev-kinh-dich after fix and sandbox run]

(Full sandbox output with all ≥17 scenarios PASS, exit 0)
```

### Evidence — G10 Dashboard GREEN

```
[To be filled by dev-kinh-dich after fix]

(Description or screenshot: hao-encoder card GREEN after sandbox fix)
```

### Evidence — G10 Cycle Count

```
Cycle count: [1 or 2]
P2-KD-M received: [ISO timestamp]
Cycle 1 fix returned: [ISO timestamp]
Cycle 2 (if needed): [ISO timestamp]
Outcome: G10 PASS (sandbox 17/17 GREEN within ≤2 cycles)
```

### Evidence — G11 Coupling Proof

```
Trial-1 outcome: outcome-(a) (coupled REDs from G10 injection + single-edit fix)
  - hao-encoder-golden: FAIL (expected LAO_DUONG but got THIEU_DUONG)
  - hao-encoder-edge: FAIL (same state mismatch)
  - reading-composer-golden: [RED|PASS after coupled verification]
  - Single-edit revert: LAO_DUONG_THRESHOLD corrected → all REDs GREEN

Trial-2 outcome: outcome-(a) (different mutation: ngu-hanh-classifier trigram)
  - ngu-hanh-classifier-golden: FAIL (expected [X] but got [Y])
  - reading-composer-golden: FAIL (coupled due to ngu-hanh dependency)
  - Single-edit revert: GENERATION table value corrected → all REDs GREEN

G11 verdict: PASS (both trials demonstrate regression alarm coupling + single-edit restoration)
```

