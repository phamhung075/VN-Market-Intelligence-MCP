---
task_id: P1-B1
title: "Extract first primitive: macro-investment-clock (deterministic tier lookup + table-driven test + scenarios)"
phase: "1"
pilot: "macro-indicators"
owner: "dev-macro-indicators"
goals: ["G1", "G7", "G12"]
files_touched:
  - "apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock.go (CREATE)"
  - "apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock_test.go (CREATE)"
  - "docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json (CREATE)"
  - "docs/scenarios/macro-indicators/primitives/macro-investment-clock-edge.json (CREATE)"
  - "docs/scenarios/macro-indicators/primitives/macro-investment-clock-failure.json (CREATE)"
estimate_hours: 2.0
ac_count: 7
blocked_by: ["P1-A5"]
unblocks: ["P1-C1"]
---

# P1-B1 — Extract First Primitive: macro-investment-clock

**Goal:** G1 (Primitives ship with scenarios), G7 (Edit-JSON-and-rerun), G12 (Dev-macro-indicators flow requires dashboard-green before done)

**Criticality:** First primitive after A-bucket scaffold completion. TWO NEW HARD GATES ACTIVATE ON THIS TASK:
1. **R-1 HARD GATE (AC-6):** Deterministic scoring — NO `math/rand` anywhere
2. **G12 DoD GATE (AC-N):** Sandbox MUST be green before commit

---

## Background

The TypeScript `MacroScoreService.scoreIndicator()` uses `Math.random()` to add variance to scores:
```typescript
// TS source (apps/macro-indicators/src/domain/services.ts):
scoreIndicator(name: string): MacroScoreTier {
  if (vn_indicators.includes(name)) {
    return { tier: "VN_DIRECT", score: 8 + Math.floor(Math.random() * 3) };
  }
  // ...
}
```

This non-deterministic behavior breaks stable scenario JSON testing. **The Go rewrite must replace `Math.random()` with deterministic fixed-score lookup** per tier classification.

**Phase classification logic (new in Go, derived from regime analysis in TA pilot):**
- Score ≥ 8 (VN_DIRECT) → Phase = "CORE_VN"
- Score ≥ 5 (REGIONAL) → Phase = "REGIONAL"
- Score < 5 (US_DOMESTIC) → Phase = "US_DOMESTIC"

---

## Files Touched

### Implementation
- `apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock.go` (CREATE)
- `apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock_test.go` (CREATE)

### Test Scenarios (frozen fixture data)
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json` (CREATE)
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-edge.json` (CREATE)
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-failure.json` (CREATE)

---

## Acceptance Criteria

### AC-1: Tier-to-Score Mapping (Deterministic, NOT Random)

**Required constant definitions** (exported as `const`):
```go
const (
  VN_DIRECT_TIER      = "VN_DIRECT"
  VN_DIRECT_SCORE     = 8
  REGIONAL_TIER       = "REGIONAL"
  REGIONAL_SCORE      = 5
  US_DOMESTIC_TIER    = "US_DOMESTIC"
  US_DOMESTIC_SCORE   = 2
)
```

**Function signature:**
```go
type InvestmentClockInput struct {
  IndicatorName string `json:"indicatorName"`
}

type InvestmentClockOutput struct {
  Tier  string `json:"tier"`
  Score int    `json:"score"`
  Phase string `json:"phase"`
}

func Classify(input InvestmentClockInput) InvestmentClockOutput
```

**Tier classification logic** (ported from TS `scoreIndicator()`):
- If `IndicatorName` is in VN_DIRECT_INDICATORS list → Tier="VN_DIRECT", Score=8
- Else if in REGIONAL_INDICATORS list → Tier="REGIONAL", Score=5
- Else → Tier="US_DOMESTIC", Score=2

**Indicator lists** (extract from TS `src/domain/defaults.ts`):
- VN_DIRECT_INDICATORS: VN_CPI, VN_UNEMPLOYMENT, VN_INTEREST_RATE, ... (at least 3)
- REGIONAL_INDICATORS: ASEAN_GROWTH, APAC_PMI, ... (at least 2)
- US_DOMESTIC_INDICATORS: (empty or fallthroughs)

**Evidence:** `grep -E "const.*INDICATOR" apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock.go` should show both lists.

---

### AC-2: Phase Classification (Score-Based)

After `Classify()` returns, apply phase logic:
- Output.Score ≥ 8 → Output.Phase = "CORE_VN"
- Output.Score ≥ 5 → Output.Phase = "REGIONAL"
- Output.Score < 5 → Output.Phase = "US_DOMESTIC"

**Deterministic guarantee:** Same indicator name → same output every time.

**Evidence:** Table-driven test (AC-3) verifies this.

---

### AC-3: Table-Driven Test with ≥5 Rows

File: `apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock_test.go`

Test structure:
```go
func TestClassify(t *testing.T) {
  tests := []struct {
    name     string
    input    InvestmentClockInput
    expected InvestmentClockOutput
  }{
    // Row 1: VN indicator → VN_DIRECT, score 8, phase CORE_VN
    // Row 2: ASEAN indicator → REGIONAL, score 5, phase REGIONAL
    // Row 3: US indicator → US_DOMESTIC, score 2, phase US_DOMESTIC
    // Row 4: Empty string → fallthrough to US_DOMESTIC, score 2, phase US_DOMESTIC
    // Row 5: Unknown indicator → fallthrough to US_DOMESTIC, score 2, phase US_DOMESTIC
    // (Add more rows if needed for edge coverage)
  }
  // ... standard table-driven loop
}
```

**Evidence:** `go test ./pkg/primitive/macro_investment_clock/... -v` exits 0 with ≥5 test cases passing.

---

### AC-4: Scenario JSON Files (Golden, Edge, Failure)

**File 1: `docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json`**
```json
{
  "name": "VN_CPI_indicator",
  "input": { "indicatorName": "VN_CPI" },
  "expected": {
    "tier": "VN_DIRECT",
    "score": 8,
    "phase": "CORE_VN"
  },
  "shouldPass": true
}
```

**File 2: `docs/scenarios/macro-indicators/primitives/macro-investment-clock-edge.json`**
```json
{
  "name": "empty_string_indicator",
  "input": { "indicatorName": "" },
  "expected": {
    "tier": "US_DOMESTIC",
    "score": 2,
    "phase": "US_DOMESTIC"
  },
  "shouldPass": true
}
```

**File 3: `docs/scenarios/macro-indicators/primitives/macro-investment-clock-failure.json`**
```json
{
  "name": "null_indicator_error",
  "input": { "indicatorName": null },
  "expected": null,
  "shouldPass": false,
  "errorType": "invalid_input"
}
```

**Verification:**
```bash
find docs/scenarios/macro-indicators/primitives -name 'macro-investment-clock-*.json' -exec jq . {} \; > /dev/null
# Expected: exit 0 (all valid JSON)
```

---

### AC-5: Fence-A Pre-Check (No Cross-Layer Imports)

**No imports from `application/`, `infrastructure/`, or `interface/` layers** into the primitive package.

**Evidence:**
```bash
grep -rn "application\|interface\|infrastructure" apps/macro-indicators/pkg/primitive/macro_investment_clock/*.go
# Expected: exit 1 (zero matches — grep finds nothing)
```

All imports in `macro_investment_clock.go` must be standard library only (e.g., `encoding/json`, `fmt`, etc.).

---

### AC-6: R-1 HARD GATE — NO math/rand, NO rand.Intn, NO rand.Float (BINDING)

**Critical guard:** The Go rewrite MUST use deterministic tier lookup, never random seeding.

**Grep verification (MANDATORY before commit):**
```bash
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed|time\.Now.*nanosecond" \
  apps/macro-indicators/pkg/primitive/macro_investment_clock/ \
  apps/macro-indicators/cmd/server/main.go \
  apps/macro-indicators/cmd/sandbox/main.go
# Expected: exit 1 or count=0 (ZERO matches)
```

**Rationale:** Non-deterministic domain logic cannot produce stable scenario JSON. The entire testing strategy (G7 edit-JSON-and-rerun) depends on this.

**Failure mode:** If any `math/rand` or random-seeding is found, task is BLOCKED. Commit will be rejected. Fix required before resubmission.

---

### AC-7: G12 DoD GATE — Sandbox MUST be GREEN Before Commit (BINDING)

**Critical rule (carries forward from L6 TA pilot lesson):** Do not mark task DONE until the sandbox dashboard shows all macro-investment-clock scenarios green.

**Pre-commit sandbox run (MANDATORY):**
```bash
cd apps/macro-indicators
# Run primitive-level sandbox
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all

# Expected output:
# ✓ scenario: macro-investment-clock-golden → PASS
# ✓ scenario: macro-investment-clock-edge → PASS
# ✓ scenario: macro-investment-clock-failure → PASS
# Summary: 3/3 PASS

# Both runs must exit 0:
echo $?
# Expected: 0
```

**Evidence requirement:** Paste the full sandbox output summary into the RETURN block (below) before declaring task done.

**Failure mode:** If any scenario fails (RED), task is NOT done. Fix the code/scenario, re-run sandbox. Each non-green attempt = 1 additional cycle (counted toward G10/G11 regression alarm).

---

## Forward-Looking: R-3 Propagation (Still HIGH)

**R-3 (DDD violation: 4 MCP tools bypass HTTP)** remains HIGH priority for Phase 2 P2-B scope expansion.

The 4 tools in `apps/mcp-server/src/interface/mcp/tools/macro/` will need HTTP rewire after this primitive ships:
- `get_macro_snapshot` → HTTP POST `/snapshot`
- `get_carry_trade_signal` → HTTP POST `/carry-trade` (Phase 2 primitive)
- `get_yield_spread_signal` → HTTP POST `/yield-spread` (Phase 2 primitive)
- `get_macro_calendar` → HTTP POST `/calendar` (Phase 2 primitive)

**Phase 1 scope:** This task (P1-B1) does NOT include rewire. Phase 2 task plan (architect expands at Phase 1 close) will list R-3 explicitly in P2-B task scope. PM will note this in Phase 2 dispatch signals.

---

## Forbidden

- **NO `--force`, `--no-verify`, `--no-gpg-sign`**
- **NO modification to `apps/technical-analysis/` (out-of-zone)**
- **NO modification to `docs/architecture-briefs/` or `docs/policies/` (other PM agents' zones)**
- **L84 discipline:** `git add` with explicit file paths only (no `-A`, no `.`)

---

## Smoke Check

After all 5 ACs pass:

```bash
cd apps/macro-indicators

# 1. Build check
go build ./...
# Expected: exit 0

# 2. Vet check
go vet ./...
# Expected: exit 0

# 3. Test check (must show all tests GREEN)
go test ./pkg/primitive/macro_investment_clock/... -v
# Expected: exit 0, ≥5 test cases PASS

# 4. R-1 grep guard (HARD GATE)
grep -rE "math/rand|rand\.Intn|rand\.Float" pkg/primitive/macro_investment_clock/ cmd/server/main.go cmd/sandbox/main.go
# Expected: exit 1 (zero matches)

# 5. G12 sandbox run (HARD GATE)
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
# Expected: exit 0, all scenarios PASS

# 6. Lint check (if golangci-lint available)
golangci-lint run ./pkg/primitive/macro_investment_clock/... 2>/dev/null || echo "lint skip (not in dev env)"
```

---

## Commit Message Template

```
feat(macro-indicators): P1-B1 — macro-investment-clock primitive (deterministic tier lookup)

Extracts first Go primitive from TS MacroScoreService.scoreIndicator().
Replaces Math.random() with deterministic fixed-score lookup per tier.

Goals: G1 (primitives + scenarios), G7 (edit-rerun), G12 (sandbox green).

Hard gates active on P1-B1:
- R-1 GATE: grep -rE math/rand|rand\.Intn|rand\.Float → 0 matches
- G12 GATE: go run ./cmd/sandbox -tier=primitive → exit 0, all PASS

Files touched:
- apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock.go (CREATE)
- apps/macro-indicators/pkg/primitive/macro_investment_clock/macro_investment_clock_test.go (CREATE)
- docs/scenarios/macro-indicators/primitives/macro-investment-clock-{golden,edge,failure}.json (CREATE)

Test: 5 table-driven rows; sandbox output 3/3 green (pasted in RETURN).
Fence-A: domain layer imports zero app/infra/interface.
L84: 5 files explicitly staged.

ACs: 1-7 PASS. R-1 + G12 gates verified pre-commit.
```

---

## RETURN

**When task is complete, fill in this block and submit:**

```
TASK: P1-B1 — macro-investment-clock
OWNER: dev-macro-indicators
ESTIMATE: 2.0 hours
BLOCKED_BY: P1-A5 ✓ (GREEN)
UNBLOCKS: P1-C1

AC-1 DETERMINISTIC TIER LOOKUP:
  Status: [PASS / FAIL]
  Evidence: (const definitions, tier lists)

AC-2 PHASE CLASSIFICATION:
  Status: [PASS / FAIL]
  Evidence: (score→phase mapping verified)

AC-3 TABLE-DRIVEN TEST (≥5 rows):
  Status: [PASS / FAIL]
  Test runs: go test ./pkg/primitive/macro_investment_clock/... -v
  Output: (paste top 10 lines of test output)

AC-4 SCENARIO JSON FILES:
  Status: [PASS / FAIL]
  Files: (list 3 files created)
  jq verify: (jq . on all 3 files exits 0)

AC-5 FENCE-A PRE-CHECK:
  Status: [PASS / FAIL]
  Evidence: grep -rn "application|interface|infrastructure" → 0 matches

AC-6 R-1 HARD GATE (NO math/rand):
  Status: [PASS / FAIL — BLOCKING]
  Evidence: grep -rE "math/rand|rand\.Intn|rand\.Float" → exit 1, 0 matches

AC-7 G12 DoD GATE (Sandbox GREEN):
  Status: [PASS / FAIL — BLOCKING]
  Sandbox output (primitive tier):
  ─────────────────────────────────────
  (paste full go run ./cmd/sandbox -tier=primitive output here)
  ─────────────────────────────────────
  Expected: ✓ 3 scenarios PASS, exit 0

COMMIT: (SHA of impl + signal)
  Impl commit: [SHA]
  Signal commit: [SHA]

FENCE-A VERIFIED: yes/no
R-1 GATE VERIFIED: yes/no (MANDATORY)
G12 GATE VERIFIED: yes/no (MANDATORY)
L84 DISCIPLINE: [file count] files explicitly staged

READY_FOR_P1-C1: [YES / NO — ONLY if R-1 + G12 both PASS]
```

---

## Notes

- **P1-B1 is the first primitive** — scaffold→business-logic boundary crossing. New gates activate here and persist through Phase 1 (P1-C1, P1-E1 are also G12 streak tasks).
- **R-1 grep guard is non-negotiable.** If `math/rand` appears anywhere, task is blocked indefinitely until removed. Commit rejected by pre-commit hook.
- **G12 sandbox green is a hard completion requirement** (not just "nice to have"). If sandbox fails, the primitive cannot be tested in Phase 2 scenarios, and G1 (Primitives ship with scenarios) fails.
- **Phase classification logic (CORE_VN / REGIONAL / US_DOMESTIC) is a Go invention** — not directly ported from TS. Architect designed this in phase-1-task-plan-go.md §Per-Task AC. New logic must match the spec exactly.
- **No TS-to-Go scraper porting yet.** Phase 1 uses frozen fixture JSON. Live scraper integration (FRED, World Bank, etc.) is Phase 2 P2-B scope.

---

**Status:** READY-FOR-DISPATCH to dev-macro-indicators
**Dispatch at:** cycle-35 (PM closes P1-A5, dispatches P1-B1)
