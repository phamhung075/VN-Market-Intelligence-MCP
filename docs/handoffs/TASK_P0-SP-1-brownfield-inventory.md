---
task_id: "P0-SP-1"
pilot: "stock-price"
phase: "0"
title: "Brownfield inventory of apps/stock-price (architect + system-auditor)"
estimate: "2h"
owner: "architect + system-auditor"
status: "READY"
date: "2026-05-24"
---

# TASK P0-SP-1 — Stock-Price Brownfield Inventory

## Summary

Read-only audit of `apps/stock-price/` to document:
1. Current DDD layer structure (domain, application, infrastructure, interface)
2. The 3-tier price-fallback logic and its domain entity location
3. Where `mattn/go-sqlite3` (CGO) currently lives in infrastructure
4. Candidate primitive/module boundaries per charter targets
5. **R-CGO gate validation:** confirm `mattn/go-sqlite3` can be isolated from primitives/module
6. Which MCP-server market-data tool handlers reach stock-price domain (G5b scope)

## Acceptance Criteria

### AC-1: Domain layer audit complete
- [ ] Read `apps/stock-price/pkg/domain/` (all .go files)
- [ ] Document: entity types (PriceQuote, DailyOHLCV, etc.), service signatures (ResolvePriceService.FetchPrice), error types
- [ ] List any legacy or superseded domain logic (G5a scope)
- [ ] Output section in `p0-brownfield-inventory.md` with entity/service summary

### AC-2: Infrastructure layer audit + R-CGO confirmation
- [ ] Read `apps/stock-price/pkg/infrastructure/` and `cmd/server/main.go`
- [ ] Identify: all `mattn/go-sqlite3` imports and file locations
- [ ] Identify: HTTP tier-fetcher implementations (Tier1/Tier2 live APIs, Tier3 SQLite cache)
- [ ] **R-CGO critical:** confirm all CGO dependencies are importable ONLY from composition root or infra layer
- [ ] Verify: no direct imports of CGO in `pkg/domain` or any other layer
- [ ] Output section: "R-CGO Feasibility" with findings (CGO isolation confirmation)

### AC-3: Primitive candidate extraction logic review
- [ ] Read decision logic in `domain/services.go` (ResolvePriceService.FetchPrice tier selection)
- [ ] Read transformation logic in relevant application/domain files (ohlcv aggregation, quote normalization, staleness checks, exchange routing)
- [ ] Map each charter-proposed primitive to exact source code location
- [ ] Assess: which 3-5 primitives are highest-leverage (most called, least entangled)
- [ ] Output section: "Primitive Candidates (Confirmed)" with file locations + rationale for selection (e.g., "price-quote-normalizer from domain/models.go L42–67")

### AC-4: Module candidate + port design
- [ ] Document the 3-tier fallback orchestration flow (how ResolvePriceService selects winning tier)
- [ ] Design the module-level port interface: `TierFetcher` (input: ticker, output: PriceQuote or error + staleness)
- [ ] Confirm: module composes primitives via this port, never directly imports HTTP fetchers or SQLite
- [ ] Output section: "Module Candidate (price_resolution)" with port interface signature + composition pattern

### AC-5: MCP-server market-data tool handlers audit (G5b scope)
- [ ] Read: `apps/mcp-server/src/interface/mcp/tools/market-data/` (all tool handlers that might reach stock-price domain)
- [ ] Identify which handlers actually consume stock-price data (candidates per charter: priceHistoryTools.ts, tickerIntelligenceTools.ts, priceAlertTools.ts)
- [ ] Check current integration path: direct domain import vs HTTP call to port 5000
- [ ] Document: which handlers need rewiring to HTTP (G5b deliverable scope)
- [ ] Output section: "MCP-Server Integration Points" with handler names + current state + rewire scope

### AC-6: R-CGO summary + phase-1 risk gate
- [ ] Write final "R-CGO Confirmation Summary" section
- [ ] Output: "Status: FEASIBLE — all mattn/go-sqlite3 imports isolated to infrastructure; no CGO in primitive/module/sandbox boundary. Sandbox build CGO_ENABLED=0 confirmed viable. Phase 1 R-CGO gate pre-cleared."
- [ ] If any CGO leakage found: output "Status: BLOCKED — CGO leak at [location]. Refactor required before Phase 1."

## Implementation Guidance

1. **Zone inspection order:** `pkg/domain/` → `pkg/application/` → `pkg/infrastructure/` → `cmd/server/` → `pkg/interface/`
2. **Search patterns:** `grep -rn "mattn/go-sqlite3\|ResolvePriceService\|FetchPrice\|Tier.*Fetcher"` to locate key areas
3. **CGO isolation check:** `grep -rn "mattn\|cgo" apps/stock-price/pkg/primitive/ apps/stock-price/pkg/module/ apps/stock-price/cmd/sandbox/` should return 0 matches (pre-refactor)
4. **Forbidden reads:** do NOT modify any source code; read-only audit only
5. **Handoff output:** single document `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md` (markdown, ~2–3 KB)

## Handoff File Output

**File:** `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md`

**Structure (required sections):**
1. Executive summary (1 paragraph)
2. Current DDD layer structure (table: layer → files → status → deviations)
3. Primitive candidates (recommended 3–5; each with source location + calibration)
4. Module candidate (port interface, composition pattern)
5. MCP-server integration points (G5b scope: handler names + current state + rewire scope)
6. R-CGO feasibility confirmation (FEASIBLE / BLOCKED + detailed findings)
7. Phase 0 exit gate readiness (go/no-go for primitive/module extraction)

## Constraints

- **L84 explicit-file staging:** handoff file only (markdown)
- **No source changes:** read-only audit
- **No git push:** local commit only
- **Anchor held:** do not create tags or rewrite history
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Refactor Targets + §CGO Boundary Clause

## Hard Gates

- [ ] **R-CGO CLEAR:** all mattn/go-sqlite3 imports in `apps/stock-price/` are localized to infrastructure layer (domain/app/interface/primitives/module = 0 matches)

## RETURN Block

**Signal to emit:** docs/signals/pm-p0-sp1-brownfield-inventory-complete-<UTC>.json
- Status: DONE | BLOCKED
- File: p0-brownfield-inventory.md path
- R-CGO verdict: FEASIBLE | BLOCKED
- Primitive recommendations: [ list of 3–5 names ]
- Module candidate: name + port interface name
- MCP-server handlers to rewire: [ list ]
- Next task: PM waits for all 6 Phase 0 deliverables before exit gate

**Expected timeline:** 2026-05-24 (same-day delivery, architect/system-auditor)
