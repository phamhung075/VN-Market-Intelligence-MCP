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
