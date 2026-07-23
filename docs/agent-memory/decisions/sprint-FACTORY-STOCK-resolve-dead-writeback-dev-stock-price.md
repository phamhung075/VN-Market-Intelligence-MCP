# DJ: FACTORY-STOCK-resolve-dead-writeback

**Date**: 2026-07-24
**Agent**: dev-stock-price
**Task**: Delete dead SaveQuote / Tier-3 write-back path

## Deadness Evidence

### 1. SaveQuote call sites (grep-confirmed)

SaveQuote is defined in:
- `pkg/domain/ports.go:12` - interface definition
- `pkg/infrastructure/fetchers.go:342` - implementation

SaveQuote is CALLED ONLY from:
- `pkg/domain/_deprecated/services_v1.go:65` - `_ = s.history.SaveQuote(quote)`

### 2. _deprecated/services_v1.go is build-ignored

File header:
```go
// DEPRECATED - superseded by pkg/module/price_resolution (G5a, P2-F).
// Kept for history; excluded from compilation via build constraint.
// Do NOT import or instantiate. Archive only.
//
//go:build ignore
```

The `//go:build ignore` tag excludes this file from compilation entirely.

### 3. Live code path does NOT use SaveQuote

Current production flow:
1. `cmd/server/main.go` creates `historyRepo` (SQLitePriceHistoryRepository)
2. `wire.go` passes `historyRepo` to `application.NewPriceHistoryUseCase`
3. `usecases.go` only calls `historyRepo.GetHistory()` - NEVER calls SaveQuote
4. `pkg/module/price_resolution` (the replacement for _deprecated services_v1.go) has NO history port dependency at all

### 4. Nothing reads market_prices_cache

The `SaveQuote` method writes to `market_prices_cache` table in `stock_price.db`.
Grep shows zero readers of this table - only the writer in the deleted code.

### 5. Git history confirms deprecation

Commit `6225f9260`: `chore(stock-price): P2-F - git mv ResolvePriceService -> _deprecated/ + FetchPriceUseCase rewire (G5a)`

The old ResolvePriceService (which called SaveQuote) was deprecated and replaced by the price_resolution module.

## Decision

DELETE the unused writer path (behavior-neutral):
- Remove `SaveQuote` method from `SQLitePriceHistoryRepository`
- Remove `SaveQuote` from `PriceHistoryPort` interface
- Remove `ownDBPath` field and constructor parameter (only used by SaveQuote)
- Remove `createTempOwnDB` test helper (only used by SaveQuote test)
- Remove `TestSQLiteRepo_SaveQuote_Writes` test
- Update mock implementations in test files
- Update README-log-schema.md to remove `own_db` field

## Files Changed

1. `apps/stock-price/pkg/domain/ports.go` - removed SaveQuote from interface
2. `apps/stock-price/pkg/infrastructure/fetchers.go` - removed SaveQuote method, ownDBPath field, simplified constructor
3. `apps/stock-price/cmd/server/main.go` - removed ownDBPath config and logging
4. `apps/stock-price/pkg/infrastructure/fetchers_test.go` - removed SaveQuote test and createTempOwnDB helper
5. `apps/stock-price/pkg/application/usecases_test.go` - removed SaveQuote from mock
6. `apps/stock-price/pkg/interface/http/router_test.go` - removed SaveQuote from mock
7. `apps/stock-price/README-log-schema.md` - removed own_db field documentation

## Verification

- `go build ./...` - exit 0
- `go test ./...` - all tests pass (8 packages)
- grep confirms no SaveQuote, market_prices_cache, or ownDB references remain in live code
