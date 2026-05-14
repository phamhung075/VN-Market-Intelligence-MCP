# stock-price — Testing

**Runtime:** Go `testing` package + `net/http/httptest`. No external mocking framework.
**Total:** 31 tests across 4 packages — all pass.

## Domain Tests
**File:** `apps/stock-price/pkg/domain/services_test.go` — 7 tests

| Test | What it verifies |
|------|-----------------|
| tier1 succeeds | Source is "hose" |
| tier1 nil, tier2 succeeds | Fallback to "hnx" |
| tier1+2 nil, tier3 succeeds | Fallback to "cache" |
| all tiers nil | Returns PriceNotAvailableError |
| all tiers error | Returns PriceNotAvailableError |
| saveQuote called | Fire-and-forget persistence after success |
| code preserved | Input code matches output |

**Mock helpers:** interface stubs via Go struct literals implementing PriceFetcherPort / PriceHistoryPort.

## Application Tests
**File:** `apps/stock-price/pkg/application/` — 6 tests

| Test | What it verifies |
|------|-----------------|
| FetchPriceResponse shape | All DTO fields present and mapped |
| code uppercased | Input normalization |
| PriceNotAvailableError propagated | Error passthrough |
| history correct length | Returns expected days count |
| history code uppercased | Input normalization |
| empty array for unknown | Graceful degradation |

## Infrastructure Tests
**File:** `apps/stock-price/pkg/infrastructure/fetchers_test.go` — 7 tests

| Test | What it verifies |
|------|-----------------|
| Tier3 cache hit | Returns correct PriceQuote from SQLite |
| Tier3 cache miss | Returns nil, nil (no error) |
| Tier3 DB missing | Returns nil, nil gracefully |
| GetHistory returns rows | OHLCV aggregation query |
| SaveQuote writes | Row inserted into stock_price.db |
| AC-8 concurrent R/W | 100 goroutines concurrent read+write, 0 SQLITE_BUSY |
| WAL DSN verified | Readonly DSN used for market.db reads |

## Interface / HTTP Tests
**File:** `apps/stock-price/pkg/interface/http/router_test.go` — 11 tests

| Test | What it verifies |
|------|-----------------|
| GET /health → 200 | JSON {status, service, port} |
| POST /price/fetch success | 200 + FetchPriceResponse shape |
| POST /price/fetch missing code | 400 validation |
| POST /price/fetch empty code | 400 validation |
| POST /price/fetch all-tiers-fail | 404 + error message |
| POST /price/fetch invalid JSON | 400 |
| GET /price/history query params | 200 + PriceHistoryResponse |
| GET /price/history path param | 200 + PriceHistoryResponse (backward compat) |
| GET /price/history missing code | 400 |
| GET /price/history invalid days | 400 |
| GET /price/history negative days | 400 |

## Run Commands
```bash
cd apps/stock-price && go test ./pkg/... -count=1        # pkg-scoped (31 tests)
cd apps/stock-price && go test ./... -count=1            # all (BLK-3 fixed — clean)
cd apps/stock-price && go build ./...                    # type-check equivalent
```

## AC Coverage
- AC-7: Tier3 readonly DSN `?mode=ro&_journal_mode=WAL&_busy_timeout=5000`
- AC-8: 100-iter concurrent R/W 0 SQLITE_BUSY
- AC-9–AC-11: domain + application + infra suites
- AC-12: code/days validation
- AC-13: uppercase normalization
- AC-14: query-param + path-param routes
