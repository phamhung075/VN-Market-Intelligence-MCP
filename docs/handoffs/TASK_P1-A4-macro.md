---
title: "TASK_P1-A4 — pkg/ DDD Scaffold"
phase: "1"
pilot: "macro-indicators"
task_id: "P1-A4"
owner: "dev-macro-indicators"
created_at: "2026-05-23T10:32:48Z"
created_by: "pm"
status: "READY-FOR-DISPATCH"
wip_claim: "phase_1_dev_team = ACTIVE (1 of 1 max)"
---

# TASK_P1-A4 — `pkg/` DDD Scaffold (Domain, Application, Infrastructure, Interface layers)

**Pilot:** macro-indicators (Phase 1, Go language)  
**Owner:** dev-macro-indicators  
**Estimate:** 30 minutes  
**AC count:** 4  
**Goals:** G3 (Microservice has clean composition root)  
**Blocked by:** P1-A3 (cmd/sandbox/main.go)  
**Blocks:** P1-A5 (api/openapi.yaml), P1-B1 (first primitive extraction)  
**Anchor:** 1776df8e (held throughout pilot — do not violate)

---

## Context

P1-A3 completed 2026-05-23T10:32:48Z: cmd/sandbox/main.go sandbox harness created (199 lines). All 4 ACs pass. QA GREEN verdict (commits c76cbe04 dev + a0f8a3ea signal).

P1-A4 now scaffolds the foundational Go DDD package structure under `apps/macro-indicators/pkg/`. This creates the four-layer skeleton:

1. **`pkg/domain/`** — Pure business types and interfaces, zero infrastructure imports
2. **`pkg/application/`** — Orchestration / use cases (can import domain, NOT infrastructure/interface)
3. **`pkg/infrastructure/`** — Adapters (sqlite, HTTP clients, external API wrappers)
4. **`pkg/interface/http/`** — HTTP handlers and router

All files are minimal compilable stubs. No business logic yet — only type definitions, interface signatures, and constructor stubs. Real implementation lands in P1-B1 (first primitive).

---

## Acceptance Criteria

### AC-1: Go build passes with all stubs present

After creating all 6 stub files below, the build must succeed:

```bash
cd apps/macro-indicators && go build ./...
# Expected: exit code 0 (zero compile errors)
```

All files must be syntactically valid Go. All type references must be resolvable (no forward references to types that don't exist).

---

### AC-2: `go vet` passes

```bash
cd apps/macro-indicators && go vet ./...
# Expected: exit code 0 (zero vet warnings)
```

---

### AC-3: Domain layer isolation (DDD Fence-A)

The domain layer **MUST NOT import** any types from application, infrastructure, or interface layers. This is the golden rule of DDD.

**Verification:**

```bash
grep -rn "pkg/application\|pkg/infrastructure\|pkg/interface" \
  apps/macro-indicators/pkg/domain/*.go
# Expected: exit code 1 (zero matches — no cross-layer imports in domain)
```

---

### AC-4: Commit message lists all 6 files explicitly (L84 discipline)

Commit message must explicitly name each file being created. Do not use vague references like "add pkg files" — list them all.

---

## Files to Create

Six stub files, all under `apps/macro-indicators/pkg/`. All are minimal compilable skeletons.

### 1. `pkg/domain/models.go`

Domain value types (port from TS `src/domain/models.ts`). Contains:

- `MacroSnapshot` struct — top-level output snapshot (fields: VNIndex, OilUSD, GoldUSD, USDVnd, FetchedAt)
- `PriceSignal` struct — generic signal type (fields: Name, Direction, Confidence, Reason)
- `SignalDirection` type — enum (values: BULLISH, BEARISH, NEUTRAL)

**Template:**

```go
package domain

import "time"

// SignalDirection represents the direction of a signal
type SignalDirection string

const (
	BULLISH  SignalDirection = "BULLISH"
	BEARISH  SignalDirection = "BEARISH"
	NEUTRAL  SignalDirection = "NEUTRAL"
)

// PriceSignal represents a single indicator signal
type PriceSignal struct {
	Name       string
	Direction  SignalDirection
	Confidence float64
	Reason     string
}

// MacroSnapshot is the top-level output of macro-indicators analysis
type MacroSnapshot struct {
	VNIndex   float64
	OilUSD    float64
	GoldUSD   float64
	USDVnd    float64
	FetchedAt time.Time
}
```

**Key constraint:** Zero imports from `pkg/application/`, `pkg/infrastructure/`, or `pkg/interface/`. Only standard library.

---

### 2. `pkg/domain/ports.go`

Port (interface) definitions for repositories/external adapters that domain logic depends on:

- `CommodityFetcherPort` interface — abstraction for fetching oil/gold prices (method: `FetchPrices(ctx, symbols []string) -> map[string]float64, error`)
- `SBVRatePort` interface — abstraction for SBV exchange rate queries (method: `GetRate(ctx, from, to string) -> float64, error`)

**Template:**

```go
package domain

import "context"

// CommodityFetcherPort is the port for commodity price retrieval
type CommodityFetcherPort interface {
	FetchPrices(ctx context.Context, symbols []string) (map[string]float64, error)
}

// SBVRatePort is the port for SBV exchange rate queries
type SBVRatePort interface {
	GetRate(ctx context.Context, from, to string) (float64, error)
}
```

**Key constraint:** Zero imports from application/infrastructure/interface. Only `context` from stdlib + domain types.

---

### 3. `pkg/application/dtos.go`

Data Transfer Objects (DTO) for HTTP/use-case boundaries:

- `MacroSnapshotRequest` struct — input DTO (empty object `{}` at Phase 1, placeholder for future parameters)
- `MacroSnapshotResponse` struct — output DTO (mirrors domain.MacroSnapshot but adds metadata like status, timestamp)

**Template:**

```go
package application

import "time"

// MacroSnapshotRequest is the input DTO for the snapshot use case
type MacroSnapshotRequest struct {
	// Placeholder: Phase 1 accepts empty request body
}

// MacroSnapshotResponse is the output DTO
type MacroSnapshotResponse struct {
	Status    string    `json:"status"`
	VNIndex   float64   `json:"vn_index"`
	OilUSD    float64   `json:"oil_usd"`
	GoldUSD   float64   `json:"gold_usd"`
	USDVnd    float64   `json:"usd_vnd"`
	FetchedAt time.Time `json:"fetched_at"`
}
```

---

### 4. `pkg/application/usecases.go`

Use-case orchestration:

- `ComputeMacroUseCase` struct — holds injected ports (CommodityFetcherPort, SBVRatePort)
- `NewComputeMacroUseCase(...)` constructor — dependency injection
- `Execute(ctx, request)` method — stub that returns zero response + nil error

**Template:**

```go
package application

import (
	"context"
	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ComputeMacroUseCase orchestrates macro snapshot computation
type ComputeMacroUseCase struct {
	commodityFetcher domain.CommodityFetcherPort
	sbvRate          domain.SBVRatePort
}

// NewComputeMacroUseCase creates a new use case with injected ports
func NewComputeMacroUseCase(
	cf domain.CommodityFetcherPort,
	sr domain.SBVRatePort,
) *ComputeMacroUseCase {
	return &ComputeMacroUseCase{
		commodityFetcher: cf,
		sbvRate:          sr,
	}
}

// Execute runs the macro snapshot computation
func (uc *ComputeMacroUseCase) Execute(
	ctx context.Context,
	req MacroSnapshotRequest,
) (MacroSnapshotResponse, error) {
	// TODO(P1-B1): implement primitive orchestration
	return MacroSnapshotResponse{}, nil
}
```

---

### 5. `pkg/infrastructure/repositories.go`

Adapter implementations for domain ports:

- `HTTPCommodityFetcher` struct — HTTP client wrapper (no live calls yet, just stub constructor)
- `NewHTTPCommodityFetcher(baseURL string)` constructor — creates HTTP fetcher

**Template:**

```go
package infrastructure

import (
	"context"
	"net/http"
)

// HTTPCommodityFetcher implements CommodityFetcherPort via HTTP
type HTTPCommodityFetcher struct {
	client  *http.Client
	baseURL string
}

// NewHTTPCommodityFetcher creates a new HTTP commodity fetcher
func NewHTTPCommodityFetcher(baseURL string) *HTTPCommodityFetcher {
	return &HTTPCommodityFetcher{
		client:  &http.Client{},
		baseURL: baseURL,
	}
}

// FetchPrices fetches commodity prices (stub)
func (hf *HTTPCommodityFetcher) FetchPrices(
	ctx context.Context,
	symbols []string,
) (map[string]float64, error) {
	// TODO(P1-B1): implement HTTP call to FRED or commodity API
	return make(map[string]float64), nil
}
```

---

### 6. `pkg/interface/http/router.go`

HTTP request routing and handler stubs:

- `NewRouter(useCase, logger)` function — returns configured `chi.Router` with routes registered
- Routes: `GET /health` (stub returning 200 + `{"status":"ok"}`), `POST /snapshot` (stub returning 501 — Not Implemented)

**Template:**

```go
package http

import (
	"log/slog"
	"net/http"
	"github.com/go-chi/chi/v5"
	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
)

// NewRouter creates a new chi router with all HTTP handlers
func NewRouter(useCase *application.ComputeMacroUseCase, logger *slog.Logger) chi.Router {
	r := chi.NewRouter()

	// GET /health
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"macro-indicators","port":5004}`))
	})

	// POST /snapshot
	r.Post("/snapshot", func(w http.ResponseWriter, r *http.Request) {
		// TODO(P1-B1): implement snapshot handler
		w.WriteHeader(http.StatusNotImplemented)
		w.Write([]byte(`{"error":"not implemented"}`))
	})

	return r
}
```

---

## Implementation Steps

1. **Create directory structure:**
   ```bash
   mkdir -p apps/macro-indicators/pkg/{domain,application,infrastructure,interface/http}
   ```

2. **Create each file** with the stubs above (copy templates, adjust as needed for your Go style).

3. **Verify compilation:**
   ```bash
   cd apps/macro-indicators && go build ./...
   ```

4. **Verify vet:**
   ```bash
   cd apps/macro-indicators && go vet ./...
   ```

5. **Verify domain isolation (AC-3):**
   ```bash
   grep -rn "pkg/application\|pkg/infrastructure\|pkg/interface" \
     apps/macro-indicators/pkg/domain/*.go
   # Expected: exit code 1 (no matches)
   ```

6. **Stage files explicitly (L84):**
   ```bash
   git add apps/macro-indicators/pkg/domain/models.go
   git add apps/macro-indicators/pkg/domain/ports.go
   git add apps/macro-indicators/pkg/application/dtos.go
   git add apps/macro-indicators/pkg/application/usecases.go
   git add apps/macro-indicators/pkg/infrastructure/repositories.go
   git add apps/macro-indicators/pkg/interface/http/router.go
   ```

7. **Commit with explicit file list** (see template below).

---

## Constraints

### L84 — Explicit file staging

```bash
# CORRECT:
git add apps/macro-indicators/pkg/domain/models.go
git add apps/macro-indicators/pkg/domain/ports.go
git add apps/macro-indicators/pkg/application/dtos.go
git add apps/macro-indicators/pkg/application/usecases.go
git add apps/macro-indicators/pkg/infrastructure/repositories.go
git add apps/macro-indicators/pkg/interface/http/router.go

# WRONG:
git add -A
git add .
git add apps/macro-indicators/
```

### No bypass

- No `--force`
- No `--no-verify` (pre-commit hooks must pass)
- No `--no-gpg-sign`
- No `git push` (local-only work)

### Anchor discipline

Anchor 1776df8e must remain reachable (no retag, no rewrite, no force-push).

---

## Commit Message Template

```
feat(macro-indicators): P1-A4 — pkg/ DDD scaffold (6 stub files)

Advances G3 per pilot-charter.md v2.0.

- apps/macro-indicators/pkg/domain/models.go (NEW)
  Domain value types: MacroSnapshot, PriceSignal, SignalDirection.
  Zero infrastructure imports (golden DDD rule).

- apps/macro-indicators/pkg/domain/ports.go (NEW)
  Port interfaces: CommodityFetcherPort, SBVRatePort.
  Abstractions for external dependencies.

- apps/macro-indicators/pkg/application/dtos.go (NEW)
  Data Transfer Objects: MacroSnapshotRequest, MacroSnapshotResponse.

- apps/macro-indicators/pkg/application/usecases.go (NEW)
  Use-case struct: ComputeMacroUseCase.
  Constructor: NewComputeMacroUseCase(cf, sr).
  Execute stub (returns zero response, nil error).

- apps/macro-indicators/pkg/infrastructure/repositories.go (NEW)
  Adapter stub: HTTPCommodityFetcher (no live HTTP calls yet).
  Constructor: NewHTTPCommodityFetcher(baseURL).

- apps/macro-indicators/pkg/interface/http/router.go (NEW)
  HTTP router: chi.Router with GET /health + POST /snapshot stubs.
  NewRouter(useCase, logger) factory.

AC-1..4 satisfied:
  AC-1: go build ./... passes (all 6 stubs compile)
  AC-2: go vet ./... passes (zero warnings)
  AC-3: grep domain/*.go for pkg/application|infrastructure|interface => 0 matches
  AC-4: This commit message lists all 6 files explicitly (L84 discipline)

Anchor 1776df8e held.
Pre-scaffold note:
  - No business logic yet (stubs only).
  - Depguard Fence-A (domain isolation) active from Day 1.
  - First primitive implementation lands in P1-B1.
  - Phase 2 will add TA's .golangci.yml fence config for automated checks.

L84 discipline: explicit per-file staging (git add <path>).
```

---

## Smoke Checks

After implementation, **before** declaring DONE:

```bash
cd apps/macro-indicators

# Verify all files exist
test -f pkg/domain/models.go && echo "✓ domain/models.go"
test -f pkg/domain/ports.go && echo "✓ domain/ports.go"
test -f pkg/application/dtos.go && echo "✓ application/dtos.go"
test -f pkg/application/usecases.go && echo "✓ application/usecases.go"
test -f pkg/infrastructure/repositories.go && echo "✓ infrastructure/repositories.go"
test -f pkg/interface/http/router.go && echo "✓ interface/http/router.go"

# Compile all packages
go build ./...
# Expected exit: 0

# Run vet
go vet ./...
# Expected exit: 0

# Domain isolation check (Fence-A)
grep -rn "pkg/application\|pkg/infrastructure\|pkg/interface" pkg/domain/*.go
# Expected: exit code 1 (zero matches)

# Verify anchor reachable
git merge-base --is-ancestor 1776df8e HEAD
# Expected exit: 0
```

---

## Risk Flags & Forward-Look

### R-1 (HIGH) — Math.random() in scoreIndicator

**Binding on:** P1-B1 AC-6 (deterministic tier lookup required)  
**Forward-warning:** PM will include explicit R-1 grep guard in P1-B1 handoff.  
**What it means:** The TS `scoreIndicator()` uses `Math.random()`. Go rewrite (P1-B1) MUST use deterministic scoring: VN_DIRECT=8, REGIONAL=5, US_DOMESTIC=2. No randomness.

### R-3 (HIGH) — 4 MCP tools bypass HTTP layer

**Binding on:** Phase 2 P2-B scope expansion  
**Forward-warning:** At Phase 1 close gate, PM will flag R-3 for architect attention.  
**What it means:** The 4 tools (get_macro_snapshot, get_carry_trade_signal, get_yield_spread_signal, get_macro_calendar) currently call macro-indicators domain code directly. Phase 2 P2-B must rewrite to use HTTP port 5004 instead.

---

## Depguard Fence Rules (Informational — no action required in P1-A4)

The `.golangci.yml` file (currently frozen at TA P2-A1 close) defines three depguard fences:

- **Fence-A:** Domain MUST NOT import Application/Infrastructure/Interface
- **Fence-B:** Application MUST NOT import Infrastructure/Interface (but CAN import Domain)
- **Fence-C:** Composition root (cmd/server/main.go) MUST NOT import Domain logic

AC-3 enforces Fence-A at the file level (grep check). When Phase 2 P2-A2 activates `.golangci-lint` in CI, automated fence violations will be caught. For now, we verify manually.

---

## Dependencies

| Task | Relation | Notes |
|------|----------|-------|
| P1-A3 | Blocks | cmd/sandbox/main.go (AC-1..4 PASS, signals complete) |
| P1-A5 | Blocked by | api/openapi.yaml (depends on pkg/ stubs being compilable) |
| P1-B1 | Blocked by | First primitive extraction (depends on pkg/ scaffold + usecases wiring) |

---

## G12 DoD Gate

**Does NOT apply to P1-A4** (scaffold-only, no scenarios exist yet).  
Gate activates P1-B1 onward when first primitive is implemented + scenarios created.

---

## Next Task

After P1-A4 DONE + QA green:

- **P1-A5** (api/openapi.yaml) unblocked
- PM dispatches P1-A5 handoff to dev-macro-indicators

---

## RETURN Block

**For dev-macro-indicators to complete:**

```
## RETURN — P1-A4 DONE

**Status:** COMPLETE ✓

**Commit SHA:** [SHA from git log -1]

**AC Verification:**
- AC-1 (go build ./...): [result]
- AC-2 (go vet ./...): [result]
- AC-3 (domain isolation grep): [result]
- AC-4 (commit lists 6 files explicitly): [result]

**Files created:**
  1. pkg/domain/models.go
  2. pkg/domain/ports.go
  3. pkg/application/dtos.go
  4. pkg/application/usecases.go
  5. pkg/infrastructure/repositories.go
  6. pkg/interface/http/router.go

**Smoke checks:** All PASS (see above)

**Files staged:** 6 files, explicit per-file (L84 compliant)
**L84 discipline:** COMPLIANT ✓
**Anchor 1776df8e:** HELD ✓

**Next:** P1-A5 dispatch ready (api/openapi.yaml). PM will send handoff after QA approval.
```

---

## References

- **Charter:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` v2.0
- **Phase 1 Task Plan:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` §P1-A4
- **TA Pilot Reference:** `apps/technical-analysis/pkg/` DDD layout (anchor 1776df8e)
- **Language Decision:** `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` §Q2
