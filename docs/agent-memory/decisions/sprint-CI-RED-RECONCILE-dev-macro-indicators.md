# Sprint CI-RED-RECONCILE — dev-macro-indicators Decisions

## STEP: FIX-MACRO-GO-DIRECTIVE

**Date:** 2026-06-08
**Agent:** dev-macro-indicators
**Task:** FIX-MACRO-GO-DIRECTIVE
**Sprint:** CI-RED-RECONCILE

### Root cause

`apps/macro-indicators/go.mod` declared `go 1.25.0` — the sole over-declarer among all 6 Go services (the other 5 all declare `go 1.22`). golangci-lint v2.0.2 in CI is built with go1.24, which refuses to load config for a module targeting a newer Go version (`the Go language version (go1.24) used to build golangci-lint is lower than the targeted Go version (1.25.0)` → exit 3 before lint runs).

### Dependency finding (surfaced, not silently bypassed)

A prior `go mod tidy` run (executed with the local go1.26.2 toolchain) over-pinned two indirect deps in go.mod to versions that themselves require go 1.25.0:

- `golang.org/x/sys v0.42.0` — requires `go 1.25.0`
- `modernc.org/libc v1.72.3` — requires `go 1.25.0`

These were NOT required by the direct dependency `modernc.org/sqlite v1.29.9` (its declared minimum for libc is `v1.49.3`, which requires only go 1.20). The high pins were written by the go1.26.2 local toolchain choosing the latest-available compatible version — an over-eager MVS resolution artifact.

Lowering these pins to their true minimums (`libc v1.49.3`, `golang.org/x/sys v0.19.0`) is safe and correct: `go test ./...` (12 packages), `go build ./...`, `go vet ./...`, and `golangci-lint run` all pass clean with the lower versions. The go.sum already contained valid checksums for both lower-version entries.

### Changes applied

File: `apps/macro-indicators/go.mod`

1. `go 1.25.0` → `go 1.22`
2. Added `toolchain go1.22.0` (matches api-gateway and stock-price pattern; prevents future `go mod tidy` auto-upgrades when run with a newer local toolchain)
3. `golang.org/x/sys v0.42.0` → `golang.org/x/sys v0.19.0` (true minimum from sqlite v1.29.9 chain)
4. `modernc.org/libc v1.72.3` → `modernc.org/libc v1.49.3` (direct minimum declared by sqlite v1.29.9)
5. `modernc.org/gc/v3 v3.1.2` → `modernc.org/gc/v3 v3.0.0-20240107210532-573471604cb6` (sqlite v1.29.9 declared minimum)
6. `modernc.org/mathutil v1.7.1` → `modernc.org/mathutil v1.6.0` (sqlite v1.29.9 declared minimum)
7. `modernc.org/memory v1.11.0` → `modernc.org/memory v1.8.0` (aligned to libc v1.49.3 chain)
8. `modernc.org/strutil v1.2.1` → `modernc.org/strutil v1.2.0` (aligned to libc v1.49.3 chain)

No `go.sum` edits required — the file already contained valid checksums for all lower-version entries (they were present from when the module was originally set up with lower versions).

### Local verification

```
cd apps/macro-indicators
go build ./...        → CLEAN (exit 0)
go vet ./...          → CLEAN (exit 0)
go test ./...         → 12 packages, all PASS, 0 FAIL
golangci-lint run     → 0 issues
```

go.sum consistency verified: checksums for `libc v1.49.3` and `golang.org/x/sys v0.19.0` present.

### Status

REVIEW / await-push. Local green confirmed. DONE gate = GREEN ci.yml after subsequent push per VERIFICATION GATE. Board SSOT: docs/data/orch/orch-state.json task FIX-MACRO-GO-DIRECTIVE → REVIEW.
