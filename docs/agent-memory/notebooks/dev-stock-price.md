# dev-stock-price — Notebook

Zone: `apps/stock-price/` | Stack: Go 1.22 (CGO — mattn/go-sqlite3) | DB: stock_price.db (write WAL) + market.db (read WAL, mode=ro dropped)

## Session 2026-07-31 — FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-SWALLOWED-EMPTY-KILLS-KINHDICH DONE

**Problem:** `/price/history` returned `{"history":[]}` for ALL tickers. SQLite DSN `mode=ro&_journal_mode=WAL` raises SQLITE_READONLY(8) when journal_mode=delete on disk. Error swallowed via `return nil, nil //nolint:nilerr`.

**Root cause:** `fetchers.go:240` (Tier3CacheFetcher.FetchPrice) and `:303` (GetHistory) both had:
```go
dsn := fmt.Sprintf("file:%s?mode=ro&_journal_mode=WAL&_busy_timeout=5000", path)
```

**Fix:** Removed `mode=ro&` from both call sites, matching sibling files `foreign_flow_repository.go:36` and `room_event_repository.go:35` which already carried the fix with the same explanatory comment.

**Verification:**
- `go build ./... && go test ./...` PASS
- `docker compose build stock-price && docker compose up -d stock-price`
- Before fix: `curl /price/history?code=FPT&days=7` -> `{"history":[]}`
- After fix: `curl /price/history?code=FPT&days=7` -> 5 OHLCV entries (FPT/VNM/VCB/HVN all return data)

**Files modified:** `apps/stock-price/pkg/infrastructure/fetchers.go` (2 DSN changes), `docs/agents/dev-stock-price/init.md` (doc update)

## Session 2026-07-29 — FIX-DEPTHTHIN-A-PRICE-HISTORY-RETENTION-10D — BLOCKED (zone mismatch)

RAW-verified market_prices_history depth: 2 distinct days (2026-07-28, 2026-07-29) — confirms task diagnosis.

**Root cause in code:** `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` lines 224-236 — rolling 24h cutoff:
```typescript
const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
db.prepare(`DELETE FROM market_prices_history WHERE fetched_at < ?`).run(cutoff);
```

**BLOCKED:** This code is in `apps/mcp-server/` zone. Task is assigned to dev-stock-price (zone: `apps/stock-price/`). Zero market_prices_history references exist in apps/stock-price/. Re-route to dev-mcp-server required.

## Session 2026-07-09 — FACTORY-STOCK-split-sandbox DONE

Split 743L cmd/sandbox/main.go into 8 files: main.go (101L), discover.go (71L), helpers.go (23L), dispatch.go (75L), exec_primitive_normalizer.go (97L), exec_primitive_selector.go (123L), exec_primitive_staleness.go (76L), exec_module_resolution.go (150L). All build/vet/test/lint/sandbox PASS. Two files over 120L justified (single cohesive executors with no natural seams).
