---
task_id: P1-D2
title: "Module-level scenario JSON (golden + edge fixtures for macro-signals composition validation)"
phase: "1"
pilot: "macro-indicators"
owner: "dev-macro-indicators"
goals: ["G2", "G7", "G12"]
files_touched:
  - "docs/scenarios/macro-indicators/module/macro-signals-golden.json (CREATE)"
  - "docs/scenarios/macro-indicators/module/macro-signals-edge.json (CREATE)"
estimate_hours: 0.5
ac_count: 4
blocked_by: ["P1-C1"]
unblocks: ["P1-E1"]
critical_path: true
---

# P1-D2 — Module-Level Scenario JSON (Golden + Edge Fixtures)

**Goal:** G2 (Module composes primitives via ports), G7 (Edit-JSON-and-rerun works), G12 (sandbox green before done)

**Criticality:** CRITICAL PATH to P1-E1 (dashboard stub). Validates G2 composition proof with frozen fixture data. Two scenario files only; 30m estimate.

---

## Background

P1-C1 proved the module composition pattern (thin DI constructor, ClassifyBatch method). P1-D2 provides the frozen fixture data to exercise that pattern:

- **golden scenario:** invokes `macro_signals.ClassifyBatch()` with known VN indicators → proves G2 wiring (module calls primitive via DI)
- **edge scenario:** empty batch → validates boundary handling

Both are **frozen fixture files** (JSON data only, no live API calls). These enable P1-E1 (dashboard stub) to render pre-computed results without waiting for scraper data.

Module-level scenarios differ from primitive-level (P1-D1):
- Primitive-level (P1-D1): tests 1 primitive in isolation
- Module-level (P1-D2): tests 1+ primitives composed via module DI

---

## Files Touched

### Scenario Fixtures (frozen fixture data)
- `docs/scenarios/macro-indicators/module/macro-signals-golden.json` (CREATE)
- `docs/scenarios/macro-indicators/module/macro-signals-edge.json` (CREATE)

**Directory structure must match sandbox runner expectation:**
```
docs/scenarios/macro-indicators/
├── module/
│   ├── macro-signals-golden.json
│   └── macro-signals-edge.json
└── primitives/
    ├── macro-investment-clock-golden.json  (from P1-B1/D1)
    ├── macro-investment-clock-edge.json
    └── macro-investment-clock-failure.json
```

Sandbox runner (from P1-A3) uses `-tier=module` to select `docs/scenarios/macro-indicators/module/` directory.

---

## Acceptance Criteria

### AC-1: Valid JSON (both files parse without errors)

**File 1: `macro-signals-golden.json`**
```json
{
  "name": "macro-signals golden batch",
  "input": {
    "indicators": ["VN_GOVERNMENT_SPENDING", "VN_EXPORT_GROWTH", "REGIONAL_EQUITY_INDEX"]
  },
  "expected_output": {
    "results": [
      {
        "indicator": "VN_GOVERNMENT_SPENDING",
        "tier": "VN_DIRECT",
        "score": 8,
        "phase": "CORE_VN"
      },
      {
        "indicator": "VN_EXPORT_GROWTH",
        "tier": "VN_DIRECT",
        "score": 8,
        "phase": "CORE_VN"
      },
      {
        "indicator": "REGIONAL_EQUITY_INDEX",
        "tier": "REGIONAL",
        "score": 5,
        "phase": "REGIONAL"
      }
    ]
  }
}
```

**File 2: `macro-signals-edge.json`**
```json
{
  "name": "macro-signals edge case: empty batch",
  "input": {
    "indicators": []
  },
  "expected_output": {
    "results": []
  }
}
```

**Validation command (smoke gate):**
```bash
jq . docs/scenarios/macro-indicators/module/macro-signals-golden.json > /dev/null
jq . docs/scenarios/macro-indicators/module/macro-signals-edge.json > /dev/null
echo "JSON VALID"
```

Both must exit 0.

**AC-1 PASS:** Both files parse via `jq` without error. No syntax issues.

---

### AC-2: Sandbox Module-Tier Green (G12 DoD Gate — HARD GATE, BLOCKING)

**Test command:**
```bash
cd apps/macro-indicators
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
```

**Expected behavior:**
- Reads both JSON files from `docs/scenarios/macro-indicators/module/`
- Executes `macro_signals.ClassifyBatch(...)` with inputs from golden + edge scenarios
- Compares actual results to `expected_output` in each JSON
- Exits 0 if all scenarios match expected
- Exits non-zero if any scenario fails

**Paste full sandbox output into RETURN block before declaring DONE.**

**AC-2 PASS:** Sandbox module-tier run exits 0 with both scenarios GREEN.

---

### AC-3: Golden Scenario Validates G2 Composition (Module Calls Primitive via DI)

**Verification (manual code inspection + sandbox output):**

1. **Code inspection:** `macro_signals.go` ClassifyBatch calls `s.clock.Classify(indicator)` for each indicator (inherited from P1-C1 DI constructor).
2. **Sandbox output shows:** Each result in golden scenario has `tier`, `score`, `phase` populated by macro-investment-clock primitive.
3. **G2 evidence:** Module's DI constructor receives `clock primitive.Classifier` and calls it via interface, NOT by importing implementation directly.

Example golden scenario shows VN_GOVERNMENT_SPENDING → VN_DIRECT tier 8 CORE_VN phase (values from P1-B1 macro-investment-clock lookup table).

**AC-3 PASS:** Golden JSON results match expected tier/score/phase from macro-investment-clock primitive (proof of G2 composition).

---

### AC-4: Zero Live API Calls in JSON Files

**Validation command:**
```bash
grep -c "http\|API\|fetch\|request\|FRED_API_KEY" \
  docs/scenarios/macro-indicators/module/macro-signals-golden.json \
  docs/scenarios/macro-indicators/module/macro-signals-edge.json
# Expected: 0
```

**AC-4 PASS:** Grep returns 0. JSON files contain only frozen fixture data (input + expected_output), no API endpoint references, no credentials.

---

## Composition Proof Section

### DI Constructor (from P1-C1)

```go
func New(clock primitive.Classifier) *Signals {
  return &Signals{clock: clock}
}
```

### ClassifyBatch Invocation (from P1-C1)

```go
func (s *Signals) ClassifyBatch(names []string) []primitive.Result {
  results := make([]primitive.Result, 0)
  for _, name := range names {
    result := s.clock.Classify(name)  // <— DI call to primitive
    results = append(results, result)
  }
  return results
}
```

**Proof:** Module constructor receives primitive via DI (no `new` keyword, no direct imports). Golden JSON invokes ClassifyBatch with 3 VN indicators → each primitive result becomes one JSON output entry.

---

## G12 DoD Gate (HARD GATE — BLOCKING)

Module-level scenarios enable sandbox to prove G2 composition **before** P1-E1 dashboard is wired. G12 rule: sandbox must be green before task DONE is declared.

**Gate enforcement:**
- Sandbox module-tier run (AC-2) MUST exit 0
- All scenarios (golden + edge) MUST show expected outputs
- If any scenario fails: task is NOT done. Fix, re-run. Each failed attempt = 1 cycle.

---

## R-1 Inherited (Deterministic Fixture Data)

Module scenario JSON files inherit R-1 constraint from P1-C1. JSON fixture data is **immutable** — no randomness, no live scraper data.

All values in `expected_output` are deterministically derived from macro-investment-clock tier lookup table (set in P1-B1, immutable).

---

## L84 Explicit-File Staging (Atomic Commit Discipline)

**Only 2 files touched; both are JSON fixtures (no code changes):**
```bash
git add docs/scenarios/macro-indicators/module/macro-signals-golden.json
git add docs/scenarios/macro-indicators/module/macro-signals-edge.json
git commit -m "feat(macro-indicators): P1-D2 — module-level scenario JSON (golden + edge fixtures)

Advances G2 per pilot-charter.md v2.0.

Module composition proof: macro-signals invokes macro-investment-clock via DI.
Frozen fixture data validates G2 wiring before P1-E1 dashboard (critical path).

- docs/scenarios/macro-indicators/module/macro-signals-golden.json (NEW)
- docs/scenarios/macro-indicators/module/macro-signals-edge.json (NEW)

Expected sandbox output: module-tier exit 0, all scenarios PASS.

Anchor: 1776df8e (held)."
```

**No `git add .` or `git add -A`.** Explicit per-file staging only.

---

## Smoke Check Commands

```bash
# 1. Validate JSON syntax
jq . docs/scenarios/macro-indicators/module/macro-signals-golden.json > /dev/null && \
jq . docs/scenarios/macro-indicators/module/macro-signals-edge.json > /dev/null && \
echo "JSON: PASS"

# 2. Zero forbidden API patterns
grep -c "http\|API\|fetch\|request\|FRED_API_KEY" \
  docs/scenarios/macro-indicators/module/*.json || echo "API check: PASS (0 matches)"

# 3. Sandbox module-tier green (AC-2 hard gate)
cd apps/macro-indicators
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
# Expected: exit 0, all scenarios PASS

# 4. All-tier still green (regression check)
go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
# Expected: exit 0, all tiers PASS

# 5. Anchor still reachable (immutable)
git log --oneline -1 1776df8e 2>/dev/null && echo "Anchor: PASS"
```

---

## Constraints

- **L84 binding:** Explicit per-file staging (`git add <path>`). No `-A`, no `.`
- **No --force, no --no-verify, no --no-gpg-sign** per charter §Constraints
- **No git push** (local-only; user owns push decision)
- **Anchor 1776df8e held** (no retag, no rewrite, no reset)
- **No modification to frozen files** (apps/technical-analysis/ out-of-zone, .golangci.yml, .github/workflows/ci.yml FROZEN at TA P2-A1/A2 close)

---

## Critical Notes

1. **Composition proof (G2):** Golden JSON invokes module.ClassifyBatch() with 3 VN indicators, verifies each returns tier/score/phase from primitive via DI. This is **proof that composition pattern works** before Phase 2 adds 5 more primitives.

2. **Critical path:** P1-D2 unblocks P1-E1 (dashboard stub) on the critical path to Phase 1 close. P1-D2 must DONE before P1-E1 can be dispatched.

3. **G12 streak:** P1-D2 is **NOT a streak task** (composition fixtures only, no new compiled code). P1-E1 is expected streak task #3 (dashboard renders primitive + module + service panels, sandbox green before DONE).

4. **Frozen fixture data:** Both JSON files are immutable once DONE. If new primitives are added in Phase 2, new module scenarios are added as separate files (macro-signals-phase2.json, etc.), not by modifying golden/edge.

5. **30-minute estimate:** 2 JSON files, no code implementation. Straightforward frozen fixture authoring. If sandbox runner requires infrastructure setup, that's a P1-A3 rework (not in scope for P1-D2).

---

## RETURN Block Template

Once P1-D2 is DONE, fill this in:

```
## RETURN — P1-D2 Module-Level Scenario JSON (Macro-Signals)

**Status:** DONE

**Completion signal:** docs/signals/dev-macro-p1-d2-done-<UTC>.json

**Commits:**
- <impl-commit-SHA> (macro-signals-golden.json + macro-signals-edge.json)
- <signal-commit-SHA> (completion signal)

**AC results:** 4/4 PASS
- AC-1: Valid JSON ✓
- AC-2: Sandbox module-tier green ✓
- AC-3: Golden validates G2 composition ✓
- AC-4: Zero API calls ✓

**Sandbox output (module-tier, pasted below):**
```
(paste full output of: go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all)
```

**Additional checks:**
- go build ./... → exit 0
- go vet ./... → exit 0
- jq validation → all 2 JSON files parse ✓
- Grep forbidden patterns → 0 matches ✓
- L84 compliance → 2 files, explicit git add per file ✓
- Anchor 1776df8e → reachable ✓

**Deviations:** (none expected for frozen fixture files; list any if found)

**Unblocks:** P1-E1 (dashboard stub, critical path)
```

---

## Knowledge & References

- **Parent task:** P1-C1 (macro_signals module stub, composition pattern)
- **Primitive baseline:** P1-B1 (macro-investment-clock tier lookup table)
- **Architect vision:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` §P1-D2
- **TA pilot precedent:** `docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md` (scenario JSON authoring pattern)
- **G2 definition:** charter §G2 — Module composes primitives via ports
- **G7 definition:** charter §G7 — Edit-JSON-and-rerun works (zero credentials in sandbox)
- **G12 definition:** charter §G12 + flow rules — sandbox green before DONE
- **Anchor:** TA pilot P1-A3 sandbox runner (anchor 1776df8e)

---

## Compliance Checklist

- [ ] Both JSON files created and valid (AC-1 jq passes)
- [ ] Sandbox module-tier test command runs and exits 0 (AC-2 hard gate)
- [ ] Golden scenario results match expected tier/score/phase (AC-3 composition proof)
- [ ] Zero API endpoint references in JSON files (AC-4)
- [ ] Smoke checks all PASS (JSON syntax, forbidden patterns, go build, go vet, anchor reachable)
- [ ] Explicit per-file `git add` (L84 discipline)
- [ ] Commit message references charter goals (G2/G7/G12), file paths, and anchor
- [ ] Sandbox output pasted into RETURN block before declaring DONE
- [ ] All-tier sandbox test also passes (regression check)

