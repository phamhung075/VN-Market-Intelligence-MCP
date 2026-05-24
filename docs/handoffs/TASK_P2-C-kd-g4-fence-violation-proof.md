# TASK P2-C — kinh-dich-service G4 Fence-A Violation Proof (QA Independent Reproduction)

**Task:** P2-C — AC-4 QA Independent Reproduction
**Pilot:** kinh-dich-service (fleet pilot 4, Phase 2)
**Owner:** qa
**Date:** 2026-05-24
**Status:** DONE

---

## Context

P2-C requires QA to independently reproduce the Fence-A violation proof on a DIFFERENT primitive
file from the one dev used (`hexagram_resolver`). QA chose `hao_encoder` as the target file.
The injection imports `pkg/infrastructure` — a forbidden higher-layer import that violates Fence-A.

Fence-false-green lesson applied: confirmed the linter actually parsed `.golangci.yml`, loaded
`depguard`, and checked real files before the injection run (verbose output analysis below).

---

## Evidence — Pre-Injection: Fence Genuinely Enforces (Anti-False-Green Check)

Verbose run (`golangci-lint run --verbose`) before injection confirms:

```
level=info msg="[config_reader] Used config file .golangci.yml"
level=info msg="[config_reader] Module name \"github.com/vn-market-intelligence/kinh-dich-service\""
level=info msg="[lintersdb] Active 1 linters: [depguard]"
level=info msg="[loader] Go packages loading at mode 8199 (compiled_files|files|name) took 332.572075ms"
0 issues.
```

Confirmation:
- Config file `.golangci.yml` was found and loaded (not silently skipped)
- Module name `github.com/vn-market-intelligence/kinh-dich-service` matches all deny rule package paths
- Active linters: `[depguard]` — not "unknown linter", not "0 linters"
- Loader ran 332ms processing real files (not "0 files")
- Exit 0 on clean codebase

**Fence is NOT false-green: it loaded config, activated depguard, and actually scanned the Go files.**

---

## Evidence — AC-4b Violation Run (QA Reproduction)

**Target file:** `apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go`
**Injected import:** `_ "github.com/vn-market-intelligence/kinh-dich-service/pkg/infrastructure"`

Injection added to the import block (local working tree only — never staged, never committed):

```go
import (
    "fmt"
    "math"

    // DELIBERATE FENCE-A VIOLATION — QA REPRODUCTION — DO NOT COMMIT
    _ "github.com/vn-market-intelligence/kinh-dich-service/pkg/infrastructure"
)
```

**Command:** `cd apps/kinh-dich-service && golangci-lint run`

**Full linter output:**
```
pkg/primitive/hao_encoder/hao_encoder.go:19:2: import 'github.com/vn-market-intelligence/kinh-dich-service/pkg/infrastructure' is not allowed from list 'fence-a': Fence-A: primitive must not import infrastructure layer (depguard)
	_ "github.com/vn-market-intelligence/kinh-dich-service/pkg/infrastructure"
	^
1 issues:
* depguard: 1
EXIT:1
```

**Verdict:**
- Exit code: NON-ZERO (1)
- Rule name in output: `fence-a` (list name) and `Fence-A: primitive must not import infrastructure layer` (desc)
- Violating file named: `pkg/primitive/hao_encoder/hao_encoder.go:19:2`
- Linter named: `depguard`

---

## Evidence — AC-4b Clean Run (Post-Revert)

**Revert command:** `git checkout apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go`

**Command:** `cd apps/kinh-dich-service && golangci-lint run`

**Output:**
```
0 issues.
EXIT:0
```

---

## Evidence — Git Status Clean (Violation Never Staged)

**Command:** `git status --short | grep "pkg/primitive"`

**Output:** (empty — grep returned exit 1, no matches)

**Confirmation:** The violation was NEVER staged, NEVER committed. Working tree clean.

---

## Evidence — Sister-Primitive Non-Leak Check

`nuclear_hexagram` imports BOTH `hexagram_resolver` AND `hao_encoder` (sister primitives).
These are OQ-6 documented legitimate cross-primitive imports.

**Command:** `cd apps/kinh-dich-service && golangci-lint run ./pkg/primitive/nuclear_hexagram/...`

**Output:**
```
0 issues.
EXIT:0
```

**Confirmation:** Allowlist `pkg/primitive/* -> pkg/primitive/*` does NOT leak — sister-primitive
imports pass while the forbidden infrastructure import fails. The fence correctly distinguishes:
- `pkg/primitive/*/` importing `pkg/primitive/*/` → ALLOWED (allowlist correct)
- `pkg/primitive/*/` importing `pkg/infrastructure/` → BLOCKED (Fence-A fires)

---

## Verdict

| Check | Result |
|-------|--------|
| Fence genuinely enforces (not false-green) | PASS — verbose confirms config loaded, depguard active, real files scanned |
| Fence fires on different primitive (hao_encoder) | PASS — exit 1 |
| Rule name `fence-a` / `Fence-A` in output | PASS |
| Violating file named in output | PASS |
| Lint exit non-zero on violation | PASS (exit 1) |
| Lint exit 0 after revert | PASS (exit 0, "0 issues") |
| git status clean (never staged/committed) | PASS |
| Sister-primitive allowlist non-leak (nuclear_hexagram exit 0) | PASS |

**P2-C QA Independent Reproduction: PASS**

---

## [QA] Review Record

```
date: 2026-05-24
task: P2-C (AC-4 QA independent reproduction)
pilot: kinh-dich-service
qa_file_used: apps/kinh-dich-service/pkg/primitive/hao_encoder/hao_encoder.go
dev_file_used: apps/kinh-dich-service/pkg/primitive/hexagram_resolver/hexagram_resolver.go (separate)
injected_import: pkg/infrastructure
violation_lint_exit: 1
violation_output_fence_name: fence-a / Fence-A: primitive must not import infrastructure layer
violation_output_file_named: pkg/primitive/hao_encoder/hao_encoder.go:19:2
revert_lint_exit: 0
git_status_after_revert: CLEAN (never staged, never committed)
sister_primitive_nonleak: nuclear_hexagram golangci-lint exit 0 (allowlist correct)
fence_false_green_cross_check: PASS (verbose confirms config loaded, depguard active, files scanned)
verdict: PASS
```
