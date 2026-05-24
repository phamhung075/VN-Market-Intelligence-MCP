---
task_id: "P2-F"
pilot: "alert-engine"
phase: "2"
title: "G5a — git mv domain/services.go → _deprecated/ + evaluate.go rewire"
owner: "dev-alert-engine"
blocked_by: "P2-E (alert-engine-pre-delete tag confirmed)"
blocks: "P2-G"
estimated_duration: "1.5 hours"
acceptance_criteria_count: 7
goal_advanced: "G5a"
goal_posture: "NO goal flips — §4.5 SSOT untouched."
---

# P2-F — G5a: `git mv` Superseded Domain Functions to `pkg/domain/_deprecated/`

**Owner:** dev-alert-engine  
**Blocked by:** P2-E DONE (`alert-engine-pre-delete` tag confirmed)  
**Blocks:** P2-G (G5b/G5c audit)  
**Files touched:**
- `apps/alert-engine/pkg/domain/services.go` → `apps/alert-engine/pkg/domain/_deprecated/services_v1.go` (MOVE via `git mv`)
- `apps/alert-engine/pkg/application/evaluate.go` (MODIFY — rewire to call `alert_pipeline` module instead of direct domain functions)
- `apps/alert-engine/pkg/domain/services_test.go` → `apps/alert-engine/pkg/domain/_deprecated/services_v1_test.go` (if present, MOVE via `git mv`)

---

## Background

Per brownfield scan and Phase-1 ledger:

- `pkg/domain/services.go` (ComputeFingerprint/djb2Hash + IsDuplicate + ShouldSuppressAlert + isToday helper, ~151 lines) is the Phase-1 predecessor of the `alert_pipeline` module. When the module is validated (Phase 1 DONE), these three pure functions are superseded by the extracted primitives (`dedup-key-builder`, `cooldown-gate`). The file moves to `pkg/domain/_deprecated/services_v1.go`.

- `pkg/application/evaluate.go` currently calls `domain.ComputeFingerprint` (L47), `domain.IsDuplicate` (L73), and `domain.ShouldSuppressAlert` (L88) directly. After the move, `EvaluateAlertUseCase.Execute()` must call the `alert_pipeline` module's composition logic instead of those direct domain function calls. The `alert_pipeline` module already provides the full pipeline via injected ports — the use case becomes a thin orchestrator that delegates.

- The existing unit test file `apps/alert-engine/pkg/domain/services_test.go` (if present) moves alongside the deprecated service file to `_deprecated/services_v1_test.go`. It remains compilable as deprecated tests and is NOT deleted.

- **Scope clarification:** `pkg/domain/models.go`, `pkg/domain/ports.go`, `pkg/domain/config.go` are NOT deprecated — they define types, ports, and config constants still used by infrastructure and the module. ONLY `services.go` (the pure functions now superseded by primitives) is deprecated.

---

## Pre-condition (mandatory — verify before any `git mv`)

```bash
git log --oneline alert-engine-pre-delete
```

Must return the P2-E commit (`ccef14fa`). If tag is missing, STOP and notify PM.

---

## Acceptance Criteria

### AC-1 — G5a file moved

```bash
test -f apps/alert-engine/pkg/domain/_deprecated/services_v1.go && echo FOUND
test -f apps/alert-engine/pkg/domain/services.go && echo STILL_EXISTS
```

First command echoes FOUND. Second command echoes nothing (original path is gone).

**Verdict:** _____ (PASS / FAIL)

---

### AC-2 — Application use case rewired (zero direct calls to deprecated functions)

```bash
grep -n "domain\.ComputeFingerprint\|domain\.IsDuplicate\|domain\.ShouldSuppressAlert" \
  apps/alert-engine/pkg/application/evaluate.go
```

Must return 0 matches. The use case no longer imports the deprecated domain service functions directly. It delegates through the `alert_pipeline` module ports.

**Verdict:** _____ (PASS / FAIL)

---

### AC-3 — Build clean

```bash
cd apps/alert-engine && go build ./...
```

Exits 0 (the deprecation move did not break compilation; deprecated service compiles under its new path).

**Verdict:** _____ (PASS / FAIL)

---

### AC-4 — Fence-A/B clean post-move

```bash
cd apps/alert-engine && golangci-lint run
```

Exits 0 (no new fence violations introduced by the `git mv` or the use-case rewire).

**Verdict:** _____ (PASS / FAIL)

---

### AC-5 — G12 DoD gate

```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```

Exits 0. Sandbox still green after deprecation move (≥11 scenarios PASS). Paste output summary to evidence section.

**Verdict:** _____ (PASS / FAIL)

---

### AC-6 — `_deprecated/` directory exists with moved file

```bash
find apps/alert-engine/pkg -path "*_deprecated*" -type f | sort
```

Output includes `services_v1.go` under the `_deprecated/` path. If services_test.go was moved, output also includes `services_v1_test.go`.

**Verdict:** _____ (PASS / FAIL)

---

### AC-7 — Fence-C still holds (infra not imported outside composition root)

```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure" \
  apps/alert-engine/pkg/domain/ \
  apps/alert-engine/pkg/application/ \
  apps/alert-engine/pkg/module/ \
  apps/alert-engine/pkg/primitive/
```

Must return 0 matches. Infra imports exist only in `cmd/server/main.go` (composition root).

**Verdict:** _____ (PASS / FAIL)

---

## Evidence Section

### Pre-condition Verification

```bash
git log --oneline alert-engine-pre-delete
```

Output:
```
[paste here]
```

### AC-1 Evidence (file moved)

```bash
test -f apps/alert-engine/pkg/domain/_deprecated/services_v1.go && echo FOUND
test -f apps/alert-engine/pkg/domain/services.go && echo STILL_EXISTS
```

Output:
```
[paste here]
```

### AC-2 Evidence (zero direct calls)

```bash
grep -n "domain\.ComputeFingerprint\|domain\.IsDuplicate\|domain\.ShouldSuppressAlert" \
  apps/alert-engine/pkg/application/evaluate.go
```

Output (must be empty):
```
[paste here]
```

### AC-3 Evidence (build clean)

```bash
cd apps/alert-engine && go build ./...
```

Output:
```
[paste here]
```

### AC-4 Evidence (lint clean)

```bash
cd apps/alert-engine && golangci-lint run
```

Output:
```
[paste here]
```

### AC-5 Evidence (sandbox green)

```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```

Output summary (≥11 scenarios PASS):
```
[paste here]
```

### AC-6 Evidence (deprecated path exists)

```bash
find apps/alert-engine/pkg -path "*_deprecated*" -type f | sort
```

Output:
```
[paste here]
```

### AC-7 Evidence (Fence-C holds)

```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure" \
  apps/alert-engine/pkg/domain/ \
  apps/alert-engine/pkg/application/ \
  apps/alert-engine/pkg/module/ \
  apps/alert-engine/pkg/primitive/
```

Output (must be empty):
```
[paste here]
```

---

## File Move and Rewire Instructions

### Step 1: Move deprecated service file

```bash
git mv apps/alert-engine/pkg/domain/services.go apps/alert-engine/pkg/domain/_deprecated/services_v1.go
```

### Step 2: Move test file (if present)

```bash
test -f apps/alert-engine/pkg/domain/services_test.go && \
  git mv apps/alert-engine/pkg/domain/services_test.go apps/alert-engine/pkg/domain/_deprecated/services_v1_test.go
```

### Step 3: Rewire evaluate.go

Open `apps/alert-engine/pkg/application/evaluate.go`. Locate lines 47, 73, 88 (or similar) calling the deprecated functions directly. Replace these calls with calls to the `alert_pipeline` module's composition logic. The module was instantiated and injected at the composition root (`cmd/server/main.go`). The use case should now receive the pipeline as a dependency and call it instead of the domain functions.

Example pattern (before):
```go
fingerprint := domain.ComputeFingerprint(alert)
isDup := domain.IsDuplicate(fingerprint)
suppress := domain.ShouldSuppressAlert(alert.ID, isDup)
```

Example pattern (after):
```go
result := s.pipeline.Evaluate(ctx, alert) // or similar — use the injected module
```

The exact wiring depends on the module's public API. Verify by running `go mod tidy` and building.

### Step 4: Verify pre-condition before commit

```bash
git log --oneline alert-engine-pre-delete
```

Confirm it returns `ccef14fa` or later.

### Step 5: Stage moved files

```bash
git add apps/alert-engine/pkg/domain/_deprecated/services_v1.go
git add -u apps/alert-engine/pkg/domain/services.go  # git mv auto-stages; verify with git status
```

If services_test.go was moved:
```bash
git add apps/alert-engine/pkg/domain/_deprecated/services_v1_test.go
git add -u apps/alert-engine/pkg/domain/services_test.go
```

### Step 6: Stage rewired evaluate.go

```bash
git add apps/alert-engine/pkg/application/evaluate.go
```

### Step 7: Run all AC tests

Before committing, run all ACs in the Evidence section above. All must PASS.

### Step 8: Commit

```bash
git commit -m "chore(alert-engine): P2-F — git mv domain/services.go → _deprecated/ + evaluate.go rewire to alert_pipeline (G5a)"
```

---

## Signal Specification

Create file: `docs/signals/dev-ae-P2-F-done-<UTC>.json`

Template:
```json
{
  "task": "P2-F",
  "pilot": "alert-engine",
  "phase": "2",
  "title": "G5a — git mv domain/services.go → _deprecated/ + evaluate.go rewire",
  "status": "DONE",
  "completed_at": "<ISO-8601 UTC timestamp>",
  "owner": "dev-alert-engine",
  "files_moved": [
    "apps/alert-engine/pkg/domain/services.go → apps/alert-engine/pkg/domain/_deprecated/services_v1.go",
    "apps/alert-engine/pkg/domain/services_test.go → apps/alert-engine/pkg/domain/_deprecated/services_v1_test.go (if present)"
  ],
  "files_rewired": [
    "apps/alert-engine/pkg/application/evaluate.go"
  ],
  "ac_verdicts": {
    "AC-1_file_moved": "PASS",
    "AC-2_zero_direct_calls": "PASS",
    "AC-3_build_clean": "PASS",
    "AC-4_fence_clean": "PASS",
    "AC-5_sandbox_green": "PASS",
    "AC-6_deprecated_path_exists": "PASS",
    "AC-7_fence_c_holds": "PASS"
  },
  "next_actor": "pm",
  "next_action": "mark P2-F DONE, sequence P2-G (G5b/G5c audit), update SSOT phase2.current_task"
}
```

---

## Goal Posture

**NO goal flips.** G5a advances but does NOT flip to YES here. All goal flips (including EARNED-PENDING → YES) are PO-only, in one atomic Phase-3 commit after ALL 12 goals reach terminal state simultaneously.

§4.5 SSOT untouched — `goalsEarned` stays 0, `decisionMatrix` stays all-TBD.

---

## Constraints

- Use `git mv` to preserve history — never delete + recreate.
- Keep `CGO_ENABLED=0 go build ./...` green.
- Keep sandbox 11/11 (or more).
- Keep `golangci-lint run` exit 0 — the move must not reintroduce fence violations.
- The `alert-engine-pre-delete` tag is the rollback anchor if the mv goes wrong. Verify it before starting.
- L84 staging: explicit paths only, never `-A` or `.`.

---
