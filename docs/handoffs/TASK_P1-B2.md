---
task_id: P1-B2
pilot: stock-price
phase: 1
phase_type: ATOMIC-TASK
assigned_to: dev-stock-price
assigned_at: "2026-05-24T01:05:00Z"
assigned_by: pm
handoff_file_version: "1.0"
parent_task: P1-B1
blocks_task: P1-B3
charter_ref: docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md
task_plan_ref: docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md §P1-B2
---

# TASK_P1-B2 — Second Primitive: `tier-fallback-selector`

**Assigned:** dev-stock-price (2026-05-24T01:05:00Z by pm)
**Sequential context:** P1-B1 DONE (R-CGO CLEAR), P1-B2 now unblocked. WIP=1 — P1-B3 held pending P1-B2 DONE.
**G12 streak task:** #2 of 3 (prior: P1-B1 ✓, next: P1-B3)
**G12 DoD requirement:** Sandbox all-green (all P1-B1 + P1-B2 scenarios) before marking DONE.

---

## What You're Building

Extract the **tier-fallback-selector** primitive from `domain/services.go` L53–65 (the result-walk loop in `ResolvePriceService.FetchPrice`). This is the pure decision logic: given an ordered list of tier results (each = quote OR error), decide which tier "wins" and return the selected quote or an error.

The selector implements the 3-tier fallback contract: **T1 wins if available → else T2 → else T3 → else PriceNotAvailableError.**

---

## Acceptance Criteria (6 total)

### AC-1: Exported types and function

`apps/stock-price/pkg/primitive/tier-fallback-selector/selector.go` exports:

```go
type TierResult struct {
    Quote *domain.PriceQuote
    Err   error
}

func SelectWinningTier(results []TierResult) (*domain.PriceQuote, error)
```

**Evidence:** Paste the function signature and type definition from `selector.go`.

---

### AC-2: Table-driven test with ≥6 rows

File: `apps/stock-price/pkg/primitive/tier-fallback-selector/selector_test.go`

Test at least these 6 scenarios:

1. **T1 wins** — T1 non-nil quote, T2 and T3 also non-nil → returns T1 quote
2. **T2 fallback** — T1 nil, T2 non-nil quote → returns T2 quote
3. **T3 fallback** — T1 nil, T2 nil, T3 non-nil quote → returns T3 quote
4. **All nil** — all three tiers return nil quote (all Err=nil) → returns `PriceNotAvailableError`
5. **All errored** — all three tiers return error (Err != nil) → returns `PriceNotAvailableError`
6. **Mixed nil + error** — T1 nil+error, T2 nil, T3 non-nil quote → T3 wins (first non-nil quote wins)

Table-driven pattern (GoTest standard). ✓

**Evidence:** Paste the test table structure and test body from `selector_test.go`.

---

### AC-3: Unit test passes

```bash
cd apps/stock-price
go test ./pkg/primitive/tier-fallback-selector/...
```

Must exit 0 (no failures, no panics).

**Evidence:** Paste the exit code and test summary (`ok github.com/vn-market-intelligence/stock-price/pkg/primitive/tier-fallback-selector ... ok`).

---

### AC-4: Fence-A compliance (R-CGO inherited from P1-B1)

```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" apps/stock-price/pkg/primitive/tier-fallback-selector/
```

Must exit 1 (zero matches). No CGO, no infrastructure imports.

**Why this matters:** R-CGO is already CLEARED from P1-B1. P1-B2 inherits that cleared status but MUST pass the per-primitive grep to confirm the fence is not violated by this new primitive.

**Evidence:** Paste the grep command and the "exit 1 (0 matches)" result.

---

### AC-5: Sandbox exits 0 with all scenarios green

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

Must exit 0. The sandbox now covers both P1-B1 scenarios (price-quote-normalizer: 3 JSONs) and P1-B2 scenarios (tier-fallback-selector: 3 JSONs) = 6 scenarios total.

**Evidence:** Paste the full sandbox output, showing all 6 scenarios passing (or more if P1-B1 added additional scenarios).

---

### AC-6: G12 DoD Gate (streak task #2) — Dashboard green before RETURN

**Hard rule:** Do not mark this task DONE until sandbox shows all scenarios green (AC-5). This is the second consecutive task with the DoD gate satisfied — part of the G12 earn-pending evidence chain (1/3 ✓, 2/3 pending, 3/3 pending).

**What this means:**
- Your handoff must include the sandbox-green evidence from AC-5.
- QA will verify this task's sandbox green evidence alongside P1-B1's when closing P1-G.
- Once P1-B3 is also DONE with sandbox green, G12 streak = 3/3 CONFIRMED (not YES until PO flips it at 12/12 terminal).

**Evidence:** Paste the sandbox output summary confirming all scenarios PASS.

---

## Files to Create

| File | Type | Purpose |
|---|---|---|
| `apps/stock-price/pkg/primitive/tier-fallback-selector/selector.go` | CREATE | Pure selector logic: given `[]TierResult`, return winning quote or error. |
| `apps/stock-price/pkg/primitive/tier-fallback-selector/selector_test.go` | CREATE | Table-driven test (≥6 rows). |
| `docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json` | CREATE | Golden: T1 non-nil, T2/T3 also present → T1 selected (source=hose). |
| `docs/scenarios/stock-price/primitives/tier-fallback-selector-edge.json` | CREATE | Edge: T1 nil, T2 non-nil → T2 selected (source=hnx). |
| `docs/scenarios/stock-price/primitives/tier-fallback-selector-failure.json` | CREATE | Failure: all nil → `PriceNotAvailableError`. |

---

## Scenario JSON Specification

Each scenario is a test case for the sandbox. The sandbox will load these JSONs and invoke `SelectWinningTier()`.

### `tier-fallback-selector-golden.json` — T1 wins

```json
{
  "description": "T1 non-nil, T2/T3 also present — T1 selected",
  "input": {
    "results": [
      {
        "quote": {
          "code": "VCB",
          "price": 85000,
          "volume": 1000000,
          "change": 500,
          "changePercent": 0.59,
          "source": "HOSE",
          "fetchedAt": "2026-05-24T00:53:00Z",
          "latencyMs": 42
        },
        "err": null
      },
      {
        "quote": {
          "code": "VCB",
          "price": 85100,
          "volume": 950000,
          "change": 600,
          "changePercent": 0.71,
          "source": "HNX",
          "fetchedAt": "2026-05-24T00:52:00Z",
          "latencyMs": 78
        },
        "err": null
      },
      {
        "quote": {
          "code": "VCB",
          "price": 84900,
          "volume": 0,
          "change": 0,
          "changePercent": 0,
          "source": "CACHE",
          "fetchedAt": "2026-05-23T00:00:00Z",
          "latencyMs": 0
        },
        "err": null
      }
    ]
  },
  "expected": {
    "quote": {
      "code": "VCB",
      "price": 85000,
      "volume": 1000000,
      "change": 500,
      "changePercent": 0.59,
      "source": "HOSE",
      "fetchedAt": "2026-05-24T00:53:00Z",
      "latencyMs": 42
    },
    "err": null
  },
  "expected_reason": "T1 (HOSE) is non-nil, so it wins. T2 and T3 are not evaluated."
}
```

### `tier-fallback-selector-edge.json` — T2 fallback (T1 fails)

```json
{
  "description": "T1 nil, T2 non-nil — T2 selected",
  "input": {
    "results": [
      {
        "quote": null,
        "err": "connection timeout"
      },
      {
        "quote": {
          "code": "VCB",
          "price": 85100,
          "volume": 950000,
          "change": 600,
          "changePercent": 0.71,
          "source": "HNX",
          "fetchedAt": "2026-05-24T00:52:00Z",
          "latencyMs": 78
        },
        "err": null
      },
      {
        "quote": null,
        "err": "not evaluated"
      }
    ]
  },
  "expected": {
    "quote": {
      "code": "VCB",
      "price": 85100,
      "volume": 950000,
      "change": 600,
      "changePercent": 0.71,
      "source": "HNX",
      "fetchedAt": "2026-05-24T00:52:00Z",
      "latencyMs": 78
    },
    "err": null
  },
  "expected_reason": "T1 failed (quote=nil, err!=nil); T2 is non-nil, so it wins. T3 not evaluated."
}
```

### `tier-fallback-selector-failure.json` — All tiers fail

```json
{
  "description": "All tiers nil — PriceNotAvailableError",
  "input": {
    "results": [
      {
        "quote": null,
        "err": "T1 connection timeout"
      },
      {
        "quote": null,
        "err": "T2 API rate limit"
      },
      {
        "quote": null,
        "err": "T3 cache miss"
      }
    ]
  },
  "expected": {
    "quote": null,
    "err": "PriceNotAvailableError"
  },
  "expected_reason": "All three tiers failed (all quotes nil). Return error sentinel."
}
```

---

## Fence Guarantees (Binding)

These are the same guarantees as P1-B1. Verify them before committing:

1. **CGO_ENABLED=0 sandbox builds:** `CGO_ENABLED=0 go build ./cmd/sandbox` exits 0 (no CGO code reachable).
2. **Zero mattn in primitive:** `grep mattn apps/stock-price/pkg/primitive/tier-fallback-selector/` exits 1.
3. **Zero infrastructure imports:** `grep pkg/infrastructure apps/stock-price/pkg/primitive/tier-fallback-selector/` exits 1.
4. **Fence-A compliance:** `grep -rn "application\|interface/http\|infrastructure" apps/stock-price/pkg/primitive/tier-fallback-selector/` exits 1 (no cross-layer imports).

All fences inherited from P1-B1 R-CGO CLEAR verdict.

---

## How to Run & Verify Locally

1. **Extract the primitive logic** from `domain/services.go` (the tier-walk loop in `ResolvePriceService.FetchPrice` L53–65).
2. **Create `selector.go`** with the exported types and function.
3. **Create `selector_test.go`** with the 6-row table-driven test.
4. **Create the 3 scenario JSONs** in `docs/scenarios/stock-price/primitives/`.
5. **Run the unit test:**
   ```bash
   cd apps/stock-price
   go test ./pkg/primitive/tier-fallback-selector/...
   ```
   Should exit 0.
6. **Run the sandbox** (after P1-B1 is in place):
   ```bash
   cd apps/stock-price
   go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
   ```
   Should exit 0, showing all scenarios (B1's 3 + B2's 3 = 6 total or more).
7. **Verify fences:**
   ```bash
   grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" pkg/primitive/tier-fallback-selector/
   ```
   Should exit 1 (0 matches).

---

## WIP Rule & Sequencing

- **Current WIP:** 1 (only P1-B2 in progress)
- **Blocked by:** P1-B1 (DONE as of 2026-05-24T00:53:00Z, R-CGO CLEAR)
- **Blocks:** P1-B3 (held until P1-B2 DONE)
- **Sequential constraint:** PM will dispatch P1-B3 ONLY after P1-B2 DONE signal + sandbox-green evidence.

---

## RETURN Block (After Task Completion)

When you complete this task, emit a signal:

**File:** `docs/signals/dev-stock-price-p1-b2-done-<UTC>.json`

**Required fields:**
```json
{
  "signal_id": "dev-stock-price-p1-b2-done-<UTC>",
  "task_id": "P1-B2",
  "pilot": "stock-price",
  "phase": 1,
  "from": "dev-stock-price",
  "to": "pm",
  "timestamp": "<ISO8601>",
  "verdict": "DONE",
  "commit_sha": "<commit SHA from your final commit>",
  "g12_streak_task": 2,
  "g12_dod_sandbox": "GREEN",
  "sandbox_output": {
    "total": "<N scenarios across B1 + B2>",
    "pass": "<N pass>",
    "fail": 0,
    "status": "OK",
    "exit_code": 0,
    "scenarios": [
      "<each scenario result>"
    ]
  },
  "ac_verdicts": {
    "AC-1": "PASS — SelectWinningTier exported with signature",
    "AC-2": "PASS — N table-driven test rows",
    "AC-3": "PASS — go test exit 0",
    "AC-4": "PASS — Fence-A: grep mattn/infrastructure = 0",
    "AC-5": "PASS — sandbox exit 0, all scenarios GREEN",
    "AC-6": "PASS — G12 DoD sandbox green before RETURN"
  },
  "go_test_all_pkg": {
    "packages": "<N>",
    "pass": "<N>",
    "fail": 0,
    "regressions": 0
  },
  "files_created": [
    "apps/stock-price/pkg/primitive/tier-fallback-selector/selector.go",
    "apps/stock-price/pkg/primitive/tier-fallback-selector/selector_test.go",
    "docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json",
    "docs/scenarios/stock-price/primitives/tier-fallback-selector-edge.json",
    "docs/scenarios/stock-price/primitives/tier-fallback-selector-failure.json"
  ],
  "files_modified": [
    "apps/stock-price/cmd/sandbox/main.go"
  ],
  "pre_revert_tag": null,
  "next_task": "P1-B3 (third primitive: price-staleness-classifier) — held until PM dispatch; G12 streak #3"
}
```

---

## Constraints (Binding)

- **L84 explicit-file staging:** `git add` each file individually (e.g., `git add apps/stock-price/pkg/primitive/tier-fallback-selector/selector.go`). Never `git add -A` or `git add .`.
- **No --force, no --no-verify, no --no-gpg-sign.** Standard commit protocol.
- **No git push.** Local commits on `main` only.
- **WIP=1 sequential:** Only this task in progress; P1-B3 held.
- **Sandbox-green before RETURN:** G12 DoD Gate — AC-5 passing is the precondition for marking DONE.
- **Do NOT touch frozen/closed services:** `apps/technical-analysis/**`, `apps/macro-indicators/**`, `docs/data/pilot-status.json`, `docs/data/pilot-status-macro-indicators.json`.

---

## References

- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md`
- **Phase 1 Task Plan (detailed):** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` §P1-B2
- **P1-B1 DONE signal (evidence of R-CGO CLEAR):** `docs/signals/dev-stock-price-p1-b1-done-20260524T005300Z.json`
- **SSOT (this file's source of truth):** `docs/data/pilot-status-stock-price.json`
- **Brownfield inventory (context on domain/services.go extraction point):** `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md`

---

**Assigned by:** pm (2026-05-24T01:05:00Z)
**Assigned to:** dev-stock-price
**Status:** READY-FOR-WORK
