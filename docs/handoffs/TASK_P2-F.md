---
task_id: P2-F
pilot: stock-price
phase: 2
title: "G5a — git mv Superseded Domain/Application Logic to pkg/_deprecated/"
owner: dev-stock-price
blocked_by: P2-E (DONE — stock-price-pre-delete tag confirmed)
blocks: P2-G (G5b/G5c audit)
task_plan_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md §P2-F"
charter_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md"
ssot_ref: "docs/data/pilot-status-stock-price.json"
language: "Go"
goal_track: "A (Trust Foundation)"
goals_advanced: ["G5a"]
goals_flip_status: "NO — no goal status flips in Phase 2 per Charter §4.5"
ac_count: 6
---

# TASK P2-F — G5a: `git mv` Superseded Domain/Application Logic to `pkg/_deprecated/`

**Pilot:** stock-price (fleet pilot 3)  
**Phase:** 2  
**Owner:** dev-stock-price  
**Blocked by:** P2-E DONE (stock-price-pre-delete tag locked at `d540f940...`)  
**Blocks:** P2-G (G5b/G5c audit)  
**AC count:** 6  
**Estimate:** ~1h  
**Goal scope:** G5a (file deprecation + rewire)

---

## Background

Per brownfield inventory §4 and phase-1-task-plan-go.md §OQ-2:

- `apps/stock-price/pkg/domain/services.go` contains `ResolvePriceService`, the predecessor implementation of the `price_resolution` module.
- When the module shipped and was validated (Phase 1 DONE), the old service became superseded.
- **G5a task:** Move the deprecated service to `pkg/domain/_deprecated/services_v1.go` (and its tests) using `git mv` to **preserve history**.
- Simultaneously, rewire `pkg/application/usecases.go` (`FetchPriceUseCase`) to call the module's `Resolve()` method instead of importing `ResolvePriceService`.
- The moved files remain compilable under their new path — they are NOT deleted, just archived.

**Pre-revert tag protection:**  
The `stock-price-pre-delete` tag (created in P2-E) marks the rollback point before this mutation. If any fence violation is introduced by the `git mv` or rewire, the tag allows instant rollback.

---

## Pre-condition Check (MUST PASS BEFORE ANY FILE EDIT)

```bash
git log --oneline stock-price-pre-delete
```

Must return the P2-E commit (proving the tag exists before this mutation). **If the tag is missing, STOP immediately.**

---

## Acceptance Criteria

### AC-1 — G5a File Moved

**Action:**
```bash
git mv apps/stock-price/pkg/domain/services.go \
        apps/stock-price/pkg/domain/_deprecated/services_v1.go

git mv apps/stock-price/pkg/domain/services_test.go \
        apps/stock-price/pkg/domain/_deprecated/services_v1_test.go
```

**Verification:**
```bash
test -f apps/stock-price/pkg/domain/_deprecated/services_v1.go && echo FOUND
test -f apps/stock-price/pkg/domain/services.go && echo STILL_EXISTS
```

**Expected result:**
- First command echoes `FOUND`.
- Second command echoes nothing (original path is gone — `git mv` removed the old path).
- `git status --short` shows two deletions (`D`) + two additions (`A`) for the moved files.

**Pass:** File moved successfully via `git mv` (history preserved).

---

### AC-2 — Application Use Case Rewired

**Action:**  
Edit `apps/stock-price/pkg/application/usecases.go`:
- Remove the import: `github.com/yourmodule/stock-price/pkg/domain/services` (or however it is imported).
- Remove the direct instantiation or call to `NewResolvePriceService()` or `ResolvePriceService{}`.
- Update `FetchPriceUseCase.Execute()` to call `f.priceResolutionModule.Resolve()` instead (inject the module as a dependency).
- Ensure the module method signature is compatible with the use case's expectations (adjust parameters/return if needed).

**Verification:**
```bash
grep -n "ResolvePriceService\|NewResolvePriceService" \
  apps/stock-price/pkg/application/usecases.go
```

**Expected result:** Returns 0 matches (no direct references to the old service remain).

**Pass:** Use case no longer imports or calls the deprecated domain service directly.

---

### AC-3 — Build Clean

**Action:**
```bash
cd apps/stock-price && go build ./...
```

**Expected result:** Exit code 0. The deprecation move and rewire did not break compilation.

**Pass:** All packages build successfully.

---

### AC-4 — Fence-A/B Clean Post-Move

**Action:**
```bash
cd apps/stock-price && golangci-lint run
```

**Expected result:** Exit code 0. No new fence violations introduced by the `git mv` or use-case rewire.

**Important:** The `_deprecated/` directory is still within `pkg/domain/` (NOT primitive), so no Fence-A boundary crossing is expected. However, verify that the moved code does not violate any fence rules.

**Pass:** Linter passes; all fences intact.

---

### AC-5 — G12 DoD Gate: Sandbox All-Green

**Action:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

**Expected result:** Exit code 0. All scenarios pass after the deprecation move.

**Important:** The sandbox is built and run under `CGO_ENABLED=0`, so it does NOT import or call any CGO-dependent code (including the deprecated service if it had CGO deps). If the sandbox fails, verify that the `price_resolution` module is correctly wired as the replacement.

**Evidence:** Paste the full stdout/stderr output (scenario summary + exit code) to the section below.

**Pass:** Sandbox exit 0, all scenarios GREEN.

---

### AC-6 — `_deprecated/` Directory Exists with Moved Files

**Action:**
```bash
find apps/stock-price/pkg -path "*_deprecated*" -type f | sort
```

**Expected result:** Output includes:
- `apps/stock-price/pkg/domain/_deprecated/services_v1.go`
- `apps/stock-price/pkg/domain/_deprecated/services_v1_test.go`

**Pass:** Both files present in the `_deprecated/` subdirectory.

---

## Hard Constraints (Per Phase-2 Task Plan)

| Constraint | Rule | Status |
|---|---|---|
| **G12 DoD gate** | Sandbox `-tier=all -module=stock-price -scenario=all` must exit 0 BEFORE DONE | Checked in AC-5 |
| **Fence-A** | `pkg/primitive/*/` imports stdlib only (UNCHANGED in this task) | Inherited from P2-B |
| **Fence-B** | `pkg/module/*/` imports primitives + stdlib only (UNCHANGED in this task) | Inherited from P2-B |
| **Fence-C** | `mattn/go-sqlite3` importable ONLY from `cmd/server/main.go` (UNCHANGED in this task) | Inherited from P2-B |
| **L84 staging** | `git add <explicit-path>` per file. NEVER `git add -A` or `git add .` | Apply before commit |
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of source files | Enforced |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor before AND after commit | Verify after commit |
| **SSOT freeze** | Do NOT modify `docs/data/pilot-status-stock-price.json` goals/decisionMatrix | PM-owned only |
| **Charter §4.5** | No goal flips — `decisionMatrix` stays `TBD`, `goalsEarned` stays 0 | Enforced by PM |

---

## Execution Flow

### Step 1: Pre-condition Check
```bash
git log --oneline stock-price-pre-delete | head -1
# Must return a commit SHA + message. If error, STOP.
```

### Step 2: Move Files via `git mv`
```bash
git mv apps/stock-price/pkg/domain/services.go \
        apps/stock-price/pkg/domain/_deprecated/services_v1.go

git mv apps/stock-price/pkg/domain/services_test.go \
        apps/stock-price/pkg/domain/_deprecated/services_v1_test.go
```

### Step 3: Verify Move (AC-1)
```bash
git status --short | grep "services"
# Should show: D pkg/domain/services.go, A pkg/domain/_deprecated/services_v1.go, etc.

find apps/stock-price/pkg -path "*_deprecated*" -type f | sort
# Should list the moved files.
```

### Step 4: Rewire FetchPriceUseCase (AC-2)
Edit `apps/stock-price/pkg/application/usecases.go`:
- Remove import of old service.
- Update `Execute()` to call the `price_resolution` module.
- Verify no grep matches for `ResolvePriceService`.

### Step 5: Build Check (AC-3)
```bash
cd apps/stock-price && go build ./...
```
Exits 0.

### Step 6: Lint Check (AC-4)
```bash
cd apps/stock-price && golangci-lint run
```
Exits 0.

### Step 7: Sandbox Green (AC-5)
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Exits 0. Paste output below.

### Step 8: Verify `_deprecated/` (AC-6)
```bash
find apps/stock-price/pkg -path "*_deprecated*" -type f | sort
```
Lists both moved files.

### Step 9: Stage Changes (L84 explicit paths)
```bash
git add apps/stock-price/pkg/domain/_deprecated/services_v1.go \
        apps/stock-price/pkg/domain/_deprecated/services_v1_test.go \
        apps/stock-price/pkg/application/usecases.go
```

### Step 10: Commit
```bash
git commit -m "chore(stock-price): P2-F — git mv ResolvePriceService → _deprecated/ + FetchPriceUseCase rewire (G5a)"
```

No `--force`, no `--no-verify`, no `--no-gpg-sign`.

### Step 11: Verify Anchor INTACT
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
# Must return non-empty (anchor is still ancestor of HEAD).
```

### Step 12: Emit Signal
Create `docs/signals/dev-sp-P2-F-git-mv-done-<UTC>.json`:
```json
{
  "pilot": "stock-price",
  "phase": 2,
  "task": "P2-F",
  "goal": "G5a",
  "action": "git mv deprecated domain logic + FetchPriceUseCase rewire",
  "status": "DONE",
  "commit_sha": "<commit SHA from step 10>",
  "ac_verdicts": {
    "AC-1": "PASS — services_v1.go + services_v1_test.go in _deprecated/",
    "AC-2": "PASS — FetchPriceUseCase no longer imports ResolvePriceService",
    "AC-3": "PASS — go build ./... exit 0",
    "AC-4": "PASS — golangci-lint run exit 0",
    "AC-5": "PASS — sandbox all-green",
    "AC-6": "PASS — _deprecated/ directory confirmed"
  },
  "next": "qa (P2-G)",
  "timestamp": "<ISO 8601>"
}
```

Stage the signal file (L84 explicit path) if required by PM.

---

## Evidence — Sandbox Output (AC-5)

**Paste full output of:**
```bash
cd apps/stock-price && go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

Below:

```
[Paste sandbox output here — must show exit 0 + all scenarios GREEN]
```

---

## Evidence — Pre-revert Tag Confirmation

**Confirm tag existed before this task:**
```bash
git log --oneline stock-price-pre-delete | head -1
```

Result: ___________________________________________

**Confirm anchor still INTACT after commit:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

Result: ___________________________________________

---

## File Checklist

- [ ] `apps/stock-price/pkg/domain/services.go` — moved to `_deprecated/` (original path gone)
- [ ] `apps/stock-price/pkg/domain/services_test.go` — moved to `_deprecated/` (original path gone)
- [ ] `apps/stock-price/pkg/domain/_deprecated/services_v1.go` — exists
- [ ] `apps/stock-price/pkg/domain/_deprecated/services_v1_test.go` — exists
- [ ] `apps/stock-price/pkg/application/usecases.go` — rewired to call module (no ResolvePriceService import)
- [ ] `apps/stock-price/.golangci.yml` — FROZEN (NOT MODIFIED — still d5ce886e)

---

## Commit Message

```
chore(stock-price): P2-F — git mv ResolvePriceService → _deprecated/ + FetchPriceUseCase rewire (G5a)
```

---

## Goal Flip Policy

**NO goal flips in this task.** Per Charter §4.5 and phase-2-task-plan-go.md §Pre-Phase 2 Summary:

- Task completion advances G5a but does NOT flip goal status to YES.
- `decisionMatrix` stays `TBD`.
- `goalsEarned` stays `0`.
- All 12 G-goals flip atomically in Phase 3 (PO-only, after P2-Z close-gate).

---

## Reference Links

- **Task plan:** docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md §P2-F
- **Brownfield inventory:** docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md §4
- **Phase 1 plan:** docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md §OQ-2
- **Charter:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md
- **SSOT:** docs/data/pilot-status-stock-price.json

---

## Next Task

**Blocked by:** P2-F DONE  
**Next task:** P2-G (G5b/G5c — MCP handler HTTP-port audit + zero TODO.*migrat)  
**Owner:** qa  
**Handoff path:** docs/handoffs/TASK_P2-G.md
