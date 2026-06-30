# Decision Journal — Sprint TA-CONSUMER-STALE-INDICATORS · architect

**Sprint goal:** Fix TA consumer stale indicators chain — RC3 VNINDEX benchmark absent from RS
**Agent:** architect
**Started:** 2026-06-30T19:30Z

---

### STEP architect-S1 · architect · 2026-06-30T19:30Z
**task-id:** FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS
**what-done:** Brownfield scan confirmed VPS script explicitly skips VNINDEX in backfill loop; designed 2-zone fix using vnmarket_prices dedicated index endpoint
**what-considered:**
- Option A: Add VNINDEX to watchlist table so ohlcvDailyAggregator covers it → rejected: VNINDEX is not a tradeable stock; pollutes watchlist semantics
- Option B: Add VNINDEX fetch to VPS backfill script using vnmarket_prices endpoint → chosen: minimal change, reuses existing push pipeline, SUBTASK-B placeholder exists in script
- Option C: Add TA-svc internal VNINDEX fetch from VnDirect → rejected: adds direct VPS dependency in Go svc; DDD violation (infra concern)
**why-decision:** Option B is the exact SUBTASK-B placeholder already in the VPS script (lines 134-139). vnmarket_prices endpoint is already proven (vnIndexRefreshJob uses it). Push handler already accepts VNINDEX code. Zero new infrastructure needed.
**why-change:** Extended to 3 zones after coordinator flagged WATCHLIST_TICKERS env gap: docker-compose.yml has no WATCHLIST_TICKERS, TA svc starts with empty universe; folded as Zone C (dev-technical-analysis: read watchlist from SQLite at startup) to avoid RC4 cycle. VNINDEX data + watchlist universe are both preconditions for RS serving.
