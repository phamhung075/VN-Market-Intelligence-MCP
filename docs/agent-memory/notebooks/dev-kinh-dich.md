# dev-kinh-dich — Notebook

Zone: `apps/kinh-dich-service/` | Stack: TS/Bun | DB: market.db (read)

## Working Memory

### 2026-05-18 — Hexagram name bug fix

**Task:** Fix hexagram name always displaying as "Cấn" regardless of hexagram number.

**Root causes found (3):**

1. `domain/services.ts` QUE_META: all 64 names were ASCII without diacritics (e.g. `'Su'`, `'Ti'`, `'Kien'`). Fixed: updated to proper Vietnamese diacritics from mcp-server's hexagramLibrary.ts as source of truth.

2. `application/usecases.ts` fallback path: when `computeScores()` returns null, `name` was taken from a freshly-computed reading with placeholder scores `[0.1…0.1]` (always → hexagram #1 "Kiền" = "Can"), not from the stored hexagram. Fixed: use `QUE_META.find(q => q.id === stored.hexagram_number)?.name`.

3. `infrastructure/repositories.ts`: `SQLitePriceScoreRepository` queried non-existent table `price_history` instead of `market_prices_history`. All stocks fell to fallback path. Fixed: correct table name + column mapping (price, fetched_at).

**Tests:** 8 new tests added (QUE_META name coverage + fallback name assertions). 30/30 pass. tsc clean.

**Files changed:**
- `src/domain/services.ts` — QUE_META 64 names → Vietnamese with diacritics
- `src/application/usecases.ts` — fallback path name lookup via QUE_META
- `src/infrastructure/repositories.ts` — price_history → market_prices_history
- `src/__tests__/unit/kinh-dich-service.test.ts` — 8 new RED→GREEN tests

Zone health: test coverage expanded, 3 structural bugs fixed, fallback path verified | HEALTHY

### 2026-05-18 — Fix identical hexagram #2 Khôn for all stocks

**Task:** All stocks returned hexagram #2 Khôn with 38% confidence.

**Root cause:** `SQLitePriceScoreRepository.computeScores()` queried `market_prices_history` (intraday 1-min ticks, all same price within a session). With identical prices, all 6 dimension scores computed to exactly 0.0 → all THIEU_AM → all Yin → Khôn #2.

**Fix (1 file, 3 lines):** Changed SQL in `computeScores()` from `SELECT price AS close, 0 AS volume FROM market_prices_history … ORDER BY fetched_at DESC` to `SELECT close, volume FROM daily_ohlcv … ORDER BY date DESC`. The `PriceRow` interface already matched (`close`, `volume`) — no type change needed.

**Verification:** 30/30 tests pass, tsc clean. Docker rebuild needed to deploy (`docker compose build kinh-dich-service && docker compose up -d kinh-dich-service`).

**Files changed:**
- `src/infrastructure/repositories.ts` — SQL table + columns fixed

Zone health: SQL fix applied, scores now use real daily closing prices, different stocks will produce different hexagrams | HEALTHY
