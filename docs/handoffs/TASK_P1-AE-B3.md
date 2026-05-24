---
task_id: "P1-AE-B3"
task_title: "Third Primitive: cooldown-gate"
pilot: "alert-engine"
phase: "1"
phase_task_plan: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-B3"
owner: "dev-alert-engine"
blocked_by: "P1-B2 DONE (two primitives landed, sandbox green with 6 scenarios — commit 6c31ca13)"
blocks: "P1-C"
goal_track: "A — Trust Foundation"
goals_advanced: ["G1 — Primitives ship with scenarios"]
g12_streak_number: 3
g12_streak_note: "Streak #3 COMPLETES the Phase-1 G12 streak requirement (P1-B1 #1, P1-B2 #2, P1-B3 #3)."
estimated_effort: "1.5h"
ac_count: 7
wip: 1
---

# P1-B3 — Third Primitive: `cooldown-gate`

**Dispatched:** 2026-05-24 PM (after P1-B2 DONE signal verified — commit 6c31ca13)
**Owner:** dev-alert-engine
**Language:** Go (go1.22+cgo)
**Scope:** Extract `ShouldSuppressAlert` from brownfield `pkg/domain/services.go` L71-138 as standalone primitive. Inject `now time.Time` as a parameter for determinism (the brownfield function calls `time.Now()` internally at L77).

## Background

`cooldown-gate` extracts `ShouldSuppressAlert` from `pkg/domain/services.go` L71-138. The key determinism issue: the existing function calls `time.Now()` internally (L77). For the primitive to be scenario-testable (deterministic), inject `now time.Time` as a parameter instead.

The logic has two rules:
1. **Cooldown window** — suppress if same stock + overlapping signal type exists within `CooldownMinutes`.
2. **Daily cap** — suppress if `MaxAlertsPerStockPerDay` alerts have already fired for the stock today.

**CRITICAL bypass:** `SeverityCritical` + `ActionCode != "MACRO"` bypasses cooldown entirely.

**Extract from:**
- `pkg/domain/services.go` L71-138: `ShouldSuppressAlert`

---

## Public Interface (Go)

```go
// pkg/primitive/cooldown-gate/gate.go
package cooldowngate

// SuppressResult is the output of Check.
type SuppressResult struct {
    Suppress bool
    Reason   string
}

// AlertInput is the minimal inbound data needed for the cooldown check.
type AlertInput struct {
    Stock       string
    Severity    string  // "low" | "medium" | "high" | "critical"
    SignalTypes []string
    ActionCode  string
}

// CooldownConfig holds cooldown and daily-cap parameters.
type CooldownConfig struct {
    CooldownMinutes         int
    MaxAlertsPerStockPerDay int
}

// RecentAlert is the minimal stored alert data needed for the check.
type RecentAlert struct {
    Stocks      string
    SignalTypes string // comma-separated
    TriggeredAt string // RFC3339 ISO 8601
}

// Check returns whether the alert should be suppressed.
// now is injected for determinism (never calls time.Now() internally).
func Check(alert AlertInput, recentAlerts []RecentAlert, cfg CooldownConfig, now time.Time) SuppressResult
```

---

## Files to Create

1. `apps/alert-engine/pkg/primitive/cooldown-gate/gate.go`
2. `apps/alert-engine/pkg/primitive/cooldown-gate/gate_test.go`
3. `docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json`
4. `docs/scenarios/alert-engine/primitives/cooldown-gate-edge.json`
5. `docs/scenarios/alert-engine/primitives/cooldown-gate-failure.json`

---

## Acceptance Criteria

### AC-1: Exported types + Check signature (now injected)
`pkg/primitive/cooldown-gate/gate.go` exports `SuppressResult`, `AlertInput`, `CooldownConfig`, `RecentAlert`, and `Check(...)`.
- `now time.Time` is a parameter (the function NEVER calls `time.Now()` internally).
- Stdlib only: `strings`, `time`, `fmt`.

### AC-2: Unit test with ≥7 test cases
```bash
cd apps/alert-engine && go test ./pkg/primitive/cooldown-gate/
```
Test cases (all must PASS):
- Empty recentAlerts → suppress=false
- Same stock, overlapping signal, within cooldown window → suppress=true (Rule 1)
- Same stock, non-overlapping signal, within cooldown window → suppress=false (signals don't overlap)
- Same stock, daily cap exhausted (3/3 alerts today) → suppress=true (Rule 2)
- `severity="critical"`, `actionCode="TA"` → suppress=false (bypass)
- `severity="critical"`, `actionCode="MACRO"` → normal cooldown rules apply (bypass does NOT fire)
- Recent alert outside cooldown window → suppress=false (window expired)

### AC-3: Unit test exit 0
```bash
cd apps/alert-engine && go test ./pkg/primitive/cooldown-gate/
```
Exit code = 0. Paste all test output to RETURN block.

### AC-4: Fence-A — zero infra/CGO/Telegram imports AND zero `time.Now`
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface\|TELEGRAM\|BOT_TOKEN\|time\.Now" \
  apps/alert-engine/pkg/primitive/cooldown-gate/
```
Must return 0. Especially `time.Now` — confirms `now` is injected, not called internally. Paste grep output to RETURN block.

### AC-5: Scenario JSON cred-free (ZERO-CREDS inherited)
```bash
grep -rniE "token|chat_id|bot|secret|api_key|password" \
  docs/scenarios/alert-engine/primitives/cooldown-gate-golden.json \
  docs/scenarios/alert-engine/primitives/cooldown-gate-edge.json \
  docs/scenarios/alert-engine/primitives/cooldown-gate-failure.json
```
Must return 0. Note: scenario JSON may contain `triggeredAt` RFC3339 timestamps — these are NOT credentials. Paste grep output to RETURN.

### AC-6: All-primitive sandbox green (G12 DoD Gate streak #3)
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```
**Must exit 0.** All scenarios across signal-classifier (P1-B1) + dedup-key-builder (P1-B2) + cooldown-gate (P1-B3) = minimum 9 scenario files MUST PASS.
Output format: `total=9 pass=9 fail=0 status=OK` (minimum).
Paste full sandbox output to RETURN block. **This task completes the G12 streak #3** — QA must verify this task follows the DoD rule for the third consecutive time.

### AC-7: CGO_ENABLED=0 build still passes (third check)
```bash
cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/
```
Exits 0. The newly added primitive did not pull in a CGO import.

---

## Scenario JSON Spec

### cooldown-gate-golden.json
Golden path: no recent alerts → no suppression.
```json
{
  "scenario": "cooldown-gate-golden",
  "input": {
    "alert": {
      "stock": "VCB",
      "severity": "high",
      "signalTypes": ["MACD_CROSS"],
      "actionCode": "TA"
    },
    "recentAlerts": [],
    "cfg": {
      "cooldownMinutes": 30,
      "maxAlertsPerStockPerDay": 3
    },
    "now": "2026-05-24T10:00:00Z"
  },
  "expected": {
    "suppress": false,
    "reason": ""
  }
}
```

### cooldown-gate-edge.json
Cooldown rule fires: same stock + overlapping signal + recent alert within 30min.
```json
{
  "scenario": "cooldown-gate-edge",
  "input": {
    "alert": {
      "stock": "VCB",
      "severity": "medium",
      "signalTypes": ["MACD_CROSS"],
      "actionCode": "TA"
    },
    "recentAlerts": [
      {
        "stocks": "VCB",
        "signalTypes": "MACD_CROSS",
        "triggeredAt": "2026-05-24T09:45:00Z"
      }
    ],
    "cfg": {
      "cooldownMinutes": 30,
      "maxAlertsPerStockPerDay": 3
    },
    "now": "2026-05-24T10:00:00Z"
  },
  "expected": {
    "suppress": true,
    "reason": "<cooldown reason string matching the primitive output, e.g. 'cooldown: same signal within 30min'>"
  }
}
```

### cooldown-gate-failure.json
Critical-severity bypass: `severity="critical"` + `actionCode="TA"` (non-MACRO) + recent alerts present → not suppressed.
```json
{
  "scenario": "cooldown-gate-failure",
  "input": {
    "alert": {
      "stock": "VCB",
      "severity": "critical",
      "signalTypes": ["MACD_CROSS"],
      "actionCode": "TA"
    },
    "recentAlerts": [
      {
        "stocks": "VCB",
        "signalTypes": "MACD_CROSS",
        "triggeredAt": "2026-05-24T09:55:00Z"
      }
    ],
    "cfg": {
      "cooldownMinutes": 30,
      "maxAlertsPerStockPerDay": 3
    },
    "now": "2026-05-24T10:00:00Z"
  },
  "expected": {
    "suppress": false,
    "reason": "<critical-bypass reason string matching the primitive output, e.g. 'critical severity bypasses cooldown'>"
  }
}
```

> **Dev note:** The exact `reason` strings must match the primitive's emitted output verbatim (port them from the brownfield `ShouldSuppressAlert` logic). All three scenario JSON files MUST be valid (no syntax errors) and MUST pass the cred-free grep audit (AC-5). `now` is an RFC3339 string parsed into `time.Time` by the sandbox harness and passed to `Check`.

---

## Constraints & Gates

**Determinism (HARD):**
- `Check` MUST accept `now time.Time` as a parameter and MUST NOT call `time.Now()` internally (AC-4 grep enforces this).

**ZERO-CREDS boundary (inherited from P1-A/P1-B1/P1-B2):**
- Scenario JSON contains only alert-domain data (stock, severity, signals, actionCode, timestamps, config). Zero credentials.
- `cooldown-gate/` source code must pass Fence-A audit (AC-4).

**G12 DoD Gate (streak #3 — COMPLETES the Phase-1 streak):**
- Sandbox must run `CGO_ENABLED=0` and pass all-primitive test (AC-6) BEFORE the RETURN block is written.
- This is the THIRD consecutive task in the 3-task G12 streak (P1-B1 #1, P1-B2 #2, P1-B3 #3). Completing it satisfies the Phase-1 G12 streak requirement.
- **QA will verify** at P1-G close-gate that the streak rule was followed for all three tasks.

**Charter binding:**
- §G1 calibration: 3-primitive core band (signal-classifier, dedup-key-builder, cooldown-gate) — this task completes the minimum band.
- §ZERO-CREDS Boundary Clause (hard gate).
- §4.5 matrix authorship: `goalsEarned` stays 0, decisionMatrix untouched by dev. **NO goal flips.**
- L84 explicit-file staging; no `--force`/`--no-verify`/`--no-gpg-sign`; all work on `main`, NO branches.
- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor of HEAD.
- Do NOT touch other pilots, SI-2 (`docs/dashboards/index.html`), or DORMANT/CLOSED zones.

---

## RETURN Block

When dev-alert-engine marks this task DONE, include:

```
[TASK_P1-AE-B3 RETURN]
AC-1: Check() with injected now time.Time exported ✓
AC-2: Unit tests ≥7 cases ✓
AC-3: go test exit 0 ✓
AC-4: Fence-A grep (incl. time.Now) = 0 ✓
AC-5: Scenario JSON creds grep = 0 ✓
AC-6: Sandbox all-green 9 scenarios (G12 streak #3) ✓
AC-7: CGO_ENABLED=0 build exit 0 ✓

Unit test output:
<paste go test ./pkg/primitive/cooldown-gate/ output>

Sandbox output:
<paste CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all output>

Fence-A grep output:
<paste grep output — should be empty or line-count=0>

Scenario creds grep output:
<paste grep output — should be empty or line-count=0>

CGO build output:
<paste CGO_ENABLED=0 go build output — exit 0>

G12 DoD streak #3 PASS (COMPLETES Phase-1 streak): signal-classifier (P1-B1) + dedup-key-builder (P1-B2) + cooldown-gate (P1-B3) sandbox all-green.
```

---

## Signal

After DONE, emit `docs/signals/dev-alert-engine-P1-B3-done-<UTCstamp>.json`:
```json
{
  "signal": "P1-B3-done",
  "agent": "dev-alert-engine",
  "task": "P1-AE-B3",
  "timestamp": "<ISO8601 UTC>",
  "commit": "<SHA first 7>",
  "anchor_intact": "debba8eaff0724d1fb32fc9d28640201cc32d1cc",
  "gates": {
    "AC1_check_exported_now_injected": "PASS",
    "AC2_unit_tests_7_cases": "PASS",
    "AC3_go_test_exit0": "PASS",
    "AC4_fence_a_grep_incl_time_now_0": "PASS",
    "AC5_scenario_json_creds_grep_0": "PASS",
    "AC6_sandbox_all_green_g12_streak3": "PASS",
    "AC7_cgo0_build_exit0": "PASS"
  },
  "sandbox_result": {
    "total": 9,
    "pass": 9,
    "fail": 0,
    "status": "OK"
  },
  "next_actor": "pm",
  "next_action": "verify P1-B3 (cooldown-gate, G12 streak #3 — COMPLETES Phase-1 G12 streak), then decide P1-B4 (optional) vs P1-C (module stub)"
}
```

---

## Dependencies

- **Charter:** docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md
- **Phase 1 Task Plan:** docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-B3
- **Previous task DONE signal:** docs/signals/dev-alert-engine-P1-B2-done-20260524T053539Z.json (commit 6c31ca13)
- **SSOT:** docs/data/pilot-status-alert-engine.json (phase1.current_task = P1-B3)
