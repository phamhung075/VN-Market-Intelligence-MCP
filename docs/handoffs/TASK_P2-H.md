---
task_id: "P2-H"
phase: "2"
pilot: "stock-price"
authored_by: "pm"
authored_at: "2026-05-24T02:50:00Z"
previous_task: "P2-G (DONE 2026-05-24T00:44:37Z, qa verified G5b/c audit)"
next_task: "P2-I (G6/SI-2 — 3-panel dashboard finalization + SI-2 fleet index)"

g3_goal_title: "Microservice has clean composition root"
g3_goal_status: "STILL-UNMET (Phase 2)"
owner: "dev-stock-price"
wip_policy: "WIP=1 sequential; PM dispatches single task; dev-stock-price executes all ACs before DONE signal"

---

# P2-H — G3: Composition Root Cleanup + OpenAPI Contract

**Pilot:** stock-price (fleet pilot 3)  
**Phase:** 2  
**Blocked by:** P2-G DONE  
**Blocks:** P2-I  
**Sprint deadline:** 2026-07-04  

---

## Goal Background

**G3 — "Microservice has clean composition root"**

The composition root (`cmd/server/main.go`) must be a PURE WIRING FILE:
- Zero business logic (no FetchPrice, no tierResult calculations, no normalization, no classification)
- Wires the `price_resolution` module
- Injects the CGO SQLite fetcher (`mattn/go-sqlite3`) as the `TierFetcher` port implementation at THIS point ONLY (Fence-C compliance)
- Ensures correct port wiring (5000 internal / 5010 external) via environment variable or system-map.json query — NOT hardcoded literals

**OpenAPI contract (`apps/stock-price/api/openapi.yaml`):**
- HTTP contract documenting all live endpoints
- Machine-readable specification (valid YAML per Python yaml parser)
- Covers at minimum: `/health`, `/price/fetch`, `/price/history`

---

## Charter Context

From `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` §P2-H:

> G3 requires the composition root to be a pure wiring file (no business logic, no if-on-data-values, no calculations) AND an HTTP contract document (OpenAPI YAML). The CGO SQLite fetcher (mattn/go-sqlite3) is wired HERE as the infra implementation of the TierFetcher port — this is the ONLY place it is injected.

---

## Acceptance Criteria (6 total)

### AC-1 — Zero Business Logic in Composition Root

**Assertion:**
```bash
grep -c "FetchPrice\|tierResult\|normalize\|SelectWinning\|Classify" \
  apps/stock-price/cmd/server/main.go
```

**Expected outcome:** Returns `0`

**Rationale:** Business logic lives in primitives/module, not the composition root.

**Failure mode:** If count > 0, dev-stock-price must extract offending code into domain/module layer or a helper module.

---

### AC-2 — CGO Infrastructure Injected at Composition Root (Fence-C)

**Assertion:**
```bash
grep -n "infrastructure\|SQLite\|mattn\|fetcher" apps/stock-price/cmd/server/main.go
```

**Expected outcome:** Returns ≥1 match (confirming the CGO SQLite adapter is wired here)

**Rationale:** CGO SQLite is importable ONLY from `cmd/server/main.go` (composition root). This is the single injection point per Fence-C.

**Example match:** `fetcher := sqlite.NewSQLiteFetcher(...)` or `import "apps/stock-price/pkg/infrastructure/fetchers"`

**Failure mode:** If count = 0, dev-stock-price must wire the infra fetcher in main.go and pass it to the module.

---

### AC-3 — Composition Root ≤100 Lines

**Assertion:**
```bash
wc -l apps/stock-price/cmd/server/main.go
```

**Expected outcome:** Returns a line count ≤ 100

**Rationale:** Pure wiring files are concise. Helpers are extracted to separate files (e.g., `cmd/server/wire.go`).

**Failure mode:** If > 100 lines, dev-stock-price must extract wiring logic into helper files (`wire.go`, `routes.go`, etc.) that are still in `cmd/server/` but separate.

---

### AC-4 — OpenAPI Contract Exists and Covers All Live Endpoints

**Assertion (file existence):**
```bash
test -f apps/stock-price/api/openapi.yaml && echo FOUND
```

**Expected outcome:** Echoes `FOUND`

**Assertion (YAML validity):**
```bash
cat apps/stock-price/api/openapi.yaml | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)"
```

**Expected outcome:** Exits 0 (valid YAML)

**Content requirements:** The YAML contract must document at minimum:

| Endpoint | Method | Req/Resp Shape | Notes |
|----------|--------|---|---|
| `/health` | GET | Response: `{ status, service, port }` | Liveness check |
| `/price/fetch` | POST | Request: `{ code: string }`, Response: `PriceQuote` | Fetch single price |
| `/price/history` | GET | Query: `code=X&days=N`, Response: `[]DailyOHLCV` | Multi-day history |

**Failure mode:** If file missing or YAML invalid, dev-stock-price must create/fix the contract.

---

### AC-5 — Build + Lint Still Clean

**Assertion:**
```bash
cd apps/stock-price && go build ./... && golangci-lint run
```

**Expected outcome:** Both commands exit 0

**Rationale:** Composition root cleanup must not break existing builds or fence rules.

**Fence checks:** `.golangci.yml` frozen at `d5ce886e` (P2-B). No subsequent commit modifies it. Fence-A/B/C all CLEAN.

**Failure mode:** If either exits non-zero, dev-stock-price must fix the issue before proceeding.

---

### AC-6 — G12 DoD Gate (Dashboard Green Before DONE)

**Assertion:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```

**Expected outcome:** Exits 0

**Evidence:** Paste full sandbox output to the `§Evidence` section below (all scenario verdicts visible).

**Rationale:** No task can be marked DONE without sandbox all-green (G12 DoD rule baked into dev-stock-price flow).

**Failure mode:** If exit non-zero, dev-stock-price must debug sandbox failures before re-running.

---

## Implementation Notes

**Files to modify:**

| File | Action | Notes |
|------|--------|-------|
| `apps/stock-price/cmd/server/main.go` | MODIFY | Wire `price_resolution` module; inject SQLite fetcher (Fence-C); ensure port from env/system-map |
| `apps/stock-price/api/openapi.yaml` | CREATE | OpenAPI 3.0.x contract (or 3.1.x); static YAML; machine-readable |

**Not touched (frozen):**
- `apps/stock-price/.golangci.yml` (frozen at `d5ce886e` per P2-B AC-4)
- `docs/data/pilot-status-stock-price.json` (PM-owned SSOT)
- `apps/technical-analysis/`, `apps/macro-indicators/`, other pilots' zones

**Port wiring guidance:**

The service listens on port 5000 (internal) / 5010 (external per system-map.json). Do NOT hardcode `5000` as a literal string in HTML/docs or main.go. Instead:

Option A: Read from `system-map.json` at init time
```go
// Pseudo-code
config := loadSystemMap("docs/data/system-map.json")
port := config.microservices[stock-price].port // 5000
```

Option B: Use environment variable with fallback
```go
port := os.Getenv("STOCK_PRICE_PORT")
if port == "" {
  port = "5000" // fallback only if env not set
}
```

Recommended: Option A (query system-map at runtime) for consistency across fleet.

**CGO Fence-C placement:**

The `mattn/go-sqlite3` import must appear ONLY in `cmd/server/main.go` (or `cmd/server/wire.go` if extraction needed). Example:

```go
package main

import (
  "apps/stock-price/pkg/module/price_resolution"
  "apps/stock-price/pkg/infrastructure/fetchers"  // ← Fence-C: OK here
  _ "github.com/mattn/go-sqlite3"  // ← CGO import: OK here ONLY
)

func main() {
  db := fetchers.NewSQLiteDB()
  fetcher := fetchers.NewSQLiteFetcher(db)
  module := price_resolution.New(fetcher)
  // ... route module
}
```

---

## Evidence

### AC-1 Output (Zero Business Logic)

```
[dev-stock-price: paste output of grep -c "FetchPrice|tierResult|normalize|SelectWinning|Classify" here]
Expected: 0
```

### AC-2 Output (Fence-C Injected)

```
[dev-stock-price: paste output of grep -n "infrastructure|SQLite|mattn|fetcher" here]
Expected: ≥1 match
```

### AC-3 Output (Line Count)

```
[dev-stock-price: paste output of wc -l apps/stock-price/cmd/server/main.go here]
Expected: ≤100
```

### AC-4 YAML Validity

```
[dev-stock-price: paste output of `cat apps/stock-price/api/openapi.yaml | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)"` here]
Expected: no error output (exit 0)
```

File content (first 50 lines):
```yaml
[dev-stock-price: paste first 50 lines of apps/stock-price/api/openapi.yaml]
```

### AC-5 Build + Lint

```bash
# Build output
[dev-stock-price: paste `cd apps/stock-price && go build ./...` output]

# Lint output
[dev-stock-price: paste `cd apps/stock-price && golangci-lint run` output]
```

Both expected to exit 0 with no errors.

### AC-6 G12 DoD Sandbox Output

```
[dev-stock-price: paste full output of:
  cd apps/stock-price
  go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
]

Expected: Exit 0, all scenario verdicts PASS/OK
```

---

## Commit Guidance

**Pattern:**
```
feat(stock-price): P2-H — composition root cleanup + OpenAPI contract (G3)
```

**Files in commit:**
- `apps/stock-price/cmd/server/main.go` (modified or newly created wire.go if needed)
- `apps/stock-price/api/openapi.yaml` (created)

**Pre-commit checks (dev-stock-price):**
1. All 6 ACs pass locally
2. Sandbox all-green (AC-6)
3. No foreign files staged (`git diff --cached --name-only` shows only stock-price paths)
4. Anchor still intact: `git merge-base --is-ancestor debba8eaff0724d1fb32fc9d28640201cc32d1cc HEAD` → exit 0

**L84 explicit-file staging:**
```bash
git add apps/stock-price/cmd/server/main.go
git add apps/stock-price/api/openapi.yaml
# OR if wire.go was extracted:
git add apps/stock-price/cmd/server/wire.go
```

NEVER use `git add -A` or `git add .` (rule L84).

---

## G-Goal Posture

**NO goal flips.** Per Charter §4.5:
- `goalsEarned` stays 0 throughout Phase 2
- `decisionMatrix` (speed, trust, scale) stays all-TBD
- Goal state changes are PO-only, atomic with 12/12 terminal close in Phase 3

This task advances G3 evidence but does NOT flip G3 status to YES. PO flips all G-goals together at Phase 3 close.

---

## Constraints & Discipline

| Constraint | Rule |
|-----------|------|
| **WIP=1** | No parallel tasks. Dev-stock-price completes P2-H before PM dispatches P2-I |
| **No branches** | All work on `main` |
| **No destructive git** | No `--force`, no `--amend`, no `--no-verify`, no `git push` of source files |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD |
| **SSOT frozen** | PM-owned `docs/data/pilot-status-stock-price.json` not modified by dev |
| **Zone isolation** | Do NOT modify `apps/kinh-dich-service/`, `apps/technical-analysis/`, `apps/macro-indicators/`, or other pilots' zones |
| **Golangci freeze** | `.golangci.yml` at `d5ce886e` (P2-B) — no subsequent commits touch it |

---

## Next Task

**P2-I** — G6/SI-2: 3-panel dashboard finalization + SI-2 fleet index (`docs/dashboards/index.html`)

Blocked by: P2-H DONE (composition root and OpenAPI in place — microservice panel can now reference real endpoint facts)

---

## References

- **Phase 2 Task Plan:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md` §P2-H
- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md`
- **SSOT:** `docs/data/pilot-status-stock-price.json`
- **System facts:** `docs/data/system-map.json` (query for stock-price microservice port)
- **G3 calibration:** Charter §Goal G3 — defines the composition root specification

---

**Authored by:** pm  
**Authored at:** 2026-05-24T02:50:00Z  
**Charter §4.5 binding:** NO goal flips in Phase 2. PO flips goals only at 12/12 terminal close.
