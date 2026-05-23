---
task_id: "P0-SP-5"
pilot: "stock-price"
phase: "0"
title: "R-CGO Confirmation: verify primitives + module + sandbox build under CGO_ENABLED=0 (dev-stock-price)"
estimate: "1.5h"
owner: "dev-stock-price"
status: "READY"
date: "2026-05-24"
---

# TASK P0-SP-5 — R-CGO Confirmation (High-Risk Binding Gate)

## Summary

**CRITICAL BINDING GATE** (R-CGO, HIGH severity per charter).

dev-stock-price confirms that the **extracted primitives + module + sandbox can build and run under `CGO_ENABLED=0`** (pure Go, no mattn/go-sqlite3, no C dependencies). This is the stock-price analog of macro's R-1 (math/rand) gate and alert-engine's Telegram-creds gate.

If any extracted unit transitively imports mattn/go-sqlite3, the decomposition is WRONG and must be re-cut before Phase 1 proceeds. This gate must pass BEFORE any Phase 1 code lands.

## Acceptance Criteria

### AC-1: Pre-extraction baseline (brownfield P0-SP-1 complete)
- [ ] Verify: P0-SP-1 (brownfield inventory) is DONE and report includes "R-CGO Feasibility: FEASIBLE"
- [ ] If report says BLOCKED: abort this task, escalate to architect for re-cut guidance

### AC-2: Sandbox CGO_ENABLED=0 build (pre-refactor)
- [ ] Run (in apps/stock-price/ directory):
  ```bash
  CGO_ENABLED=0 go build -o ./cmd/sandbox/sandbox ./cmd/sandbox
  ```
- [ ] Expected: exit 0 (compiles successfully)
- [ ] If exit != 0: document error, escalate as "CGO_ENABLED=0 build FAILED pre-refactor"

### AC-3: Grep mattn/go-sqlite3 in current source (pre-refactor baseline)
- [ ] Run:
  ```bash
  grep -rn "mattn/go-sqlite3" apps/stock-price/pkg/domain/ apps/stock-price/pkg/application/ apps/stock-price/pkg/interface/
  ```
- [ ] Expected: 0 matches (CGO should only be in infrastructure)
- [ ] If > 0 matches: this is a BLOCKER; document locations and escalate to architect

### AC-4: Sandbox source inspection (cmd/sandbox)
- [ ] Check: does `cmd/sandbox/main.go` exist?
- [ ] If NO: create stub sandbox (minimal implementation, zero CGO, zero network):
  ```go
  package main
  import "fmt"
  func main() {
    fmt.Println("Stock-price sandbox: R-CGO verified — no CGO dependencies")
  }
  ```
- [ ] If YES: inspect existing sandbox code
- [ ] Verify: no imports of mattn/go-sqlite3, no cgo pragmas, no C code
- [ ] Run:
  ```bash
  grep -rn "cgo\|mattn\|import \"C\"" cmd/sandbox/
  ```
- [ ] Expected: 0 matches

### AC-5: Full module + primitives (post-extraction, Phase 1 gate)
- [ ] NOTE: This AC cannot be fully verified PRE-Phase-1 (primitives/module don't exist yet)
- [ ] Instead, record in task RETURN: "R-CGO Phase 1 gate: will be verified in P1-A1 (first primitive task)"
- [ ] Template: Phase 1 first-primitive task (P1-A1 in phase-1-task-plan.md) MUST include:
  ```
  AC (R-CGO specific):
  - CGO_ENABLED=0 go build -o ./bin/sp-primitive-1 ./cmd/sandbox exits 0
  - grep mattn/go-sqlite3 pkg/primitive/PRIMITIVE_1 exits 1 (zero matches)
  - grep mattn/go-sqlite3 pkg/module/ exits 1 (zero matches)
  ```

### AC-6: Sandbox scenario run (zero-CGO validation)
- [ ] Run (if cmd/sandbox exists and is functional):
  ```bash
  CGO_ENABLED=0 go run ./cmd/sandbox -help
  ```
- [ ] Expected: exit 0 + help output (no CGO errors, no runtime failures)
- [ ] If exit != 0: document error, escalate as "Sandbox runtime failed under CGO_ENABLED=0"

### AC-7: Task completion signal with R-CGO verdict
- [ ] Create signal: `docs/signals/dev-stock-price-p0-sp5-r-cgo-confirmation-<UTC>.json`
- [ ] Include:
  - `r_cgo_verdict`: "CLEAR" | "BLOCKED"
  - `build_test`: { cgoe0_build: true|false, exit_code: N }
  - `grep_results`: { mattn_in_domain_app_interface: 0, mattn_in_sandbox: 0 }
  - `phase_1_gate_template`: link to phase-1-task-plan.md AC block
  - `blockers`: [] (if CLEAR) | [{ location, issue, remediation }] (if BLOCKED)

## Implementation Guidance

1. **Timing:** run AFTER P0-SP-1 (brownfield) is DONE and confirms R-CGO FEASIBLE
2. **Environment:** local development environment (Mac/Linux), Go 1.22+
3. **Zone:** work in `apps/stock-price/` directory
4. **Pre-refactor scope:** test baseline (existing code) before Phase 1 cuts anything
5. **Phase 1 gate scope:** template the verification steps to be re-run in first Phase 1 primitive task
6. **Forbidden modifications:** do NOT write any production code; testing only

## Handoff File Output

**Files:**
- `docs/signals/dev-stock-price-p0-sp5-r-cgo-confirmation-<UTC>.json` (completion signal)

**Signal structure (example, CLEAR verdict):**
```json
{
  "signal": "dev-stock-price-p0-sp5-r-cgo-confirmation",
  "from": "dev-stock-price",
  "emittedAt": "2026-05-24T...:...:...Z",
  "task": "P0-SP-5",
  "phase": "0",
  "pilot": "stock-price",
  "r_cgo_verdict": "CLEAR",
  "findings": {
    "cgoe0_build_sandbox": { "exit_code": 0, "status": "PASS" },
    "grep_mattn_domain_app_interface": { "matches": 0, "status": "PASS" },
    "grep_mattn_sandbox": { "matches": 0, "status": "PASS" },
    "sandbox_runtime": { "cgoe0_run_help": 0, "status": "PASS" }
  },
  "phase_1_gate": {
    "first_primitive_task": "P1-A1",
    "r_cgo_verification_required": true,
    "template_acs": [
      "CGO_ENABLED=0 go build -o ./bin/sp-PRIMITIVE ./cmd/sandbox exits 0",
      "grep mattn/go-sqlite3 pkg/primitive/PRIMITIVE exits 1",
      "grep mattn/go-sqlite3 pkg/module/ exits 1"
    ]
  },
  "next": "Phase 0 exit gate ready (architect verification signal pending)"
}
```

**Blocked verdict example:**
```json
{
  "r_cgo_verdict": "BLOCKED",
  "blockers": [
    {
      "location": "apps/stock-price/pkg/domain/models.go:L42",
      "issue": "import mattn/go-sqlite3",
      "remediation": "Move to infrastructure/sqlite.go, re-architect as port interface"
    }
  ]
}
```

## Constraints

- **L84 explicit-file staging:** 1 signal file (JSON)
- **No source code changes:** read-only testing + one stub if needed
- **No git push:** local-only
- **Anchor held:** no tag/rewrite during this task
- **High severity:** R-CGO BLOCKED means Phase 1 cannot proceed without architect re-cut
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §CGO Boundary Clause + §Phase 0

## Hard Gates

- [ ] **CGO_ENABLED=0 builds:** exit 0
- [ ] **Zero CGO in domain/app/interface:** grep returns 0
- [ ] **R-CGO verdict clear:** signal includes CLEAR or BLOCKED status
- [ ] **Phase 1 gate template:** phase_1_gate section populated in signal

## RETURN Block

**Signal emitted:** docs/signals/dev-stock-price-p0-sp5-r-cgo-confirmation-<UTC>.json

**Expected outcomes:**
- r_cgo_verdict: CLEAR (expected) | BLOCKED (escalate to architect)
- All AC results documented in signal
- Phase 1 gate template ACs ready for first primitive task

**If BLOCKED:** PM escalates immediately to architect with full blocker details.

**Expected timeline:** 2026-05-24 (same-day delivery, dev-stock-price)
