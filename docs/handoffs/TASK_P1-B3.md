---
task_id: P1-B3
pilot: stock-price
phase: 1
phase_type: ATOMIC-TASK
assigned_to: dev-stock-price
assigned_at: null
assigned_by: pm
handoff_file_version: "1.0"
parent_task: P1-B2
blocks_task: P1-C
charter_ref: docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md
task_plan_ref: docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md §P1-B3
---

# TASK_P1-B3 — Third Primitive: `price-staleness-classifier`

**Assigned:** dev-stock-price (pending main router dispatch)
**Sequential context:** P1-B2 DONE (sandbox GREEN all 6 scenarios), P1-B3 now unblocked. WIP=1 — P1-C held pending P1-B3 DONE.
**G12 streak task:** #3 of 3 (prior: P1-B1 ✓, P1-B2 ✓, next: completes the G12 streak)
**G12 DoD requirement:** Sandbox all-green (all P1-B1 + P1-B2 + P1-B3 scenarios = 9 total) before marking DONE.

---

## What You're Building

Extract the **price-staleness-classifier** primitive — a new formalization currently absent from the codebase. Per brownfield §3 P3 finding: this is not an extraction from existing duplicated code, but a codification of an implicit contract.

The classifier formalizes the rule: **if a T3 cache quote's `fetchedAt` is older than `freshThresholdSeconds`, it is `STALE`; older than `staleThresholdSeconds`, it is `EXPIRED`; otherwise `FRESH`.**

This primitive enables the module to annotate quote staleness on the result (staleness is NOT a selection criterion; T1 still wins by tier order even if stale).

---

## Acceptance Criteria (6 total)

### AC-1: Exported types and function

`apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go` exports:

```go
type StalenessLabel string

const (
    Fresh   StalenessLabel = "FRESH"
    Stale   StalenessLabel = "STALE"
    Expired StalenessLabel = "EXPIRED"
)

func ClassifyStaleness(
    fetchedAt string,         // RFC3339 timestamp
    now time.Time,
    freshThresholdSeconds int, // seconds within which quote is FRESH (e.g. 60)
    staleThresholdSeconds int, // seconds beyond which quote is EXPIRED (e.g. 3600)
) (StalenessLabel, error)
```

**Evidence:** Paste the type definition and function signature from `classifier.go`.

---

### AC-2: Table-driven test with ≥5 rows

File: `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier_test.go`

Test at least these 5 scenarios:

1. **Recent timestamp (within freshThreshold)** — `fetchedAt` 30s ago, freshThreshold=60s → `FRESH`
2. **Stale timestamp (between fresh and stale thresholds)** — `fetchedAt` 90s ago, freshThreshold=60s, staleThreshold=3600s → `STALE`
3. **Expired timestamp (beyond stale threshold)** — `fetchedAt` 5h ago, staleThreshold=3600s → `EXPIRED`
4. **Boundary condition (exactly at threshold)** — `fetchedAt` exactly 60s ago, freshThreshold=60s → defined behavior (≤ threshold = FRESH)
5. **Malformed RFC3339 string** — `fetchedAt` = "not-a-date" → returns error with non-nil err

Table-driven pattern (GoTest standard). ✓

**Evidence:** Paste the test table structure and test body from `classifier_test.go`.

---

### AC-3: Unit test passes

```bash
cd apps/stock-price
go test ./pkg/primitive/price-staleness-classifier/...
```

Must exit 0 (no failures, no panics).

**Evidence:** Paste the exit code and test summary (`ok github.com/vn-market-intelligence/stock-price/pkg/primitive/price-staleness-classifier ... ok`).

---

### AC-4: Fence-A compliance (R-CGO inherited from P1-B1)

```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" apps/stock-price/pkg/primitive/price-staleness-classifier/
```

Must exit 1 (zero matches). No CGO, no infrastructure imports.

**Why this matters:** R-CGO is already CLEARED from P1-B1 and reconfirmed in P1-B2. P1-B3 inherits that cleared status but MUST pass the per-primitive grep to confirm the fence is not violated by this new primitive.

**Evidence:** Paste the grep command and the "exit 1 (0 matches)" result.

---

### AC-5: Sandbox exits 0 with all scenarios green

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```

Must exit 0. The sandbox now covers all three primitive scenario suites:
- P1-B1: `price-quote-normalizer` (3 JSONs)
- P1-B2: `tier-fallback-selector` (3 JSONs)
- P1-B3: `price-staleness-classifier` (3 JSONs)
- **Total: 9 scenarios, all PASS**

**Evidence:** Paste the full sandbox output, showing all 9 scenarios passing.

---

### AC-6: G12 DoD Gate (streak task #3) — Dashboard green before RETURN

**Hard rule:** Do not mark this task DONE until sandbox shows all scenarios green (AC-5). This is the third consecutive task with the DoD gate satisfied — **this task completes the G12 earn-pending evidence chain (1/3 ✓, 2/3 ✓, 3/3 PENDING).**

**What this means:**
- Your handoff must include the sandbox-green evidence from AC-5 (all 9 scenarios).
- QA will verify this task's sandbox green evidence alongside P1-B1 and P1-B2 when closing P1-G.
- Once this task is DONE with sandbox green, G12 streak = 3/3 CONFIRMED (not YES until PO flips it at 12/12 terminal).
- This is the final task of the 3-task DoD streak; subsequent Phase 1 tasks (P1-C, P1-D, P1-E, P1-F, P1-G) are NOT part of the G12 streak.

**Evidence:** Paste the sandbox output summary confirming all 9 scenarios PASS, including the new 3 scenarios from P1-B3.

---

## Files to Create

| File | Type | Purpose |
|---|---|---|
| `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go` | CREATE | Staleness classification logic: given `fetchedAt`, compare to thresholds. |
| `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier_test.go` | CREATE | Table-driven test (≥5 rows). |
| `docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json` | CREATE | Golden: `fetchedAt` 30s ago, freshThreshold=60s → `FRESH`. |
| `docs/scenarios/stock-price/primitives/price-staleness-classifier-edge.json` | CREATE | Edge: `fetchedAt` 90s ago, freshThreshold=60s, staleThreshold=3600s → `STALE`. |
| `docs/scenarios/stock-price/primitives/price-staleness-classifier-failure.json` | CREATE | Failure: malformed `fetchedAt` ("not-a-date") → error captured in trace output. |

---

## Scenario JSON Specification

Each scenario is a test case for the sandbox. The sandbox will load these JSONs and invoke `ClassifyStaleness()`.

### `price-staleness-classifier-golden.json` — Fresh quote

```json
{
  "description": "fetchedAt = 30 seconds ago, freshThreshold=60, staleThreshold=3600 → FRESH",
  "input": {
    "fetchedAt": "2026-05-24T00:59:30Z",
    "now": "2026-05-24T01:00:00Z",
    "freshThresholdSeconds": 60,
    "staleThresholdSeconds": 3600
  },
  "expected": {
    "label": "FRESH",
    "err": null
  },
  "expected_reason": "Age = 30s, which is within freshThreshold=60s, so label is FRESH"
}
```

### `price-staleness-classifier-edge.json` — Stale quote

```json
{
  "description": "fetchedAt = 90 seconds ago, freshThreshold=60, staleThreshold=3600 → STALE",
  "input": {
    "fetchedAt": "2026-05-24T00:58:30Z",
    "now": "2026-05-24T01:00:00Z",
    "freshThresholdSeconds": 60,
    "staleThresholdSeconds": 3600
  },
  "expected": {
    "label": "STALE",
    "err": null
  },
  "expected_reason": "Age = 90s, which is between freshThreshold=60s and staleThreshold=3600s, so label is STALE"
}
```

### `price-staleness-classifier-failure.json` — Malformed RFC3339

```json
{
  "description": "fetchedAt = malformed string (not-a-date) → error",
  "input": {
    "fetchedAt": "not-a-date",
    "now": "2026-05-24T01:00:00Z",
    "freshThresholdSeconds": 60,
    "staleThresholdSeconds": 3600
  },
  "expected": {
    "label": null,
    "err": "time: invalid layout"
  },
  "expected_reason": "Cannot parse fetchedAt as RFC3339; return error"
}
```

---

## Fence Guarantees (Binding)

These are the same guarantees as P1-B1 and P1-B2. Verify them before committing:

1. **CGO_ENABLED=0 sandbox builds:** `CGO_ENABLED=0 go build ./cmd/sandbox` exits 0 (no CGO code reachable).
2. **Zero mattn in primitive:** `grep mattn apps/stock-price/pkg/primitive/price-staleness-classifier/` exits 1.
3. **Zero infrastructure imports:** `grep pkg/infrastructure apps/stock-price/pkg/primitive/price-staleness-classifier/` exits 1.
4. **Fence-A compliance:** `grep -rn "application\|interface/http\|infrastructure" apps/stock-price/pkg/primitive/price-staleness-classifier/` exits 1 (no cross-layer imports).

All fences inherited from P1-B1 R-CGO CLEAR verdict. Reconfirmed at P1-B2. Verify once more at P1-B3.

---

## How to Run & Verify Locally

1. **Create the classifier logic** in `classifier.go` with the three constants and the `ClassifyStaleness` function.
2. **Create `classifier_test.go`** with the ≥5-row table-driven test.
3. **Create the 3 scenario JSONs** in `docs/scenarios/stock-price/primitives/`.
4. **Run the unit test:**
   ```bash
   cd apps/stock-price
   go test ./pkg/primitive/price-staleness-classifier/...
   ```
   Should exit 0.
5. **Run the sandbox** (with all prior primitives in place):
   ```bash
   cd apps/stock-price
   go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
   ```
   Should exit 0, showing all 9 scenarios (B1's 3 + B2's 3 + B3's 3 = 9 total).
6. **Verify fences:**
   ```bash
   grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" pkg/primitive/price-staleness-classifier/
   ```
   Should exit 1 (0 matches).

---

## WIP Rule & Sequencing

- **Current WIP:** 1 (only P1-B3 in progress, once dispatched)
- **Blocked by:** P1-B2 (DONE as of 2026-05-24T01:00:46Z, sandbox GREEN)
- **Blocks:** P1-C (module stub, held until P1-B3 DONE)
- **Sequential constraint:** PM will dispatch P1-C ONLY after P1-B3 DONE signal + sandbox-green evidence (all 9 scenarios).

---

## RETURN Block (After Task Completion)

When you complete this task, emit a signal:

**File:** `docs/signals/dev-stock-price-p1-b3-done-<UTC>.json`

**Required fields:**
```json
{
  "signal_id": "dev-stock-price-p1-b3-done-<UTC>",
  "task_id": "P1-B3",
  "pilot": "stock-price",
  "phase": 1,
  "from": "dev-stock-price",
  "to": "pm",
  "timestamp": "<ISO8601>",
  "verdict": "DONE",
  "commit_sha": "<commit SHA from your final commit>",
  "g12_streak_task": 3,
  "g12_dod_sandbox": "GREEN",
  "g12_streak_complete": true,
  "sandbox_output": {
    "total": 9,
    "pass": 9,
    "fail": 0,
    "status": "OK",
    "exit_code": 0,
    "scenarios": [
      "PASS price-quote-normalizer-golden.json (P1-B1)",
      "PASS price-quote-normalizer-edge.json (P1-B1)",
      "PASS price-quote-normalizer-failure.json (P1-B1)",
      "PASS tier-fallback-selector-golden.json (P1-B2)",
      "PASS tier-fallback-selector-edge.json (P1-B2)",
      "PASS tier-fallback-selector-failure.json (P1-B2)",
      "PASS price-staleness-classifier-golden.json (P1-B3)",
      "PASS price-staleness-classifier-edge.json (P1-B3)",
      "PASS price-staleness-classifier-failure.json (P1-B3)"
    ]
  },
  "ac_verdicts": {
    "AC-1": "PASS — StalenessLabel type and ClassifyStaleness function exported",
    "AC-2": "PASS — ≥5 table-driven test rows (FRESH, STALE, EXPIRED, boundary, malformed)",
    "AC-3": "PASS — go test exit 0",
    "AC-4": "PASS — Fence-A: grep mattn/infrastructure = 0",
    "AC-5": "PASS — sandbox exit 0, all 9 scenarios GREEN (B1+B2+B3)",
    "AC-6": "PASS — G12 DoD sandbox green before RETURN; streak 3/3 complete"
  },
  "go_test_all_pkg": {
    "packages": "<N>",
    "pass": "<N>",
    "fail": 0,
    "regressions": 0
  },
  "files_created": [
    "apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go",
    "apps/stock-price/pkg/primitive/price-staleness-classifier/classifier_test.go",
    "docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json",
    "docs/scenarios/stock-price/primitives/price-staleness-classifier-edge.json",
    "docs/scenarios/stock-price/primitives/price-staleness-classifier-failure.json"
  ],
  "files_modified": [
    "apps/stock-price/cmd/sandbox/main.go"
  ],
  "pre_revert_tag": null,
  "next_task": "P1-C (module stub: price_resolution) — held until PM dispatch after P1-B3 DONE"
}
```

---

## Constraints (Binding)

- **L84 explicit-file staging:** `git add` each file individually. Never `git add -A` or `git add .`.
- **No --force, no --no-verify, no --no-gpg-sign.** Standard commit protocol.
- **No git push.** Local commits on `main` only.
- **WIP=1 sequential:** Only this task in progress; P1-C held.
- **Sandbox-green before RETURN:** G12 DoD Gate — AC-5 passing (all 9 scenarios) is the precondition for marking DONE. This task COMPLETES the G12 3/3 streak.
- **Do NOT touch frozen/closed services:** `apps/technical-analysis/**`, `apps/macro-indicators/**`, `docs/data/pilot-status.json`, `docs/data/pilot-status-macro-indicators.json`.

---

## References

- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md`
- **Phase 1 Task Plan (detailed):** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` §P1-B3
- **P1-B1 DONE signal (evidence of R-CGO CLEAR):** `docs/signals/dev-stock-price-p1-b1-done-20260524T005300Z.json`
- **P1-B2 DONE signal (evidence of 6 scenarios GREEN):** `docs/signals/dev-stock-price-p1-b2-done-20260524T010046Z.json`
- **SSOT (this file's source of truth):** `docs/data/pilot-status-stock-price.json`
- **Brownfield inventory (context on implicit staleness contract):** `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md`

---

**Assigned by:** pm
**Assigned to:** dev-stock-price
**Status:** READY-FOR-DISPATCH
