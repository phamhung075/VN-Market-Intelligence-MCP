# Sprint CI-RED-RECONCILE — dev-technical-analysis Decisions

## STEP: FIX-TA-GOLANGCI-CONFIG-V2

**Date:** 2026-06-08
**Agent:** dev-technical-analysis
**Task:** FIX-TA-GOLANGCI-CONFIG-V2
**Sprint:** CI-RED-RECONCILE

### Root cause

`apps/technical-analysis/.golangci.yml` retained the v1 schema after the `FIX-CI-LINT-STACK` migration (commit dd79f811) bumped `golangci-lint-action` to v7 (which installs golangci-lint v2.0.2). golangci-lint v2 rejects any config without a top-level `version: "2"` key with exit 3 (`unsupported version of the configuration: ""`). The other 5 sibling services were already migrated; this config was the only miss.

### Changes applied

File: `apps/technical-analysis/.golangci.yml`

v1 → v2 schema migration:
1. Added `version: "2"` at top level.
2. `run.go: "1.22"` removed (v2 dropped this key); replaced with `run.timeout: 120s` (matches all 5 sibling configs).
3. `linters.disable-all: true` → `linters.default: none` (v2 renamed field).
4. Top-level `linters-settings:` block moved into `linters.settings:` nested under `linters:` (v2 schema change).
5. Removed `Main:` allow-list rule under `depguard.rules` — v2 sibling configs do not use this pattern; the three deny-list fence rules (fence-a, fence-b, fence-c) are preserved intact and unchanged.

### Local verification

`cd apps/technical-analysis && golangci-lint run` → exit 1 (lint violations found), NOT exit 3.

Exit 3 = config parse failure (was the CI blocker). Exit 1 = lint issues surfaced = config is valid and lint is running.

The exit 1 violation (`cmd/sandbox/main.go:44` Fence-C infra import) is a pre-existing real depguard violation already tracked as `FIX-TA-SANDBOX-DEPGUARD` (backlog, medium priority). It is NOT introduced by this change and is NOT the CI-RED-RECONCILE blocker.

### Status

REVIEW / await-push. Local lint pass (config valid) confirmed. DONE gate = GREEN ci.yml after subsequent push per VERIFICATION GATE.

---

## STEP: FIX-TA-SANDBOX-DEPGUARD

**Date:** 2026-06-08
**Agent:** dev-technical-analysis
**Task:** FIX-TA-SANDBOX-DEPGUARD
**Sprint:** CI-RED-RECONCILE

### Root cause

`cmd/sandbox/main.go` imported `pkg/infrastructure` (line 44) to obtain `infrastructure.NewTACalculator()` for use in `newTestServer()`. Fence-C in `.golangci.yml` denies `pkg/infrastructure` imports from all files except `cmd/server/main.go` (the composition root). The v1 golangci config was masking this; the v2 migration (FIX-TA-GOLANGCI-CONFIG-V2) surfaced it as a hard lint violation.

### Decision

Option considered but rejected: move `cmd/sandbox` to an allowed location (e.g. `cmd/server/main.go`-level). Rejected — sandbox is a separate binary with different wiring concerns; it should not contaminate the production composition root.

Option applied: add a `sandboxCalculator` local adapter inside `cmd/sandbox/main.go` that satisfies `application.TACalculator` by delegating to `module.Compute` directly. This is architecturally correct: the sandbox composition root constructs its own test adapter at its own layer, identical in behavior to `infrastructure.TACalculator` but without crossing the fence. The sandbox already imports `pkg/module` and `pkg/domain`, so no new transitive dependencies are introduced.

### Changes applied

File: `apps/technical-analysis/cmd/sandbox/main.go`

1. Removed import: `"github.com/vn-market-intelligence/technical-analysis/pkg/infrastructure"`.
2. Added import: `"github.com/vn-market-intelligence/technical-analysis/pkg/domain"`.
3. Added `sandboxCalculator` struct + `Calculate` method (mirrors `infrastructure.TACalculator`, delegates to `module.Compute`, maps `dc.CrossEvent` → `domain.CrossSignal`).
4. `newTestServer()`: replaced `infrastructure.NewTACalculator()` with `&sandboxCalculator{}`.

### Local verification

- `golangci-lint run ./...` → exit 0, 0 issues.
- `go build ./cmd/...` → exit 0.
- `go test ./...` → all packages pass.
- `go run ./cmd/sandbox -tier=service -scenario=health-ok.json` → GREEN.
- `go run ./cmd/sandbox -tier=service -scenario=indicators-happy-path.json` → GREEN.

### Status

DONE-CODE-LOCAL-GREEN / REVIEW. Push + CI green run owned by router (per VERIFICATION GATE).
