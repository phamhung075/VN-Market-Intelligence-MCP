---
title: "G4 Acceptance Criteria Revision — Remove Whole-CI Dependency"
date: "2026-05-23"
author: "architect"
status: "ACTIVE"
supersedes_signal: "docs/signals/po-cycle20-dispatch-dev-ta-fix-go-lint-20260523T064034Z.json"
pilot: "technical-analysis"
goal: "G4"
---

# G4 Acceptance Criteria Revision

## 1. Problem Statement

Verbatim user message (cycle-19, 2026-05-23):

> "CI cannot show correct result because CI is run on complete project but we check only new factory repo."

The specific failure mode: the `go-lint` CI job added by P2-A2 runs in parallel to the `bun test` job in `.github/workflows/ci.yml`. A pushed commit causes a GitHub Actions workflow run. That run shows status `failure` regardless of `go-lint` exit code because the `bun test` job (whole monorepo legacy TS) is red and will remain red until the G5 deletion chain (P2-B2..B4) completes. Any gate that reads whole-run status (`gh run view <id> --json conclusion`) therefore reports RED even when `go-lint` is clean. Additionally, the per-job extraction approach (`gh run view <id> --json jobs --jq '.jobs[]|select(.name=="go-lint")|.conclusion'`) is fragile: it depends on the CI job name string being stable, the GitHub API response shape not changing, and the grading agent correctly distinguishing job-level conclusion from run-level conclusion — three independent failure surfaces for a single gate.

## 2. Original AC (from superseded signal)

Source: `docs/signals/po-cycle20-dispatch-dev-ta-fix-go-lint-20260523T064034Z.json`, field `acceptance`.

```
AC-1: `golangci-lint run` exits 0 on apps/technical-analysis (local).
AC-2: `go test ./...` exits 0 on apps/technical-analysis (local).
AC-3: sandbox primitives + modules 30/30 GREEN.
AC-4: CI go-lint job exits 0 on rerun.   ← CONTESTED — whole-CI dependency
AC-5: Completion signal written with all verification fields.
```

AC-4 is the contested criterion. The intent is sound — the fence must be wired into CI so a future violation fails the build. The mechanism (reading CI job conclusion after a monorepo-wide run) is unsuitable while the `bun test` job is structurally red.

## 3. Revised AC

The revised set keeps AC-1, AC-2, AC-3 unchanged. AC-4 is replaced by three narrow, durable checks (AC-4a, AC-4b, AC-4c) that together prove the fence is real without depending on whole-CI green. AC-5 absorbs the signal-writing requirement.

---

**AC-1 (unchanged):** `golangci-lint run` exits 0 locally on `apps/technical-analysis/`.

Evidence pointer: dev-technical-analysis completion signal field `golangci_lint_local_exit_code: 0`.

---

**AC-2 (unchanged):** `go test ./...` exits 0 on `apps/technical-analysis/`.

Evidence pointer: dev-technical-analysis completion signal field `go_test_local_exit_code: 0`.

---

**AC-3 (unchanged):** Sandbox 30/30 GREEN (`go run ./cmd/sandbox -tier=primitive` + `-tier=module`).

Evidence pointer: dev-technical-analysis completion signal field `sandbox_30_30_status: GREEN`.

---

**AC-4a — CI job exists and is correctly wired.**

The file `.github/workflows/ci.yml` contains a job named `go-lint` with:
- `uses: golangci/golangci-lint-action@v6.1.1`
- `working-directory: apps/technical-analysis` (or equivalent `with: working-directory:` key)
- `args: --config .golangci.yml`

This job runs on every `push` to `main` and every `pull_request` targeting `main`.

Verification method: QA reads `.github/workflows/ci.yml` directly. No API call required. Job name and wiring are deterministic in the file.

Evidence pointer: `.github/workflows/ci.yml` lines 54-73 (committed as of P2-A2 commit `fd423047`). QA quotes the job name and working-directory value verbatim in `docs/handoffs/TASK_P2-A4.md §Evidence to Record`.

---

**AC-4b — Local deliberate-violation proof (offline).**

QA or dev-technical-analysis introduces 1 deliberate Fence-A violation **locally** (e.g., adds `import "github.com/vn-market-intelligence/technical-analysis/pkg/module"` inside any file under `pkg/primitive/`), runs `golangci-lint run` from `apps/technical-analysis/`, and confirms the linter exits non-zero with a depguard `Fence-A` denial message.

QA then reverts the violation, runs `golangci-lint run` again, and confirms exit 0.

The violation is **never committed or pushed.** It is a local scratch-run only.

Evidence pointer: The before/after linter output is captured as a text block and pasted into `docs/handoffs/TASK_P2-A4.md §Evidence to Record`. Fields required:
- `violation_command`: exact `import` line added
- `violation_linter_output`: first error line from `golangci-lint run` output (must contain `Fence-A`)
- `violation_exit_code`: integer (must be non-zero)
- `revert_exit_code`: 0

This replaces the original P2-A4 design of committing a violation to a PR and relying on a CI run URL. The fence proof is identical in logical content; the CI run URL was an artifact of that proof, not the proof itself.

---

**AC-4c — Config is frozen; fence scope is unambiguous.**

`.golangci.yml` at `apps/technical-analysis/.golangci.yml` is at P2-A1 close state (committed `9561fee9`). The file declares three fences: `fence-a` (primitive must not import module/application/interface), `fence-b` (module must not import application/interface), `fence-c` (infrastructure import only in cmd/server/main.go). Config must not have been modified after P2-A1 close (out_of_scope clause in original dispatch).

Verification method: `git log --oneline apps/technical-analysis/.golangci.yml` shows no commits after `9561fee9`. QA runs this command and records the output in `TASK_P2-A4.md §Evidence to Record`.

Evidence pointer: `apps/technical-analysis/.golangci.yml` (frozen). `git log` output pasted in TASK_P2-A4.

---

**AC-5 (signal, formerly AC-5 from original):** Completion signal written at `docs/signals/dev-ta-cycle20-fix-go-lint-done-<UTC>.json` with all verification fields: `commit_sha`, `golangci_lint_local_exit_code`, `go_test_local_exit_code`, `sandbox_30_30_status`, and `g4_ci_dependency_dropped: true` (new field confirming the whole-CI AC-4 was superseded by this revision).

---

**Summary table:**

| AC | What it proves | Evidence location | CI dependency? |
|---|---|---|---|
| AC-1 | Lint clean on TA source | Completion signal | None |
| AC-2 | Tests pass on TA source | Completion signal | None |
| AC-3 | Scenarios green | Completion signal | None |
| AC-4a | CI job wired correctly in workflow file | `TASK_P2-A4.md §Evidence` | Read-only file check |
| AC-4b | Fence actually blocks violations | `TASK_P2-A4.md §Evidence` | None (local run) |
| AC-4c | Config frozen post-P2-A1 | `TASK_P2-A4.md §Evidence` + `git log` | None |
| AC-5 | Signal written, revision acknowledged | `docs/signals/dev-ta-cycle20-fix-go-lint-done-*.json` | None |

Total: 7 criteria (vs 5 original). The replacement is strictly more thorough on fence-wiring proof while eliminating all whole-CI dependency.

---

## 4. Evidence Pointers — Exact File and Field

| AC | File | Field / section |
|---|---|---|
| AC-1 | `docs/signals/dev-ta-cycle20-fix-go-lint-done-<UTC>.json` | `golangci_lint_local_exit_code` |
| AC-2 | `docs/signals/dev-ta-cycle20-fix-go-lint-done-<UTC>.json` | `go_test_local_exit_code` |
| AC-3 | `docs/signals/dev-ta-cycle20-fix-go-lint-done-<UTC>.json` | `sandbox_30_30_status` |
| AC-4a | `.github/workflows/ci.yml` | Job `go-lint` block (lines 54-73, commit `fd423047`) + `docs/handoffs/TASK_P2-A4.md §Evidence to Record` |
| AC-4b | `docs/handoffs/TASK_P2-A4.md §Evidence to Record` | `violation_command`, `violation_linter_output`, `violation_exit_code`, `revert_exit_code` |
| AC-4c | `apps/technical-analysis/.golangci.yml` (frozen at `9561fee9`) | `git log --oneline` output quoted in `TASK_P2-A4.md §Evidence to Record` |
| AC-5 | `docs/signals/dev-ta-cycle20-fix-go-lint-done-<UTC>.json` | `g4_ci_dependency_dropped: true` |

---

## 5. Migration Note for PO

**Recommendation: SUPERSEDE, do not amend.**

The in-flight dispatch `docs/signals/po-cycle20-dispatch-dev-ta-fix-go-lint-20260523T064034Z.json` should be treated as superseded by this revision. Rationale:

1. AC-4 in the original signal is structurally impossible to satisfy until G5 lands (the `bun test` job will remain red). Amending the signal in place leaves stale text that could confuse the grading agent in cycle-21.
2. The revised AC set changes the task body for P2-A4 specifically (offline violation proof instead of PR-based proof). A clean supersede is safer than a diff-patch on the in-flight JSON.
3. The `supersedes` field in the architect signal (`docs/signals/architect-g4-revision-<UTC>.json`) gives PO the explicit linkage for audit traceability.

**PO action steps:**
1. Read this revision file.
2. Re-dispatch dev-technical-analysis for the golangci-lint fix task with AC-1..AC-3 and the updated AC-5 (local fix work is unchanged).
3. Re-dispatch QA for P2-A4 with the new AC-4a/4b/4c (offline violation proof, workflow file read, git log check). The P2-A4 handoff at `docs/handoffs/TASK_P2-A4.md` will need its acceptance criteria block rewritten to match; PO authors that rewrite at dispatch time per §4.5 matrix-authorship binding.
4. On PASS of all revised AC → flip G4=YES per §4.5 rule (atomic with cycle-N close commit).

**What does NOT change:**
- The golangci-lint fix work itself (dev-technical-analysis must still fix whatever findings caused `go-lint` exit 3 on CI run 26319980090). AC-1/2/3 are identical.
- The P2-A4 scope (deliberate-violation proof). Only the mechanism shifts from CI-run to local run.
- The L84 explicit-file staging constraint, no --force, no --no-verify.
- Anchor `62edbf3d` held.
- §4.5 matrix-authorship binding unchanged — G4 grade is authored by PO only.

---

## 6. Impact on G5 Chain (P2-B0..B4)

**No change.** The G5 deletion chain gate rule was:

> "P2-B2 dispatch HELD per architect order; deletion can proceed only once fence proven."

The fence is proven when G4 flips YES. Under the revised AC, G4 can flip YES as soon as:

- AC-1/2/3: golangci-lint + go test + sandbox green locally (dev-technical-analysis completion signal)
- AC-4a/4b/4c: workflow file verified + offline violation proof + config frozen (TASK_P2-A4 QA verification)
- AC-5: signal written

This removes the whole-CI bottleneck from the G4→G5 gate. G5 deletion chain (P2-B2..B4) can proceed as soon as G4 flips YES under the revised criteria, without waiting for the `bun test` job to turn green.

The `bun test` job will turn green as a byproduct of P2-B2..B4 (old TS TA code deleted), which is the correct causal order: fence proven → deletion safe → legacy tests stop failing.

No task IDs change. No handoff files change except `TASK_P2-A4.md` (AC block rewrite by PO at dispatch).

---

## 7. Consistency Check — L84 Staging Discipline

This revision file is one of three files authored this cycle:
1. `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` (this file)
2. `docs/signals/architect-g4-revision-<UTC>.json` (PO pick-up signal)
3. `docs/agent-memory/notebooks/architect.md` (notebook entry)

All three are new or append-only mutations. No production code touched. No CI workflow touched. No agent flow files touched. L84 compliant.
