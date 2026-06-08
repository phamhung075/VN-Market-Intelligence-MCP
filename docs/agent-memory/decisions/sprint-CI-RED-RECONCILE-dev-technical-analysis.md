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
