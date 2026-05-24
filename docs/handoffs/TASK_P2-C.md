---
task_id: P2-C
task_title: "G4 Deliberate-Violation Proof (AC-4b) — Fence-A violation, non-zero exit, reverted"
owner: "qa"
phase: "2"
pilot: "stock-price"
blocked_by: "P2-B (DONE — d5ce886e, golangci.yml freeze anchor established)"
blocks: "P2-D (G4 freeze anchor confirmation)"
scheduled_for: "2026-05-24 (sequential WIP=1)"
goal_focus: "G4 (Architecture fence enforced — offline depguard evidence)"
goal_flip_authorized: false
ssot_touch_forbidden: true
anchor_discipline: "Frozen anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc remains INTACT (no retag, no rewrite, no push)"

---

# TASK_P2-C — G4 Deliberate-Violation Proof

**Owner:** qa  
**Blocked by:** P2-B DONE (golangci.yml exists + passes clean run)  
**Blocks:** P2-D (G4 freeze anchor confirmation)  
**WIP=1:** Sequential execution (no parallel tasks within Phase 2)  
**Date:** 2026-05-24  
**Acceptance Criteria Count:** 5  

---

## Background

Task P2-B created the `.golangci.yml` file with three named depguard fence rules (fence-a, fence-b, fence-c) and wired the CI job. AC-4b of G4 requires **proof that the fence CATCHES a real violation**.

This task is the **deliberate-violation proof**. QA (and ideally the developer for comparison) will:
1. Deliberately inject a forbidden import into a primitive or module file (local-only, no commit)
2. Run `golangci-lint run` → confirm it exits non-zero and names the fence rule
3. Revert the violation immediately
4. Confirm lint exits 0 again + sandbox is still green
5. Ensure `git status` is clean (violation never staged, never committed)

**Critical discipline:** The violation MUST NEVER be committed. This is the most important safety gate in G4. A committed violation would corrupt the fence's integrity.

---

## Acceptance Criteria

### AC-1: Linter exits non-zero on violation run; output contains fence name

**Step 1 — Introduce a Fence-A violation (QA executes):**

```bash
# Open any primitive file, e.g., price-quote-normalizer
nano apps/stock-price/pkg/primitive/price-quote-normalizer/normalizer.go
# OR any other primitive under pkg/primitive/

# Add ONE import line that violates the fence. Example:
# - Add `import "github.com/mattn/go-sqlite3"` (forbidden by Fence-A)
# - OR add `import "github.com/vn-market-intelligence/stock-price/pkg/infrastructure"` (forbidden by Fence-A)

# IMPORTANT: Save the edit locally but do NOT stage or commit.
```

**Step 2 — Run linter:**

```bash
cd apps/stock-price
golangci-lint run
```

**Expected outcome:** Non-zero exit code. Output must contain:
- The word `fence-a` or `Fence-A` (case-insensitive)
- The file name that contains the violation

**Evidence:** Paste the full linter output (including exit code) to section **§Evidence — AC-1 Violation Run** below.

**AC-1 PASS** if:
- `golangci-lint run` exits with non-zero code ✓
- Output names the fence rule (fence-a / fence-b / fence-c) ✓
- Output identifies the violating file ✓

---

### AC-2: Linter exits 0 after revert

**Step 3 — Revert the violation immediately:**

```bash
cd apps/stock-price
git checkout -- apps/stock-price/pkg/primitive/price-quote-normalizer/normalizer.go
# (or whichever file was edited in Step 1)
```

**Step 4 — Confirm clean linter run:**

```bash
cd apps/stock-price
golangci-lint run
```

**Expected outcome:** Exit code 0. No fence violations reported.

**Evidence:** Paste the linter output to section **§Evidence — AC-2 Clean Run** below.

**AC-2 PASS** if:
- `golangci-lint run` exits 0 ✓
- Output shows `0 issues` ✓

---

### AC-3: Git status is clean (violation never staged/committed)

**Step 5 — Confirm git status:**

```bash
git status --short
```

**Expected outcome:** No lines appear for any files under `apps/stock-price/pkg/primitive/`.

**Evidence:** Paste output to section **§Evidence — AC-3 Git Status Clean**.

**AC-3 PASS** if:
- `git status --short` returns empty (or shows no primitives) ✓
- The edited file is not staged ✓
- The edited file is not committed ✓

---

### AC-4: QA independently reproduces the violation proof on a different primitive file

**Step 6 — QA repeats the process with a DIFFERENT primitive:**

Using the same procedure as AC-1..AC-3, but on a different primitive file (e.g., if AC-1 tested `price-quote-normalizer`, AC-4 tests `tier-fallback-selector` or `price-staleness-classifier`):

1. Edit a different primitive file
2. Introduce a DIFFERENT forbidden import (e.g., if AC-1 used `mattn/go-sqlite3`, use `pkg/infrastructure` instead, or vice versa)
3. Run `golangci-lint run` → confirm non-zero exit + fence name in output
4. Revert the edit
5. Confirm lint exit 0 again

**Evidence:** Paste the full violation-run output + clean-run output to section **§Evidence — AC-4 QA Independent Reproduction**.

**AC-4 PASS** if:
- A second fence rule (or same fence rule, different primitive) was tested ✓
- Non-zero exit captured ✓
- Clean revert confirmed ✓
- This is QA's independent verification, NOT a copy-paste of dev's evidence ✓

---

### AC-5: G12 DoD gate — sandbox remains green after violation exercise

**After all reversions are complete:**

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

**Expected outcome:** Exit 0. All 11 scenarios pass. No code was actually changed (violations were reverted).

**Evidence:** Paste the final line of output (the `total=N pass=N fail=0 status=OK` summary) to section **§Evidence — AC-5 G12 DoD Gate**.

**AC-5 PASS** if:
- Sandbox exits 0 ✓
- `total=11 pass=11 fail=0 status=OK` ✓

---

## Evidence Sections

### §Evidence — AC-1 Violation Run

[QA: Paste full `golangci-lint run` output showing non-zero exit + fence rule name + file name here]

```
<paste_linter_output_here>
```

---

### §Evidence — AC-2 Clean Run

[QA: Paste full `golangci-lint run` output after revert, showing exit 0 + "0 issues" here]

```
<paste_linter_output_here>
```

---

### §Evidence — AC-3 Git Status Clean

[QA: Paste output of `git status --short` (should be empty or no primitives)]

```
<paste_git_status_here>
```

---

### §Evidence — AC-4 QA Independent Reproduction

[QA: Paste full violation-run + clean-run outputs for a DIFFERENT primitive file (not the one used in AC-1)]

**Violation Run (File: _____________):**
```
<paste_violation_output_here>
```

**Clean Run (after revert):**
```
<paste_clean_output_here>
```

---

### §Evidence — AC-5 G12 DoD Gate

[QA: Paste final line of sandbox output showing total=11 pass=11 fail=0 status=OK]

```
<paste_sandbox_summary_here>
```

---

## Commit & Signal

### No Violation Committed

This task produces **NO code commit for the violation itself**. Violations are local-only exercises that are reverted before any commit.

### Handoff Evidence Commit

After capturing all evidence in this handoff document (AC-1 through AC-5), QA stages this document and commits:

```bash
git add -f docs/handoffs/TASK_P2-C.md
git commit -m "$(cat <<'EOF'
docs(pm/stock-price): P2-C G4 deliberate-violation proof (Fence-A + Fence-B verified non-zero exit, reverted clean)

- AC-1 PASS: Fence-A violation introduced → golangci-lint non-zero exit + fence-a named
- AC-2 PASS: Violation reverted → golangci-lint exit 0
- AC-3 PASS: git status clean (violation never staged/committed)
- AC-4 PASS: QA independently reproduced with different primitive + different forbidden import
- AC-5 PASS: Sandbox remains green (total=11 pass=11 fail=0)

G4 deliberate-violation proof complete. Fence-A/B/C verified functional.
Violation NEVER committed — local-only exercise.

Task: P2-C (G4 violation proof)
Next: P2-D (G4 freeze anchor confirmation)
EOF
)"
```

### Completion Signal

After the commit, QA emits a completion signal:

```bash
cat > docs/signals/qa-sp-P2-C-g4-violation-proof-done-$(date -u +%Y%m%dT%H%M%SZ).json << 'EOF'
{
  "task": "P2-C",
  "pilot": "stock-price",
  "phase": "2",
  "goal_focus": "G4",
  "ac_verdicts": ["AC-1 PASS", "AC-2 PASS", "AC-3 PASS", "AC-4 PASS", "AC-5 PASS"],
  "violation_proof": "Fence-A violation introduced → non-zero exit + reverted clean (local-only, never committed)",
  "independent_reproduction": "AC-4 QA independently tested different primitive with different forbidden import",
  "g12_dod_gate": "PASS (sandbox 11/11 all-green after exercise)",
  "next_actor": "pm",
  "next_action": "verify P2-C evidence, update SSOT, dispatch P2-D"
}
EOF
```

---

## Key Constraints (Binding)

| Constraint | Rule |
|---|---|
| **Violation NEVER committed** | The injected import violation must be reverted before any `git commit`. If violation is committed, P2-C FAILS and PM escalates to architect. |
| **L84 explicit staging** | `git add -f docs/handoffs/TASK_P2-C.md` (explicit path, not `-A` or `.`) |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` |
| **Fence discipline** | Test BOTH fence-a (primitives) AND at least one of fence-b/fence-c. AC-1 can be fence-a; AC-4 can be fence-b or fence-c (proof the rule catches violations across zones). |
| **G12 DoD gate** | Sandbox must exit 0 after the exercise (AC-5). No actual code changes remain. |
| **Anchor INTACT** | Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor. No retag, no rewrite, no push. |
| **SSOT untouched** | PM owns `docs/data/pilot-status-stock-price.json`. QA does NOT modify it. |
| **Charter §4.5** | NO goal flips. G4 advances but does NOT flip to YES in this task. PO flips goals only at Phase 3 atomic close (12/12 terminal). |

---

## Success Criteria

All 5 ACs pass ✓ AND all 6 constraints honored ✓ → **P2-C = DONE**

Next task: **P2-D** (QA — G4 freeze anchor confirmation, AC-4c)

---

## References

- **Charter:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md
- **Phase 2 Task Plan:** docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md (§P2-C)
- **P2-B Deliverable:** docs/handoffs/TASK_P2-B.md (freeze anchor d5ce886e)
- **G4 Calibration:** Charter §G4 — "depguard via golangci-lint (SAME mechanism as TA+macro, NO SI-3/TS-fence dependency)"
- **Fence Rules:** apps/stock-price/.golangci.yml (fence-a/fence-b/fence-c)
- **L5 Lesson:** Pre-revert tag discipline (Fence-C mattn relocation verified in P2-B; P2-C proves fence catches violations)

---

**Handoff created by:** PM (2026-05-24T02:08:41Z)  
**Awaiting:** QA dispatch and evidence collection

