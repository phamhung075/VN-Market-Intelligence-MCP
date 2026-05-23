---
task_id: "P1-C"
pilot: "stock-price"
phase: 1
title: "Module stub: pkg/module/price_resolution/ — port + composition function"
owner: "dev-stock-price"
status: "DONE"
readyAt: "2026-05-24T01:08:00Z"
dispatchedAt: "2026-05-24T01:08:00Z"
dispatchedBy: "pm"
doneAt: "2026-05-24T01:15:00Z"
commit_sha: "e98179f9"
createdAt: "2026-05-24T01:08:00Z"
createdBy: "pm"
source: "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md (§P1-C)"
dependencies:
  blocks: "P1-D"
  blockedBy: "P1-B3 (must be DONE + sandbox all-green)"
g12_streak:
  task_number: null
  requirement: "Both sandbox tiers (`-tier=primitive` and `-tier=module`) exit 0 before RETURN block"
wip_limit: 1
---

# TASK P1-C — Module Stub: `pkg/module/price_resolution/`

**Status:** READY (blocked on P1-B3 DONE, which is NOW COMPLETE 2026-05-24T01:08:00Z)

**Owner:** dev-stock-price

**Acceptance Criteria Count:** 7

**Estimated effort:** 1 hour

---

## Context

This task composes the THREE extracted primitives (from P1-B1, P1-B2, P1-B3) into a **module stub** under `apps/stock-price/pkg/module/price_resolution/` via a **TierFetcher port interface**. The module mirrors the existing `domain.ResolvePriceService.FetchPrice` logic but decomposes it:

- Infra fetching is **injected** (via TierFetcher port)
- Tier selection is delegated to **tier-fallback-selector** primitive
- Normalization is delegated to **price-quote-normalizer** primitive
- Staleness annotation is delegated to **price-staleness-classifier** primitive

**Fence-B gate (critical):** The module MUST NOT import `mattn/go-sqlite3`, `pkg/infrastructure/`, or any CGO code path. It imports ONLY `pkg/primitive/*`, stdlib, and the port interface.

---

## Files to Create

```
apps/stock-price/pkg/module/price_resolution/ports.go (NEW)
apps/stock-price/pkg/module/price_resolution/price_resolution.go (NEW)
apps/stock-price/pkg/module/price_resolution/price_resolution_test.go (NEW)
docs/scenarios/stock-price/module/price-resolution-golden.json (NEW)
docs/scenarios/stock-price/module/price-resolution-edge.json (NEW)
```

---

## Acceptance Criteria

### AC-1: `ports.go` — TierFetcher interface

**PASS if:**

File `apps/stock-price/pkg/module/price_resolution/ports.go` is created and exports:

```go
package price_resolution

import "github.com/vn-market-intelligence/stock-price/pkg/domain"

// TierFetcher is the port the module depends on.
// Infrastructure (Tier1, Tier2, Tier3) implements this; injected at composition root.
type TierFetcher interface {
    FetchPrice(code string) (*domain.PriceQuote, error)
}
```

**Evidence:** Paste the complete `ports.go` file into the handoff RETURN block.

---

### AC-2: Fence-B — No infrastructure imports

**PASS if:**

```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" apps/stock-price/pkg/module/price_resolution/
```

Returns **0 matches** (exit code 1).

**Evidence:** Paste the exact grep command + output into the handoff.

---

### AC-3: Unit tests pass

**PASS if:**

```bash
cd apps/stock-price
go test ./pkg/module/price_resolution/... -v
```

Exit code 0, all tests PASS. Tests MUST use **mock TierFetcher** implementations (not real infrastructure fetchers).

**Evidence:** Paste the go test output showing all tests PASS, along with a snippet of one mock implementation from the test file.

---

### AC-4: No cross-module imports

**PASS if:**

```bash
grep -rn "from.*pkg/module/" apps/stock-price/pkg/module/price_resolution/
```

Returns **0 matches** (exit code 1). The module does not import other modules.

**Evidence:** Paste the grep command + output.

---

### AC-5: Module-level sandbox exit 0

**PASS if:**

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
```

Exit code 0, all scenarios PASS.

**Evidence:** Paste the complete sandbox output showing:
- All scenarios found and executed
- Exit code 0
- Pass/Fail summary per scenario

---

### AC-6: All-tier sandbox exit 0

**PASS if:**

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

Exit code 0. (This runs all 9 primitive scenarios + all module scenarios = 11+ total.)

**Evidence:** Paste the complete sandbox output.

---

### AC-7: G12 DoD Gate — Both sandbox tiers green

**PASS if:**

BOTH of the following exit 0 with all scenarios passing:

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
```

**This is the gate:** Do NOT mark task DONE until both commands show all scenarios GREEN.

**Evidence:** Paste both commands' output (primitive + module tier results).

---

## Module Stub Implementation Pattern

### `price_resolution.go` — Module struct

```go
package price_resolution

import "github.com/vn-market-intelligence/stock-price/pkg/domain"

// PriceResolutionModule composes the 3 extracted primitives.
type PriceResolutionModule struct {
    tier1   TierFetcher
    tier2   TierFetcher
    tier3   TierFetcher
}

// New creates a new PriceResolutionModule with 3 injected TierFetchers.
func New(tier1, tier2, tier3 TierFetcher) *PriceResolutionModule {
    return &PriceResolutionModule{
        tier1:   tier1,
        tier2:   tier2,
        tier3:   tier3,
    }
}

// Resolve(code string) implements the 3-tier fallback logic:
// 1. Call tier1.FetchPrice, tier2.FetchPrice, tier3.FetchPrice concurrently
// 2. Build []TierResult
// 3. Call tier-fallback-selector.SelectWinningTier() to pick the winner
// 4. Optionally call price-staleness-classifier.ClassifyStaleness() to annotate staleness
// 5. Return the selected PriceQuote with staleness field set (if needed)
func (m *PriceResolutionModule) Resolve(code string) (*domain.PriceQuote, error) {
    // TODO: Implementation here
}
```

**Key points:**

- The Resolve() method calls **all 3 tier fetchers concurrently** (mirroring the existing domain service goroutine pattern).
- Builds a `[]TierResult` slice.
- Calls `tier-fallback-selector.SelectWinningTier()` to pick the winning quote (T1 wins if non-nil, else T2, else T3).
- Calls `price-staleness-classifier.ClassifyStaleness()` on the winning quote to annotate staleness (optional; can be optional in Phase 1 if time-constrained, but recommended).

### Module Scenario JSON

**`docs/scenarios/stock-price/module/price-resolution-golden.json`:**

```json
{
  "scenario_name": "price-resolution-golden",
  "description": "3-tier walk: T1 returns quote (stale: 90s old) → T2 returns quote (fresh: 10s old) → module selects T1 (T1 wins by tier order, staleness is annotation not selection) → result: T1 quote with staleness=STALE",
  "inputs": {
    "code": "VCB",
    "tier_1": {
      "price": 85000,
      "volume": 1000000,
      "change": 500,
      "change_pct": 0.59,
      "source": "hose",
      "fetched_at": "2026-05-24T00:37:00Z",
      "latency_ms": 15
    },
    "tier_2": {
      "price": 84950,
      "volume": 800000,
      "change": 450,
      "change_pct": 0.53,
      "source": "hnx",
      "fetched_at": "2026-05-24T00:59:00Z",
      "latency_ms": 25
    },
    "tier_3": null
  },
  "expected": {
    "code": "VCB",
    "price": 85000,
    "source": "hose",
    "staleness": "STALE"
  }
}
```

**`docs/scenarios/stock-price/module/price-resolution-edge.json`:**

```json
{
  "scenario_name": "price-resolution-edge",
  "description": "T1 nil, T2 nil, T3 cache quote (EXPIRED: 5h old) → T3 wins (only tier with data) → result: T3 quote with staleness=EXPIRED",
  "inputs": {
    "code": "VCB",
    "tier_1": null,
    "tier_2": null,
    "tier_3": {
      "price": 84000,
      "volume": 500000,
      "change": 0,
      "change_pct": 0,
      "source": "cache",
      "fetched_at": "2026-05-23T20:00:00Z",
      "latency_ms": 5
    }
  },
  "expected": {
    "code": "VCB",
    "price": 84000,
    "source": "cache",
    "staleness": "EXPIRED"
  }
}
```

---

## Fence-A / Fence-B Summary

| Fence | Rule | Gate Task | Status |
|-------|------|-----------|--------|
| **Fence-A** (primitive barrier) | No infrastructure imports in `pkg/primitive/*` | P1-B1 | CLEARED ✓ |
| **Fence-B** (module barrier) | No infrastructure imports in `pkg/module/*` | **P1-C (THIS TASK)** | TBD |
| **Fence-C** (composition root) | Infrastructure ONLY wired from `cmd/server/main.go` | P2 | Future |

---

## Critical Path

```
P1-B3 (DONE 2026-05-24T01:08:00Z — sandbox all-green, 9/9 scenarios PASS)
  ↓ (G12 streak 3/3 COMPLETE)
P1-C (THIS TASK — module stub, Fence-B gate)
  ↓
P1-D (dashboard stub)
  ↓
P1-E (edit-rerun handler)
  ↓
P1-G (QA close-gate verification)
```

**WIP=1 sequential.** After P1-C DONE signal, PM will dispatch P1-D (dashboard stub).

---

## RETURN Block Template

When completed, fill in the following fields in your RETURN signal (docs/signals/pm-p1-c-dispatch-stock-price-<UTC>.json):

```json
{
  "signal_id": "pm-p1-c-dispatch-stock-price-<UTC>",
  "task_id": "P1-C",
  "pilot": "stock-price",
  "phase": 1,
  "from": "pm",
  "to": "dev-stock-price",
  "timestamp": "<UTC>",
  "verdict": "READY",
  "commit_sha": null,
  "handoff": "docs/handoffs/TASK_P1-C.md",
  "ac_count": 7,
  "ac_verdicts": {
    "AC-1": "PASS — ports.go TierFetcher interface exported",
    "AC-2": "PASS — Fence-B grep mattn/go-sqlite3|pkg/infrastructure|cgo|import C = 0",
    "AC-3": "PASS — go test ./pkg/module/price_resolution/... exit 0",
    "AC-4": "PASS — grep pkg/module/ cross-imports = 0",
    "AC-5": "PASS — go run ./cmd/sandbox -tier=module -scenario=all exit 0",
    "AC-6": "PASS — go run ./cmd/sandbox -tier=all -scenario=all exit 0",
    "AC-7": "PASS — G12 DoD Gate: primitive + module sandbox both green"
  },
  "g12_dod_sandbox": "GREEN (both tiers: primitive 9/9 + module 2/2)",
  "blocked_by": "P1-B3 (now DONE)",
  "blocks": "P1-D (dashboard stub)"
}
```

---

## Go-To-Production Checklist

- [ ] `pkg/module/price_resolution/ports.go` created (AC-1)
- [ ] `pkg/module/price_resolution/price_resolution.go` created with Resolve() (AC-1 + AC-5)
- [ ] `pkg/module/price_resolution/price_resolution_test.go` created with table-driven tests + mocks (AC-3)
- [ ] `docs/scenarios/stock-price/module/` JSON fixtures created (AC-5, AC-6)
- [ ] Fence-B grep returns 0 (AC-2)
- [ ] All unit tests pass (AC-3)
- [ ] Module-level sandbox passes (AC-5)
- [ ] All-tier sandbox passes (AC-6)
- [ ] G12 DoD Gate verified: both sandbox tiers green (AC-7)
- [ ] Commit staged (L84 explicit file per path)
- [ ] RETURN signal written to docs/signals/
- [ ] PM notified of DONE signal

---

## Questions / Blockers

If you encounter a Fence-B violation (infrastructure import detected), **STOP and escalate immediately** with:

1. The exact grep match + line number
2. The import path
3. Whether it was added by you (revert immediately) or pre-existing (escalate to architect)

If sandbox fails at AC-5 or AC-6, **DO NOT mark task DONE.** Run `go test` on individual primitives to isolate the failure. Include full error trace in escalation.

---

## References

- **Phase 1 Task Plan:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` (§P1-C)
- **Primitive 1 (P1-B1):** `docs/handoffs/TASK_P1-B1.md`
- **Primitive 2 (P1-B2):** `docs/handoffs/TASK_P1-B2.md`
- **Primitive 3 (P1-B3):** `docs/handoffs/TASK_P1-B3.md`
- **R-CGO Gate:** Cleared by P1-B1 (AC-5 + AC-6 + AC-7 + AC-8)
- **Fence-B Pattern:** Analog to TA/macro; Go-specific: depguard via golangci.yml (Phase 2 G4 enforcement)

---

**CREATED BY:** pm (TASK_P1-C.md handoff generator)

**CREATED AT:** 2026-05-24T01:08:00Z

**STATUS:** READY for dispatch to dev-stock-price after P1-C dispatch signal
