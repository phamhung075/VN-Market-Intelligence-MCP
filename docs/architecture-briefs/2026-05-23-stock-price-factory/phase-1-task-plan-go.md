---
title: "Phase 1 Task Plan — Stock-Price Microservice (Go)"
date: "2026-05-24"
author: "architect (P0-SP-6)"
pilot: "stock-price"
fleet_pilot_number: 3
phase: "1"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-04"
charter_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md"
language: "Go"
deliverable: "PHASE0-D6 (phase_1_task_plan)"
parent_pattern: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md (macro pilot P0-D5)"
---

# Phase 1 Task Plan — Stock-Price Microservice (Go)

**Generated:** 2026-05-24 by architect (Phase 0, task P0-SP-6)
**Pattern:** cloned from macro-indicators `phase-1-task-plan-go.md` structure; specialized for stock-price Go native service
**Language:** Go (locked at charter creation — service is already Go; no rewrite step)
**Status:** READY-FOR-DISPATCH to dev-stock-price

---

## Phase 1 Overview

Phase 1 delivers the **Go scaffold additions** and the **first primitive end-to-end** (`price-quote-normalizer`), the **R-CGO gate**, the **module stub**, the **dashboard stub**, and the **sandbox green** baseline.

**Key difference from macro Phase 1:** stock-price is **already a running Go service**. Phase 1 does NOT recreate `go.mod`, `cmd/server/main.go`, or the `pkg/` DDD layers — they already exist and are clean (per brownfield inventory §2). Instead, Phase 1 **adds** the factory scaffolding on top of the existing service:

- `cmd/sandbox/` (new — sandbox runner)
- `pkg/primitive/` (new — primitives)
- `pkg/module/price_resolution/` (new — module stub)
- `dashboard/` (new — HTML trust layer)

The `go.mod` already has `mattn/go-sqlite3 v1.14.22` as its only external dependency. The sandbox must build under `CGO_ENABLED=0` — this is the R-CGO gate (stock-price's equivalent of macro's R-1 Math.random() fix).

**Goal:** Go scaffold + 3 primitives + module stub + dashboard stub + sandbox green, all under `CGO_ENABLED=0` for the primitive/module/sandbox fence. R-CGO gate must pass before module stub lands.

---

## Phase 1 Scope vs Prior Pilots

| Item | TA Phase 1 | Macro Phase 1 | Stock-Price Phase 1 |
|---|---|---|---|
| `go.mod` creation | YES (rewrite from TS) | YES (rewrite from TS) | **NO** — already exists |
| `cmd/server/main.go` creation | YES | YES | **NO** — already exists (clean) |
| `pkg/` DDD scaffold | YES | YES | **NO** — already exists (clean) |
| `cmd/sandbox/` creation | YES | YES | **YES** — new addition |
| `pkg/primitive/` creation | YES (5 primitives) | YES (1 primitive) | **YES** (3 primitives — P1-B1, P1-B2, P1-B3) |
| Module stub | YES (1 module) | YES (1 module) | **YES** (1 module: `price_resolution`) |
| Dashboard stub | YES | YES | **YES** |
| R-CGO gate | N/A (no CGO in existing TS) | N/A (no CGO planned — modernc-sqlite) | **YES — HARD GATE** (`mattn/go-sqlite3` is in existing infra; must not leak into primitive/module/sandbox) |

**Duration:** 2–3 sprints (11–15 dev-hours estimated)
**Owner:** dev-stock-price
**WIP:** 1 sequential (charter wip_limit)

---

## Pre-Revert Tags (Phase 1 scope)

Phase 1 only scaffolds new directories — no deletion or CI activation. Phase 2 pre-revert tags are the dev-stock-price responsibility at those task times:

| Tag | Phase | Who creates | Purpose |
|---|---|---|---|
| `stock-price-pre-ci` | Phase 2 — before `.golangci.yml` CI activation | dev-stock-price | G4 fence freeze anchor |
| `stock-price-pre-delete` | Phase 2 — before `git mv` of superseded domain logic to `_deprecated/` | dev-stock-price | G5a rollback anchor |
| `stock-price-pre-inject` | Phase 2 — before bug-injection commit | qa | G10 rollback anchor |

PM must reference these tags in all Phase 2 handoff specs.

---

## Task Ledger

| ID | Title | Owner | Goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|-------|----------------|--------|------------|-----|----------|
| **P1-A** | `cmd/sandbox/main.go` — sandbox runner (CGO_ENABLED=0, flags: -tier, -module, -scenario) | dev-stock-price | G7, G12 | P1-B1 | — | 45m | 5 |
| **P1-B1** | Extract first primitive: `pkg/primitive/price-quote-normalizer/` + test + 3 scenario JSONs + **R-CGO gate** | dev-stock-price | G1, G7, G12 | P1-B2 | P1-A | 2h | 9 (incl. 4 R-CGO) |
| **P1-B2** | Extract second primitive: `pkg/primitive/tier-fallback-selector/` + test + 3 scenario JSONs | dev-stock-price | G1, G7, G12 | P1-B3 | P1-B1 | 1.5h | 6 |
| **P1-B3** | Extract third primitive: `pkg/primitive/price-staleness-classifier/` + test + 3 scenario JSONs | dev-stock-price | G1, G7, G12 | P1-C | P1-B2 | 1.5h | 6 |
| **P1-C** | Module stub: `pkg/module/price_resolution/` — port + composition function (imports primitives via TierFetcher port) | dev-stock-price | G2, G12 | P1-D | P1-B3 | 1h | 7 |
| **P1-D** | Dashboard stub: `apps/stock-price/dashboard/index.html` — 3 panels (primitives, module, microservice), NOT-RUN state | dev-stock-price | G6, G8, G9, G12 | P1-E | P1-C | 2h | 7 |
| **P1-E** | Edit-rerun handler + env audit (zero DB creds, zero CGO in sandbox env) | dev-stock-price | G7, G8, G12 | P1-F | P1-D | 1.5h | 6 |
| **P1-F** | Flex / catchup / `ohlcv-aggregator` optional 4th primitive (if Phase 1 time allows) | dev-stock-price | G1 | P1-G | P1-E | 1h | 4 |
| **P1-G** | Phase 1 close-gate verification (QA) — sandbox all-green, dashboard ≥90%, G12 streak confirmed | qa | G1, G2, G6, G7, G8, G12 | — | P1-F | 30m | 5 |

**Total atomic tasks:** 9 (P1-A through P1-G)
**Total estimated effort:** ~12 dev-hours (single agent, WIP=1)
**Total AC count: 55** (A:5 + B1:9 + B2:6 + B3:6 + C:7 + D:7 + E:6 + F:4 + G:5)

---

## Per-Task Acceptance Criteria

### P1-A — `cmd/sandbox/main.go`

**Files touched:** `apps/stock-price/cmd/sandbox/main.go` (CREATE)

**Background:** The sandbox runner drives all G7, G8, G12 verification. It MUST build under `CGO_ENABLED=0` — if it imports anything from `pkg/infrastructure/`, CGO will be required (because `fetchers.go` pulls `mattn/go-sqlite3`). The sandbox imports ONLY `pkg/primitive/*` and `pkg/module/*`.

**AC-1:** Sandbox accepts three flags:
  - `-tier` (values: `primitive` | `module` | `all`) — which sandbox tier to run
  - `-module` (value: `stock-price`) — module identifier for scenario path resolution
  - `-scenario` (values: `all` | path to a specific JSON file)

**AC-2:** Scenario JSON files are loaded from `docs/scenarios/stock-price/primitives/` (for `-tier=primitive`) or `docs/scenarios/stock-price/module/` (for `-tier=module`). Zero live HTTP calls, zero SQLite connections.

**AC-3:** Exits 0 if all scenarios pass; exits non-zero if any scenario fails. Prints per-scenario PASS/FAIL summary.

**AC-4:** Zero credential reads: `grep -c "DB_PATH\|STOCK_PRICE_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD" apps/stock-price/cmd/sandbox/main.go` returns 0.

**AC-5 (R-CGO pre-check):** `CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox/` exits 0 (no CGO code path reachable — sandbox does not import infra). If this fails, P1-A is BLOCKED — investigate import chain before continuing.

**Hard gate:** AC-5 must pass before P1-B1 is dispatched.

---

### P1-B1 — First Primitive: `price-quote-normalizer` + **R-CGO Gate**

**Files touched:**
- `apps/stock-price/pkg/primitive/price-quote-normalizer/normalizer.go` (CREATE)
- `apps/stock-price/pkg/primitive/price-quote-normalizer/normalizer_test.go` (CREATE)
- `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json` (CREATE)
- `docs/scenarios/stock-price/primitives/price-quote-normalizer-edge.json` (CREATE)
- `docs/scenarios/stock-price/primitives/price-quote-normalizer-failure.json` (CREATE)

**Background:** `price-quote-normalizer` maps raw exchange payload fields → canonical `domain.PriceQuote`. Currently duplicated in all 3 tier fetchers in `pkg/infrastructure/fetchers.go` (Tier1 L60–83, Tier2 L123–148, Tier3 L185–195). This primitive formalizes the shared field-mapping contract. `fetchedAt` is passed in as a parameter (string), `latencyMs` is passed in as `int64` — no `time.Now()` side-effects in the primitive itself.

**AC-1:** `pkg/primitive/price-quote-normalizer/normalizer.go` exports:
```go
func NormalizeQuote(
    rawPrice, rawVolume, rawChange, rawChangePct float64,
    code string,
    source domain.PriceSource,
    fetchedAt string,
    latencyMs int64,
) domain.PriceQuote
```
Output fields: `Code`, `Price`, `Volume`, `Change`, `ChangePercent`, `Source`, `FetchedAt`, `LatencyMs` — byte-identical to current `domain.PriceQuote` shape.

**AC-2:** Table-driven Go test with ≥5 rows: VCB normal price (HOSE), HNX price with different field names, cache price (zero change/changePct), zero volume edge case, empty code edge case.

**AC-3:** `go test ./pkg/primitive/price-quote-normalizer/...` exits 0.

**AC-4 (sandbox green):** `cd apps/stock-price && go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` exits 0. Paste sandbox output into handoff doc as evidence.

**Scenario JSON spec:**
- `price-quote-normalizer-golden.json` — VCB, price=85000, volume=1000000, change=500, changePct=0.59, source=hose → canonical PriceQuote
- `price-quote-normalizer-edge.json` — zero volume, zero change, changePct=0 → canonical PriceQuote with zero fields
- `price-quote-normalizer-failure.json` — empty code string → capture in output or return sentinel zero-value PriceQuote

**AC-5 — R-CGO-1 (build under CGO_ENABLED=0):**
```bash
CGO_ENABLED=0 go build -o ./bin/sp-quote-norm ./cmd/sandbox
```
This command MUST exit 0. If it exits non-zero, R-CGO is BLOCKED — do NOT continue to P1-B2.

**AC-6 — R-CGO-2 (zero CGO in primitive package):**
```bash
grep -rn "mattn/go-sqlite3\|cgo\|import \"C\"" apps/stock-price/pkg/primitive/price-quote-normalizer/
```
Must exit 1 (zero matches). If it returns matches, R-CGO is BLOCKED.

**AC-7 — R-CGO-3 (zero infrastructure imports in primitive):**
```bash
grep -rn "pkg/infrastructure" apps/stock-price/pkg/primitive/price-quote-normalizer/
```
Must exit 1 (zero matches). If it returns matches, R-CGO is BLOCKED.

**AC-8 — R-CGO-GATE (verdict):**
- If AC-5 + AC-6 + AC-7 ALL PASS → **R-CGO CLEAR.** Record verdict in P1-B1 completion signal. Continue to P1-B2.
- If ANY of AC-5, AC-6, AC-7 FAIL → **R-CGO BLOCKED.** Stop Phase 1. PM escalates to architect before any further primitive extraction.

**AC-9 — Fence-A pre-check:**
```bash
grep -rn "application\|interface/http\|infrastructure" apps/stock-price/pkg/primitive/price-quote-normalizer/
```
Must exit 1 (zero cross-layer imports). Evidence pasted into handoff.

**Hard gate:** R-CGO-GATE (AC-8) is a BLOCKER. Phase 1 cannot advance past P1-B1 until R-CGO CLEAR verdict is recorded.

**G12 DoD Gate (streak task #1):** Sandbox all-green before RETURN block is written.

---

### P1-B2 — Second Primitive: `tier-fallback-selector`

**Files touched:**
- `apps/stock-price/pkg/primitive/tier-fallback-selector/selector.go` (CREATE)
- `apps/stock-price/pkg/primitive/tier-fallback-selector/selector_test.go` (CREATE)
- `docs/scenarios/stock-price/primitives/tier-fallback-selector-golden.json` (CREATE)
- `docs/scenarios/stock-price/primitives/tier-fallback-selector-edge.json` (CREATE)
- `docs/scenarios/stock-price/primitives/tier-fallback-selector-failure.json` (CREATE)

**Background:** Extracted from `domain/services.go` L53–65 — the result-walk loop in `ResolvePriceService.FetchPrice`. This is the pure tier-selection decision: given `[]TierResult`, return the first non-nil quote in T1→T2→T3 order, or `PriceNotAvailableError`.

**Exported types and function:**
```go
type TierResult struct {
    Quote *domain.PriceQuote
    Err   error
}
func SelectWinningTier(results []TierResult) (*domain.PriceQuote, error)
```

**AC-1:** `selector.go` exports `TierResult` type and `SelectWinningTier` function with the above signature.

**AC-2:** Table-driven test with ≥6 rows:
  - T1 wins (T1 non-nil, T2/T3 non-nil → T1 returned)
  - T2 fallback (T1 nil, T2 non-nil → T2 returned)
  - T3 fallback (T1 nil, T2 nil, T3 non-nil → T3 returned)
  - All nil → `PriceNotAvailableError` returned
  - All errored → `PriceNotAvailableError` returned
  - Mixed nil + error → first non-nil wins

**AC-3:** `go test ./pkg/primitive/tier-fallback-selector/...` exits 0.

**AC-4 — Fence-A (R-CGO inherited from P1-B1):**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" apps/stock-price/pkg/primitive/tier-fallback-selector/
```
Must exit 1 (zero matches). This is the R-CGO inherited check — R-CGO gate is already CLEARED from P1-B1; subsequent primitives inherit the cleared status but MUST pass the per-primitive grep.

**AC-5:** `go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` exits 0 (now covering both P1-B1 and P1-B2 scenarios).

**Scenario JSON spec:**
- `tier-fallback-selector-golden.json` — T1 non-nil quote → T1 selected (expected: source=hose)
- `tier-fallback-selector-edge.json` — T1 nil, T2 non-nil → T2 selected (expected: source=hnx)
- `tier-fallback-selector-failure.json` — all nil → `PriceNotAvailableError` (expected: error output in trace)

**AC-6 — G12 DoD Gate (streak task #2):** Sandbox all-green (all scenarios across P1-B1 + P1-B2) before RETURN block.

---

### P1-B3 — Third Primitive: `price-staleness-classifier`

**Files touched:**
- `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier.go` (CREATE)
- `apps/stock-price/pkg/primitive/price-staleness-classifier/classifier_test.go` (CREATE)
- `docs/scenarios/stock-price/primitives/price-staleness-classifier-golden.json` (CREATE)
- `docs/scenarios/stock-price/primitives/price-staleness-classifier-edge.json` (CREATE)
- `docs/scenarios/stock-price/primitives/price-staleness-classifier-failure.json` (CREATE)

**Background:** This primitive formalizes an implicit contract currently absent from the codebase. The charter §Refactor Targets identifies it as P4 (`price-staleness-classifier`). Per brownfield §3 P3 finding: no existing code to extract — this is a new formalization. It codifies the rule: if a T3 cache quote's `fetchedAt` is older than `freshThresholdSeconds`, it is `STALE`; older than `staleThresholdSeconds`, it is `EXPIRED`; otherwise `FRESH`.

**Exported types and function:**
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

**AC-1:** `classifier.go` exports `StalenessLabel` type, three constants (`Fresh`, `Stale`, `Expired`), and `ClassifyStaleness` function with the above signature.

**AC-2:** Table-driven test with ≥5 rows:
  - Recent timestamp (within freshThreshold) → `FRESH`
  - Timestamp between fresh and stale thresholds → `STALE`
  - Timestamp beyond stale threshold → `EXPIRED`
  - Exactly-at-threshold boundary → defined behavior (≤ threshold = FRESH)
  - Malformed RFC3339 string → returns error with non-nil err

**AC-3:** `go test ./pkg/primitive/price-staleness-classifier/...` exits 0.

**AC-4 — Fence-A + R-CGO inherited:**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" apps/stock-price/pkg/primitive/price-staleness-classifier/
```
Must exit 1 (zero matches).

**AC-5:** `go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` exits 0 (covering all 3 primitive scenario suites: B1 + B2 + B3).

**Scenario JSON spec:**
- `price-staleness-classifier-golden.json` — `fetchedAt` = 30 seconds ago, freshThreshold=60, staleThreshold=3600 → `FRESH`
- `price-staleness-classifier-edge.json` — `fetchedAt` = 90 seconds ago, freshThreshold=60, staleThreshold=3600 → `STALE`
- `price-staleness-classifier-failure.json` — malformed `fetchedAt` string ("not-a-date") → error captured in trace output

**AC-6 — G12 DoD Gate (streak task #3):** Sandbox all-green (all 9 scenarios across B1 + B2 + B3) before RETURN block. This task completes the G12 streak #3 (QA must verify this task follows the DoD rule for the third consecutive time).

---

### P1-C — Module Stub: `pkg/module/price_resolution/`

**Files touched:**
- `apps/stock-price/pkg/module/price_resolution/ports.go` (CREATE)
- `apps/stock-price/pkg/module/price_resolution/price_resolution.go` (CREATE)
- `apps/stock-price/pkg/module/price_resolution/price_resolution_test.go` (CREATE)
- `docs/scenarios/stock-price/module/price-resolution-golden.json` (CREATE)
- `docs/scenarios/stock-price/module/price-resolution-edge.json` (CREATE)

**Background:** The module stub composes the 3 confirmed primitives via a `TierFetcher` port (injected at composition root). It mirrors the existing `domain.ResolvePriceService.FetchPrice` logic but decomposes it: infra fetching is injected, tier selection is delegated to `tier-fallback-selector`, normalization to `price-quote-normalizer`, and staleness annotation to `price-staleness-classifier`.

**`ports.go`:**
```go
package price_resolution

import "github.com/vn-market-intelligence/stock-price/pkg/domain"

// TierFetcher is the port the module depends on.
// Infrastructure (Tier1, Tier2, Tier3) implements this; injected at composition root.
type TierFetcher interface {
    FetchPrice(code string) (*domain.PriceQuote, error)
}
```

**`price_resolution.go` — module struct:**
```go
type PriceResolutionModule struct {
    tier1   TierFetcher
    tier2   TierFetcher
    tier3   TierFetcher
}

func New(tier1, tier2, tier3 TierFetcher) *PriceResolutionModule

func (m *PriceResolutionModule) Resolve(code string) (*domain.PriceQuote, error)
```

`Resolve()` calls the 3 TierFetchers concurrently (mirroring existing domain service goroutine pattern), builds `[]TierResult`, calls `tier-fallback-selector.SelectWinningTier()`, optionally calls `price-staleness-classifier.ClassifyStaleness()` to annotate.

**AC-1:** `ports.go` defines `TierFetcher` interface with `FetchPrice(code string) (*domain.PriceQuote, error)` only. Zero infrastructure imports.

**AC-2 — Fence-B (critical):**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" apps/stock-price/pkg/module/price_resolution/
```
Must exit 1 (zero matches). Fence-B: module never imports infrastructure.

**AC-3:** `go test ./pkg/module/price_resolution/...` exits 0. Test uses mock `TierFetcher` implementations (not real infra fetchers).

**AC-4 — No cross-module imports:**
```bash
grep -rn "from.*pkg/module/" apps/stock-price/pkg/module/price_resolution/
```
Must exit 1 (zero matches — G2 QA check pattern, adapted for Go import syntax).

**AC-5:** Module-level sandbox: `go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all` exits 0.

**Module scenario JSON spec (both in `docs/scenarios/stock-price/module/`):**
- `price-resolution-golden.json` — 3-tier walk: T1 returns quote (stale: 90s) → T2 returns quote (fresh: 10s) → module selects T1 (T1 wins by tier order, staleness is annotation not selection) → result: T1 quote with staleness=STALE
- `price-resolution-edge.json` — T1 nil, T2 nil, T3 cache quote (EXPIRED: 5h old) → T3 wins (only tier with data) → result: T3 quote with staleness=EXPIRED

**AC-6 — All-tier sandbox:**
```bash
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
Must exit 0. Evidence pasted into handoff.

**AC-7 — G12 DoD Gate:** Both sandbox tiers (`-tier=primitive` and `-tier=module`) exit 0 before RETURN block.

---

### P1-D — Dashboard Stub: `apps/stock-price/dashboard/index.html`

**Files touched:** `apps/stock-price/dashboard/index.html` (CREATE)

**Background:** Three-panel HTML dashboard (the 3-panel standard per charter §G6). Renders from scenario trace JSON. `file://` works with zero network calls, zero CGO, zero live DB.

**AC-1:** File opens via `file://` in a browser without any web server. Zero external CDN, zero live API calls, zero `fetch()` to port 5000.

**AC-2:** Three panels visible:
  - **Primitives panel** — cards for: `price-quote-normalizer`, `tier-fallback-selector`, `price-staleness-classifier` (all showing NOT-RUN state initially)
  - **Module panel** — card for `price_resolution` (NOT-RUN state)
  - **Microservice panel** — card for `stock-price` service (port 5000/5010 per system-map; NOT-RUN state)

**AC-3:** Status display is honest — NOT-RUN when sandbox has not been executed. No false greens. QA verifies by opening the HTML file cold (no prior sandbox run).

**AC-4 — PO Playwright compatibility (Path B):** Dashboard renders correctly in chromium-headless-shell:
  - ZERO console errors
  - ZERO pageerrors
  - ZERO requestfailed
  - All cards (3 primitive + 1 module + 1 microservice) are rendered in the DOM
  - NOT-RUN status is displayed honestly

**AC-5:** Zero credentials in dashboard HTML:
```bash
grep -c "DB_PATH\|STOCK_PRICE_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD\|mattn" apps/stock-price/dashboard/index.html
```
Must return 0.

**AC-6:** Clone color scheme and layout from TA's `apps/technical-analysis/dashboard/index.html` and macro's `apps/macro-indicators/dashboard/index.html` — substitute stock-price content (primitive names, module name, service name, port 5000).

**AC-7 — G12 DoD Gate:** Sandbox all-green (all scenarios: B1+B2+B3 primitives + C module) before any primitive card is allowed to show GREEN status in the HTML.

---

### P1-E — Edit-Rerun Handler + Env Audit

**Files touched:** `apps/stock-price/dashboard/index.html` (MODIFY — add rerun handler)

**Background:** G7 trust contract — user edits scenario JSON, refreshes dashboard, sees new result. The rerun handler invokes the `CGO_ENABLED=0` sandbox binary against the edited JSON fixture.

**AC-1:** User can edit any scenario JSON (e.g., change `rawPrice` from 85000 to 70000 in `price-quote-normalizer-golden.json`), refresh the dashboard, and see the updated normalized output.

**AC-2:** The rerun command invoked by the handler uses `CGO_ENABLED=0` explicitly:
```bash
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
```
(Or equivalent pre-built sandbox binary with CGO_ENABLED=0 at build time.)

**AC-3 — Env audit (mandatory G7 gate):**
```bash
env | grep -E "DB_PATH|STOCK_PRICE_DB_PATH|API_KEY|SECRET|TOKEN|PASSWORD|mattn"
```
This command run inside the sandbox process context MUST return empty. Dev-stock-price confirms and pastes the empty output into the handoff.

**AC-4 — CGO audit in sandbox env:**
```bash
grep -rn "mattn/go-sqlite3" apps/stock-price/pkg/primitive/ apps/stock-price/pkg/module/ apps/stock-price/cmd/sandbox/
```
Must return 0 matches (R-CGO final confirmation at G7 time).

**AC-5:** QA verifies: deliberate scenario edit → updated dashboard result (G7 pattern — manual verification of the trust loop). QA edits `price-quote-normalizer-golden.json`, changes `rawPrice` to a different value, reruns, confirms dashboard card shows the new output.

**AC-6 — G12 DoD Gate:** All scenarios green (both `-tier=primitive` and `-tier=module`) after the rerun handler edit. No false greens. Evidence pasted into handoff.

---

### P1-F — Flex / `ohlcv-aggregator` Optional 4th Primitive

**Files touched (if time allows):**
- `apps/stock-price/pkg/primitive/ohlcv-aggregator/aggregator.go` (CREATE)
- `apps/stock-price/pkg/primitive/ohlcv-aggregator/aggregator_test.go` (CREATE)
- `docs/scenarios/stock-price/primitives/ohlcv-aggregator-golden.json` (CREATE)
- `docs/scenarios/stock-price/primitives/ohlcv-aggregator-edge.json` (CREATE)
- `docs/scenarios/stock-price/primitives/ohlcv-aggregator-failure.json` (CREATE)

**AC-1:** `AggregateOHLCV(rows []RawOHLCVRow) []domain.DailyOHLCV` function extracted from `SQLitePriceHistoryRepository.GetHistory` row-scan logic (brownfield §3 P4).

**AC-2 — Fence-A + R-CGO inherited:**
```bash
grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|cgo\|import \"C\"" apps/stock-price/pkg/primitive/ohlcv-aggregator/
```
Must exit 1 (zero matches).

**AC-3:** `go test ./pkg/primitive/ohlcv-aggregator/...` exits 0.

**AC-4:** `go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` exits 0 (all 12 scenarios: B1×3 + B2×3 + B3×3 + F×3).

**Note:** P1-F is OPTIONAL for Phase 1. If Phase 1 time is consumed by B1/B2/B3 + C/D/E, P1-F defers to Phase 2 bucket. PM decides at P1-E close whether to dispatch P1-F or proceed to P1-G.

---

### P1-G — Phase 1 Close-Gate Verification (QA)

**Files touched:** none (read-only audit + signal emit)

**Owner:** qa

**AC-1 — Sandbox all-green:**
```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=all -module=stock-price -scenario=all
```
All three commands exit 0. QA pastes output as evidence.

**AC-2 — Dashboard ≥90%:**
QA opens `apps/stock-price/dashboard/index.html` via `file://`. Confirms all primitive cards (3 or 4) + module card + microservice card are rendered with expected states (green after sandbox run, or NOT-RUN if cold). Zero console errors.

**AC-3 — G12 streak confirmed (3/3 tasks):**
QA verifies that P1-B1, P1-B2 (or P1-C — first task after B1 to produce sandbox artefact), and P1-B3 (or P1-C/D as applicable) each have sandbox-green evidence in their handoff docs. Streak = 3 consecutive tasks with G12 DoD Gate satisfied. Documents as `g12_streak: 3/3 CONFIRMED` in P1-G signal.

**AC-4 — R-CGO final verification:**
```bash
grep -rn "mattn/go-sqlite3\|cgo\|import \"C\"" \
  apps/stock-price/pkg/primitive/ \
  apps/stock-price/pkg/module/ \
  apps/stock-price/cmd/sandbox/
```
Must return 0 matches. QA records `r_cgo_final: CLEAR` in signal.

**AC-5 — Phase 1 exit gate PO report:**
QA emits `docs/signals/qa-stock-price-phase1-close-gate-<UTC>.json` with:
- `sandbox_all_green: true/false`
- `dashboard_render_pct: N` (count of rendered panels / expected panels × 100)
- `g12_streak: 3/3 CONFIRMED`
- `r_cgo_final: CLEAR`
- `phase1_gate: GO / CONDITIONAL-GO / NO-GO` (per exit criteria table below)

---

## Phase 1 Exit Criteria

| # | Criterion | Measurement | GO threshold |
|---|---|---|---|
| 1 | **Time to first primitive** | Wall-clock from P1-A dispatch to P1-B1 DONE signal | ≤ 4 agent-hours |
| 2 | **Sandbox all-green** | `go run ./cmd/sandbox -tier=all -scenario=all` exit code | 0 (all scenarios PASS) |
| 3 | **Dashboard ≥90%** | Panels rendered / panels expected × 100 | ≥ 90% |
| 4 | **G12 earned (3/3 streak)** | QA counts consecutive DoD-Gate-satisfied tasks | 3/3 verified |

**GO** = all 4 criteria met → PO dispatches Phase 2.
**CONDITIONAL GO** = 3 of 4 met → cap Phase 2 at 1 task per sprint for next 2 sprints, then re-evaluate.
**NO-GO** = ≤2 met → architect re-plans Phase 2 scope. Do not start Phase 2.

---

## Critical Path

```
P1-A (sandbox runner — CGO_ENABLED=0 check)
  ↓
P1-B1 (first primitive + R-CGO gate — BLOCKER)
  ↓   [R-CGO MUST BE CLEAR before P1-B2 dispatched]
P1-B2 (second primitive — R-CGO inherited)
  ↓
P1-B3 (third primitive — G12 streak task #3)
  ↓
P1-C (module stub — TierFetcher port + composition)
  ↓
P1-D (dashboard stub — 3 panels, NOT-RUN)
  ↓
P1-E (edit-rerun handler + env audit)
  ↓
P1-F (optional: ohlcv-aggregator 4th primitive)
  ↓
P1-G (QA close-gate verification)
```

**WIP=1 enforced throughout** — dev-stock-price works one task at a time. PM dispatches next task only after current task DONE signal + (for P1-B1) R-CGO CLEAR verdict.

**R-CGO is the Phase 1 critical chokepoint:** if AC-8 of P1-B1 fails, the entire remaining critical path is blocked until architect resolves the CGO leak.

---

## G12 DoD Gate Rule (Day-0 — from TA pilot cc7578f1 + macro carry-over)

**Hard rule — blocks DONE declaration on every task that produces sandbox-runnable artefacts.**

Do not mark task DONE until sandbox shows all scenarios green:

```bash
cd apps/stock-price
go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
```

Both must exit 0 with all scenarios GREEN. Paste sandbox output summary into handoff doc before writing RETURN block.

**G12 streak tasks** (first 3 qualifying tasks after DoD Gate installed):
- Streak #1 = P1-B1 (first primitive — sandbox primitive tier green)
- Streak #2 = P1-B2 (second primitive — all primitive scenarios green)
- Streak #3 = P1-B3 (third primitive — all 9 primitive scenarios green, G12 streak complete candidate)

QA verifies all 3 handoff docs contain sandbox green evidence before declaring G12=EARNED-PENDING.

---

## WIP Policy

**WIP=1 sequential.** PM dispatches ONE task at a time. The single `dev-stock-price` agent works sequentially through P1-A → P1-G in the order above.

Exception: P1-G (QA) can overlap with P1-F (if P1-F is dispatched), since QA only reads artefacts. PM judgment call.

No parallel dispatches within Phase 1. Rationale: the primitive extraction tasks are a learning + validation sequence — running them in parallel would mask fence violations and make R-CGO debugging harder.

---

## Open Questions (Resolved from Brownfield P0-SP-1)

**OQ-1 — Which 3–5 primitives are highest-leverage?**

**Resolved (brownfield §3):** Confirmed 3 primitives for Phase 1:
1. `price-quote-normalizer` (★★★ highest leverage — duplicated in 3 tier fetchers, clear extraction boundary)
2. `tier-fallback-selector` (★★★ highest leverage — extracted from domain service result-walk)
3. `price-staleness-classifier` (★★ high leverage — formalizes implicit staleness contract currently absent)

Optional 4th (P1-F): `ohlcv-aggregator` (★ medium leverage — row-scan nil-guard from SQLitePriceHistoryRepository.GetHistory)
Deferred: `exchange-code-router` — routing is static tier→exchange mapping, not per-ticker; no lookup table exists; defer to Phase 2 brownfield.

**OQ-2 — Existing domain/application logic: retained or moved to `_deprecated/`?**

**Resolved (brownfield §4):** `pkg/domain/services.go` (`ResolvePriceService`) is the Phase 1 predecessor — it remains UNTOUCHED in Phase 1. Phase 2 G5a moves it to `pkg/domain/_deprecated/services_v1.go` after the `price_resolution` module is validated. The 7 unit tests in `services_test.go` are the Phase 1 regression baseline (they must continue to pass; dev-stock-price must not break them when adding new packages).

**OQ-3 — MCP-server handlers that need HTTP rewire?**

**Resolved (brownfield §5):** HTTP integration already in place in `clients.ts`. The two HTTP functions (`fetchStockPrice`, `getPriceHistory`) already route to port 5000. No direct domain imports found in any market-data tool handler. G5b scope is narrower than anticipated: the Phase 2 decision is whether to route `priceHistoryTools.ts` and `tickerIntelligenceTools.ts` Section 1 through the Go service vs. retaining local SQLite queries (both are architecturally valid). No mandatory rewire for correctness. PM/PO decides in Phase 2 planning.

**OQ-4 — Dashboard panels layout (3-level standard)**

**Resolved (charter §G6 + brownfield §2):** 3 panels exactly:
1. Primitives panel: one card per Phase 1 primitive (`price-quote-normalizer`, `tier-fallback-selector`, `price-staleness-classifier`, and optionally `ohlcv-aggregator`)
2. Module panel: one card for `price_resolution`
3. Microservice panel: one card for the stock-price service (port 5000/5010)

Clone layout from TA + macro dashboards. dev-stock-price owns the dashboard stub (no dev-frontend involvement in Phase 1).

**OQ-5 — Sandbox JSON fixtures: spec per scenario type**

**Resolved (per primitive analysis in brownfield §3):** Each primitive needs ≥3 JSON scenario files: golden (happy path — canonical correct output), edge (boundary condition — zero values, threshold boundaries, empty collections), failure (malformed input → error output captured in trace, NOT a panic). Module needs ≥2 JSON scenario files (golden + edge). All fixtures in `docs/scenarios/stock-price/primitives/` and `docs/scenarios/stock-price/module/`.

**OQ-6 — `go.mod` modification: is a new external dep needed?**

**Resolved:** Phase 1 adds ZERO new external dependencies. The sandbox uses only stdlib and the existing stock-price module's own packages (`pkg/domain`, `pkg/primitive/*`, `pkg/module/*`). `mattn/go-sqlite3` stays in `go.mod` (for the existing infra layer) but is never imported by primitive/module/sandbox. `go mod tidy` should be idempotent after Phase 1 additions.

**OQ-7 — `exchange-code-router` primitive: Phase 1 or Phase 2?**

**Resolved (brownfield §3 P5 finding):** Deferred. The current implementation has no per-ticker exchange routing table — T1 statically returns HOSE, T2 statically returns HNX. A real `exchange-code-router` would require a ticker→exchange lookup that does not currently exist. Dev-stock-price reassesses in Phase 2 brownfield of the updated service state.

---

## Signal to emit on completion

**File:** `docs/signals/pm-p0-sp6-phase1-task-plan-complete-<UTC>.json`

**Fields:**
```json
{
  "task_id": "P0-SP-6",
  "pilot": "stock-price",
  "status": "DONE",
  "file": "docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md",
  "task_count": 9,
  "ac_count": 55,
  "r_cgo_gate_baked": "YES",
  "r_cgo_gate_task": "P1-B1 (AC-5 + AC-6 + AC-7 + AC-8)",
  "exit_criteria_documented": "YES",
  "critical_path_documented": "YES",
  "phase1_primitives": ["price-quote-normalizer", "tier-fallback-selector", "price-staleness-classifier"],
  "phase1_module": "price_resolution",
  "next": "PM waits for all 6 Phase 0 deliverables before exit gate"
}
```
