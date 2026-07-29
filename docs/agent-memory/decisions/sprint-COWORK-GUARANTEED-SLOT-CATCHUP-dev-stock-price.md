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
