# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-stock-price

**Sprint goal:** Cowork guaranteed-slot catchup
**Agent:** dev-stock-price
**Started:** 2026-07-29T03:07:00Z

---

### STEP dev-stock-price-S1 · dev-stock-price · 2026-07-29T03:12:00Z
**task-id:** FIX-DEPTHTHIN-A-PRICE-HISTORY-RETENTION-10D
**what-done:** RAW-verified market_prices_history depth (2 distinct days) and identified code location; detected zone mismatch.
**what-considered:**
- only path: escalate zone mismatch — the retention WRITER is in `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` (lines 224-236, 24h rolling cutoff), NOT in `apps/stock-price/`.
**why-decision:** Task is zone-assigned to `apps/stock-price/` but market_prices_history table and its writer live entirely in `apps/mcp-server/`. Zone restriction rule: "only touch files in apps/<service>/. If changes needed outside zone, STOP and notify PM."
**why-change:** Task cannot proceed — requires PM to re-route to dev-mcp-server.

### STEP dev-stock-price-S2 · dev-stock-price · 2026-07-31T00:44:00Z
**task-id:** FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-SWALLOWED-EMPTY-KILLS-KINHDICH
**what-done:** Fixed `mode=ro` + `_journal_mode=WAL` DSN conflict in fetchers.go:240 and :303; rebuilt service; verified `/price/history` returns data.
**what-considered:**
- option A: drop `mode=ro`, keep `_journal_mode=WAL` (matches sibling files foreign_flow_repository.go:36 and room_event_repository.go:35)
- option B: use `immutable=1` (true readonly, but more restrictive than needed)
**why-decision:** Chose option A — consistency with sibling files in the same package; `immutable=1` would block legitimate read access to an actively-written WAL DB.
**why-change:** no change — fix applied exactly as specified in AC (2-of-4 remaining call sites, matching existing pattern).

### STEP dev-stock-price-S3 · dev-stock-price · 2026-07-31T21:35:00Z
**task-id:** FACTORY-STOCK-dedup-history-handlers
**what-done:** Deduplicated priceHistory and priceHistoryPathParam handlers; named the days=30 default; added behavior-parity tests.
**what-considered:**
- option A: extract runHistory helper + parseDays helper (shared implementation, both handlers call it)
- option B: closure-style (inline shared logic in a local closure)
**why-decision:** Chose option A — helper functions are idiomatic Go, more testable, clearer separation; closures would add indirection without benefit.
**why-change:** no change — implemented per approach in the task spec (shared runHistory/parseDays, named const defaultHistoryDays).
