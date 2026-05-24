---
task_id: P2-B
task_title: ".golangci.yml Fence-A/B/C Creation + CI Job Wiring"
pilot: stock-price
phase: "2"
phase_plan_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md"
owner: dev-stock-price
blocked_by: "P2-A (DONE — stock-price-pre-ci tag verified 2026-05-24T00:00:00Z)"
blocks: "P2-C"
dispatch_date: "2026-05-24"
handoff_from: pm
handoff_to: dev-stock-price
---

# TASK P2-B — `.golangci.yml` Fence-A/B/C Creation + CI Job Wiring

**Owner:** dev-stock-price  
**Phase:** 2 (G4 partial advancement — NO goal flip)  
**WIP slot:** 1 of 1 (sequential)  
**Estimated effort:** 1 hour  
**Total ACs:** 5 (all acceptance criteria below)

---

## Background

stock-price is Go (same proven path as TA + macro pilots). Three depguard fences mirror the macro `.golangci.yml` structure exactly, adapted for stock-price primitives/module paths. The config is created AFTER the pre-ci tag (P2-A, verified DONE) so the freeze anchor is unambiguous.

**Pre-condition check (DONE):**
```
tag stock-price-pre-ci: db3ca097 (chore(pm/stock-price): Phase-2 OPEN + P2-A pre-ci tag handoff)
Anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc: INTACT (ancestry-path non-empty)
```

---

## Acceptance Criteria

### AC-1: `.golangci.yml` File Created with THREE Named Depguard Rules

**Requirement:** `apps/stock-price/.golangci.yml` exists and contains a `depguard` linter configuration with THREE named rules:

- **fence-a**: `pkg/primitive/` — deny imports of `application`, `interface`, `infrastructure`, and `github.com/mattn/go-sqlite3`. Allow: stdlib + `pkg/domain`.
- **fence-b**: `pkg/module/` — deny imports of `application`, `interface`, `infrastructure`, and `github.com/mattn/go-sqlite3`. Allow: stdlib + `pkg/primitive/*` + `pkg/domain`.
- **fence-c**: `github.com/mattn/go-sqlite3` (and `pkg/infrastructure`) importable only from `cmd/server/` (deny from primitive, module, and interface zones). Exclusions: `!**/cmd/server/main.go`, `!**/*_test.go`.

Config includes `run.timeout: 120s`. File is ≤80 lines.

**Verification command:**
```bash
test -f apps/stock-price/.golangci.yml && \
  grep -c "depguard" apps/stock-price/.golangci.yml && \
  wc -l apps/stock-price/.golangci.yml
```

Expected: file exists, ≥1 depguard section, ≤80 lines.

**Evidence to paste here:**
[After completion, paste: file listing + line count + grep output for "fence-a\|fence-b\|fence-c"]

---

### AC-2: Current Codebase Passes Clean Lint Run

**Requirement:** `cd apps/stock-price && golangci-lint run` exits 0 on the CURRENT codebase (no fence violations exist in existing Phase-1 code — primitives and module are already stdlib-only).

**Verification command:**
```bash
cd apps/stock-price && golangci-lint run
echo "Exit code: $?"
```

Expected: Exit code = 0 (zero fence violations).

**Evidence to paste here:**
[After completion, paste: full linter output (or "Exit code: 0")]

---

### AC-3: CI Job Wired in `.github/workflows/ci.yml`

**Requirement:** `.github/workflows/ci.yml` includes a job named `stock-price-go-lint` with `working-directory: apps/stock-price` that runs `golangci-lint run`. Evidence: the job exists and is callable in CI.

**Verification command:**
```bash
grep -n "stock-price-go-lint\|stock-price" .github/workflows/ci.yml
```

Expected: ≥1 match containing the job name `stock-price-go-lint` or `stock-price` in a job definition block.

**Evidence to paste here:**
[After completion, paste: grep output showing job definition lines]

---

### AC-4: `.golangci.yml` Freeze Anchor Established

**Requirement:** `git log --oneline apps/stock-price/.golangci.yml` shows ONLY P2-B as the most recent commit on that file (establishes the freeze anchor path for AC-4c verification in P2-D).

**Verification command:**
```bash
git log --oneline apps/stock-price/.golangci.yml | head -1
```

Expected: Single commit from this P2-B task is the MOST RECENT commit on the file.

**Evidence to paste here:**
[After completion, paste: commit SHA + subject of the P2-B commit touching .golangci.yml]

---

### AC-5: G12 DoD Gate — Sandbox Runs Green

**Requirement:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0. All scenarios PASS. Paste output summary to handoff doc.

**Verification command:**
```bash
cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
echo "Sandbox exit code: $?"
```

Expected: Exit code = 0. All scenarios show PASS status.

**Evidence to paste here:**
[After completion, paste: full sandbox output]

---

## Files Touched

- **CREATE:** `apps/stock-price/.golangci.yml` (~50–80 lines)
- **MODIFY:** `.github/workflows/ci.yml` (add job `stock-price-go-lint` with `working-directory: apps/stock-price`)

---

## Commit Instructions

**Commit subject pattern:**
```
feat(stock-price): P2-B — .golangci.yml Fence-A/B/C + CI go-lint job (G4 partial)
```

**Staging (L84 explicit-file rule — MANDATORY):**
```bash
git add -f apps/stock-price/.golangci.yml
git add .github/workflows/ci.yml
git commit -m "feat(stock-price): P2-B — .golangci.yml Fence-A/B/C + CI go-lint job (G4 partial)"
```

**No destructive git:** No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push`.

---

## Hard Constraints (Inherited from Phase 2 Plan)

| Constraint | Rule | Verification |
|---|---|---|
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD | `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD \| tail -1` → non-empty |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` | Verify staging with `git status --short` |
| **Fence-A spec** | `pkg/primitive/*/` imports stdlib only — no module, application, interface, infrastructure, no `mattn/go-sqlite3` | `cd apps/stock-price && golangci-lint run` exits 0 |
| **Fence-B spec** | `pkg/module/*/` imports primitives + stdlib only — no application, infrastructure, interface, no `mattn/go-sqlite3` | Same as Fence-A |
| **Fence-C spec** | `mattn/go-sqlite3` + `pkg/infrastructure` importable ONLY from `cmd/server/main.go` | Same as Fence-A |
| **G12 DoD gate** | `go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all` exits 0 BEFORE DONE | Sandbox all-green evidence to handoff |
| **No goal flips** | Phase 2 forbids any G-goal status changes; PO flips only at Phase 3 terminal | SSOT check: goalsEarned=0, decisionMatrix all TBD |

---

## After Completion

1. **Signal file:** Create `docs/signals/dev-sp-P2-B-done-<UTC>.json` with:
   ```json
   {
     "from": "dev-stock-price",
     "to": "pm",
     "type": "task-done",
     "priority": "high",
     "createdAt": "2026-05-24T<HH:MM:SSZ>",
     "payload": {
       "pilot": "stock-price",
       "phase": "2",
       "task": "P2-B",
       "fence_rules": ["fence-a", "fence-b", "fence-c"],
       "ci_job_name": "stock-price-go-lint",
       "sandbox_exit_code": 0,
       "ac_verdicts": {
         "AC-1": "PASS — .golangci.yml with 3 named rules created",
         "AC-2": "PASS — golangci-lint run exits 0",
         "AC-3": "PASS — CI job stock-price-go-lint wired",
         "AC-4": "PASS — freeze anchor established on .golangci.yml",
         "AC-5": "PASS — sandbox all-green"
       },
       "next_actor": "pm",
       "next_action": "verify P2-B DONE, dispatch P2-C"
     }
   }
   ```

2. **PM action:** After P2-B signal received, PM will:
   - Verify all 5 ACs PASS
   - Update SSOT: `phase2.current_task = P2-C`
   - Dispatch P2-C (QA task — deliberate-violation proof)

---

## Phase 2 Goal Advancement

**Goals advanced in this task:** G4 (partial — setup only; no flip)  
**Goals NOT flipped:** ALL (§4.5 PO-only at Phase 3 terminal)  
**SSOT mutation rule:** PM-owned SSOT updated ONLY by PM after DONE signal; dev does NOT touch.

---

## Reference Links

- **Phase 2 Task Plan:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` (§P2-B, lines 192–241)
- **Pilot Status SSOT:** `docs/data/pilot-status-stock-price.json` (phase2.tasks.P2-B)
- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` (§G4 goal)
- **Brownfield Inventory:** `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md` (§3 fence requirements)

---

## Notes

- P2-A pre-ci tag verified 2026-05-24T00:00:00Z at commit db3ca097
- P2-B is the ONLY way fences are wired; deliberate violation proof (P2-C) will use this fence
- No fence violations are expected in the current codebase — Phase 1 primitives/module are already stdlib-only
- CGO sandbox fence (`CGO_ENABLED=0 go build ./cmd/sandbox`) is a separate concern; AC-5 checks normal sandbox
- After P2-B DONE, P2-C (QA) will deliberately violate Fence-A to prove the linter catches it
