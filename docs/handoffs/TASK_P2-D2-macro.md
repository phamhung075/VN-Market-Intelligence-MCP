# TASK_P2-D2 — Fix Injected Bug: Byte-Identical Restore (G10 AI-Fixability Proof)

## Task Identity
- **Task ID**: P2-D2
- **Pilot**: macro-indicators v2.0
- **Owner**: dev-macro-indicators
- **Cycle Dispatched**: cycle-55 (2026-05-23T17:55:00Z)
- **Estimate**: 30 minutes
- **Critical Path**: YES (G10 unblock)

## Context — QA Injection Complete

QA cycle-54 completed deliberate bug injection to prove G10 (AI-fixability without looping). Evidence:

### P2-D1 Injection Summary
- **QA Commit**: `bdfc57f5`
- **QA Signal**: `docs/signals/qa-p2-d1-injection-DONE-20260523T174900Z.json`
- **Pre-Injection State**:
  - Tag: `p2-d1-pre-injection` (annotated) + `macro-pre-inject` (lightweight), both on `c2217c92`
  - Sandbox: total=20 pass=20 fail=0 status=OK exit 0
  - All hard gates clean

### Injection Applied
- **Target File**: `apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go`
- **Change**: Line 40: `HotMoneyThreshold = 2.5` → `HotMoneyThreshold = 5.0`
- **Type**: Single literal constant change; no refactoring, no comments, no other mutations
- **Severity**: Deliberate; only carry-trade and module-wired scenarios fail (G8 isolation verified)

### Post-Injection State
- **Sandbox**: total=20 pass=18 fail=2 status=FAIL exit 1
- **Failed Scenarios**:
  - `macro-carry-trade-signal-golden.json` → "carry_hot_money_inflow": got NEUTRAL, want HOT_MONEY_INFLOW
  - `macro-signals-golden.json` → carryTrade.regime cascade from carry-trade primitive
- **G8 Isolation**: Other 5 primitives (investment-clock, oil, gold, usdvnd, yield) still GREEN; macro-signals-edge still GREEN
- **Hard Gates Post-Injection**:
  - Anchor `1776df8e`: HELD (exit 0)
  - R-1 (no math/rand): exit 1 (PASS)
  - Fence-B (app/infra): exit 1 (PASS)
  - Fence-C (infra outside main): exit 1 (PASS)
  - SSOT/TA/scenarios: untouched (PASS)

## Goal Under Proof

**G10**: AI agent fixes a primitive bug without looping (≤2 dispatch cycles)

Charter reference: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G10`

G10 is graded YES if:
1. Dev-macro-indicators achieves byte-identical restore within ≤2 dispatch cycles
2. Sandbox returns 20/20 GREEN (exit 0)
3. All hard gates remain clean
4. QA re-verifies the fix (will happen after dev closes P2-D2)

G10 is graded NO if:
1. Fix requires >2 dispatch cycles, OR
2. Fix is non-byte-identical (any other diff), OR
3. Sandbox remains RED after "fix" attempt, OR
4. Any hard gate fails post-fix

## Pre-Flight Checklist

Before starting work:

- [ ] SSOT check: `docs/data/pilot-status-macro-indicators.json` phase2.activeTask = P2-D2
- [ ] SSOT check: phase2.tasks.P2-D2.status = DISPATCHED
- [ ] Anchor check: `git merge-base --is-ancestor 1776df8e HEAD; echo $?` returns 0
- [ ] Tag check: `git rev-list -n 1 p2-d1-pre-injection` returns `c2217c92716fa0586ac28848dfd85264f917337f`
- [ ] Tag check: `git rev-list -n 1 macro-pre-inject` returns `c2217c92716fa0586ac28848dfd85264f917337f`
- [ ] Baseline sandbox: run `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` → must be exit 1, status=FAIL, pass=18 fail=2 (not your fix target yet, just baseline)

## Authoritative Fix Command

The bug is a single literal change. Fix by restoring the constant to its pre-bug value:

**File**: `apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go`

**Line 40**: Change `HotMoneyThreshold = 5.0` back to `HotMoneyThreshold = 2.5`

**Edit Pattern**:
```go
// Line ~38-42 before fix:
const (
	HotMoneyThreshold = 5.0   // <- CHANGE THIS TO 2.5
	// ... other consts
)

// Line ~38-42 after fix:
const (
	HotMoneyThreshold = 2.5   // <- RESTORED
	// ... other consts
)
```

**No other edits**:
- No refactoring
- No comment additions
- No test file changes
- No other source files touched
- No CI/golangci.yml changes
- No TA zone files touched

## Acceptance Criteria

### AC-1: Byte-Identical Restore
```bash
git diff p2-d1-pre-injection -- apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go
```
**Must return empty** (no diff between HEAD and pre-injection state for this file).

### AC-2: Sandbox Green
```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
```
**Must exit 0, status=OK, total=20 pass=20 fail=0**

### AC-3: Hard Gates Clean
Run all 5 hard-gate commands (see embedded list below); all must exit with status 1 (PASS):

1. **Anchor held**:
   ```bash
   git merge-base --is-ancestor 1776df8e HEAD && echo "exit 0" || echo "exit 1"
   ```
   (Must output "exit 0" / exit code 0)

2. **R-1 deterministic (no math/rand)**:
   ```bash
   grep -rE 'math/rand|rand\.Intn|rand\.Float|math\.Random' apps/macro-indicators/pkg/ && exit 1 || exit 0
   ```
   (Correct: exit 0, zero matches)

3. **Fence-B clean (app imports no infra)**:
   ```bash
   grep -rE 'import.*infrastructure|import.*app' apps/macro-indicators/pkg/module/ && exit 1 || exit 0
   ```
   (Correct: exit 0, zero matches)

4. **Fence-C clean (infra outside main)**:
   ```bash
   grep -rE 'infrastructure|infrastructure imports' apps/macro-indicators/pkg/ --include='*.go' | grep -v 'pkg/module' && exit 1 || exit 0
   ```
   (Correct: exit 0, zero matches)

5. **Scenario dir clean** (no untracked / modified scenario files):
   ```bash
   cd apps/macro-indicators && git status docs/scenarios/macro-indicators/ | grep modified
   ```
   (Correct: no output / clean)

### AC-4: SSOT Untouched
- Do NOT modify `docs/data/pilot-status-macro-indicators.json` yourself
- PM will update SSOT at cycle close after QA re-verifies P2-D2 fix
- Your task: fix the code only

### AC-5: Done Signal Written
After code fix + sandbox GREEN + hard gates clean, write:

**File**: `docs/signals/dev-macro-p2-d2-fix-DONE-<UTC>.json`

**Schema**:
```json
{
  "type": "dev-task-result",
  "from": "dev-macro-indicators",
  "to": "pm+qa",
  "cycle": "cycle-55",
  "task_id": "P2-D2",
  "verdict": "DONE",
  "g10_phase": "fix-complete-awaiting-qa-reverify",
  "fix_commit_sha": "<your commit SHA>",
  "byte_identical_verification": {
    "command": "git diff p2-d1-pre-injection -- apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go",
    "result": "empty"
  },
  "sandbox_result": {
    "exit_code": 0,
    "status": "OK",
    "total": 20,
    "pass": 20,
    "fail": 0
  },
  "hard_gates_status": {
    "anchor_1776df8e_held": "PASS (exit 0)",
    "r1_deterministic": "PASS (exit 0)",
    "fence_b_clean": "PASS (exit 0)",
    "fence_c_clean": "PASS (exit 0)",
    "scenario_dir_clean": "PASS (git status clean)"
  },
  "cycle_used": 1,
  "cycle_baseline_start": "2026-05-23T17:49:00Z",
  "timestamp": "<UTC now>"
}
```

(Cycle count: 1 if you fix in this dispatch; 2 if you need a second dispatch.)

## Out of Scope (Do NOT Touch)

- `apps/technical-analysis/` — TA zone is off-limits
- `apps/macro-indicators/.golangci.yml` — CI config frozen
- `.github/workflows/ci.yml` — CI job frozen
- `docs/data/pilot-status-macro-indicators.json` — SSOT updates only by PM
- Any file outside `apps/macro-indicators/` zone
- Any test edits (sandbox scenarios are frozen)
- Any comment edits (code-only, pure literal fix)
- Any refactoring or optimization

## Constraints (Non-Negotiable)

1. **L84 Explicit Staging**: Only stage the one file you edit:
   ```bash
   git add apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/macro_carry_trade_signal.go
   git add docs/signals/dev-macro-p2-d2-fix-DONE-<UTC>.json
   ```
   NEVER use `git add -A` or `git add .`

2. **No Destructive Git**:
   - NO `git push` (local-only; user owns push)
   - NO `git push --tags`
   - NO `--force`, `--no-verify`, `--no-gpg-sign` flags

3. **Anchor Discipline**:
   - Anchor `1776df8e` must remain ancestor of HEAD pre and post commit
   - Do NOT retag, rewrite, or force-push

4. **Commit Message Pattern**:
   ```
   fix(macro-indicators): P2-D2 — byte-identical restore HotMoneyThreshold 5.0→2.5 (G10 fixability proof)
   ```

5. **Cycle Counting**:
   - Cycle 1 = this dispatch (cycle-55)
   - Cycle 2 = if you need a follow-up dispatch from PM (after this closes)
   - If >2 cycles needed without byte-identical sandbox-GREEN, G10 fails

## G10 Pass / Fail Matrix

| Condition | Result |
|-----------|--------|
| Byte-identical restore in ≤2 cycles + sandbox 20/20 GREEN + hard gates clean | **G10 = YES** ✓ |
| >2 cycles needed | **G10 = NO** ✗ |
| Non-byte-identical "fix" (any other diff) | **G10 = NO** ✗ |
| Sandbox stays RED after fix | **G10 = NO** ✗ |
| Any hard gate fails post-fix | **G10 = NO** ✗ |

## Next Steps After Your Fix

1. **Dev completes P2-D2** → writes done signal → PM awaits
2. **QA re-verifies** (cycle-55 or cycle-56, depending on dev cycle) → runs sandbox independently → writes signal
3. **PM closes P2-D2** (atomic commit) → updates SSOT phase2.tasks.P2-D2.completion + flips G10=YES (if all criteria PASS) → SSOT goalsEarned increments
4. **PO decides verdict** (only after 12/12 goals reach terminal grade)

---

## Hard Gate Commands (Copy-Paste Ready)

All commands must be run from repo root unless otherwise specified.

### 1. Anchor Check
```bash
git merge-base --is-ancestor 1776df8e HEAD && echo "PASS: anchor held" || echo "FAIL: anchor lost"
```

### 2. R-1 Determinism
```bash
grep -rE 'math/rand|rand\.Intn|rand\.Float|math\.Random' apps/macro-indicators/pkg/ && echo "FAIL: found random" || echo "PASS: R-1 clean"
```

### 3. Fence-B Application Layer (no infra imports)
```bash
grep -rE 'import.*".*infrastructure|import.*".*infra' apps/macro-indicators/pkg/module/ && echo "FAIL: module imports infra" || echo "PASS: Fence-B clean"
```

### 4. Fence-C Infrastructure Constraint
```bash
grep -rE 'package infrastructure|import.*infrastructure' apps/macro-indicators/pkg/ --include='*.go' | grep -v 'pkg/module' && echo "FAIL: infra outside main" || echo "PASS: Fence-C clean"
```

### 5. Scenario Directory Clean
```bash
cd apps/macro-indicators && git status docs/scenarios/macro-indicators/ | grep -E 'modified|new file' && echo "FAIL: scenarios modified" || echo "PASS: scenarios clean"
```

### 6. Sandbox Green (All Tiers)
```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all 2>&1 | tail -1
```
Expected: `total=20 pass=20 fail=0 status=OK exit status 0`

---

## Reference Files

- **Charter**: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md`
- **QA P2-D1 Signal**: `docs/signals/qa-p2-d1-injection-DONE-20260523T174900Z.json`
- **Pre-Injection Tag**: `p2-d1-pre-injection` (sha: c2217c92)
- **SSOT**: `docs/data/pilot-status-macro-indicators.json` (DO NOT EDIT)
- **Pilot Status**: `docs/data/pilot-status-macro-indicators.json` phase2.tasks.P2-D2

## Hints for Success

1. **Literal only**: The fix is one constant value. No surrounding code changes.
2. **Test without committing first**: Run sandbox locally before `git add`. Verify exit 0.
3. **Hard gates are prerequisites**: Before writing done signal, verify all 5 hard gates.
4. **Byte-identical proof is binding**: If `git diff p2-d1-pre-injection -- <file>` shows anything, the fix fails G10.
5. **Anchor must hold**: If you somehow modify the repo history, anchor `1776df8e` ancestor check will fail → PM cannot close you.

Good luck! You've got 2 cycles to prove AI can fix bugs without looping.
