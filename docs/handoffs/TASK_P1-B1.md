---
task_id: P1-B1
pilot: stock-price
phase: 1
title: "Extract first primitive: price-quote-normalizer + R-CGO gate"
from: pm
to: dev-stock-price
date: 2026-05-24
sprint_deadline: 2026-07-04
estimated_hours: 2
wip_position: "sequential task 1 (after P1-A); P1-B2 held until P1-B1 DONE"
prerequisite: "P1-A DONE (afe3468b, 2026-05-24T00:46:00Z)"
---

# TASK P1-B1 — Extract first primitive: `price-quote-normalizer` + R-CGO Gate

**Owner:** dev-stock-price  
**Estimated effort:** 2 hours  
**WIP status:** Sequential (P1-B2 held until this task DONE)  
**Charter ref:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md`  
**Task plan ref:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md § P1-B1`  

---

## Summary

Extract the **first primitive** `price-quote-normalizer` from the duplicated field-mapping logic currently spread across three tier fetchers in `pkg/infrastructure/fetchers.go` (Tier1 L60–83, Tier2 L123–148, Tier3 L185–195). This primitive is the **highest-leverage refactor** and must pass the **R-CGO hard-blocker gate** (AC-5/6/7/8) before P1-B2 can be dispatched.

**Critical:** The R-CGO gate (AC-8) is a **BLOCKER**. If AC-5, AC-6, or AC-7 fail, **STOP immediately**. Do NOT continue to P1-B2. Escalate to PM for architect re-cut.

---

## Acceptance Criteria

### AC-1: Function signature and export (primitive interface)

**Statement:** `pkg/primitive/price-quote-normalizer/normalizer.go` exports a public function with the exact signature:

```go
func NormalizeQuote(
    rawPrice, rawVolume, rawChange, rawChangePct float64,
    code string,
    source domain.PriceSource,
    fetchedAt string,
    latencyMs int64,
) domain.PriceQuote
```

**Output fields match:** The function returns a `domain.PriceQuote` struct with byte-identical field names and types to the current shape:
- `Code` (string)
- `Price` (float64)
- `Volume` (float64)
- `Change` (float64)
- `ChangePercent` (float64)
- `Source` (domain.PriceSource)
- `FetchedAt` (string)
- `LatencyMs` (int64)

**Evidence:** Paste the function signature from the source file into this handoff when DONE.

---

### AC-2: Table-driven test with ≥5 rows

**Statement:** `pkg/primitive/price-quote-normalizer/normalizer_test.go` contains a table-driven test suite with **at least 5 test rows**, covering:

1. **Happy path (VCB HOSE):** rawPrice=85000, rawVolume=1000000, rawChange=500, rawChangePct=0.59, source=HOSE → canonical PriceQuote
2. **HNX price with different field names:** rawPrice=50000, rawVolume=500000, rawChange=-100, rawChangePct=-0.20, source=HNX → canonical PriceQuote
3. **Cache price (zero change/changePct):** rawPrice=75000, rawVolume=0, rawChange=0, rawChangePct=0, source=CACHE → PriceQuote with zero Change/ChangePercent
4. **Zero volume edge case:** rawPrice=60000, rawVolume=0, rawChange=150, rawChangePct=0.25, source=HOSE → canonical PriceQuote with Volume=0
5. **Empty code edge case:** rawPrice=70000, rawVolume=1000, rawChange=0, rawChangePct=0, code="", source=HNX → returns sentinel zero-value or handles gracefully

**Evidence:** Run `cd apps/stock-price && go test ./pkg/primitive/price-quote-normalizer/... -v`. Paste the test output summary into this handoff.

---

### AC-3: Unit tests pass

**Statement:** `go test ./pkg/primitive/price-quote-normalizer/...` exits with code 0. Zero failures, zero panics.

**Evidence:** Paste the test output showing all tests PASS.

---

### AC-4: Sandbox green (primitive tier)

**Statement:** The newly extracted primitive runs without error under the sandbox runner:

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

**Expected:** Command exits 0. All scenario files execute and produce PASS verdicts. No errors or panics.

**Evidence:** Paste the complete sandbox output (including any scenario summaries and exit code) into this handoff.

---

### AC-5 (R-CGO-1): Build under CGO_ENABLED=0

**Statement:** The sandbox builds successfully with CGO disabled:

```bash
cd apps/stock-price
CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox
```

**Expected:** Command exits 0. The resulting binary is a valid executable.

**Binding:** If this exits non-zero → **R-CGO BLOCKED**. STOP immediately. Do NOT proceed to AC-6/7/8. Escalate to PM + architect.

**Evidence:** Paste the full command output (including exit code).

---

### AC-6 (R-CGO-2): Zero CGO imports in primitive package

**Statement:** The primitive package contains zero CGO-related code:

```bash
grep -rn "mattn/go-sqlite3\|cgo\|import \"C\"" apps/stock-price/pkg/primitive/price-quote-normalizer/
```

**Expected:** Command exits 1 (zero matches).

**Binding:** If this returns matches → **R-CGO BLOCKED**. STOP immediately. Do NOT proceed to AC-7/8. Escalate.

**Evidence:** Paste the command output (which should be empty or show "no matches").

---

### AC-7 (R-CGO-3): Zero infrastructure imports in primitive (Fence-B)

**Statement:** The primitive package contains zero infrastructure layer imports:

```bash
grep -rn "pkg/infrastructure" apps/stock-price/pkg/primitive/price-quote-normalizer/
```

**Expected:** Command exits 1 (zero matches).

**Binding:** If this returns matches → **R-CGO BLOCKED**. STOP immediately. Do NOT proceed to AC-8. Escalate.

**Evidence:** Paste the command output (which should be empty or show "no matches").

---

### AC-8 (R-CGO-GATE — CRITICAL BLOCKER)

**Statement:** Verdict on R-CGO clearance:

**IF AC-5 + AC-6 + AC-7 ALL PASS:**
- Record verdict: **R-CGO CLEAR**
- Proceed to P1-B2 (PM will dispatch next task)
- Paste all three command outputs as evidence into this section

**IF ANY of AC-5, AC-6, AC-7 FAIL:**
- Record verdict: **R-CGO BLOCKED**
- **STOP Phase 1 immediately**
- Do NOT continue to P1-B2, P1-B3, or any further task
- Notify PM in WORK channel: "P1-B1 R-CGO gate BLOCKED — [which AC failed] — awaiting architect re-cut"
- Paste the failing command output into this section as evidence of the blocker

**This is a hard gate. Phase 1 cannot advance past this task without R-CGO CLEAR.**

---

### AC-9: Fence-A pre-check (architecture boundary)

**Statement:** The primitive package imports only stdlib and `pkg/primitive/*` (Fence-A):

```bash
grep -rn "application\|interface/http\|infrastructure" apps/stock-price/pkg/primitive/price-quote-normalizer/
```

**Expected:** Command exits 1 (zero matches).

**Evidence:** Paste the command output.

---

### G12 DoD Gate (sandbox green before RETURN)

**Statement:** Before you write the RETURN block, sandbox must show all scenarios passing:

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

**Expected:** Exit code 0. All scenario JSON files from `docs/scenarios/stock-price/primitives/` pass.

**Evidence:** Paste the complete sandbox output summary. Example:
```
price-quote-normalizer-golden.json: PASS
price-quote-normalizer-edge.json: PASS
price-quote-normalizer-failure.json: PASS
Total: 3 scenarios, 3 PASS, 0 FAIL, exit code 0
```

---

## Scenario JSON Files to Create

You must create **three scenario JSON files** in `docs/scenarios/stock-price/primitives/`:

### 1. `price-quote-normalizer-golden.json`

**Purpose:** Happy-path normalization of a real quote.

**Sample structure:**
```json
{
  "scenario": "price-quote-normalizer-golden",
  "input": {
    "rawPrice": 85000,
    "rawVolume": 1000000,
    "rawChange": 500,
    "rawChangePct": 0.59,
    "code": "VCB",
    "source": "hose",
    "fetchedAt": "2026-05-24T10:30:00Z",
    "latencyMs": 150
  },
  "expectedOutput": {
    "code": "VCB",
    "price": 85000,
    "volume": 1000000,
    "change": 500,
    "changePercent": 0.59,
    "source": "hose",
    "fetchedAt": "2026-05-24T10:30:00Z",
    "latencyMs": 150
  }
}
```

### 2. `price-quote-normalizer-edge.json`

**Purpose:** Edge cases: zero volume, zero change, empty fields.

**Sample structure:**
```json
{
  "scenario": "price-quote-normalizer-edge",
  "input": {
    "rawPrice": 75000,
    "rawVolume": 0,
    "rawChange": 0,
    "rawChangePct": 0,
    "code": "ACB",
    "source": "cache",
    "fetchedAt": "2026-05-24T09:00:00Z",
    "latencyMs": 0
  },
  "expectedOutput": {
    "code": "ACB",
    "price": 75000,
    "volume": 0,
    "change": 0,
    "changePercent": 0,
    "source": "cache",
    "fetchedAt": "2026-05-24T09:00:00Z",
    "latencyMs": 0
  }
}
```

### 3. `price-quote-normalizer-failure.json`

**Purpose:** Error case — empty code string; primitive either returns sentinel or handles gracefully.

**Sample structure:**
```json
{
  "scenario": "price-quote-normalizer-failure",
  "input": {
    "rawPrice": 70000,
    "rawVolume": 1000,
    "rawChange": 100,
    "rawChangePct": 0.14,
    "code": "",
    "source": "hnx",
    "fetchedAt": "2026-05-24T10:15:00Z",
    "latencyMs": 200
  },
  "expectedOutput": {
    "code": "",
    "price": 70000,
    "volume": 1000,
    "change": 100,
    "changePercent": 0.14,
    "source": "hnx",
    "fetchedAt": "2026-05-24T10:15:00Z",
    "latencyMs": 200,
    "_error": null
  }
}
```

---

## Files to be Created/Modified

| File | Action | Status |
|------|--------|--------|
| `apps/stock-price/pkg/primitive/price-quote-normalizer/normalizer.go` | CREATE | — |
| `apps/stock-price/pkg/primitive/price-quote-normalizer/normalizer_test.go` | CREATE | — |
| `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json` | CREATE | — |
| `docs/scenarios/stock-price/primitives/price-quote-normalizer-edge.json` | CREATE | — |
| `docs/scenarios/stock-price/primitives/price-quote-normalizer-failure.json` | CREATE | — |

---

## Notes

- **Do not modify** `apps/stock-price/pkg/infrastructure/fetchers.go` in this task (that's Phase 2 scope, G5a).
- **Do not import** the infrastructure layer, `mattn/go-sqlite3`, or any application/interface layer in this primitive.
- **Extracting from:** The field mapping logic that appears duplicated in Tier1/Tier2/Tier3 fetchers. Look for the pattern of mapping raw exchange fields → `domain.PriceQuote` fields.
- **Sandbox execution:** The `cmd/sandbox/` runner (from P1-A) will discover and load your scenario JSON files automatically.
- **Commit message:** Include "P1-B1: extract price-quote-normalizer primitive + 3 scenarios" and reference the task id and R-CGO gate passage.

---

## Success Criteria

You are DONE when:

1. ✓ All ACs 1–9 pass
2. ✓ R-CGO gate (AC-8) is **CLEAR** (or **BLOCKED** with escalation evidence)
3. ✓ G12 sandbox output is GREEN and pasted into the handoff
4. ✓ Committed to `main`
5. ✓ You have emitted a completion signal `docs/signals/dev-stock-price-p1-b1-done-<UTC>.json` with all AC verdicts and the R-CGO verdict

If R-CGO is BLOCKED, emit a **blocker signal** instead and notify PM in WORK channel.

---

## RETURN Block (written by dev-stock-price when DONE)

_(This section is left blank for you to fill in once the task is complete. Include commit SHA, all AC evidence, R-CGO gate verdict, and the sandbox output summary.)_
