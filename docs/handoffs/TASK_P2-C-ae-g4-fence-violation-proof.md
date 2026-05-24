---
task_id: "P2-C"
task_title: "G4 Deliberate-Violation Proof (AC-4b) — Fence-A violation, non-zero exit proven, reverted, NEVER committed"
pilot: "alert-engine"
phase: "2"
owner: "dev-alert-engine (violation creator) + qa (independent reproduction)"
blocked_by: "P2-B DONE (.golangci.yml exists + golangci-lint exits 0 on clean source)"
blocks: "P2-D"
status: "READY"
sequenced_at: "2026-05-24T085000Z"
ac_count: 5
goal_advanced: "G4 (full enforcement proof)"
---

# TASK P2-C — G4 Deliberate-Violation Proof (AC-4b)

**Sequenced:** 2026-05-24T085000Z by PM  
**Pilot:** alert-engine (fleet pilot 5)  
**Phase:** 2 (G4, G5, G3, G9, G10, G11 closure)  
**Owner:** dev-alert-engine (violation creator) + qa (independent reproduction)  
**Predecessor:** P2-B DONE (commit 6c2edc9d, .golangci.yml + CI job wired)  
**Successor:** P2-D (G4 freeze anchor confirmation)  

---

## Context

THIS IS THE R-FENCE GATE (R = "Right, Does It Really Work?").

A `.golangci.yml` linter config can report `exit 0` while checking **nothing** if:
- The depguard rule name is deprecated
- The glob patterns do NOT match actual import paths
- The linter version does not support the config format

**"golangci-lint exit 0" alone does NOT prove the fence enforces.**

P2-B (the previous task) established the **config** — a green lint run is **CONFIG PROOF**, not **FENCE PROOF**.

P2-C proves the fence by injecting a **DELIBERATE VIOLATION** and confirming:
1. `golangci-lint run` exits **NON-ZERO**
2. The output contains `fence-a` or `Fence-A` and names the violating file
3. The violation is reverted (NEVER committed)
4. The clean run exits 0 again

Only after that confirmed non-zero exit does P2-C become DONE. If lint exits 0 on the violation run, P2-C **BLOCKS** — the fence is broken; investigate and fix the `.golangci.yml` config in-place before proceeding.

---

## CRITICAL DESIGN NOTE — Fence Exception & Meaningful Proof

**From charter verification round (router audit P2-B):**

The alert-engine `fence-c` block has a **principled exclusion** `!**/pkg/infrastructure/**` because `pkg/infrastructure` legitimately registers the `mattn/go-sqlite3` CGO driver as the infra implementation.

**Therefore, P2-C violation injection MUST target a FENCED layer to be meaningful:**

- **Inject the violation into `pkg/primitive/` (caught by fence-a) or `pkg/module/` (caught by fence-b)**
- Example: Add `import "github.com/mattn/go-sqlite3"` or `import "github.com/vn-market-intelligence/alert-engine/pkg/infrastructure"` into a file under `pkg/primitive/` or `pkg/module/`
- **Do NOT inject into `pkg/infrastructure/`** — that path is excluded by design; a green lint run would falsely look like the fence is broken, OR a violation there would not fire (either way meaningless)

If you inject into a fenced layer and lint exits 0, the fence is truly broken and requires investigation.

If you inject into the excluded layer and lint exits 0, that is **expected and proves nothing** — the exclusion is working as designed.

---

## Acceptance Criteria

---

### AC-1 — Linter Exits Non-Zero on Violation Run

**Instruction:**

1. **Step 1 — Create ONE temporary Fence-A violation**  
   Open `apps/alert-engine/pkg/primitive/signal-classifier/classifier.go`.  
   Add ONE import line that imports `github.com/mattn/go-sqlite3` (or any path from `pkg/infrastructure/`).  
   **DO NOT SAVE ANY COMMIT** — keep local-only.

2. **Step 2 — Run the linter**
   ```bash
   cd apps/alert-engine && golangci-lint run
   ```
   Must exit **non-zero**.  
   Output must contain `fence-a` or `Fence-A` in the depguard diagnostic and **name the violating file**.

3. **Step 3 — Revert the violation immediately**
   ```bash
   git checkout apps/alert-engine/pkg/primitive/signal-classifier/classifier.go
   ```

4. **Step 4 — Confirm clean linter run**
   ```bash
   cd apps/alert-engine && golangci-lint run
   ```
   Must exit 0.

5. **Step 5 — Confirm git status is clean**
   ```bash
   git status --short | grep "signal-classifier"
   ```
   Must show no changes (violation was reverted before any stage/commit).

**Expected output on violation run (Step 2):**
```
apps/alert-engine/pkg/primitive/signal-classifier/classifier.go:N:N:
  import "github.com/mattn/go-sqlite3" is not allowed (Fence-A: primitive must not import mattn/go-sqlite3 (CGO))
```

**Blocker condition:** If Step 2 exits 0 (fence did NOT catch the violation):
- P2-C is BLOCKED
- Investigate: (a) is `golangci-lint --version` compatible with the depguard config format? (b) do the `files` glob patterns in `.golangci.yml` match `pkg/primitive/**/*.go`? (c) do the `deny.pkg` values exactly match the Go module import paths?
- Fix the config in-place (do NOT retag `alert-engine-pre-ci`)
- Re-run the whole procedure from Step 1
- Do NOT proceed to P2-D until lint exits non-zero on the violation run

**Evidence to handoff:**
Full `golangci-lint run` output from the violation run (Step 2), showing non-zero exit + fence-a name + file path.

---

### AC-2 — Linter Exits 0 After Revert

**Instruction:**

After Step 3 (revert) and Step 4 (confirm clean run), paste the clean run output to handoff evidence.

```bash
cd apps/alert-engine && golangci-lint run
```

Must exit 0. No errors, no warnings.

**Evidence to handoff:**
Full `golangci-lint run` output from the clean run (Step 4), showing exit 0.

---

### AC-3 — Violation Never Staged or Committed

**Instruction:**

After Step 5, verify git status:
```bash
git status --short | grep "pkg/primitive"
```

Must return empty (no changes in pkg/primitive).

Run:
```bash
git log --oneline -5 | grep -i "ac-4b\|violation\|fence"
```

Must NOT show any commits with violation-related messages. The violation exists ONLY in local memory; the handoff documents the evidence; no committed code changed.

**Evidence to handoff:**
`git status --short` output confirming clean tree after revert.

---

### AC-4 — QA Independent Reproduction (Different Primitive File)

**Instruction (QA only):**

QA independently reproduces the violation proof on a **DIFFERENT primitive file** (e.g., `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`).

1. Open `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`
2. Add import `"github.com/vn-market-intelligence/alert-engine/pkg/infrastructure"` (different violation source than dev-alert-engine's test)
3. Run `cd apps/alert-engine && golangci-lint run` → must exit non-zero, output contains `fence-a` + file name
4. Revert `git checkout apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`
5. Run `cd apps/alert-engine && golangci-lint run` → must exit 0
6. `git status --short | grep dedup-key-builder` → must be empty

QA's `.golangci.yml` MUST be the SAME file that P2-B committed (no config changes permitted).

**Evidence to handoff:**
QA pastes their own violation-run linter output + clean-run output to the handoff under `§Evidence — QA Reproduction`.

---

### AC-5 — G12 DoD Gate (Sandbox Still Green)

**Instruction:**

The violation proof is local-only and reverted before any commit, so sandbox should remain green.

```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```

Must exit 0.

**Expected output:**
```
tier=primitive:
  signal-classifier golden: PASS
  signal-classifier edge: PASS
  signal-classifier failure: PASS
  ... (all 11 scenarios)
  
Total: 11 PASS, 0 FAIL
Status: OK
```

**Evidence to handoff:**
Paste sandbox output summary (≥11 scenarios PASS, exit 0).

---

## Evidence Section — Violation Proof Record

This section will be populated by dev-alert-engine during task execution:

### §Evidence — AC-1 Violation Run
```
[Paste full golangci-lint output from Step 2 — non-zero exit, fence-a name, file path]
```

### §Evidence — AC-2 Clean Run
```
[Paste full golangci-lint output from Step 4 — exit 0]
```

### §Evidence — AC-3 Status Check
```
[Paste git status --short output — should be clean/empty]
```

### §Evidence — QA Reproduction
```
[QA pastes their own violation + clean run outputs here — different primitive file]
```

### §Evidence — AC-5 Sandbox
```
[Paste sandbox output — 11/11 PASS, exit 0]
```

---

## Commit & Signal

**No violation committed.** Dev-alert-engine + QA commit the **HANDOFF EVIDENCE ONLY**:
- Update `docs/handoffs/TASK_P2-C-ae-g4-fence-violation-proof.md` with pasted linter outputs + sandbox output
- Stage only this handoff file (L84 explicit staging)
- Commit with subject:
  ```
  chore(alert-engine): P2-C — G4 Fence-A violation proof (non-zero caught + reverted, never committed)
  ```

QA will emit `docs/signals/qa-ae-P2-C-g4-violation-proof-done-<UTC>.json` with:
- `task: "P2-C"`
- `fence_gate_status: "PASS"` (non-zero exit observed + fence-a name in output)
- `violation_reverted: true` (never committed)
- `qa_reproduction: true` (QA did independent test)
- `sandbox_green_after: true` (11/11 PASS, exit 0)
- `next_actor: "qa"` (QA owns P2-D freeze anchor confirmation)

---

## G-Goal Posture

**No goal flips.** AC-4b is the R-FENCE proof arm of G4; G4 is not yet terminal.  
`goalsEarned` stays 0 (§4.5 SSOT untouched).  
`decisionMatrix` stays all-TBD (PO-only, after 12/12 terminal in Phase 3).

---

## Constraints (Inherited from Phase 2)

- **L84 staging:** `git add <explicit-path>` per file — NEVER `-A` or `.`
- **No destructive git:** no `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push`
- **Anchor INTACT:** `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor before AND after any commit
- **SSOT freeze:** Do NOT modify goal fields or decisionMatrix
- **SI-2 boundary:** DO NOT touch `docs/dashboards/index.html` (stock-price-EXCLUSIVE)
- **Fenced layers only:** Violation injection targets `pkg/primitive/` (fence-a) or `pkg/module/` (fence-b), NOT `pkg/infrastructure/` (excluded by design)

---

## Definition of Done

✓ AC-1: Linter exits non-zero on violation run; output contains `fence-a` + file name  
✓ AC-2: Linter exits 0 after revert  
✓ AC-3: `git status --short` clean after revert (violation NEVER committed)  
✓ AC-4: QA independently reproduces on different primitive file  
✓ AC-5: Sandbox green (11/11 PASS, exit 0) after violation reverted  

✓ Handoff evidence recorded (violation outputs + sandbox output pasted)  
✓ Commit created with evidence  
✓ Signal emitted (next_actor=qa for P2-D)  
✓ Anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc remains ancestor of HEAD  
✓ goalsEarned=0 + decisionMatrix all-TBD untouched
