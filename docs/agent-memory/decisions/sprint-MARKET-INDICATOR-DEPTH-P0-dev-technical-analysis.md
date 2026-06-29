# Decision Journal — Sprint MARKET-INDICATOR-DEPTH-P0 · dev-technical-analysis

**Sprint goal:** Market Indicator Depth P0 primitives
**Agent:** dev-technical-analysis
**Started:** 2026-06-29T22:00Z

---

### STEP dev-technical-analysis-S1 · dev-technical-analysis · 2026-06-29T22:05Z
**task-id:** P0-1-VOLATILITY-INDICATORS
**what-done:** Implemented all 5 FR + gauge scalar in Go DDD three-tier structure: pure domain VolatilityService, application ComputeVolatilityUseCase, SQLiteOHLCVRepository, HTTP handler wired to router.
**what-considered:**
- only path: Go mode (pilot primary); DDD three-tier required by G12/architect blueprint; sandbox injection path required for G12 service-tier scenarios (no DB access in sandbox).
**why-decision:** Follows existing CalculateTAService pattern exactly; OHLCVBar distinct from CandleStick because volatility needs full OHLCV (GK/ATR), not close-only.
**why-change:** Watchlist loading via WATCHLIST_TICKERS env var (not SYSTEM_MAP_PATH file access) because Docker build context is apps/technical-analysis/ — docs/ is outside the build context and cannot be mounted without docker-compose changes (outside my zone). Env var injection is within zone; ops will set from system-map.json.
