---
title: "Phase 1 Task Plan (Go) — macro-indicators Pilot"
date: "2026-05-23"
author: "architect (cycle-29 phase-0)"
pilot: "macro-indicators"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-23"
sprint_deadline: "2026-07-04"
charter_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md"
language: "Go"
deliverable: "PHASE0-D5"
parent_pattern: "docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md (TA pilot)"
---

# Phase 1 Task Plan (Go) — macro-indicators Pilot

**Generated:** 2026-05-23 by architect (Phase 0)
**Pattern:** cloned from TA's `phase-1-task-plan-go.md` structure, adjusted for macro domain
**Language:** Go (locked Day 0 — charter §Language Lock; user verdict 2026-05-22 §Q2)
**Status:** READY-FOR-DISPATCH to dev-macro-indicators

---

## Summary

Phase 1 delivers the Go scaffold and the **first primitive end-to-end** (`macro-investment-clock`), following the 5-bucket structure proven on the TA pilot. The 6 selected primitives are extracted sequentially (one per task) to keep WIP=1 as specified by charter wip_limit.phase_1_dev_team=1.

Phase 1 scope = first primitive only plus the Go scaffold. Remaining 5 primitives + module + G4 fence + G5 deletion chain are Phase 2.

**First primitive rationale:** `macro-investment-clock` chosen first because:
1. It requires NO live scraper data (pure classification function)
2. It replaces the non-deterministic `Math.random()` in `scoreIndicator()` with a deterministic lookup — the fix is required before any stable scenario JSON can be authored
3. It is the most referenced primitive in charter §G1 candidate list and Phase 1 spec

---

## Charter Context (unchanged from charter v2.0)

- **Deadline:** 2026-07-04 (kickoff + 6 sprints, hard)
- **Goals:** G1–G12 in charter. Language-agnostic
- **WIP cap:** phase_1 = 1 task In Progress at a time (single dev-macro-indicators agent)
- **Anti-scope-creep:** pilot covers `apps/macro-indicators/` only
- **Security:** zero DB credentials + zero FRED_API_KEY in sandbox process env
- **L84:** `git add <explicit-path>` per file always. No `-A` no `.`

---

## Pre-Revert Tags (Phase 1 scope)

Phase 1 creates the Go scaffold — no deletion or CI activation occurs in Phase 1. Pre-revert tags for G4, G5, G10 are Phase 2 responsibilities:

| Tag | Phase | Who creates |
|---|---|---|
| `macro-pre-ci` | Phase 2 P2-A — before CI job activation | dev-macro-indicators |
| `macro-pre-delete` | Phase 2 P2-B — before `git mv src/ src/_deprecated/` | dev-macro-indicators |
| `macro-pre-inject` | Phase 2 P2-D — before bug injection commit | qa |

PM must reference these tags in all Phase 2 handoff specs.

---

## Task Ledger

| ID | Title | Owner | Goals | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-------|--------|------------|-----|----------|
| **P1-A1** | Create `apps/macro-indicators/go.mod` + `go.sum` (module name, Go 1.22, chi + modernc-sqlite deps) | dev-macro-indicators | G3 | P1-A2 | — | 15m | 4 |
| **P1-A2** | Create `apps/macro-indicators/cmd/server/main.go` (Go composition root, port 5004) | dev-macro-indicators | G3 | P1-A3 | P1-A1 | 20m | 5 |
| **P1-A3** | Create `apps/macro-indicators/cmd/sandbox/main.go` (sandbox runner, clone TA pattern) | dev-macro-indicators | G7, G12 | P1-A4 | P1-A2 | 20m | 4 |
| **P1-A4** | Scaffold `pkg/` DDD layout (domain, application, infrastructure, interface/http — stub files compile) | dev-macro-indicators | G3 | P1-A5, P1-B1 | P1-A3 | 30m | 8 |
| **P1-A5** | Create `apps/macro-indicators/api/openapi.yaml` (HTTP contract: GET /health + POST /snapshot) | dev-macro-indicators | G3 | P1-B1 | P1-A4 | 15m | 4 |
| **P1-B1** | Extract Go primitive: `pkg/primitive/macro_investment_clock/` + table-driven test + 3 scenario JSONs | dev-macro-indicators | G1, G7, G12 | P1-C1 | P1-A5 | 2h | 7 |
| **P1-C1** | Module stub: `pkg/module/macro_signals/` — barrel + composition function (imports macro-investment-clock via port) | dev-macro-indicators | G2, G12 | P1-D1, P1-D2, P1-E1 | P1-B1 | 1h | 6 |
| **P1-D1** | Scenario JSON suite: `docs/scenarios/macro-indicators/primitives/` — 3 files for macro-investment-clock (golden, edge, failure) | dev-macro-indicators | G1, G7, G12 | P1-E1 | P1-B1 | 30m | 5 |
| **P1-D2** | Module-level scenario JSON: `docs/scenarios/macro-indicators/module/macro-signals-{golden,edge}.json` | dev-macro-indicators | G2, G7, G12 | P1-E1 | P1-C1 | 30m | 4 |
| **P1-E1** | Dashboard stub HTML: `apps/macro-indicators/dashboard/index.html` — 1 primitive card + module + service panels (NOT-RUN state) | dev-macro-indicators | G6, G8, G9, G12 | P1-E2 | P1-C1, P1-D2 | 2h | 7 |
| **P1-E2** | Dashboard edit-rerun: Go sandbox runner wired to dashboard rerun-handler + env audit (FRED_API_KEY must be absent from sandbox env) | dev-macro-indicators | G7, G8, G12 | — | P1-E1 | 1.5h | 6 |

**Total atomic tasks:** 11 (5 A-bucket + 1 B-bucket + 1 C-bucket + 2 D-bucket + 2 E-bucket)
**Total estimated effort:** ~9.5 hours (single agent, WIP=1)
**Parallel tasks:** none — WIP=1 per charter wip_limit.phase_1_dev_team=1

**Key differences vs TA Phase 1 plan:**
- TA had 5 B-bucket tasks (5 primitives). Macro Phase 1 has 1 B-bucket task (1 primitive — the rest are Phase 2)
- TA had no `cmd/sandbox/` — it was a later addition. Macro bakes sandbox runner in Phase 1 (A3) per lessons-doc L6 carry-over
- TA had `pkg/` not `internal/` — macro follows same convention (brownfield §8)
- WIP cap is 1 for macro Phase 1 (TA had WIP=2 with dev-frontend; macro has no dev-frontend involvement until Phase 2 dashboard expansion)
- Module stub lands in Phase 1 to validate G2 wiring before Phase 2 primitives pile in

---

## Per-Task Acceptance Criteria

### P1-A1 — `go.mod` + `go.sum`

**Files touched:** `apps/macro-indicators/go.mod` (CREATE), `apps/macro-indicators/go.sum` (GENERATED)

**AC-1:** `go.mod` contains `module github.com/vn-market-intelligence/macro-indicators`, `go 1.22`, and exactly 2 direct deps: `github.com/go-chi/chi/v5 v5.2.1` + `modernc.org/sqlite v1.29.9` (versions match TA pilot per brownfield §8).
**AC-2:** `go mod verify` passes; `go.sum` is non-empty.
**AC-3:** `cd apps/macro-indicators && go mod tidy` run — `go.sum` generated, no diff after tidy (idempotent).
**AC-4:** Commit message references G3, includes both file paths explicitly.

**Atomic commit message pattern:**
```
feat(macro-indicators): P1-A1 — go.mod + go.sum (Go 1.22, chi + modernc-sqlite)

Advances G3 per pilot-charter.md v2.0.
Language: Go (per docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md §Q2).

- apps/macro-indicators/go.mod (NEW)
- apps/macro-indicators/go.sum (GENERATED via go mod tidy)

Deps: go-chi/chi v5.2.1 + modernc.org/sqlite v1.29.9 (pure-Go, no CGO).
```

---

### P1-A2 — `cmd/server/main.go` (composition root)

**Files touched:** `apps/macro-indicators/cmd/server/main.go` (CREATE)

**AC-1:** File is ≤100 lines (see brownfield §5 R-5 — macro has 3 use cases vs TA's 1; 100L threshold).
**AC-2:** Contains zero business logic — only: import statements, DI constructor calls, server startup + graceful shutdown boilerplate. `grep -c "if.*price\|for.*signal\|scoreIndicator\|buildSnapshot\|oilDirection" apps/macro-indicators/cmd/server/main.go` returns 0.
**AC-3:** Port = 5004 (from `envStr("PORT", "5004")`). Zero DB credentials, zero FRED_API_KEY read — `grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET\|TOKEN" apps/macro-indicators/cmd/server/main.go` returns 0.
**AC-4:** `go vet ./cmd/...` — expected to fail until P1-A4 (pkg/ packages not yet exist). Record as "pre-scaffold expected failure" in commit message.
**AC-5:** Pattern mirrors TA's `cmd/server/main.go` verbatim (graceful shutdown, slog, envStr helper, server timeouts).

**G3 QA check (at P1-A5 close, not P1-A2):**
```bash
test -f apps/macro-indicators/cmd/server/main.go && echo PASS
test -f apps/macro-indicators/api/openapi.yaml && echo PASS
grep -c "scoreIndicator\|buildSnapshot\|oilDirection" apps/macro-indicators/cmd/server/main.go
# Expected: 0
```

---

### P1-A3 — `cmd/sandbox/main.go`

**Files touched:** `apps/macro-indicators/cmd/sandbox/main.go` (CREATE)

**AC-1:** Sandbox runner accepts `-tier` flag (values: `primitive` | `module` | `all`) and `-module` flag (value: `macro-indicators`) and `-scenario` flag (value: `all` | scenario file path).
**AC-2:** Reads scenario JSON from `docs/scenarios/macro-indicators/` (primitive subdirectory or module subdirectory based on `-tier`). Does NOT fetch from live scrapers or external APIs.
**AC-3:** Prints pass/fail per scenario. Exits 0 if all pass, non-zero if any fail.
**AC-4:** Zero environment variable reads for secrets: `grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET\|TOKEN" apps/macro-indicators/cmd/sandbox/main.go` returns 0.

Clone shape from TA's `apps/technical-analysis/cmd/sandbox/main.go` — adjust module name, scenario path, and remove any TA-specific primitive references.

---

### P1-A4 — `pkg/` DDD scaffold (stub files that compile)

**Files touched:** 8 Go source files under `pkg/` (CREATE — all stubs)

Create the following as minimal compilable stubs:
- `pkg/domain/models.go` — `MacroSnapshot`, `PriceSignal`, `SignalDirection` types (port from `src/domain/models.ts`)
- `pkg/domain/ports.go` — `CommodityFetcherPort`, `SBVRatePort` interfaces (port from `src/domain/repositories.ts` — core ports only)
- `pkg/application/dtos.go` — `MacroSnapshotRequest`, `MacroSnapshotResponse` structs
- `pkg/application/usecases.go` — `ComputeMacroUseCase` struct + `NewComputeMacroUseCase` constructor + `Execute` stub (returns empty response, nil)
- `pkg/infrastructure/repositories.go` — `HTTPCommodityFetcher` struct + `NewHTTPCommodityFetcher` constructor (body: stub, no live calls yet)
- `pkg/interface/http/router.go` — `NewRouter(useCase, logger)` returning `chi.Router` with `GET /health` + `POST /snapshot` (handlers: stubs returning 501)

**AC-1:** `cd apps/macro-indicators && go build ./...` passes (zero compile errors after all stubs present).
**AC-2:** `go vet ./...` passes.
**AC-3:** `pkg/domain/models.go` imports ZERO packages from `pkg/infrastructure/` or `pkg/application/` (golden DDD rule).
**AC-4:** Commit message lists all 6 new files explicitly (L84 discipline).

---

### P1-A5 — `api/openapi.yaml`

**Files touched:** `apps/macro-indicators/api/openapi.yaml` (CREATE)

**AC-1:** Valid OpenAPI 3.0 document. `python3 -c "import yaml; yaml.safe_load(open('apps/macro-indicators/api/openapi.yaml'))"` exits 0.
**AC-2:** Documents `GET /health` returning `{"status":"ok","service":"macro-indicators","port":5004}`.
**AC-3:** Documents `POST /snapshot` request body (empty object `{}`) and response body (MacroSnapshotResponse fields: vnIndex, oilUsd, goldUsd, usdVnd, signals, fetchedAt).
**AC-4:** `test -f apps/macro-indicators/api/openapi.yaml && echo PASS`

**Smoke gate at end of A-bucket (before P1-B1 starts):**
```bash
cd apps/macro-indicators
go build ./...        # binary builds
go vet ./...          # zero warnings
test -f api/openapi.yaml && echo "openapi: PASS"
grep -c "scoreIndicator\|buildSnapshot\|oilDirection" cmd/server/main.go
# Expected: 0
```

---

### P1-B1 — `pkg/primitive/macro_investment_clock/`

**Files touched:** new Go package + test file + 3 scenario JSONs (CREATE)

**Background:** The `macro-investment-clock` primitive classifies the macro regime phase (expansion, contraction, recovery, slowdown) based on indicator tier scoring. The TS `scoreIndicator()` uses `Math.random()` — the Go rewrite must use **deterministic scoring** (see brownfield §5 R-1).

**Deterministic scoring design:**
- VN_DIRECT tier: score = 8 (fixed, not 8+random)
- REGIONAL tier: score = 5 (fixed)
- US_DOMESTIC tier: score = 2 (fixed)

Input struct: `InvestmentClockInput{IndicatorName string}`
Output struct: `InvestmentClockOutput{Tier string, Score int, Phase string}`

Phase classification (new logic, not in TS original — architect design for go primitive):
- Score ≥ 8 (VN_DIRECT) → Phase = "CORE_VN"
- Score ≥ 5 (REGIONAL) → Phase = "REGIONAL"
- Score < 5 (US_DOMESTIC) → Phase = "US_DOMESTIC"

**File paths:**
- `pkg/primitive/macro_investment_clock/macro_investment_clock.go`
- `pkg/primitive/macro_investment_clock/macro_investment_clock_test.go`
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json`
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-edge.json`
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-failure.json`

**AC-1:** Table-driven test with ≥5 rows (3 tier inputs + 1 VN keyword + 1 empty/unknown).
**AC-2:** Scenario JSONs: golden (known VN indicator → tier=VN_DIRECT, score=8), edge (empty string → tier=US_DOMESTIC, score=2), failure (invalid input → error captured in output or zero-value).
**AC-3:** `go test ./pkg/primitive/macro_investment_clock/...` exits 0.
**AC-4:** `cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all` exits 0 — N/N green. Paste sandbox output into handoff doc.
**AC-5:** Fence check: `grep -rn "application\|interface\|infrastructure" pkg/primitive/macro_investment_clock/*.go` returns 0 (no cross-layer imports — Fence-A pre-check).
**AC-6:** `grep -c "Math.random\|rand.Intn\|rand.Float" pkg/primitive/macro_investment_clock/*.go` returns 0 (deterministic).
**AC-7:** `FRED_API_KEY` env var absent from sandbox process (dev-macro-indicators confirms with `env | grep FRED_API_KEY` in sandbox context before submitting).

---

### P1-C1 — `pkg/module/macro_signals/` (stub)

**Files touched:** `pkg/module/macro_signals/macro_signals.go` + `_test.go` (CREATE)

**AC-1:** Module imports `pkg/primitive/macro_investment_clock` via the primitive's exported function (NOT via an infra adapter). Pattern: composition function `func BuildMacroSignals(input MacroSignalsInput) MacroSignalsOutput` calls `macro_investment_clock.Classify(...)`.
**AC-2:** `grep -rn "from.*pkg/module/" apps/macro-indicators/pkg/module/macro_signals/` returns 0 (no cross-module imports — G2 QA check).
**AC-3:** Multi-primitive scenario test (stub at Phase 1 — 1 primitive invocation is sufficient; Phase 2 adds remaining primitives).
**AC-4:** `go test ./pkg/module/macro_signals/...` exits 0.
**AC-5:** Sandbox module-level run: `go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all` exits 0.
**AC-6:** G12 DoD Gate: both sandbox tiers green before DONE is declared.

---

### P1-D1 — Primitive Scenario JSON Suite

**Files touched:** 3 JSON files (CREATE)

Full spec in P1-B1 AC-2. Confirm all 3 files:
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json`
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-edge.json`
- `docs/scenarios/macro-indicators/primitives/macro-investment-clock-failure.json`

**AC-1:** `find docs/scenarios/macro-indicators/primitives -name '*.json' | wc -l` returns ≥ 3.
**AC-2:** `find docs/scenarios/macro-indicators/primitives -name '*.json' -exec jq . {} \; > /dev/null` exits 0 (all valid JSON).
**AC-3:** ≥ 1 failure scenario exists (charter G1 verification requirement).
**AC-4:** `go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all` exits 0 — all 3 pass.
**AC-5:** Zero live API calls in any scenario JSON (all data is frozen in the JSON body — FRED_API_KEY never appears in scenario files).

---

### P1-D2 — Module Scenario JSON

**Files touched:** 2 JSON files (CREATE)

- `docs/scenarios/macro-indicators/module/macro-signals-golden.json`
- `docs/scenarios/macro-indicators/module/macro-signals-edge.json`

**AC-1:** Both files are valid JSON.
**AC-2:** `go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all` exits 0.
**AC-3:** golden scenario invokes macro-investment-clock primitive (verifies G2 module composition).

---

### P1-E1 — Dashboard Stub HTML

**Files touched:** `apps/macro-indicators/dashboard/index.html` (CREATE)

**AC-1:** File opens via `file://` in browser without any server. Zero network calls on open.
**AC-2:** Three panels rendered: Primitives (1 card for macro-investment-clock with NOT-RUN state), Module (1 card for macro-signals with NOT-RUN), Microservice (1 card for macro-indicators service).
**AC-3:** Status display is honest — NOT-RUN when sandbox not yet executed. No false greens.
**AC-4:** Dashboard renders correctly in chromium-headless-shell (PO Playwright path B) — no console errors, no pageerrors, no requestfailed.
**AC-5:** `grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET" apps/macro-indicators/dashboard/index.html` returns 0.
**AC-6:** Clone TA's `apps/technical-analysis/dashboard/index.html` color scheme and layout — substitute macro-indicators content.
**AC-7:** G12 DoD Gate: sandbox green (all primitives + module) before dashboard card is allowed to show GREEN status.

---

### P1-E2 — Dashboard Edit-Rerun + Env Audit

**Files touched:** `apps/macro-indicators/dashboard/index.html` (MODIFY — add rerun handler)

**AC-1:** User can edit any scenario JSON (e.g., change input value), refresh dashboard, see updated result. Rerun uses `go run ./cmd/sandbox` — NOT `bun run sandbox`.
**AC-2:** Env audit: run `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD|FRED_API_KEY"` inside sandbox process context — must return empty.
**AC-3:** FRED_API_KEY explicitly in the grep pattern (charter §Security Clause macro-specific addition).
**AC-4:** QA verifies 1 deliberate scenario edit produces updated dashboard result (G7 verification pattern).
**AC-5:** Exit 0 when all scenarios green after edit; non-zero when scenario is broken (G8 honest red/green).
**AC-6:** G12 DoD Gate (Phase 1 streak task #1): sandbox output pasted to handoff, all GREEN.

---

## Sequencing

```
P1-A1 → P1-A2 → P1-A3 → P1-A4 → P1-A5
                                     ↓
                                  P1-B1 → P1-C1 → P1-D2
                                     ↓               ↓
                                  P1-D1          P1-E1 → P1-E2
```

**Critical path:** P1-A1 → A5 → B1 → C1 → D2 → E1 → E2

**WIP=1 enforcement:** dev-macro-indicators works one task at a time. PM dispatches next task only after current task's DONE signal + QA green light.

---

## Phase 1 Exit Gate (PO Go/No-Go)

Per charter `07-phases.md §Phase 1 exit gate`:

| Criterion | Measurement |
|---|---|
| Time-to-extract first primitive ≤ 4 agent-hours | Track wall-clock from P1-A1 dispatch to P1-B1 DONE signal |
| Dashboard render rate ≥ 90% on the 1 Phase-1 card | Playwright card-visible check (PO verifies) |
| Sandbox self-test: macro-investment-clock at L3+ | `go run ./cmd/sandbox -tier=primitive -scenario=all` exits 0 |
| PO + architect approve Phase 1 dashboard before Phase 2 starts | PO issues go signal after Phase 1 close |

**GO** = all 4 met → proceed to Phase 2 at planned scope (6 primitives, 1 module, G4-G12 chain).
**CONDITIONAL GO** = 3 of 4 met → proceed but cap at 1 primitive per sprint for next 2 sprints.
**NO-GO** = 2 or fewer met → architect re-plans Phase 2 scope before further extraction.

---

## G12 DoD Gate Rule (Day-0 — carried from TA pilot cc7578f1)

**Hard rule — blocks DONE declaration on every task.**

Do not mark task DONE until sandbox dashboard shows all macro scenarios green.

Run both tiers before declaring complete:

```bash
cd apps/macro-indicators
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
```

Both must exit 0 with all scenarios GREEN.

If ANY scenario is RED: task is NOT done. Fix, re-run. Each non-green attempt = 1 cycle (G10/G11 evidence).

Evidence: paste sandbox output summary into handoff doc before writing RETURN block.

**Pre-Phase-2 task streak:** G12 grade requires 3 consecutive tasks with G12 DoD Gate followed. Tasks P1-B1, P1-C1, P1-E1 are the first 3 streak candidates (they all produce sandbox-runnable artefacts). QA counts these as streak tasks #1, #2, #3 for G12 grading.

---

## Open Questions for PM

**OQ-1 — Sandbox binary vs `go run`**
P1-A3 and P1-E2 use `go run ./cmd/sandbox` for the sandbox runner. If sandbox compile time is slow (>5s), PM may elect to have dev-macro-indicators pre-build a `sandbox` binary at task start (`go build -o bin/sandbox ./cmd/sandbox/`). Document chosen approach in P1-A3 AC.

**OQ-2 — `NewHTTPCommodityFetcher()` constructor — stub scope**
P1-A4 creates `HTTPCommodityFetcher` as a stub. Phase 2 P2-B bucket will implement live HTTP calls. PM must lock the calling convention in P1-A4 AC to prevent mismatch when Phase 2 implements it.

**OQ-3 — `modernc.org/sqlite` vs `mattn/go-sqlite3` for `SQLiteMacroRepository`**
Macro-indicators reads `market.db` readonly (same as TA). `modernc.org/sqlite` (no CGO) is correct. PM must confirm this in P1-A4 AC, especially since market.db is a shared file with other services.

**OQ-4 — Dashboard HTML in Phase 1 vs Phase 2 ownership**
TA had `dev-frontend` author the dashboard (P1-E1/E2). Macro has no `dev-frontend` agent in WIP=1 mode — `dev-macro-indicators` owns dashboard stub. If dashboard complexity grows in Phase 2, PM may need to split E-bucket between dev-macro-indicators (logic) and dev-frontend (CSS/layout). Flag this in Phase 2 task plan.

**OQ-5 — `go-chi/chi` version pin**
Pin at `v5.2.1` to match alert-engine + TA. PM confirms at P1-A1 time that alert-engine go.mod still shows v5.2.1 before pinning.

**OQ-6 — Phase 2 first dispatch sequencing**
Phase 2 should start with P2-A1 (golangci.yml creation) in parallel with P2-B1 (preliminary scraper strategy confirmation). These are independent. PM dispatches both in same cycle, subject to WIP=2 Phase 2 cap.
