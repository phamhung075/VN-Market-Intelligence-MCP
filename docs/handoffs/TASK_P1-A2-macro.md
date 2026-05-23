---
title: "TASK_P1-A2 — cmd/server/main.go Composition Root"
phase: "1"
pilot: "macro-indicators"
task_id: "P1-A2"
owner: "dev-macro-indicators"
created_at: "2026-05-23T10:15:00Z"
created_by: "pm"
status: "READY-FOR-DISPATCH"
wip_claim: "phase_1_dev_team = ACTIVE (1 of 1 max)"
---

# TASK_P1-A2 — `cmd/server/main.go` Composition Root

**Pilot:** macro-indicators (Phase 1, Go language)  
**Owner:** dev-macro-indicators  
**Estimate:** 20 minutes  
**AC count:** 5  
**Goal:** G3 (Microservice has clean composition root)  
**Blocked by:** P1-A1 (go.mod + go.sum)  
**Blocks:** P1-A3 (cmd/sandbox/main.go)  
**Anchor:** 1776df8e (held throughout pilot — do not violate)

---

## Context

P1-A1 completed 2026-05-23T10:13:55Z: go.mod + go.sum created with chi v5.2.1 + modernc-sqlite v1.29.9 pinned. All 4 ACs pass. Two notes from P1-A1:

1. **D-1 (LOW):** `tools.go` anchor added to prevent `go mod tidy` from stripping deps during scaffold phase. This file must be **removed as part of P1-A2** since `main.go` (composition root being created now) will import both deps directly. The anchor becomes redundant once composition root exists.

2. **D-2 (INFO):** go directive is 1.25.0 (not 1.22) — this is correct per Go 1.21+ tidy behavior under 1.26.2 toolchain. Modern.org/sqlite v1.29.9 requires 1.25.0. No action needed.

---

## Acceptance Criteria

### AC-1: File size constraint
`apps/macro-indicators/cmd/server/main.go` must be **≤100 lines**.

**Rationale:** Brownfield audit (p0-brownfield-inventory.md §5 R-5) documents that macro-indicators has 3 use-cases vs TA's 1. 100L threshold provides buffer vs TA's 80L, accommodating slightly more complex startup without violating composition-root discipline.

**Verification:**
```bash
wc -l apps/macro-indicators/cmd/server/main.go
# Expected: ≤ 100 lines
```

---

### AC-2: Zero business logic
File contains **only** import statements, DI constructor calls, server startup, and graceful shutdown boilerplate. **No business logic**.

**Verification:**
```bash
grep -c "if.*price\|for.*signal\|scoreIndicator\|buildSnapshot\|oilDirection" \
  apps/macro-indicators/cmd/server/main.go
# Expected: 0
```

---

### AC-3: Port + Environment security
Port must be **5004** (from `envStr("PORT", "5004")`). Zero DB credentials, zero FRED_API_KEY reads in this file.

**Verification:**
```bash
grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET\|TOKEN" \
  apps/macro-indicators/cmd/server/main.go
# Expected: 0
```

**Note:** Environment variables for service credentials (if needed) are read in `pkg/infrastructure/repositories.go` constructors, NOT in main.go.

---

### AC-4: Go vet expected failure (pre-scaffold)
`go vet ./cmd/...` will exit non-zero (expected) because `pkg/` packages don't exist yet. Record this as "pre-scaffold expected failure" in commit message. This is **not** a failure condition.

**Verification:**
```bash
cd apps/macro-indicators
go vet ./cmd/... 2>&1 | head -5
# Expected output: "package github.com/vn-market-intelligence/macro-indicators/pkg/... not found"
# or similar
```

Do NOT fix this error — it will resolve when P1-A4 creates pkg/ scaffolds.

---

### AC-5: Pattern mirrors TA pilot
Structure mirrors `apps/technical-analysis/cmd/server/main.go` **verbatim**:

- Import block: `log/slog`, `net/http`, `context`, chi `router.NewRouter()`, graceful shutdown
- `envStr()` helper (read PORT with default fallback)
- Server initialization: `&http.Server{...}`, timeouts (ReadTimeout, WriteTimeout, IdleTimeout)
- Graceful shutdown: context cancellation + server.Shutdown()
- Exit codes: 0 on success, non-zero on error

**Reference:** `apps/technical-analysis/cmd/server/main.go` at anchor 1776df8e (TA pilot composition root pattern)

---

## Files Touched

| File | Action | Notes |
|------|--------|-------|
| `apps/macro-indicators/cmd/server/main.go` | CREATE | Composition root, ~80–100 lines, Go pattern from TA |
| `apps/macro-indicators/tools.go` | DELETE | Anchor no longer needed (main.go now imports chi + sqlite directly) |

---

## Implementation Notes

### Structure template (reference TA)

```go
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/interface/http/router"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// DI: instantiate use case and router
	// (pkg/ packages don't exist yet — wire stubs in P1-A4)
	// useCase := application.NewComputeMacroUseCase(...)
	// r := router.NewRouter(useCase, logger)

	port := envStr("PORT", "5004")
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in background
	go func() {
		logger.Info("server starting", slog.String("port", port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", slog.Any("err", err))
			os.Exit(1)
		}
	}()

	// Graceful shutdown on signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("shutdown error", slog.Any("err", err))
		os.Exit(1)
	}

	logger.Info("server stopped")
}

func envStr(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
```

**Pre-scaffold scaffolding note:** The DI wiring (commented above) won't compile until P1-A4 creates `pkg/interface/http/router.go`. For P1-A2, **either**:

- Option A: Comment out DI wiring, compile-gate marked "pre-scaffold" in AC-4
- Option B: Create minimal `pkg/interface/http/router.go` stub in P1-A2 (breaks task boundary, not recommended)

**Use Option A** (comment + pre-scaffold gate).

---

## Constraints

### L84 — Explicit file staging
```bash
git add apps/macro-indicators/cmd/server/main.go
git add --force apps/macro-indicators/tools.go  # deletion
# NO: git add -A
# NO: git add .
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
feat(macro-indicators): P1-A2 — cmd/server/main.go composition root

Advances G3 per pilot-charter.md v2.0.

- apps/macro-indicators/cmd/server/main.go (NEW, ~80–100 lines)
  Composition root: DI wiring + server startup + graceful shutdown.
  Pattern: mirrors apps/technical-analysis/cmd/server/main.go (TA pilot).
  Port: 5004 (envStr with default).
  AC-1..5 satisfied (see TASK_P1-A2-macro.md).

- apps/macro-indicators/tools.go (DELETE — no longer needed)
  P1-A1 scaffold anchor: kept deps in go.mod during pre-composition phase.
  P1-A2 now imports chi + sqlite directly in main.go, anchor redundant.

Notes:
  - go vet ./cmd/... expected to fail (pre-scaffold, pkg/ not yet exist)
    → will resolve when P1-A4 creates pkg/ scaffolds
  - DI wiring commented (stubs in P1-A4)
  - Zero business logic, zero env secrets in main.go

L84 discipline: explicit per-file staging (git add <path>).
Anchor 1776df8e held.
```

---

## Smoke Checks

After implementation, **before** declaring DONE:

```bash
cd apps/macro-indicators

# Check file exists and size
wc -l cmd/server/main.go
# Expected: ≤ 100 lines

# Zero business logic
grep -c "if.*price\|for.*signal\|scoreIndicator\|buildSnapshot\|oilDirection" \
  cmd/server/main.go
# Expected: 0

# Zero credentials
grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET\|TOKEN" cmd/server/main.go
# Expected: 0

# Port check
grep "PORT" cmd/server/main.go | grep -c 5004
# Expected: 1 (port 5004 somewhere in code)

# tools.go deletion verified
test ! -f tools.go && echo "tools.go deleted ✓" || echo "tools.go still exists (ERROR)"

# Expected go vet failure (recorded in commit)
go vet ./cmd/...
# Expected exit: non-zero (pre-scaffold)
# Expected error message: "package ... not found" or similar
```

---

## Risk Flags & Forward-Look

### R-1 (HIGH) — Math.random() in scoreIndicator
**Binding on:** P1-B1 AC-6 (fix mandatory)  
**Forward-warning:** At P1-A5 close (openapi.yaml complete), PM will include explicit R-1 reminder in P1-B1 handoff.  
**What it means:** The TS `scoreIndicator()` uses `Math.random()` for tier scoring. Go rewrite (P1-B1) MUST use deterministic tier lookup (pre-computed map). No randomness in primitives.

**Evidence in P1-B1:** `grep -c "Math.random\|rand.Intn\|rand.Float" pkg/primitive/macro_investment_clock/*.go` must return 0.

---

### R-3 (HIGH) — 4 MCP tools bypass HTTP layer
**Binding on:** Phase 2 P2-B scope expansion  
**Forward-warning:** At Phase 1 close gate, PM will flag R-3 for architect attention.  
**What it means:** The 4 tools (get_macro_snapshot, get_carry_trade_signal, get_yield_spread_signal, get_macro_calendar) currently import macro-indicators domain code directly in mcp-server. Phase 2 P2-B must rewrite these to use HTTP port 5004 instead.

**Phase 2 ownership:** Architect specifies which tasks in P2-B include mcp-server tool handler rewire.

---

## Dependencies

| Task | Relation | Notes |
|------|----------|-------|
| P1-A1 | Blocks | go.mod + go.sum (AC-1..4 PASS, signals complete) |
| P1-A3 | Blocked by | sandbox/main.go depends on cmd/server structure |

---

## G12 DoD Gate

**Does NOT apply to P1-A2** (scaffold-only, no sandbox runner yet).  
Gate activates P1-B1 onward (first primitive + scenarios).

---

## Next Task

After P1-A2 DONE + QA green:
- **P1-A3** (cmd/sandbox/main.go) unblocked
- PM dispatches P1-A3 handoff to dev-macro-indicators

---

## RETURN Block

**For dev-macro-indicators to complete:**

```
## RETURN — P1-A2 DONE

**Status:** COMPLETE ✓

**Commit SHA:** [SHA from git log -1]

**AC Verification:**
- AC-1 (≤100 lines): [result]
- AC-2 (zero business logic): [result]
- AC-3 (port 5004 + zero creds): [result]
- AC-4 (pre-scaffold go vet failure): [result]
- AC-5 (TA pattern mirror): [result]

**Files staged:** cmd/server/main.go + tools.go deletion
**L84 discipline:** COMPLIANT (explicit per-file staging)
**Anchor 1776df8e:** HELD ✓

**Next:** P1-A3 dispatch ready. PM will send handoff after QA approval.
```

---

## References

- **Charter:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` v2.0
- **Phase 1 Task Plan:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` §P1-A2
- **Brownfield Inventory:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` §5 (R-5 100L threshold)
- **TA Pilot Reference:** `apps/technical-analysis/cmd/server/main.go` (anchor 1776df8e pattern)
- **Language Decision:** `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` §Q2
