---
task_id: "P2-E1"
title: "Regression Alarm Proof — 2 Trials Coupling-Proven (G11)"
owner: "qa + dev-macro-indicators"
cycle: "cycle-56"
dispatch_timestamp: "2026-05-23T18:00:00Z"
blocked_by: "P2-D2 DONE"
unblocks: "Phase 3 (PO 12/12 close)"
goal_under_proof: "G11"
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G11"
task_plan_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md §P2-E1"
anchor: "1776df8e (must remain ancestor throughout)"
---

# TASK_P2-E1 — Regression Alarm Proof (G11 — 2 Trials Coupling-Proven)

## Task Overview

**Goal under proof:** G11 — "Regression alarm bell works"

**Charter §G11 definition verbatim:**

> AI fixes bug A, breaks scenario B → dashboard flips B red → AI forced to fix B before "done".
>
> TA pilot lesson: Two trials of coupling-proven outcome-(a) was sufficient evidence to grade G11=YES (cycle-17 PO decision). Macro G11 inherits same grading rubric — coupling-proven via dashboard rendering N coupled REDs from one mutation, single-edit fix repairs all N, counts as alarm-mechanism-functional.

**Context:** P2-D1 (cycle-54) + P2-D2 (cycle-55) proved G10 (AI-fixability in ≤2 cycles). P2-E1 proves the fixability mechanism works **repeatedly**, not just once. We test a second, different bug injection + fix cycle (trial 2 of ≥2) to show the protocol is robust.

**Key difference from P2-D:** P2-D1 targeted `macro_carry_trade_signal` primitive. P2-E1 **MUST target a DIFFERENT primitive** to demonstrate the protocol generalizes across the codebase.

---

## Pre-Flight Checklist

- [ ] SSOT `docs/data/pilot-status-macro-indicators.json` confirms:
  - `phase2.activeTask = "P2-E1"` ✓ (set at cycle-56 dispatch)
  - `phase2.tasks.P2-D2.status = "DONE"` ✓ (QA GREEN verified 2026-05-23T15:59:48Z)
  - `goals.G10.status = "YES"` ✓ (flipped this cycle)
  - `goalsEarned = 8` ✓ (updated cycle-56)
- [ ] Git anchor 1776df8e still ancestor: `git log --oneline --ancestry-path 1776df8e..HEAD | tail -1` returns non-empty
- [ ] Sandbox at HEAD currently GREEN: `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` → exit 0, 20/20
- [ ] Pre-revert tags still in place:
  - `p2-d1-pre-injection` @ commit c2217c92 ✓ (from P2-D1)
  - `macro-pre-inject` @ commit c2217c92 ✓ (from P2-D1, alternate tag)
- [ ] No stale mutations from P2-D1: `git status` clean (all from P2-D2 fix committed)
- [ ] TA zone untouched: `git diff 1776df8e -- apps/technical-analysis/ docs/data/pilot-status.json` returns empty

---

## Goal Contract Summary

**G11 PASS criteria (per Charter §G11 + TA cycle-17 rubric):**

1. Inject a second, **different** deliberate bug in a **different** macro primitive (NOT carry-trade again)
2. Mutation causes ≥2 scenarios RED (coupling-proven: one mutation triggers dashboard cascade)
3. Dashboard displays RED status honestly for affected cards
4. `dev-macro-indicators` agent fixes BOTH RED cards with a single edit (single root cause)
5. Sandbox exits 0, all 20/20 scenarios GREEN
6. Fix maintains byte-identical restore to pre-bug state on target primitive
7. All hard gates remain CLEAN (anchor held, R-1 deterministic, Fence-B/C clean, SSOT/TA/CI untouched)

**G11 terminal = PASS when both trials succeed** (TA cycle-17 grading: 2 trials = sufficient evidence that fixability protocol is repeatable and coupling-proven)

---

## Primitive Selection for Trial 2

**Trial 1 (P2-D1 / P2-D2):** `macro_carry_trade_signal` with `HotMoneyThreshold 2.5 → 5.0`

**Trial 2 options (choose ONE):**
- `macro_yield_spread_signal` — single threshold/constant (e.g., `HighSpreadThreshold`)
- `macro_oil_impact_classifier` — BEARISH/BULLISH/NEUTRAL threshold (e.g., cost-pressure multiplier)
- `macro_gold_direction_classifier` — price direction threshold
- `macro_usdvnd_direction_classifier` — direction threshold
- `macro_investment_clock` — regime calculation threshold (e.g., indicator weight)

**Selection criteria:**
- Must be cleanly extractable (single constant, single-line mutation)
- Must NOT be carry-trade (used in P2-D1)
- Golden scenario must fail honestly on the mutation
- Sandbox must show coupling (≥2 scenarios RED, not just the primitive's own golden)

**Recommended:** `macro_yield_spread_signal` (paired with carry-trade via macro-signals module; changing yield threshold may couple with other module scenarios that read deposit rate + earning yield together)

---

## Injection Protocol (QA)

### Step 1: Create Pre-Bug Tag

**Before any file edit:**

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
git tag p2-e1-pre-injection HEAD
git tag -a p2-e1-pre-injection -m "P2-E1 trial-2 regression alarm: pre-injection baseline (commit before deliberate bug)" HEAD  # optional annotated tag
git tag macro-e1-pre-inject HEAD  # lightweight alternate
git log --oneline p2-e1-pre-injection
# Output: should be the current HEAD before any mutation
```

**Verify pre-flight gates:**

```bash
# Confirm we're starting from GREEN
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# Expected: exit 0, total=20 pass=20 fail=0 status=OK

# Confirm anchor held
git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
# Expected: non-empty line (ancestor chain intact)
```

### Step 2: Select and Mutate Primitive

**Choose primitive:** (QA decision — recommend `macro_yield_spread_signal` per above)

**Mutation strategy:** Change a single constant in the primitive's main file to a clearly wrong value.

**Example for macro_yield_spread_signal:**
- File: `apps/macro-indicators/pkg/primitive/macro_yield_spread_signal/macro_yield_spread_signal.go`
- Constant: `HighSpreadThreshold = 2.5` (or whatever the real value is)
- Mutation: Change to `HighSpreadThreshold = 0.1` (impossibly low — all scenarios will flip HIGH_SPREAD regime incorrectly)
- Expected effect: yield-spread golden scenario fails (regime mismatch)
- Coupling: module golden scenario also fails if it composes yield-spread + carry-trade (module GOLDEN likely uses both)

**Mutation command example:**

```bash
# IMPORTANT: QA edits only in the primitive package, single line
# Example: replace "HighSpreadThreshold = 2.5" with "HighSpreadThreshold = 0.1"
# Use sed or direct edit in your text editor
sed -i '' 's/HighSpreadThreshold = 2\.5/HighSpreadThreshold = 0.1/g' \
  apps/macro-indicators/pkg/primitive/macro_yield_spread_signal/macro_yield_spread_signal.go

# Verify the mutation:
grep -n "HighSpreadThreshold" apps/macro-indicators/pkg/primitive/macro_yield_spread_signal/macro_yield_spread_signal.go
# Expected: line number shows "0.1"
```

### Step 3: Verify Honest Failure

```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# Expected: exit 1 (non-zero fail code)
# Expected output pattern: "FAIL" or "status: FAIL" with ≥2 failed scenarios
# At minimum: macro_yield_spread_signal-golden + macro-signals-golden (coupling)

# Capture full output:
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all 2>&1 | tee /tmp/p2-e1-sandbox-fail.txt
```

**G8 isolation check:**

```bash
# Confirm other 4 primitives (oil, gold, usdvnd, investment-clock) still GREEN
# Only yield-spread-affected scenarios should fail
grep -E "PASS|FAIL" /tmp/p2-e1-sandbox-fail.txt | grep -E "investment-clock|oil|gold|usdvnd"
# Expected: all lines show "PASS" (only those 4 unaffected)

grep "yield\|macro-signals-golden" /tmp/p2-e1-sandbox-fail.txt
# Expected: at least 1 or 2 lines with "FAIL"
```

### Step 4: Hard Gates (Pre-Injection)

```bash
# Anchor held
git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
# Expected: non-empty

# R-1 deterministic (zero randomization)
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/
# Expected: exit 1 (0 matches)

# Fence-B app/infra (module must not import infrastructure)
grep -rn "application\|infrastructure\|interface" apps/macro-indicators/pkg/module/
# Expected: exit 1 (0 matches)

# Fence-C composition root (no domain in cmd/)
grep -rn "scoreIndicator\|Compute\|Classify" apps/macro-indicators/cmd/server/main.go
# Expected: exit 1 (0 matches)
```

### Step 5: Commit the Injection

```bash
# Explicit staging (L84 rule — NEVER git add -A or .)
git add apps/macro-indicators/pkg/primitive/macro_yield_spread_signal/macro_yield_spread_signal.go

# Commit
git commit -m "test(macro-indicators): P2-E1 — deliberate <MUTATION_LITERAL> bug injected in <primitive-name> (G11 regression-alarm proof setup, trial 2)"
# Example subject: "test(macro-indicators): P2-E1 — deliberate HighSpreadThreshold=0.1 bug injected in macro_yield_spread_signal (G11 regression-alarm proof setup, trial 2)"

# Verify commit
git log --oneline -1
# Expected: commit message shows "P2-E1" + primitive name + "trial 2"
```

### Step 6: Dashboard State Check (QA Annotation)

```bash
# Note which cards are RED after sandbox FAIL
# Expected: yield-spread golden card + macro-signals golden card (coupling) both RED
# Expected: other 4 primitives + macro-signals edge + microservice NOT-RUN remain GREEN/NOT-RUN

# QA should open dashboard and describe state:
# - macro-investment-clock: GREEN ✓
# - macro-oil: GREEN ✓
# - macro-gold: GREEN ✓
# - macro-usdvnd: GREEN ✓
# - macro-carry-trade: GREEN ✓
# - macro-yield-spread: RED (mutated) ✗
# - macro-signals (golden): RED (coupling — composed yield-spread) ✗
# - macro-signals (edge): GREEN ✓
# - microservice: NOT-RUN ✓
```

---

## Fix Protocol (dev-macro-indicators)

### Step 1: Diagnose

Dev agent receives QA signal showing:
- Sandbox exits 1
- ≥2 scenarios RED (yield + module)
- Dashboard shows RED on affected cards

Dev must diagnose from dashboard signals + sandbox output.

### Step 2: Single-Edit Fix

Dev fixes the constant in the primitive back to the original (pre-bug) value:

```bash
# Locate the constant (from sandbox failure or source review)
# Restore it to original value (matches tag p2-e1-pre-injection state)
# Example: HighSpreadThreshold = 0.1 → 2.5 (byte-identical restore)

# Verification:
git diff p2-e1-pre-injection -- apps/macro-indicators/pkg/primitive/macro_yield_spread_signal/macro_yield_spread_signal.go
# Expected: empty (byte-identical to pre-injection tag)
```

### Step 3: Verify Full Recovery

```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# Expected: exit 0, total=20 pass=20 fail=0 status=OK

# Dashboard state should revert to all-GREEN:
# - All 6 primitives: GREEN ✓
# - macro-signals (both golden + edge): GREEN ✓
# - microservice: NOT-RUN ✓
```

### Step 4: Hard Gates Post-Fix

```bash
# Anchor held
git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
# Expected: non-empty

# R-1 deterministic
grep -rE "math/rand|rand\.Intn|rand\.Float" apps/macro-indicators/pkg/
# Expected: exit 1 (0 matches)

# Fence-B, Fence-C
grep -rn "application\|infrastructure" apps/macro-indicators/pkg/module/
# Expected: exit 1

# SSOT untouched (no dev mutations)
git diff 44b2c835..HEAD -- docs/data/pilot-status-macro-indicators.json
# Expected: empty (SSOT not touched by dev fix)

# TA untouched
git diff HEAD -- apps/technical-analysis/
# Expected: empty (no TA modifications)

# Scenarios untouched
git diff HEAD -- docs/scenarios/
# Expected: empty (no scenario file mutations)

# CI untouched
git diff HEAD -- .github/workflows/
# Expected: empty (no CI config changes)
```

### Step 5: Commit the Fix

```bash
# Explicit staging
git add apps/macro-indicators/pkg/primitive/macro_yield_spread_signal/macro_yield_spread_signal.go

# Commit with clear subject
git commit -m "fix(macro-indicators): P2-E1 — restore <primitive> constant to original value (G11 regression-alarm proof trial 2 fix)"
# Example: "fix(macro-indicators): P2-E1 — restore macro_yield_spread_signal HighSpreadThreshold=2.5 (G11 regression-alarm proof trial 2 fix)"

# Verify
git log --oneline -1
```

---

## QA Verification (after dev fix)

### AC-1: Trial 2 Mutation Setup

- [ ] Pre-injection tag created: `git log --oneline p2-e1-pre-injection` shows commit before mutation
- [ ] Primitive mutated: single-line constant change from correct to wrong value
- [ ] Sandbox exits 1 with ≥2 FAIL (coupling-proven)
- [ ] Evidence: paste sandbox output showing FAIL list + exit code 1
- [ ] Dashboard predicted RED for mutated primitive + coupled scenario(s)

**Evidence to record:**

```
Sandbox output (pre-fix):
exit_code: 1
status: FAIL
total: 20
pass: 18
fail: 2
failed_scenarios:
  - macro_yield_spread_signal-golden.json (example)
  - macro-signals-golden.json (example — coupling)
hard_gates_pre_fix: ALL CLEAN (anchor HELD, R-1 exit 1, Fence-B/C exit 1, SSOT/TA/scenarios empty)
```

### AC-2: Dev Single-Edit Fix Verified

- [ ] Fix commit created (byte-identical restore to pre-injection tag)
- [ ] Sandbox post-fix exits 0 with 20/20 PASS
- [ ] Dashboard shows all-GREEN
- [ ] Fix was single edit (only one constant restored, no other changes)
- [ ] Zone discipline: only primitive file modified, no SSOT/TA/scenarios/CI touched

**Evidence to record:**

```
Fix commit: <dev_commit_sha>
Byte-identical verify: git diff p2-e1-pre-injection -- <primitive-file> [empty output]
Sandbox post-fix:
exit_code: 0
status: OK
total: 20
pass: 20
fail: 0
hard_gates_post_fix: ALL CLEAN (anchor HELD, R-1 exit 1, Fence-B/C exit 1, SSOT/TA/scenarios empty)
Zone discipline: git diff HEAD~1..HEAD shows only <primitive-file> (≤5 lines changed, 1 constant)
```

### AC-3: Coupling-Proven Verdict

- [ ] Single mutation (T2) caused ≥2 scenarios RED
- [ ] Single fix (T2) repaired all ≥2 RED scenarios
- [ ] No iteration required (dev not dispatched multiple times for T2 fix)
- [ ] Outcome-(a) from TA cycle-17 rubric: **coupling-proven** (one mutation → ≥2 failures; one fix → all repaired)

**Evidence to record:**

```
Trial 2 summary:
- Primitive: macro_yield_spread_signal (DIFFERENT from P2-D1 carry-trade)
- Mutation: <HighSpreadThreshold 2.5 → 0.1> (single literal)
- Failed scenarios: macro_yield_spread_signal-golden + macro-signals-golden (2 FAILs)
- Root cause: HighSpreadThreshold incorrectly low → all spread regimes computed wrong
- Fix: restore HighSpreadThreshold to 2.5
- Coupling-proven: one constant change broke 2 scenarios; one constant restore fixed both
- Verdict: OUTCOME-(a) PASS (coupling-proven per TA cycle-17 definition)
```

### AC-4: G11 Ready to Flip YES

- [ ] Trial 1 (P2-D1/D2) PASS evidence in SSOT `goals.G10` ✓
- [ ] Trial 2 (P2-E1 this task) PASS evidence documented in handoff
- [ ] Both trials coupling-proven (one mutation → ≥2 failures; one fix → all GREEN)
- [ ] No pilot-scoped bugs outstanding (sandbox 20/20 GREEN post-fix)
- [ ] Anchor 1776df8e held throughout both trials
- [ ] Protocol is repeatable and robust (≥2 different primitives, ≥2 different mutations, all restored in ≤2 cycles)

---

## AC Results Expected

| AC | Criterion | PASS / FAIL |
|----|-----------|-----------|
| AC-1 | Trial 2 mutation setup: pre-tag + different primitive + ≥2 FAIL + coupling | PASS |
| AC-2 | Dev single-edit fix: byte-identical restore + 20/20 GREEN + zone discipline | PASS |
| AC-3 | Coupling-proven outcome-(a): one mutation ≥2 FAILs, one fix all GREEN | PASS |
| AC-4 | G11 terminal ready: 2 trials proven, protocol repeatable, all hard gates CLEAN | PASS |

---

## Constraints (Binding)

- **L84 explicit-file staging:** Only modified primitive package file(s) staged. NEVER `git add -A` or `.`
- **No `--force`, `--no-verify`, `--no-gpg-sign`:** Hard stop if any hook fails; create new commit to fix
- **No `git push`:** Local-only commits. User owns push permissions.
- **Anchor 1776df8e:** Must remain ancestor before and after every commit. Check: `git log --oneline --ancestry-path 1776df8e..HEAD | tail -1` returns non-empty both times.
- **Zone bans:** Do NOT modify `apps/technical-analysis/` (TA FROZEN). Do NOT touch `docs/data/pilot-status-macro-indicators.json` (PM/PO owned). Do NOT modify scenarios or CI configs.
- **One primitive per trial:** Trial 2 primitive ≠ carry-trade (P2-D1). Different primitive for generalizability proof.
- **G12 DoD gate:** Sandbox must exit 0 before dev declares DONE.

---

## Hard Gate Commands

```bash
# Pre-injection / Pre-fix verification
git log --oneline --ancestry-path 1776df8e..HEAD | tail -1
# (anchor check — expected: non-empty)

# R-1 determinism (macro-specific, per charter §Security Clause)
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/
# (expected: exit 1 = 0 matches)

# Fence-B module isolation
grep -rn "application\|infrastructure\|interface" apps/macro-indicators/pkg/module/
# (expected: exit 1 = 0 matches)

# Fence-C composition root ban
grep -rn "scoreIndicator\|Classify\|Compute" apps/macro-indicators/cmd/server/main.go
# (expected: exit 1 = 0 matches)

# SSOT untouched
git diff 44b2c835..HEAD -- docs/data/pilot-status-macro-indicators.json
# (expected: empty)

# G12 DoD gate: sandbox all-tier GREEN
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# (expected post-fix: exit 0, total=20 pass=20 fail=0 status=OK)
```

---

## Signals Expected

### QA Completion Signal (after Trial 2 fix)

File: `docs/signals/qa-p2-e1-macro-GREEN-<UTC>.json`

```json
{
  "type": "qa-verify",
  "from": "qa",
  "to": "pm",
  "cycle": "cycle-56-qa-e1",
  "task_id": "P2-E1",
  "goal_under_proof": "G11",
  "verdict": "GREEN",
  "trial_2_evidence": {
    "primitive_selected": "macro_yield_spread_signal (or [oil|gold|usdvnd|investment-clock])",
    "primitive_different_from_trial_1": true,
    "mutation_literal": "HighSpreadThreshold = 2.5 → 0.1 (example)",
    "pre_injection_tag": "p2-e1-pre-injection",
    "pre_injection_tag_sha": "<HEAD-at-dispatch>",
    "injection_commit_sha": "<injection-commit>",
    "mutation_exit_code": 1,
    "mutation_fail_count": 2,
    "failed_scenarios": ["macro_yield_spread_signal-golden", "macro-signals-golden"],
    "coupling_proven": true,
    "dev_fix_commit_sha": "<dev-fix-sha>",
    "byte_identical_diff_vs_tag": "empty",
    "sandbox_post_fix": {
      "exit_code": 0,
      "status": "OK",
      "total": 20,
      "pass": 20,
      "fail": 0
    },
    "hard_gates": {
      "anchor_1776df8e": "HELD (exit 0)",
      "r1_deterministic": "exit 1 (zero matches)",
      "fence_b_module": "exit 1 (zero matches)",
      "fence_c_root": "exit 1 (zero matches)",
      "ssot_untouched": true,
      "ta_untouched": true,
      "scenarios_untouched": true,
      "ci_untouched": true
    }
  },
  "g11_verdict_summary": "COUPLING-PROVEN OUTCOME-(a): Trial 2 mutation caused ≥2 scenario failures (yield-spread + macro-signals cascade); single dev fix restored all to GREEN. TA cycle-17 rubric satisfied: 2 trials coupling-proven = G11 PASS. Regression alarm mechanism verified repeatable across different primitives.",
  "ac_results": {
    "AC-1": "PASS (pre-tag + different primitive + ≥2 FAIL + coupling)",
    "AC-2": "PASS (single-edit fix + byte-identical + 20/20 GREEN + zone clean)",
    "AC-3": "PASS (coupling-proven: 1 mutation → ≥2 FAIL, 1 fix → all GREEN)",
    "AC-4": "PASS (G11 terminal ready: 2 trials proven, protocol repeatable)"
  },
  "timestamp": "2026-05-23T<PM-will-set>"
}
```

---

## Next Agent / Next Action

**PM cycle-56 (this cycle):**
1. Verify QA P2-E1 completion signal received
2. Flip G11=YES in SSOT + add evidence chain
3. Mark phase2.activeTask = null (all dev/qa tasks DONE; Phase 3 is PO-only)
4. Create phase-2-close signal
5. Dispatch PO for §4.5 atomic close (12/12 terminal + decisionMatrix population)

**PO Phase 3:**
1. Verify all 12 goals reach terminal grade (YES/PARTIAL/DEFER)
2. Apply decision matrix rubric mechanically (Speed/Trust/Scale)
3. Populate decisionMatrix fields with verdict
4. Atomic commit: last G-goal flip + matrix + verdict signature

---

## References

- **Charter:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G11
- **Task plan:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md §P2-E1
- **TA cycle-17 precedent:** docs/po-decisions/2026-05-23-macro-indicators-phase-1-gate.md (references TA G11 2-trial rubric)
- **G10 evidence (trial 1):** docs/signals/qa-p2-d2-verify-GREEN-20260523T155948Z.json
- **G10 SSOT entry:** docs/data/pilot-status-macro-indicators.json goals.G10

---

## Acceptance Signature

QA: _____________________ (date/cycle)  
PM: _____________________ (date/cycle)  
PO: _____________________ (date/cycle — at 12/12 close)
