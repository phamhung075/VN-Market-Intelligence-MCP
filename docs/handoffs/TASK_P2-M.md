---
task_id: "P2-M"
title: "G10 AI-Fixability + G11 2-Trial Coupling Proof"
authored_by: "pm"
authored_at: "2026-05-24T04:05:00Z"
pilot: "stock-price"
phase: "2"
owner: "dev-stock-price + qa"
classification: "BLIND FIX — Developer receives ONLY failing-sandbox symptom, NOT the injection details"
---

# P2-M — G10 AI-Fixability Proof (≤2 Cycles) + G11 2-Trial Coupling Proof

## Preamble — Information Asymmetry (Binding)

**This task implements a "blind fix" test.** The goal is to measure whether the AI agent (dev-stock-price) can:
1. **Diagnose** from a RED dashboard symptom alone (failing sandbox scenario)
2. **Fix** the regression within ≤2 dispatch cycles
3. **Verify** the fix is byte-identical to the baseline

**What you WILL receive:**
- The failing-sandbox symptom (one specific scenario failing)
- The sandbox exit code (non-zero)
- The dashboard card that is RED
- Instructions to run the sandbox and observe failures

**What you WILL NOT receive:**
- The file path of the bug
- The function name containing the bug
- The specific literal that was changed
- Any code snippet showing "before" vs "after"

This is intentional. The grader (not the fixer) has the injection evidence. Your job is to rediscover
the bug from the symptom and fix it.

---

## Background: P2-L Injection Summary

P2-L (QA) created a pre-inject tag (`stock-price-pre-inject` at commit `57d4df43`) and injected a
**SINGLE-LITERAL bug** into one stock-price primitive. The injection type is: **one identifier or
constant was changed** (not a multi-line refactor, not a logic rewrite — a single-edit fix exists).

**Result:** Sandbox now shows:
```
total=11 pass=10 fail=1 status=FAIL
exit status 1
```

One scenario is failing. The dashboard card for that primitive now shows RED.

---

## Your Mission

### Phase A: Diagnose and Fix the G10 Regression

#### G10 Step 1 — Run the Sandbox and Observe the Failure

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

Look for the FAIL line in the output. Note:
- Which scenario is failing (the scenario name tells you which primitive is broken)
- The failure message (what was expected vs what was actually returned)
- The exit code (non-zero)

Open `apps/stock-price/dashboard/index.html` in a browser. You will see one card showing RED / FAIL
(the same primitive from the failing scenario).

#### G10 Step 2 — Rediscover the Bug

Using only:
1. The failing scenario name and failure message from the sandbox output
2. The source code of the affected primitive
3. The primitive's test files (if helpful)

Determine what ONE literal was changed in the primitive's source code to cause this failure.

Do NOT search for `TODO` comments, breakpoint markers, or "injected bug" strings. The bug is real code.

#### G10 Step 3 — Fix the Bug

Make ONE edit to ONE file to restore it to the correct state. The fix must be:
- A single character / identifier change (reversing the injection)
- NOT a multi-line rewrite
- NOT adding new logic or removing code

After your fix:
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

Should exit 0 with all scenarios PASS.

#### G10 Step 4 — Verify Byte-Identical Restore

The grader will verify that your fixed file is byte-identical to the pre-inject baseline. This is
the **hard contract for G10 success:**

```bash
git diff stock-price-pre-inject HEAD -- apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go
```

Must show **EMPTY output** (zero diff). If it is not empty, the fix is not byte-identical.

Alternatively, the grader will run:
```bash
git checkout stock-price-pre-inject -- apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go
git diff HEAD -- apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go
```

And also expect EMPTY output (your fix matches the baseline exactly).

#### G10 Cycle Count

QA will count the number of times you are dispatched (each dev-stock-price dispatch = 1 cycle).
- **Cycle 1 PASS:** Fix is correct on first dispatch
- **Cycle 2 PASS:** Fix is correct on second dispatch (one retry)
- **Cycle 3+:** FAIL — exceeds ≤2 budget

#### G10 Acceptance Criteria

**AC-1 — Sandbox exit 0 post-fix:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0. All 11 scenarios PASS. Paste full output to evidence section.

**AC-2 — Dashboard GREEN:**
Open `apps/stock-price/dashboard/index.html` in browser. All cards show GREEN (no RED cards).
The formerly-RED primitive now shows GREEN / PASS for its scenarios.

**AC-3 — Cycle count ≤ 2:**
QA records number of dispatches. Must be ≤ 2.

**AC-4 — G12 DoD gate — sandbox all-green before DONE:**
Same as AC-1. Sandbox exit 0 with full output pasted.

---

### Phase B: G11 2-Trial Coupling Proof

After the G10 fix is complete and verified (sandbox GREEN, dashboard GREEN, cycle count ≤2), QA
executes **Trial-1** and **Trial-2** regression-alarm coupling proofs.

#### G11 Trial-1 — Coupled Scenarios from G10 Injection

QA verifies: during the G10 bug injection, did **any scenario for a different primitive also fail**?

**Expected coupling pattern:** The injected primitive (the one you just fixed) calls or is called by
other primitives, or the module-level scenario exercises multiple primitives. When one primitive's
output changed (due to the injected bug), downstream primitives that depend on it also failed.

**Trial-1 success criterion (outcome-a):**
- ≥1 coupled scenario went RED during P2-L injection (beside the injected primitive's golden scenario)
- Your single-edit fix (reversing the injection) restored ALL coupled REDs to GREEN simultaneously

If no coupled scenario went RED, QA will instruct you to update the module-level scenario or
create a new coupling scenario, then re-run Trial-1 with the corrected scenario set.

#### G11 Trial-2 — Different Primitive Mutation

QA injects a DIFFERENT one-literal bug into a **different primitive**
(e.g., if Trial-1 was `price-staleness-classifier`, Trial-2 might be `price-quote-normalizer` or
`tier-fallback-selector`).

**Trial-2 procedure:**
1. QA mutates a different primitive's source (single-literal change)
2. You observe sandbox failures (the Trial-2 primitive golden + coupled scenarios)
3. You diagnose and fix the mutation (single edit, restoring baseline)
4. Sandbox exits 0 again
5. All coupled REDs are restored to GREEN

**Trial-2 success criterion (outcome-a):**
- ≥1 coupled scenario failed alongside the different primitive's golden scenario
- Your single-edit fix restored all coupled REDs to GREEN

#### G11 Acceptance Criteria

**AC-5 — G11 both trials outcome-(a) PASS:**

QA records in the handoff evidence section:
```
trial_1_injected_primitive: [name of P2-L primitive]
trial_1_coupled_scenarios_failed: [count ≥1]
trial_1_fix_restored_all: YES (all coupled scenarios GREEN post-fix)
trial_1_outcome: outcome-(a) PASS

trial_2_injected_primitive: [name of different primitive]
trial_2_coupled_scenarios_failed: [count ≥1]
trial_2_fix_restored_all: YES (all coupled scenarios GREEN post-fix)
trial_2_outcome: outcome-(a) PASS

g11_verdict: PASS (both trials demonstrate regression-alarm coupling)
```

QA emits completion signal `docs/signals/qa-sp-P2-M-g10-g11-done-<UTC>.json`.

---

## Files You May Need to Edit

Based on the failing scenario name (which you will discover by running the sandbox), you will likely
need to edit **ONE FILE** in `apps/stock-price/pkg/primitive/`. The exact file will be clear from
the failing scenario's primitive name.

**You WILL NOT edit:**
- `.golangci.yml` (frozen — P2-B)
- `docs/dashboards/index.html` (P2-I finalized)
- `docs/data/pilot-status-stock-price.json` (PM-owned SSOT)
- Any file outside `apps/stock-price/pkg/primitive/` (unless the bug is elsewhere — diagnose first)

---

## Commit Strategy — Implicit Acceptance

**After you fix the bug(s) and sandbox is all-green:**
1. Stage your primitive-file change(s) using explicit paths: `git add apps/stock-price/pkg/primitive/.../fixed-file.go`
2. Commit with a descriptive subject (e.g., `fix(stock-price): P2-M — fix price-staleness-classifier bug (G10)`)
3. Push to origin main (or stay local — PM will commit per L84 explicit-path discipline)

**QA will then:**
- Verify sandbox green again
- Run the byte-identical restore check against `stock-price-pre-inject`
- Count cycles to green (your dispatches)
- Verify Trial-1 and Trial-2 coupling outcomes
- Record G10 + G11 evidence in handoff and emit completion signal

---

## Success Metrics (Non-Negotiable)

| Metric | PASS Threshold | FAIL Threshold |
|--------|---|---|
| Sandbox exit code | 0 | non-zero |
| Dashboard GREEN | All cards GREEN | Any RED card |
| Cycle count | ≤ 2 dispatches | ≥ 3 dispatches |
| Byte-identical restore | `git diff stock-price-pre-inject HEAD -- <file>` empty | Non-empty diff |
| Trial-1 coupling | Outcome-(a): coupled REDs fixed by single-edit | No coupling OR fix requires multi-edit |
| Trial-2 coupling | Outcome-(a): coupled REDs fixed by single-edit | No coupling OR fix requires multi-edit |
| G12 DoD gate | Sandbox all-green before declaring DONE | Sandbox RED at declaration |

---

## Handoff Acceptance Criteria (QA Verification)

After dev-stock-price signals completion (sandbox GREEN, commits made), QA verifies:

**AC-1:** Sandbox exits 0 with full output pasted to `§Evidence — G10 Sandbox Clean Run`

**AC-2:** Dashboard shows GREEN for all primitive cards (no RED)

**AC-3:** QA records cycle count (number of dev-stock-price dispatches from P2-L DONE signal to
sandbox GREEN signal). Must be ≤ 2. Paste decision logic to evidence section.

**AC-4:** G12 DoD gate confirmed: sandbox all-green BEFORE dev declares DONE (no last-minute sandbox
RED admitted at declaration time).

**AC-5:** G11 both trials outcome-(a) PASS. QA records Trial-1 and Trial-2 details (coupled scenarios,
fixes applied, restoration proof) in evidence section.

---

## Evidence Sections (QA writes these after dev-stock-price completion)

### § Evidence — G10 Sandbox Clean Run

```
[Paste full stdout of: cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all]
```

### § Evidence — G10 Cycle Count

```
Cycle count: [1 or 2]
Dispatches: [list dev-stock-price dispatch timestamps / signals]
Cycle 1: [timestamp] → [result: green OR needs another cycle]
Cycle 2: [timestamp] → [result: green]
Budget used: [1 or 2] / [max 2]
```

### § Evidence — G10 Byte-Identical Restore

```
git diff stock-price-pre-inject HEAD -- apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go
[Should be empty output]
Exit code: 0 ✓
```

### § Evidence — G11 Trial-1 Coupling Proof

```
Trial-1 injected primitive: [name]
Coupled scenarios that failed:
  - [scenario name 1]
  - [scenario name 2]
  - ...
Single-edit fix applied: [description of the one change]
Sandbox post-fix: [total=11 pass=11 fail=0 status=OK]
All coupled REDs restored to GREEN: YES ✓
Outcome: outcome-(a) PASS
```

### § Evidence — G11 Trial-2 Coupling Proof

```
Trial-2 injected primitive: [name — different from Trial-1]
Coupled scenarios that failed:
  - [scenario name 1]
  - [scenario name 2]
  - ...
Single-edit fix applied: [description of the one change]
Sandbox post-fix: [total=11 pass=11 fail=0 status=OK]
All coupled REDs restored to GREEN: YES ✓
Outcome: outcome-(a) PASS
```

### § G11 Final Verdict

```
trial_1_outcome: outcome-(a) PASS
trial_2_outcome: outcome-(a) PASS
g11_verdict: PASS (regression-alarm coupling proven via 2-trial rubric)
```

---

## Special Notes

### The Grader's Viewpoint

The PM/Architect has the injection evidence file (`docs/handoffs/TASK_P2-L-sp-g10-injection-evidence.md`),
which documents the exact file, function, and literal that was changed. You (the fixer) do NOT have
access to that file during the fix. Your fix must be independently discovered from the failing-sandbox
output alone.

The grader will verify:
1. Your fix is byte-identical to the baseline (proving correct rediscovery)
2. You fixed it within ≤2 cycles (proving quick diagnosis)
3. Trial-1 and Trial-2 show coupled failures (proving regression alarm sensitivity)

### No Goal Flips

This task DOES NOT flip any G-goal state. G10 and G11 advance but remain EARNED-PENDING until the
Phase-3 PO-only terminal close. The `decisionMatrix` block in the SSOT stays all-TBD. `goalsEarned`
stays 0.

### Build + Lint Remains Green

Before declaring DONE, verify:
```bash
cd apps/stock-price && go build ./... && golangci-lint run
```
Both exit 0 (no new fence violations, no compiler errors).

---

## Next Step (after DONE)

QA signals completion. PM transitions the SSOT `current_task` to `P2-Z` (Phase-2 close-gate) and
dispatches QA for final verification.

