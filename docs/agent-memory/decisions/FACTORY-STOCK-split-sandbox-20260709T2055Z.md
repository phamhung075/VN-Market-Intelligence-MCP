# Decision: FACTORY-STOCK-split-sandbox file split

**Date:** 2026-07-09T20:55Z
**Agent:** dev-stock-price
**Task:** FACTORY-STOCK-split-sandbox

## Context

743L monolithic `apps/stock-price/cmd/sandbox/main.go` needed splitting by executor seam per DoD:
- <=120L per file or justified
- Pure file-move, no signature changes
- Sandbox runs identically post-split

## Decision

Split into 8 files:

| File | Lines | Content |
|------|-------|---------|
| main.go | 101 | main(), flags, findRepoRoot() |
| discover.go | 71 | Scenario struct, discoverScenarios() |
| helpers.go | 23 | floatPtrEqual(), ptrVal() |
| dispatch.go | 75 | executePrimitive(), executeModule() |
| exec_primitive_normalizer.go | 97 | price_quote_normalizer executor |
| exec_primitive_selector.go | 123 | tier_fallback_selector executor |
| exec_primitive_staleness.go | 76 | price_staleness_classifier executor |
| exec_module_resolution.go | 150 | price_resolution module executor |

## Justification for over-limit files

**exec_primitive_selector.go (123L, +3L):** Single cohesive executor with DTO types, JSON unmarshaling, result building, and field-by-field comparison. Splitting further would fragment a tightly coupled unit.

**exec_module_resolution.go (150L, +30L):** Module executor requires:
- Input DTOs (22L)
- Mock TierFetcher (8L)
- Builder helper (17L)
- Wall-clock rebinding logic for deterministic staleness (15L)
- Main executor with field comparison (88L)

All parts are module-specific with no reusable seams. Further split would create artificial fragmentation.

## Verification

- Build: PASS
- Vet: PASS
- Tests: 8 packages PASS
- Lint: 0 issues
- Sandbox: 11/11 scenarios PASS
- CGO fence: 0 matches (CLEAR)

## Outcome

DoD satisfied. Behavior unchanged. Files organized by executor seam.
