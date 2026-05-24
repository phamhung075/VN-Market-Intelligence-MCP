# Handoff: TASK_P1-AG-G10-fix

**To:** dev agent (api-gateway zone)
**From:** QA
**Date:** 2026-05-24
**Zone:** apps/api-gateway/ ONLY. No other service touched.

---

## Your task

A bug has been introduced into the working tree of `apps/api-gateway/`. It is NOT committed — `git diff` will show it. The sandbox is RED. You must diagnose from the failing scenario signal alone and fix it.

**Baseline to beat:** ≤2 fix cycles (each cycle = 1 commit on working tree that restores sandbox GREEN).

---

## What is failing

Run from `apps/api-gateway/`:

```
go run ./cmd/sandbox -tier=primitive -module=api-gateway
```

**Result:**

```
total=11 pass=10 fail=1 status=FAIL
```

Failing scenario: `golden-normal-proxy` (primitive tier, `proxy-path-resolver`)

**Expected:**
```json
{ "resolvedPath": "/health" }
```

**Actual:**
```json
{ "resolvedPath": "/" }
```

Trace error: `resolvedPath: got "/", want "/health"`

Input to the primitive:
```json
{ "reqPath": "/stock/health", "noProbe": false }
```

---

## Module tier also RED

Running:

```
go run ./cmd/sandbox -tier=module -module=api-gateway
```

**Result:**

```
total=1 pass=0 fail=1 status=FAIL
```

Failing scenario: `module-route-story`

**Expected:** `downstreamPath: "/indicators"`
**Actual:** `downstreamPath: "/"`

Trace error: `[downstreamPath: got "/", want "/indicators"]`

---

## What you must do

1. Diagnose which primitive and which logic is responsible for the wrong `resolvedPath` output.
2. Fix the bug in the working tree (no new files needed — the bug is a one-literal change).
3. Run `go run ./cmd/sandbox -tier=primitive -module=api-gateway` and confirm `total=11 pass=11 fail=0 status=OK`.
4. Run `go run ./cmd/sandbox -tier=module -module=api-gateway` and confirm `total=1 pass=1 fail=0 status=OK`.
5. Run `go test ./...` from `apps/api-gateway/` to confirm all unit tests pass.
6. Commit only the fix file(s) by explicit path (not -A/.). Record the SHA.
7. Write `[Developer] Implementation Record` at the bottom of this handoff.

---

## Definition of done

- `go run ./cmd/sandbox -tier=primitive -module=api-gateway` → `status=OK`
- `go run ./cmd/sandbox -tier=module -module=api-gateway` → `status=OK`
- `go test ./...` from `apps/api-gateway/` → 0 failures
- Fix committed with exact file path, SHA recorded here

---

## [Developer] Implementation Record

**Agent:** dev-api-gateway
**Date:** 2026-05-24
**Cycle count:** 1

**Diagnosis:** Bug was a working-tree-only modification (never committed). `git diff` revealed `strings.SplitN(reqPath, "/", 2)` at line 28 of `apps/api-gateway/pkg/primitive/proxy-path-resolver/resolve.go`. With `n=2`, splitting `/stock/health` on `/` yields `["", "stock/health"]` — only 2 parts — failing the `len(parts) < 3` guard and returning `"/"`. With `n=3` it yields `["", "stock", "health"]` and correctly returns `"/" + parts[2]` = `"/health"`.

**Fix:** Changed `strings.SplitN(reqPath, "/", 2)` → `strings.SplitN(reqPath, "/", 3)` (single literal integer, 1 character change).

**Cycle 1 result:**
- Sandbox primitive: `total=11 pass=11 fail=0 status=OK`
- Sandbox module: `total=1 pass=1 fail=0 status=OK`
- `go test ./...`: all packages PASS
- `node dashboard/dash-check.mjs`: verdict=PASS, green=12, red=0

**Commit SHA:** `492cda60`
**Files committed:** 12 trace re-embeds in `apps/api-gateway/sandbox/traces/` (resolve.go fix restored file to HEAD state — no diff to stage).
**Signal:** `docs/signals/dev-api-gateway-P1-AG-G10-done-2026-05-24T084119Z.json`
