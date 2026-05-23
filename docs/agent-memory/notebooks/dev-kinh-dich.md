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

### 2026-05-24 — P1-A: Bun sandbox runner + config.ts Bun.env fix

**Task:** P1-KD-A — establish sandbox foundation for G7/G8/G12 verification cycles.

**Files created/modified:**
- `apps/kinh-dich-service/src/sandbox/runner.ts` (CREATE) — sandbox runner with --tier/--module/--scenario flags
- `apps/kinh-dich-service/src/infrastructure/config.ts` (MODIFY) — process.env → Bun.env (2 lines)
- `apps/kinh-dich-service/package.json` (MODIFY) — added "sandbox" script alias
- `docs/scenarios/kinh-dich/primitives/` (CREATE dir) — scenario fixture dir for primitive tier
- `docs/scenarios/kinh-dich/module/` (CREATE dir) — scenario fixture dir for module tier

**AC results:** All 6 PASS. AC-4 zero-cred count=0. AC-6 zero-import count=0. Sandbox exits 0 baseline (no primitives yet). 30/30 tests pass. tsc clean.

**Key design decisions:**
- Runner uses `import.meta.url` + 5-level walk-up to find repo root (no hardcoded path)
- `--tier=all` expands to [primitive, module] in sequence
- Zero-scenario (no JSON files in dir) = PASS by design (expected at P1-A since no primitives exist)
- Scenario JSON validation: requires `tier` + `input` fields as minimum structure
- Per-scenario execution dispatch hook ready for P1-B1 primitives

**Blocks:** P1-B1 (hexagram-resolver + R-FENCE discovery gate)

Zone health: P1-A DONE — sandbox GREEN baseline established | HEALTHY

### 2026-05-24 — P1-B1: hexagram-resolver primitive + R-FENCE discovery gate

**Task:** P1-KD-B1 — extract first primitive + R-FENCE discovery (G12 streak #1).

**Files created:**
- `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.ts` — pure primitive, zero cross-layer imports
- `apps/kinh-dich-service/src/primitive/hexagram-resolver/index.test.ts` — 9 test cases (pass/edge/failure)
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-golden.json`
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-edge.json`
- `docs/scenarios/kinh-dich/primitives/hexagram-resolver-failure.json`
- `docs/signals/dev-kinh-dich-p1-b1-done-20260524T000000Z.json`

**Files modified:**
- `apps/kinh-dich-service/src/sandbox/runner.ts` — added hexagram-resolver executor + dispatcher
- `docs/handoffs/TASK_P1-KD-B1.md` — added §R-FENCE Discovery section

**AC results:** All 8 PASS. 39/39 tests pass. tsc clean. Sandbox PASS 3/3.

**R-FENCE discovery:** VIABLE. Import style confirmed: `.js`-suffixed ESM throughout domain/application/interface. G4 deliberate-violation pair calibrated: `import type { ReadingRequest } from '../../application/dtos.js'` in `src/primitive/hexagram-resolver/index.ts` will be the Phase 2 proof target.

**Key technical decisions:**
- Embedded full TRIGRAM_LINES + QUE_META (all 64 hexagrams) in primitive — not just the source lines 198-201 from services.ts, because the TRIGRAMS_TO_QUE map is built dynamically from QUE_META at module load
- Added explicit length check (`signals.length !== 6`) before the trigram lookup to produce a clear error message
- Sandbox runner updated with per-scenario dispatch on `scenario.primitive === 'hexagram-resolver'`
- Failure scenario uses `expect_error: true` flag — sandbox catches thrown error and records PASS

**G12 streak:** #1 of 3. Sandbox GREEN before RETURN. DoD Gate satisfied.

Zone health: P1-B1 DONE — first primitive extracted, R-FENCE VIABLE, G12 streak 1/3 | HEALTHY
