# Decision Journal — FACTORY-KINHDICH-name-price-score-constants

**Agent:** dev-kinh-dich  
**Task ID:** FACTORY-KINHDICH-name-price-score-constants  
**Timestamp:** 2026-07-09T19:20Z  

## Decision

Extract 2 inline magic literals in `price_score.go` to named constants in `domain/models.go`:
- `DailyReturnNormalizationBand = 0.05` (the `/0.05` divisor)
- `MinPricePointsForScoring = 7` (the `len(prices)<7` guard)

Reference `domain.MinPricePointsForScoring` in `usecases.go` `ErrInsufficientData` so the error message cannot drift from the actual threshold.

## What Considered

1. **Put constants in infrastructure layer (local to price_score.go):** REJECTED — depguard Fence-C blocks application layer from importing infrastructure layer. The error message in usecases.go needs to reference the constant.

2. **Put constants in domain layer (chosen):** SELECTED — domain layer is importable by both infrastructure and application layers. These are business rules (VN price-limit basis, hao-encoder input contract), not infrastructure concerns.

3. **Duplicate the constant in both layers:** REJECTED — violates DRY, creates drift risk.

## Why This Change

- The 0.05 divisor and 7-point threshold are magic literals with business meaning (VN price-limit bands, 6-hao hexagram structure).
- Naming them with provenance comments makes the rationale auditable.
- Referencing the shared constant in the error message prevents message/behavior drift.
- DoD: no behavior change at default values; scores unchanged after rebuild.

## Verification

- `go test ./...` — all packages ok
- `go vet ./...` — exit 0
- `go build ./cmd/...` — exit 0
- `golangci-lint run ./...` — 0 issues
- Sandbox primitive: 15/15 GREEN
- Sandbox module: 2/2 GREEN
