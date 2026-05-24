---
task_id: "P1-AE-B2"
task_title: "Second Primitive: dedup-key-builder"
pilot: "alert-engine"
phase: "1"
phase_task_plan: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-B2"
owner: "dev-alert-engine"
blocked_by: "P1-B1 DONE (ZERO-CREDS gate passed, sandbox green with 3 signal-classifier scenarios)"
blocks: "P1-B3"
goal_track: "A — Trust Foundation"
goals_advanced: ["G1 — Primitives ship with scenarios"]
g12_streak_number: 2
estimated_effort: "1h"
ac_count: 6
wip: 1
---

# P1-B2 — Second Primitive: `dedup-key-builder`

**Dispatched:** 2026-05-24 PM (after P1-B1 DONE signal verified)
**Owner:** dev-alert-engine
**Language:** Go (go1.22+cgo)
**Scope:** Extract `ComputeFingerprint` + `djb2Hash` from brownfield `pkg/domain/services.go` L17-42 as standalone primitive.

## Background

The `dedup-key-builder` primitive extracts the fingerprint logic for deduplication. This function is already pure (stdlib only: `fmt`, `sort`, `strings`). The djb2 seed (`5381`) is a CRITICAL constant — wrong seed = wrong fingerprint = dedup failures in production.

**Extract from:**
- `pkg/domain/services.go` L17-42: `ComputeFingerprint` + `djb2Hash` helper

**Public interface (go):**
```go
package dedupkeybuilder

// BuildKey produces a stable dedup fingerprint for an alert.
// stock + sorted(signalTypes) + message prefix (50 chars) → djb2 8-hex lowercase.
// Must produce byte-identical output to the TS computeFingerprint for the same inputs.
func BuildKey(stock string, signalTypes []string, message string) string
```

**djb2 discipline:** Seed is `5381` (uint32). Sorting of signalTypes = stable alphabetical. Message prefix = first 50 Unicode runes.

---

## Files to Create

1. `apps/alert-engine/pkg/primitive/dedup-key-builder/builder.go`
2. `apps/alert-engine/pkg/primitive/dedup-key-builder/builder_test.go`
3. `docs/scenarios/alert-engine/primitives/dedup-key-builder-golden.json`
4. `docs/scenarios/alert-engine/primitives/dedup-key-builder-edge.json`
5. `docs/scenarios/alert-engine/primitives/dedup-key-builder-failure.json`

---

## Acceptance Criteria

### AC-1: Exported function signature
`pkg/primitive/dedup-key-builder/builder.go` exports `BuildKey(stock string, signalTypes []string, message string) string`.
- `djb2Hash` is unexported (package-private).
- djb2 seed = `5381` (uint32).
- Sorting = alphabetical (stable).
- Message prefix = first 50 Unicode runes.

### AC-2: Unit test with ≥5 test cases
```bash
cd apps/alert-engine && go test ./pkg/primitive/dedup-key-builder/
```
Test cases (all must PASS):
- Known input with pre-computed expected fingerprint → output matches (golden contract)
- Signals in different order → same fingerprint as sorted order (sort-stability)
- Empty signalTypes array → known fingerprint
- Empty message string → known fingerprint
- Long message (>50 runes) → fingerprint matches 50-rune prefix truncation

### AC-3: Unit test exit 0
```bash
cd apps/alert-engine && go test ./pkg/primitive/dedup-key-builder/
```
Exit code = 0. Paste all test output to RETURN block.

### AC-4: Fence-A — zero infra/CGO imports
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface\|TELEGRAM\|BOT_TOKEN" \
  apps/alert-engine/pkg/primitive/dedup-key-builder/
```
Must return 0 (no matches). Paste grep output to RETURN block.

### AC-5: Scenario JSON cred-free (ZERO-CREDS inherited)
```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" \
  docs/scenarios/alert-engine/primitives/dedup-key-builder-golden.json \
  docs/scenarios/alert-engine/primitives/dedup-key-builder-edge.json \
  docs/scenarios/alert-engine/primitives/dedup-key-builder-failure.json
```
Must return 0. Scenario files contain only alert-domain data (stock ticker, signal types, message, expected fingerprint). Zero credential-shaped fields. Paste grep output to RETURN.

### AC-6: All-primitive sandbox green (G12 DoD Gate streak #2)
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```
**Must exit 0.** All scenarios across P1-B1 (signal-classifier, 3 files) + P1-B2 (dedup-key-builder, 3 files) = minimum 6 scenario files MUST PASS.
Output format: `total=6 pass=6 fail=0 status=OK` (minimum).
Paste full sandbox output to RETURN block — this proves G12 streak #2.

---

## Scenario JSON Spec

### dedup-key-builder-golden.json
Golden-path test case with pre-computed fingerprint.
```json
{
  "scenario": "dedup-key-builder-golden",
  "input": {
    "stock": "VCB",
    "signalTypes": ["MACD_CROSS", "BB_BREAK"],
    "message": "Stop-loss triggered at 85,000"
  },
  "expected": {
    "fingerprint": "<pre-computed 8-hex string, e.g., 'a1b2c3d4'>"
  }
}
```

### dedup-key-builder-edge.json
Edge case: empty arrays and empty message.
```json
{
  "scenario": "dedup-key-builder-edge",
  "input": {
    "stock": "HPG",
    "signalTypes": [],
    "message": ""
  },
  "expected": {
    "fingerprint": "<pre-computed fingerprint for empty signals + message>"
  }
}
```

### dedup-key-builder-failure.json
Failure case: empty stock (or validation error).
```json
{
  "scenario": "dedup-key-builder-failure",
  "input": {
    "stock": "",
    "signalTypes": null,
    "message": "test"
  },
  "expected": {
    "fingerprint": "<pre-computed fingerprint or error trace>"
  }
}
```

> **Dev note:** Pre-compute expected fingerprints from the existing Go `ComputeFingerprint` or from the TS reference port. All three scenario JSON files MUST be valid (no syntax errors) and MUST pass the sandbox grep audit (AC-5).

---

## Constraints & Gates

**ZERO-CREDS boundary (inherited from P1-A/P1-B1):**
- Scenario JSON contains only alert-domain data (stock, signals, message, fingerprint). Zero credentials.
- `dedup-key-builder/` source code must pass Fence-A audit (AC-4).

**G12 DoD Gate (streak #2):**
- Sandbox must run `CGO_ENABLED=0` and pass all-primitive test (AC-6).
- This is the second consecutive task in the 3-task G12 streak (P1-B1 #1, P1-B2 #2, P1-B3 #3).
- **QA will verify** at P1-G close-gate that the streak rule was followed.

**Charter binding:**
- §G1 calibration: 3-primitive core band (signal-classifier, dedup-key-builder, cooldown-gate).
- §ZERO-CREDS Boundary Clause (hard gate).
- §4.5 matrix authorship: `goalsEarned` stays 0, decisionMatrix untouched by dev.

---

## RETURN Block

When dev-alert-engine marks this task DONE, include:

```
[TASK_P1-AE-B2 RETURN]
AC-1: BuildKey() exported ✓
AC-2: Unit tests ≥5 cases ✓
AC-3: go test exit 0 ✓
AC-4: Fence-A grep = 0 ✓
AC-5: Scenario JSON creds grep = 0 ✓
AC-6: Sandbox all-green (G12 streak #2) ✓

Unit test output:
<paste go test ./pkg/primitive/dedup-key-builder/ output>

Sandbox output:
<paste CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all output>

Fence-A grep output:
<paste grep output — should be empty or line-count=0>

Scenario creds grep output:
<paste grep output — should be empty or line-count=0>

G12 DoD streak #2 PASS: signal-classifier (P1-B1) + dedup-key-builder (P1-B2) sandbox all-green.
```

---

## Signal

After DONE, emit `docs/signals/dev-alert-engine-P1-B2-done-<UTCstamp>.json`:
```json
{
  "signal": "P1-B2-done",
  "agent": "dev-alert-engine",
  "task": "P1-AE-B2",
  "timestamp": "<ISO8601 UTC>",
  "commit": "<SHA first 7>",
  "anchor_intact": "debba8eaff0724d1fb32fc9d28640201cc32d1cc",
  "gates": {
    "AC1_buildkey_exported": "PASS",
    "AC2_unit_tests_5_cases": "PASS",
    "AC3_go_test_exit0": "PASS",
    "AC4_fence_a_grep_0_matches": "PASS",
    "AC5_scenario_json_creds_grep_0": "PASS",
    "AC6_sandbox_all_green_g12_streak2": "PASS"
  },
  "sandbox_result": {
    "total": 6,
    "pass": 6,
    "fail": 0,
    "status": "OK"
  },
  "next_actor": "pm",
  "next_action": "verify P1-B2 (dedup-key-builder, G12 streak #2), then sequence P1-B3 (cooldown-gate)"
}
```

---

## Dependencies

- **Charter:** docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md
- **Phase 1 Task Plan:** docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-B2
- **Previous task DONE signal:** docs/signals/dev-alert-engine-P1-B1-done-20260524T053017Z.json
- **SSOT:** docs/data/pilot-status-alert-engine.json (phase1.current_task = P1-B2)
