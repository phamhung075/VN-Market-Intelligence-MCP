---
task_id: P1-A1
title: "Create apps/macro-indicators/go.mod + go.sum (Go 1.22, chi + modernc-sqlite deps)"
phase: "1"
pilot: "macro-indicators"
owner: "dev-macro-indicators"
goals: ["G3"]
files_touched:
  - "apps/macro-indicators/go.mod (CREATE)"
  - "apps/macro-indicators/go.sum (GENERATED via go mod tidy)"
status: "PENDING"
blocked_by: []
blocks: ["P1-A2"]
estimate_hours: 0.25
ac_count: 4
---

# P1-A1 — Create `apps/macro-indicators/go.mod` + `go.sum`

**Goal:** G3 (Microservice has clean composition root)

**Context:**
This is the first task of the macro-indicators Phase 1 scaffold. It initializes the Go module and pins the two core dependencies needed for the rest of Phase 1: `go-chi/chi` (HTTP router) and `modernc.org/sqlite` (pure-Go SQLite, no CGO).

**Phase 1 Plan Ref:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md §P1-A1`

---

## Files Touched

- `apps/macro-indicators/go.mod` (CREATE — Go module definition)
- `apps/macro-indicators/go.sum` (GENERATED via `go mod tidy`)

---

## Acceptance Criteria

### AC-1
`go.mod` contains exactly:
- Module name: `module github.com/vn-market-intelligence/macro-indicators`
- Go version: `go 1.22`
- Exactly 2 direct dependencies:
  - `github.com/go-chi/chi/v5 v5.2.1` (matches alert-engine pinning; verified 2026-05-23)
  - `modernc.org/sqlite v1.29.9` (pure-Go, no CGO; matches TA pilot brownfield §8)

### AC-2
`go mod verify` passes with zero errors.
`go.sum` is non-empty (contains hash entries for all direct + transitive deps).

### AC-3
After running `cd apps/macro-indicators && go mod tidy` in a clean sandbox:
- `go.sum` is regenerated
- No diff after tidy (idempotent — all deps already pinned correctly)
- `go mod verify` passes again

### AC-4
Commit message:
- References G3 goal explicitly
- Lists both file paths explicitly (L84 discipline: `apps/macro-indicators/go.mod`, `apps/macro-indicators/go.sum`)
- Includes rationale (e.g., "Advances G3 per pilot-charter.md v2.0; language Go locked per 2026-05-22 user verdict")

---

## Atomic Commit Format

```
feat(macro-indicators): P1-A1 — go.mod + go.sum (Go 1.22, chi + modernc-sqlite)

Advances G3 per pilot-charter.md v2.0.
Language: Go (locked per docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md §Q2).

- apps/macro-indicators/go.mod (NEW)
- apps/macro-indicators/go.sum (GENERATED via go mod tidy)

Deps:
  - github.com/go-chi/chi/v5 v5.2.1 (matches alert-engine + TA pilot)
  - modernc.org/sqlite v1.29.9 (pure-Go, no CGO)

Verified: go mod verify passes; go.sum idempotent after tidy.
```

---

## Constraints

**L84 Explicit-File Staging:**
```bash
git add apps/macro-indicators/go.mod
git add apps/macro-indicators/go.sum
git commit -m "..."
```
NO `git add -A`, NO `git add .`

**No Force, No Bypass:**
- No `--force`
- No `--no-verify`
- No `--no-gpg-sign`
- No `git push` (local-only — user owns push)

**Anchor Held:** Commit anchor `1776df8e` is immutable (no retag, no rewrite).

**All work on `main`:** NO branches per CLAUDE.md.

---

## Pre-Task Dependencies

- Phase 0 complete (architect deliverables verified at commit db0c0ba7 + af71de22)
- `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` ready
- `docs/data/pilot-status-macro-indicators.json` initialized with Phase 1 task list

---

## G12 DoD Gate Note (Informational)

G12 DoD Gate is the rule: _Do not mark task DONE until sandbox dashboard shows all macro scenarios green._

**For P1-A1:** This task is scaffold-only (no executable sandbox yet). G12 gate does NOT apply to P1-A1.

**For P1-B1 onward:** G12 gate is binding. After P1-A5 closes, all subsequent tasks (P1-B1 through P1-E2) must prove sandbox green before DONE is declared.

**Reference:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md §G12 DoD Gate Rule`

---

## Risk Flags — Forward-Look Section

### R-1 (HIGH): Math.random() in scoreIndicator() — P1-B1 Binding

**Description:**
The current TS implementation of `scoreIndicator()` in `src/domain/services.ts` uses `Math.random()` to add non-deterministic variance to tier scoring. This is incompatible with deterministic scenario testing in Go.

**Go Rewrite Rule (P1-B1 AC-6):**
Go primitive `pkg/primitive/macro_investment_clock/` must use **deterministic tier lookup**:
- VN_DIRECT tier → fixed score = 8 (no random)
- REGIONAL tier → fixed score = 5 (no random)
- US_DOMESTIC tier → fixed score = 2 (no random)

**Binding Check (P1-B1):**
```bash
grep -c "Math.random\|rand.Intn\|rand.Float" \
  apps/macro-indicators/pkg/primitive/macro_investment_clock/*.go
# Must return 0 (zero random functions)
```

**PM Responsibility:**
R-1 is already baked into P1-B1 AC-6 of the phase-1-task-plan. PM must forward-warn dev-macro-indicators at P1-A5 close (when B1 dispatch is prepared) so the developer sees the deterministic requirement before writing code.

**Severity:** HIGH — blocks scenario JSON authorship + all downstream module composition tests.

---

### R-3 (HIGH): 4 MCP Tools Bypass HTTP Layer — Phase 2 Forward-Look

**Description:**
Four MCP tools in `apps/mcp-server/src/interface/mcp/tools/macro/` bypass the macro-indicators HTTP layer entirely by importing domain logic directly:

1. `get_macro_snapshot`
2. `get_carry_trade_signal`
3. `get_yield_spread_signal`
4. `get_macro_calendar`

These are currently calling TS domain imports directly (e.g., `import { buildSnapshot } from '../../../domain/...'`). After Phase 1 Go scaffold ships, these tools must be rewired to call `localhost:5004/snapshot` HTTP endpoint instead.

**Phase 2 Expansion Required (P2-B scope expansion):**
Unlike TA's simple HTTP swap, macro-indicators requires **mcp-server tool handler rewire**:
- Edit `apps/mcp-server/src/interface/mcp/tools/macro/` each tool handler
- Call HTTP client: `POST localhost:5004/snapshot` instead of direct domain call
- Error handling: if Go service returns 5xx or timeout, return user-friendly error

**NOT in Phase 1 scope:**
R-3 is Phase 2 territory (architect-owned at Phase 1 close gate). Do NOT attempt in P1. Noted here for architect visibility when Phase 2 task plan expands at Phase 1 exit gate.

**Severity:** HIGH — must be resolved before TA domain code can be migrated or deleted.

---

## Smoke Check

```bash
cd apps/macro-indicators
go mod verify                           # Exit 0: all checksums valid
go.sum | wc -l                          # Return > 0 (non-empty)
grep "go-chi/chi" go.mod                # Confirm v5.2.1
grep "modernc.org/sqlite" go.mod        # Confirm v1.29.9
go mod tidy                             # Idempotent: no changes
git diff go.sum                         # Empty after tidy
```

All must succeed with zero changes.

---

## Dependencies

**Upstream:** None (first task)
**Downstream:** P1-A2 (cmd/server/main.go composition root) requires this module to compile

---

## WIP Lock Status

**Phase 1 WIP Limit:** 1 task In Progress (per charter wip_limit.phase_1_dev_team=1)

This task claims the WIP slot. No other dev-macro-indicators task may be dispatched until this task returns DONE + QA-green.

---

## Next Task Alert (for PM dispatch after P1-A1 DONE)

After P1-A1 closes:
- **P1-A2** (cmd/server/main.go composition root, ~20m) is unblocked
- PM dispatches P1-A2 next (same dev-macro-indicators agent, sequential per WIP=1)
- **Critical forward-look:** After P1-A5 closes (openapi.yaml), P1-B1 dispatch must carry explicit R-1 reminder in handoff because AC-6 of B1 is the hard gate (Math.random must be eliminated)

---

## Testing Notes

- Confirm both files created in correct directory: `apps/macro-indicators/`
- Verify module name matches charter (github.com/vn-market-intelligence/macro-indicators)
- Verify chi version matches alert-engine pinning (v5.2.1, verified at commit anchor)
- Verify modernc-sqlite pinning (v1.29.9) — pure-Go, no CGO required for sandbox env

---

## References

- **Charter:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` §v2.0
- **Brownfield Inventory:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md` §8 (dependency pinning guidelines)
- **Phase 1 Task Plan:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` §P1-A1
- **Language Decision:** `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` §Q2 (Go locked for macro)
- **OQ-5 Resolution:** alert-engine go.mod confirms chi v5.2.1 (verified 2026-05-23)
