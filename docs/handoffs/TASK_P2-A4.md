---
task_id: P2-A4
title: "Offline deliberate-violation proof: prove fence enforcement (revised AC — no CI dependency)"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G4"]
files_touched:
  - "apps/technical-analysis/pkg/primitive/<any>/<file>.go (TEMP MODIFY in local working tree ONLY — add forbidden import, run linter, revert; NEVER committed, NEVER pushed)"
status: "PENDING"
blocked_by: ["P2-A3-prereq-fix-go-lint (revised cycle-22 dispatch)"]
unblocks: []
estimate_hours: 0.333
ac_count: 3
spec_revision: "docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md"
revision_landed: "2026-05-23T07:28:17Z (architect commit f8258e82)"
amendment_1_landed: "2026-05-23T08:30:00Z (architect commit 10aceb0c — AC-4c freeze anchor 9561fee9 → 9d364329)"
po_handoff_rewrite: "2026-05-23T07:30:40Z (cycle-22, supersedes original CI-rerun ACs)"
po_handoff_amendment_1_applied: "2026-05-23T07:42:40Z (cycle-23, AC-4c anchor + verdict updated + collision note retracted)"
---

# P2-A4 — Offline deliberate-violation proof: prove fence enforcement (revised AC — no CI dependency)

**Goal:** G4 (Architecture fence enforced in CI) — Final verification

**Description:**
QA proves the depguard Fence-A enforcement is real WITHOUT depending on a whole-CI green run. The revised proof has three narrow checks: (a) the CI job is correctly wired in the workflow file (verified by reading `.github/workflows/ci.yml`), (b) the linter actually blocks a Fence-A violation locally (verified by deliberate-violation scratch run that is never committed), (c) the `.golangci.yml` config has been frozen since P2-A1 close (verified by `git log`). Together these three offline checks artifact that the fence is real and not a false negative.

**Why revised:** Original AC required observing a CI run with `go-lint` job red on a violation commit and green on a revert commit. The whole-CI status conclusion is `failure` regardless of `go-lint` job exit because the parallel `bun test` job runs whole-monorepo legacy TS that will remain red until the G5 deletion chain (P2-B2..B4) completes. Per-job extraction (`gh run view <id> --json jobs --jq '.jobs[]|select(.name=="go-lint")|.conclusion'`) depends on three fragile surfaces (job name string stability, GitHub API response shape, grading agent correctly distinguishing job conclusion from run conclusion). The revised AC eliminates all whole-CI dependency. Full rationale: `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` §1.

---

## Files Touched

- `apps/technical-analysis/pkg/primitive/<any>/<file>.go` — TEMP MODIFY in local working tree ONLY (add forbidden import, run linter to capture output, revert). NEVER committed. NEVER pushed.
- `docs/handoffs/TASK_P2-A4.md` — append §Evidence to Record fields (frontmatter intact).

---

## Acceptance Criteria (revised — 3 ACs replace original 6)

### AC-4a — CI job exists and is correctly wired

The file `.github/workflows/ci.yml` contains a job named `go-lint` with:
- `uses: golangci/golangci-lint-action@v6.1.1`
- `working-directory: apps/technical-analysis` (or equivalent `with: working-directory:` key)
- `args: --config .golangci.yml`

This job runs on every `push` to `main` and every `pull_request` targeting `main`.

**Verification method:** QA reads `.github/workflows/ci.yml` directly. No API call required. Job name and wiring are deterministic in the file.

**Evidence to record (see §Evidence to Record):**
- Verbatim job-name line from the file
- Verbatim working-directory line from the file
- Verbatim args line from the file
- Line range cited (e.g., "lines 54-73 at commit fd423047")

---

### AC-4b — Local deliberate-violation proof (offline)

QA introduces 1 deliberate Fence-A violation **locally in the working tree** (e.g., adds `import "github.com/vn-market-intelligence/technical-analysis/pkg/module"` inside any file under `pkg/primitive/`), runs `golangci-lint run` from `apps/technical-analysis/`, and confirms the linter exits non-zero with a depguard **Fence-A** denial message.

QA then reverts the violation, runs `golangci-lint run` again, and confirms exit 0.

**The violation is NEVER committed or pushed.** It is a local scratch-run only. After revert, `git status` must show no changes.

**Evidence to record (see §Evidence to Record):**
- `violation_command`: exact `import` line added (verbatim)
- `violation_linter_output`: first error line from `golangci-lint run` output (MUST contain `Fence-A` substring)
- `violation_exit_code`: integer (MUST be non-zero)
- `revert_exit_code`: 0
- `git_status_after_revert`: must be "clean" (verbatim `git status --short` output should be empty)

This replaces the original P2-A4 design of committing a violation to a PR and relying on a CI run URL. The fence proof is identical in logical content; the CI run URL was an artifact of that proof, not the proof itself.

---

### AC-4c — Config is frozen; fence scope is unambiguous

`apps/technical-analysis/.golangci.yml` is at its current frozen state (committed `9d364329`). The file declares three fences:
- `fence-a` (primitive must not import module/application/interface)
- `fence-b` (module must not import application/interface)
- `fence-c` (infrastructure import only in cmd/server/main.go)

Config must NOT have been modified after `9d364329` (out_of_scope clause).

**Note:** `9d364329` converted the config from golangci-lint v2 format to v1 format to match `golangci-lint-action@v6.1.1`'s default binary (v1.64.8). The format conversion is semantic-neutral — all three fence rules are preserved identically (byte-for-byte semantic content). Full evidence: `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` §Amendment 1. Architect signal: `docs/signals/architect-g4-ac4c-amendment-20260523T083000Z.json`. PO adoption commit: cycle-23 (this file).

**Verification method:** `git log --oneline apps/technical-analysis/.golangci.yml` shows exactly two commits — `9561fee9` (P2-A1 config creation) then `9d364329` (v2→v1 format conversion) — and no commits after `9d364329`.

**AC-4c verdict:** PASS if `9d364329` is the most recent commit on this file; FAIL if any commit appears after `9d364329`.

**Evidence to record (see §Evidence to Record):**
- Verbatim `git log --oneline apps/technical-analysis/.golangci.yml` output

---

## Evidence to Record

QA fills in this block after running the three checks. PO uses this block to flip G4=YES atomic with cycle-close commit (matrix-authorship rule §4.5).

### AC-4a Evidence

```
ci.yml path: .github/workflows/ci.yml
job_name_line:        go-lint:
uses_line:                uses: golangci/golangci-lint-action@v6.1.1
working_directory:          working-directory: apps/technical-analysis
args_line:                args: --config .golangci.yml
line_range_cited:     lines 54-74
commit_at_read:       2a9a07e1c6a14a808c5a186eef6adb14b93f77cc
```

### AC-4b Evidence

```
violation_command:        _ "github.com/vn-market-intelligence/technical-analysis/pkg/application"
violation_file_path:      pkg/primitive/rsi/rsi.go
violation_linter_output:  pkg/primitive/rsi/rsi.go:9:2: import 'github.com/vn-market-intelligence/technical-analysis/pkg/application' is not allowed from list 'fence-a': Fence-A: primitive must not import application layer (depguard)
violation_exit_code:      1
revert_exit_code:         0
git_status_after_revert:  (empty — apps/technical-analysis/pkg/primitive/rsi/rsi.go not present in git status --short output)
```

### AC-4c Evidence

```
git_log_output:
9d364329 fix(technical-analysis): cycle-20 — golangci-lint findings on apps/technical-analysis (G4 unblock)
9561fee9 chore(arch/technical-analysis): P2-A1 — golangci-lint depguard Fence-A/B/C config
ac_4c_verdict:  PASS — 9d364329 is the most recent commit on apps/technical-analysis/.golangci.yml; no commits after it
```

---

## Smoke Check

```bash
# AC-4a
cat .github/workflows/ci.yml | head -80

# AC-4b
cd apps/technical-analysis
# (add deliberate import to a primitive file — see violation_command above)
golangci-lint run; echo "exit=$?"
# (revert the import)
git status --short  # MUST be empty
golangci-lint run; echo "exit=$?"

# AC-4c
git log --oneline apps/technical-analysis/.golangci.yml
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G4   | TBD-pending-AC-execution (fence enforcement proven by offline AC-4a/4b/4c instead of CI red/green cycle) |

---

## Dependencies

**Upstream:** P2-A3-prereq-fix-go-lint (revised cycle-22 dispatch must complete first). Path-B escalation resolved by architect 2026-05-23 commit `10aceb0c` — AC-4c amended to accept `9d364329` as the new frozen anchor (`docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` §Amendment 1). dev-ta cycle-22 work (fix lint findings, exit 0 on clean run) proceeds unchanged under AC-1/AC-2/AC-3.
**Downstream:** None (G4 complete after this task; G5 deletion chain P2-B2..B4 then proceeds).

---

## What changed vs original handoff

| Aspect | Original | Revised |
|---|---|---|
| AC count | 6 | 3 (AC-4a, AC-4b, AC-4c) |
| Proof mechanism | Commit violation to PR + observe CI red/green | Read workflow file + local scratch-run violation + git log on config |
| CI dependency | Yes (run URLs required) | None |
| Files committed | Yes (violation commit + revert commit) | None (violation never committed) |
| Brittleness | High (job name string + API shape + grading distinction) | Low (file reads + local exec) |

---

## Migration trail

- Original handoff: PR-based deliberate-violation proof (committed violation, observed CI red, committed revert, observed CI green, recorded 2 CI run URLs).
- Architect revision: `docs/architecture-briefs/2026-05-22-refactor/g4-acceptance-revision.md` (commit `f8258e82`, 2026-05-23T07:28:17Z).
- Architect signal: `docs/signals/architect-g4-revision-20260523T072817Z.json`.
- PO handoff rewrite: cycle-22, 2026-05-23T07:30:40Z (this commit).
- PO revised dispatch: `docs/signals/po-cycle22-dispatch-dev-ta-fix-go-lint-revised-20260523T073040Z.json`.
- PO supersede marker for cycle-20: `docs/signals/po-cycle20-dispatch-dev-ta-fix-go-lint-20260523T064034Z-superseded.json`.
