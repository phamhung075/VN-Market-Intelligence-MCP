---
task_id: P1-C1
title: "Module stub: macro-signals (Day 0 lesson L1 — thin composition, prove wiring pattern early)"
phase: "1"
pilot: "macro-indicators"
owner: "dev-macro-indicators"
goals: ["G2", "G12"]
files_touched:
  - "apps/macro-indicators/pkg/module/macro_signals/macro_signals.go (CREATE)"
  - "apps/macro-indicators/pkg/module/macro_signals/macro_signals_test.go (CREATE)"
  - "docs/scenarios/macro-indicators/modules/macro-signals-golden.json (CREATE)"
estimate_hours: 1.5
ac_count: 6
blocked_by: ["P1-B1"]
unblocks: ["P1-D1", "P1-D2", "P1-E1"]
---

# P1-C1 — Module Stub: macro-signals (Thin Composition, Day 0 Lesson L1)

**Goal:** G2 (Module composes primitives via ports), G12 (sandbox green before done — streak task #2 of 3)

**Criticality:** Second task in G12 DoD streak. Validates composition pattern early (TA pilot lesson L1: ship module stub Day 0 even if thin, prove composition works before Phase 2 primitives pile in). Unblocks dashboard and edge cases.

---

## Background

The TA pilot learned (lesson L1): ship a **thin module stub on Day 0** to validate the composition pattern, even if only 1 primitive is wired. This prevents Phase 2 from discovering coupling bugs too late.

**Module purpose (macro_signals):**
- Orchestrates 1+ primitives (currently: macro-investment-clock only)
- Imports primitives via **PORTS ONLY** (dependency injection), never direct implementation imports
- Exposes a single public `ClassifyBatch(names []string) []Result` method or similar
- No application/infrastructure/interface imports — pure domain orchestration

**Expected composition pattern:**
```go
// Module constructor (Day 1 — thin, only 1 primitive)
func New(clock primitive.Classifier) *Signals {
  return &Signals{clock: clock}
}

// Thin orchestration method
func (s *Signals) ClassifyBatch(names []string) []primitive.Result {
  results := make([]primitive.Result, 0)
  for _, name := range names {
    result := s.clock.Classify(name)
    results = append(results, result)
  }
  return results
}
```

Phase 2 will add more primitives (yield spread, carry trade, etc.); module constructor will grow but composition pattern stays same.

---

## Files Touched

### Implementation
- `apps/macro-indicators/pkg/module/macro_signals/macro_signals.go` (CREATE)
- `apps/macro-indicators/pkg/module/macro_signals/macro_signals_test.go` (CREATE)

### Test Scenarios (frozen fixture data — module-level invocation)
- `docs/scenarios/macro-indicators/modules/macro-signals-golden.json` (CREATE)

---

## Acceptance Criteria

### AC-1: Module Struct + Constructor (Composition via Dependency Injection)

**Required module struct and constructor:**
```go
type Signals struct {
  clock primitive.Classifier  // or interface name from P1-B1 public API
}

func New(clock primitive.Classifier) *Signals {
  return &Signals{clock: clock}
}
```

**Constraint:** Constructor accepts primitive as a PARAMETER (never instantiates it internally). This enables testability and Phase 2 multi-primitive composition.

**Acceptance:** Constructor compiles, no missing params, type matches macro-investment-clock exported interface.

---

### AC-2: Composition Imports ONLY from pkg/primitive/ (NOT application, NOT interface, NOT infrastructure)

**Fence-B (module layer isolation):**
```bash
grep -rnE "vn-market-intelligence/macro-indicators/pkg/(application|interface|infrastructure)" \
  apps/macro-indicators/pkg/module/macro_signals/
# Expected output: empty (exit 1)
```

**Rationale:** Module is pure domain orchestration — no app/infra concerns. DDD layer separation enforced. Phase 2 adds more primitives; isolation guarantees low coupling.

**Acceptance:** Grep exits 1 (zero matches). Module file imports ONLY:
- `github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock` (or macro.Classifier interface path)
- Standard library (testing, fmt, etc.)

---

### AC-3: Module Scenario JSON (golden — batch invocation)

**File:** `docs/scenarios/macro-indicators/modules/macro-signals-golden.json`

**Schema (module-level input → primitive results aggregation):**
```json
{
  "scenario_name": "macro-signals-golden",
  "phase": "module",
  "tier": "module",
  "description": "Batch classification through macro-signals module (1 primitive wired: macro-investment-clock)",
  "input": {
    "indicator_names": ["VN_CPI", "Unemployment_Rate", "Unknown"]
  },
  "expected_output": {
    "batch_count": 3,
    "classifications": [
      {
        "indicator": "VN_CPI",
        "tier": "VN_DIRECT",
        "score": 8,
        "phase": "CORE_VN"
      },
      {
        "indicator": "Unemployment_Rate",
        "tier": "US_DOMESTIC",
        "score": 2,
        "phase": "US_DOMESTIC"
      },
      {
        "indicator": "Unknown",
        "tier": "US_DOMESTIC",
        "score": 2,
        "phase": "US_DOMESTIC"
      }
    ]
  }
}
```

**Acceptance:** Valid JSON. Input array exercises ≥2 different tier classification paths. Validates composition wiring (batch method invokes primitive correctly, aggregates results).

---

### AC-4: Unit Test (Table-Driven, ≥3 rows)

**File:** `apps/macro-indicators/pkg/module/macro_signals/macro_signals_test.go`

**Required test cases:**
- Row 1: Batch with 1 VN indicator (verifies module calls primitive, returns CORE_VN)
- Row 2: Batch with 1 US indicator (verifies tier classification)
- Row 3: Batch with empty array (edge: module handles nil/empty gracefully)

**Test pattern (table-driven):**
```go
func TestMacroSignalsClassifyBatch(t *testing.T) {
  mockClock := &mockClassifier{...}  // mock of macro-investment-clock interface
  signals := New(mockClock)

  tests := []struct {
    name     string
    input    []string
    expected int  // expected result count
  }{
    {"batch_vn", []string{"VN_CPI"}, 1},
    {"batch_us", []string{"Unemployment_Rate"}, 1},
    {"batch_empty", []string{}, 0},
  }

  for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
      results := signals.ClassifyBatch(tt.input)
      if len(results) != tt.expected {
        t.Fatalf("got %d results, want %d", len(results), tt.expected)
      }
    })
  }
}
```

**Acceptance:** `go test ./pkg/module/macro_signals/...` exits 0. All 3+ rows pass.

---

### AC-5: Module-Tier Sandbox Gate (G12 DoD Streak Task #2)

**Hard gate: Sandbox MUST be green before DONE declared.**

Run sandbox with `-tier=module` flag:
```bash
cd apps/macro-indicators
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
```

**Expected output:**
```
[module] macro-signals: macro-signals-golden ... PASS
---
Total: 1/1 PASS
Exit code: 0
```

**Acceptance:** Sandbox exits 0. All module scenarios PASS (currently 1: golden). Paste full sandbox output into RETURN block of this handoff.

**Note:** If cmd/sandbox does not yet support `-tier=module`, extend it in this task (small delta: parse module tier, load `docs/scenarios/macro-indicators/modules/*.json` instead of primitives/, invoke module rather than primitive).

---

### AC-6: R-1 Propagated (Defensive — Module Shouldn't Use Rand Either)

**Fence check:**
```bash
grep -rnE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" \
  apps/macro-indicators/pkg/module/macro_signals/
# Expected output: empty (exit 1)
```

**Rationale:** Module inherits determinism requirement from primitives. Phase 2 will add more primitives; all must be deterministic.

**Acceptance:** Grep exits 1 (zero matches). Module file contains zero randomization.

---

## Implementation Guidance

### Module File Structure
```go
package macro_signals

import (
  // domain + primitive only; NO application/interface/infrastructure
  "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
  // or use a defined Classifier interface if macro-investment-clock exports one
)

type Signals struct {
  clock macro_investment_clock.Classifier  // or interface type
}

func New(clock macro_investment_clock.Classifier) *Signals {
  return &Signals{clock: clock}
}

func (s *Signals) ClassifyBatch(names []string) []macro_investment_clock.Result {
  results := make([]macro_investment_clock.Result, 0, len(names))
  for _, name := range names {
    result := s.clock.Classify(name)
    results = append(results, result)
  }
  return results
}
```

### Test Mock Setup
If macro-investment-clock uses an interface (e.g., `type Classifier interface { Classify(string) Result }`), create a mock:
```go
type mockClassifier struct{}

func (m *mockClassifier) Classify(name string) Result {
  // stub: returns deterministic result based on name
  return Result{Tier: "VN_DIRECT", Score: 8, Phase: "CORE_VN"}
}
```

### Scenario Directory
Ensure `docs/scenarios/macro-indicators/modules/` directory exists before creating JSON:
```bash
mkdir -p docs/scenarios/macro-indicators/modules/
touch docs/scenarios/macro-indicators/modules/macro-signals-golden.json
```

---

## Forbidden (Perimeter Guard)

- **No app/interface/infrastructure imports** — violation = FENCE-B red, handoff rejected
- **No external API calls** — module is pure logic
- **No env var reads** — scenario is frozen
- **No database access** — primitives own data fetching (Phase 2)
- **No math/rand** — determinism gate
- **No touching apps/technical-analysis/** — zone violation
- **No --force, no --no-verify, no --no-gpg-sign** — git integrity

---

## Smoke Checks (Before Commit)

```bash
cd apps/macro-indicators

# Build
go build ./pkg/module/macro_signals/... 2>&1 | head -20

# Vet
go vet ./pkg/module/macro_signals/... 2>&1 | head -20

# Test
go test ./pkg/module/macro_signals/... -v 2>&1 | head -30

# Fence-B isolation
grep -rnE "vn-market-intelligence/macro-indicators/pkg/(application|interface|infrastructure)" \
  pkg/module/macro_signals/ && echo "FENCE-B VIOLATION" || echo "Fence-B: CLEAN"

# R-1 determinism
grep -rnE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" \
  pkg/module/macro_signals/ && echo "R-1 VIOLATION" || echo "R-1: CLEAN"

# Scenario JSON valid
jq . docs/scenarios/macro-indicators/modules/macro-signals-golden.json > /dev/null && echo "JSON: valid" || echo "JSON: BROKEN"

# Sandbox module tier (if cmd/sandbox already supports -tier=module)
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all 2>&1 | tail -5
```

---

## Commit Message Template

```
feat(macro-indicators): P1-C1 — module stub macro-signals (composition via ports, G12 streak #2)

Advances G2 (module composes primitives) + G12 (sandbox green before done, streak task #2 of 3).

Day 0 lesson L1 (TA pilot carry-over): ship thin module stub to validate wiring pattern before Phase 2.

Module:
- pkg/module/macro_signals/macro_signals.go (Signals struct + New constructor + ClassifyBatch)
- pkg/module/macro_signals/macro_signals_test.go (3+ table-driven test rows)
- docs/scenarios/macro-indicators/modules/macro-signals-golden.json (batch scenario)

Composition:
- Dependencies injected via constructor (macro-investment-clock.Classifier)
- Zero application/interface/infrastructure imports (Fence-B enforced)
- R-1 propagated (zero math/rand)
- G12 DoD gate: sandbox -tier=module exits 0, all scenarios PASS

Architecture brief: docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md §P1-C1
TA pilot precedent: @anchor 1776df8e (app/technical-analysis/pkg/module/macro pattern)
```

**Trailer (if code involved):**
```
AC: AC-1 ✓ AC-2 ✓ AC-3 ✓ AC-4 ✓ AC-5 ✓ AC-6 ✓
Task: P1-C1
```

---

## RETURN Block (Dev → PM/QA)

Once task is complete, dev-macro-indicators signals DONE with:

```
## RETURN

**Status:** DONE (all 6 ACs pass, R-1 clean, G12 sandbox green)

**Commits (L84 explicit):**
- Impl: <sha> (macro_signals.go + macro_signals_test.go + golden scenario JSON)
- Signal: <sha>

**Sandbox Output (G12 verification paste below):**
```
[module] macro-signals: macro-signals-golden ... PASS
---
Total: 1/1 PASS
Exit code: 0
```

**Smoke Checks:**
- [ ] go build ./pkg/module/macro_signals/... → exit 0
- [ ] go vet ./pkg/module/macro_signals/... → exit 0
- [ ] go test ./pkg/module/macro_signals/... → exit 0
- [ ] Fence-B grep → 0 matches (CLEAN)
- [ ] R-1 grep → 0 matches (CLEAN)
- [ ] Scenario JSON valid
- [ ] Sandbox module-tier green

**Deviations:** (if any, describe with severity + justification)

**Next:** P1-D1 (scenario JSON suite expansion), P1-E1 (dashboard card), P1-C1 unblocks both.
```

---

## Context for Dev

- **Anchor:** 1776df8e (verify `git merge-base --is-ancestor 1776df8e HEAD; echo $?` returns 0 pre+post)
- **Zone:** apps/macro-indicators/ (no cross-service mods)
- **Phase deadline:** 2026-07-04 (6 sprints)
- **TA pilot reference:** `git log --all --grep="P.*-.*module" --oneline | grep technical-analysis` (find module tasks from TA)
- **Module pattern:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md §P1-C1
- **Day 0 lesson L1:** TA learned shipping thin module stub early catches composition bugs before Phase 2. This task proves the pattern works.

---

## Knowledge Sources

- **Pilot charter:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md §Goals §G2 (Module composes primitives via ports)
- **Phase 1 plan:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md §P1-C1
- **TA DDD module pattern:** git show 1776df8e:apps/technical-analysis/pkg/module/macro/ (reference pattern — LOCKED at anchor)
- **P1-B1 primitive interface:** Read AC-1 output of P1-B1 task signal to confirm `Classifier` interface shape
- **Lesson L1:** docs/architecture-briefs/2026-05-23-macro-indicators-factory/01-lessons-from-ta-pilot.md §L1
- **DDD reference:** docs/standards/ddd-microservices.md (if exists, else refer to architecture brief §Architecture Layers)
