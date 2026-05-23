---
task_id: P2-A2
pilot: macro-indicators
phase: "2"
title: CI Job + Deliberate Violation Proof + Pre-CI Tag
owner: dev-macro-indicators
estimated_effort: "1h"
dependencies:
  - P2-A1
critical_path: true
wip_slot: "1 of 1 (sequential)"
---

# TASK P2-A2 — CI Job + Deliberate Violation Proof + Pre-CI Tag

**Goal:** Flip G4 status from PARTIAL to YES by adding CI wiring + deliberate-violation proof.

**Charter reference:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §G4

**Phase 2 plan reference:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md §P2-A2

**Anchor:** 1776df8e (must hold pre+post — verify before and after commit)

---

## Context

P2-A1 created `.golangci.yml` with Fence-A/B/C depguard rules. This task proves those rules work by:
1. Wiring a CI job that runs golangci-lint on every push to main
2. Demonstrating a deliberate fence violation locally (not committed), capturing the CI failure output
3. Tagging the P2-A1 commit with `macro-pre-ci` for rollback safety

**Why deliberate violation proof?** The TA pilot showed offline violation evidence (local golangci-lint demonstrating a fence breach) is equivalent to CI-green evidence for G4 grading. This task uses the TA-proven pattern.

---

## Hard Gates (Binding)

All gates must PASS before you declare DONE.

| Gate | Command | Must exit | Reason |
|------|---------|-----------|--------|
| **Anchor pre-commit** | `git merge-base --is-ancestor 1776df8e HEAD; echo $?` | 0 | Safety: anchor unforgotten |
| **R-1 determinism** | `grep -rE "math/rand\|rand\.Intn\|rand\.Float\|time\.Now.*Seed" apps/macro-indicators/pkg/` | 1 | No randomization in Go code |
| **Lint clean** | `cd apps/macro-indicators && golangci-lint run` | 0 | No violations before commit |
| **G12 sandbox** | `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` | 0 + `total=5 pass=5 fail=0 status=OK` | Dashboard/scenario logic untouched |
| **Anchor post-commit** | `git merge-base --is-ancestor 1776df8e HEAD; echo $?` | 0 | Safety: anchor still held after commit |

---

## Acceptance Criteria

### AC-1: Pre-CI Tag Created (Before Any File Edit)

**What to do:**
1. Verify you are on the commit from P2-A1 (should be 31597da4 or later, the commit that created `.golangci.yml`).
2. Run: `git tag macro-pre-ci HEAD`
3. Confirm: `git log --oneline macro-pre-ci` — should show the P2-A1 commit (31597da4).
4. Do NOT push the tag.

**How to verify:**
```bash
git tag macro-pre-ci HEAD
git log --oneline macro-pre-ci   # should show commit 31597da4 or similar
```

**Result:** Tag `macro-pre-ci` placed on the freeze anchor commit (last commit from P2-A1).

---

### AC-2: CI Job Added to `.github/workflows/ci.yml`

**What to do:**
1. Edit `.github/workflows/ci.yml` (or the CI workflow file path at the root of the repo).
2. Add a new GitHub Actions job named `go-lint` (or `macro-go-lint`) that:
   - Triggers on `push` to `main` (and PR events, if the project uses PR workflows)
   - Runs in a Linux container (ubuntu-latest)
   - Sets `working-directory: apps/macro-indicators`
   - Runs `golangci-lint run`
   - Reports exit code (0 = pass, non-zero = fail)

**Example YAML snippet to add:**
```yaml
  macro-go-lint:
    name: Macro Indicators Go Lint
    runs-on: ubuntu-latest
    working-directory: apps/macro-indicators
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v4
        with:
          go-version: '1.26'
      - uses: golangci/golangci-lint-action@v3
        with:
          working-directory: apps/macro-indicators
          args: run
```

**How to verify:**
```bash
grep -n "macro-indicators" .github/workflows/ci.yml   # must return ≥1 match
grep -n "golangci-lint" .github/workflows/ci.yml      # must return ≥1 match in the macro context
```

**Result:** CI job added to workflow file. On next push to main, the CI will run.

---

### AC-3: Deliberate Violation Proof (Local, Violation Never Committed)

**What to do:**
1. Create a deliberate Fence-A violation on a throwaway branch or dirty working tree.
2. Run golangci-lint locally to capture the failure.
3. Revert the violation immediately (do NOT commit).
4. Re-run golangci-lint to confirm it's clean again.
5. Paste both outputs to the "Evidence to Record" section below.

**Step-by-step:**

**Step 3.1 — Create a temporary violation:**
```bash
# Edit one of the existing primitive packages (e.g., macro_investment_clock)
# Add a temporary import that violates Fence-A (e.g., importing from pkg/application/)

# Example: edit apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock.go
# Add this line at the top of the file (after package declaration, before other imports):
# import "apps/macro-indicators/pkg/application"

# (Or add an import statement inside the file that pulls in an application layer type)
```

**Step 3.2 — Run golangci-lint:**
```bash
cd apps/macro-indicators
golangci-lint run
# You should see output like:
# macro_investment_clock.go:5: Fence-A violation: pkg/primitive/macro_investment_clock cannot import pkg/application [depguard]
# (exit non-zero)
```

**Step 3.3 — Capture the output:**
Write down the exact exit code (should be non-zero, e.g., 1) and the error message mentioning "fence-a" or "depguard".

**Step 3.4 — Revert the violation:**
```bash
# Remove the temporary import line from the file
# Run:
git checkout apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock.go
# OR manually delete the temporary import
```

**Step 3.5 — Re-run golangci-lint:**
```bash
cd apps/macro-indicators
golangci-lint run
# Should exit 0 (no violations)
```

**Step 3.6 — Confirm clean:**
```bash
git status   # should show no staged changes
git diff     # should show zero diffs to tracked files
```

**Result:** Both outputs (exit non-zero with fence error + exit 0 clean) captured as evidence.

---

### AC-4: `.golangci.yml` Freeze Anchor Verified

**What to do:**
1. Verify that the most recent commit touching `.golangci.yml` is the P2-A1 commit (31597da4).
2. Check that the `macro-pre-ci` tag points to that same commit.
3. This ensures the freeze anchor is not drifting between P2-A1 and P2-A2.

**How to verify:**
```bash
git log --oneline apps/macro-indicators/.golangci.yml | head -1
# Should show: 31597da4 (or the commit that created the file)

git log --oneline macro-pre-ci | head -1
# Should also show: 31597da4

# Both must match
```

**Result:** Freeze anchor confirmed. `.golangci.yml` has not been modified since P2-A1.

---

### AC-5: G12 Sandbox Green + R-1 Guard

**What to do:**
1. Run the full sandbox to ensure the dashboard logic is untouched:
   ```bash
   cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
   ```
2. Run the R-1 determinism check:
   ```bash
   grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/
   ```

**Expected results:**
- Sandbox exits 0 with output: `total=5 pass=5 fail=0 status=OK`
- R-1 grep exits 1 (zero matches)

**Result:** G12 DoD gate satisfied. No randomization introduced.

---

## Out of Scope

- Do NOT modify `apps/technical-analysis/` (TA pilot FROZEN).
- Do NOT modify `docs/data/pilot-status-macro-indicators.json` (SSOT, PM-owned).
- Do NOT push the `macro-pre-ci` tag to remote.
- Do NOT modify root `.golangci.yml` (each pilot has its own if needed).
- Do NOT run the full CI locally — just verify the workflow YAML is syntactically correct.
- Do NOT commit the deliberate violation line to any branch (violation is local-only, reverted before commit).

---

## Commit Steps

1. **Tag the freeze anchor (before any edits):**
   ```bash
   git tag macro-pre-ci HEAD
   git log --oneline macro-pre-ci  # verify
   ```

2. **Edit `.github/workflows/ci.yml` to add the macro-go-lint job:**
   - Use the YAML snippet from AC-2.
   - Confirm no syntax errors: `yamllint .github/workflows/ci.yml` (if available) or manual inspection.

3. **Stage the workflow file explicitly (L84 rule):**
   ```bash
   git add .github/workflows/ci.yml
   ```

4. **Run the hard gates one more time:**
   ```bash
   git merge-base --is-ancestor 1776df8e HEAD; echo $?          # must = 0
   cd apps/macro-indicators && golangci-lint run               # must = 0
   cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all  # must = 0 + pass=5
   grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/  # must = 1
   ```

5. **Commit with the subject pattern:**
   ```bash
   git commit -m "feat(macro-indicators): P2-A2 — CI go-lint job + macro-pre-ci tag (G4 AC-4a/4b/4c)"
   ```

6. **Verify anchor post-commit:**
   ```bash
   git merge-base --is-ancestor 1776df8e HEAD; echo $?  # must = 0
   ```

---

## Evidence to Record

Before submitting the completion signal, paste the following to the completion signal document (`docs/signals/dev-macro-p2-a2-done-<UTC>.json`):

1. **Deliberate violation proof:**
   - Violation added to: (file path)
   - Linter output (exit non-zero): (paste full output)
   - Linter output (exit 0 after revert): (paste full output)

2. **CI workflow changes:**
   - Job name: (e.g., `macro-go-lint`)
   - Working directory: `apps/macro-indicators`
   - Trigger: push to main

3. **Tag confirmation:**
   - Tag name: `macro-pre-ci`
   - Tagged commit: (SHA, should match P2-A1)
   - `git log --oneline macro-pre-ci` output: (paste)

4. **Sandbox evidence:**
   - Sandbox exit code: 0
   - Output: `total=5 pass=5 fail=0 status=OK`

5. **R-1 grep exit code:** 1

6. **Anchor checks:**
   - Pre-commit: 1776df8e ancestor? exit 0
   - Post-commit: 1776df8e ancestor? exit 0

---

## Completion Signal Format

When you have verified all 5 ACs, create a completion signal at:
```
docs/signals/dev-macro-p2-a2-done-<UTC>.json
```

**Signal structure:**
```json
{
  "timestamp": "2026-05-23T...",
  "cycle": "c282-cycle-NNN (dev dispatch)",
  "role": "dev-macro-indicators",
  "event": "P2-A2 DONE",
  "task": "P2-A2",
  "status": "READY_FOR_QA",
  "impl_commit": "<commit-sha>",
  "ac_results": [
    { "ac": "AC-1", "status": "PASS", "evidence": "macro-pre-ci tag on 31597da4" },
    { "ac": "AC-2", "status": "PASS", "evidence": "CI job added to .github/workflows/ci.yml" },
    { "ac": "AC-3", "status": "PASS", "evidence": "deliberate_violation_proof_exit_nonzero: <output>, deliberate_violation_proof_exit_zero: <output>" },
    { "ac": "AC-4", "status": "PASS", "evidence": "freeze anchor verified 31597da4" },
    { "ac": "AC-5", "status": "PASS", "evidence": "sandbox total=5 pass=5 fail=0, R-1 exit=1" }
  ],
  "g4_status": "FULL_YES (after QA verification)",
  "hard_gates": {
    "anchor_pre": "0",
    "anchor_post": "0",
    "r1_exit": "1",
    "lint_exit": "0",
    "sandbox_exit": "0"
  },
  "next_step": "QA verification → flip G4 PARTIAL→YES in SSOT"
}
```

---

## Next Task (After QA GREEN)

PM cycle-44 will:
1. Read your completion signal
2. If all 5 ACs PASS: spawn QA for P2-A2 verification
3. On QA GREEN: flip G4 status PARTIAL → YES in SSOT
4. Dispatch P2-B2 (macro-pre-delete tag + git mv)

---

## Quick Reference: Hard Gates (Copy-Paste Ready)

```bash
# Anchor pre
git merge-base --is-ancestor 1776df8e HEAD; echo $?  # must = 0

# R-1 determinism
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/  # must exit 1

# Lint local
cd apps/macro-indicators && golangci-lint run  # must exit 0

# G12 sandbox
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all  # must = total=5 pass=5 fail=0 status=OK

# Anchor post
git merge-base --is-ancestor 1776df8e HEAD; echo $?  # must = 0
```
