# Handoff: DDD Phase 2b — Kinh Dich Service + Alert Engine

**Branch:** `feature/ddd-phase-2b`
**Status:** Review
**Commit:** 91d9fdb4

## TLDR

Phase 2b extracts 2 remaining TypeScript/Bun microservices from mcp-server:
1. `apps/kinh-dich-service/` (port 5005) — pure hexagram logic
2. `apps/alert-engine/` (port 5006) — dedup, cooldown, mute, Telegram

42 new tests GREEN (21 per service). tsc clean. docker-compose updated with both services. api-gateway registers both in health aggregation. Phase 2 COMPLETE.

## Files Created

### kinh-dich-service
- `apps/kinh-dich-service/src/domain/models.ts` — HaoReading, KinhDichReading, etc.
- `apps/kinh-dich-service/src/domain/repositories.ts` — KinhDichRepositoryPort, PriceScorePort
- `apps/kinh-dich-service/src/domain/services.ts` — computeReading, classifyNguHanh + full hexagram library embedded
- `apps/kinh-dich-service/src/domain/errors.ts` — KinhDichError, InsufficientDataError, HexagramNotFoundError
- `apps/kinh-dich-service/src/application/dtos.ts` — ReadingRequest, ReadingResponse, MarketReadingResponse
- `apps/kinh-dich-service/src/application/usecases.ts` — ReadingUseCase, MarketHexagramUseCase
- `apps/kinh-dich-service/src/infrastructure/repositories.ts` — SQLiteKinhDichRepository, SQLitePriceScoreRepository
- `apps/kinh-dich-service/src/infrastructure/config.ts`
- `apps/kinh-dich-service/src/interface/handlers.ts` — GET /reading/:code, GET /market, GET /health
- `apps/kinh-dich-service/src/interface/serializers.ts`
- `apps/kinh-dich-service/src/index.ts`
- `apps/kinh-dich-service/src/__tests__/unit/kinh-dich-service.test.ts` — 11 tests
- `apps/kinh-dich-service/src/__tests__/integration/kinh-dich-handlers.test.ts` — 10 tests
- `apps/kinh-dich-service/package.json`, `tsconfig.json`, `bunfig.toml`, `Dockerfile`

### alert-engine
- `apps/alert-engine/src/domain/models.ts` — AlertRequest, CooldownConfig, StoredAlert, EvaluateAlertResult
- `apps/alert-engine/src/domain/repositories.ts` — AlertRepositoryPort, MutePort, TelegramPort
- `apps/alert-engine/src/domain/services.ts` — computeFingerprint, shouldSuppressAlert, isDuplicate
- `apps/alert-engine/src/domain/errors.ts`
- `apps/alert-engine/src/application/dtos.ts` — EvaluateAlertRequest, EvaluateAlertResponse
- `apps/alert-engine/src/application/usecases.ts` — EvaluateAlertUseCase
- `apps/alert-engine/src/infrastructure/repositories.ts` — SQLiteAlertRepository, SQLiteMuteRepository, initAlertTables
- `apps/alert-engine/src/infrastructure/telegram.ts` — TelegramClient (wraps Bot API)
- `apps/alert-engine/src/infrastructure/config.ts`
- `apps/alert-engine/src/interface/handlers.ts` — POST /evaluate, GET /health
- `apps/alert-engine/src/index.ts`
- `apps/alert-engine/src/__tests__/unit/alert-engine.test.ts` — 11 tests
- `apps/alert-engine/src/__tests__/integration/alert-handlers.test.ts` — 10 tests
- `apps/alert-engine/package.json`, `tsconfig.json`, `bunfig.toml`, `Dockerfile`

### Updated files
- `docker-compose.yml` — kinh-dich-service + alert-engine services added (was placeholder comment)
- `apps/api-gateway/src/index.ts` — added kinh-dich + alert URL registration

## API Endpoints

### kinh-dich-service (port 5005)
- `GET /reading/:code?days=30` → `{stock, hexagram, name, trend, signal, confidence, actionNote, overallReading, timestamp}`
- `GET /market` → `{hexagram, name, trend, signal, confidence, timestamp}`
- `GET /health`

### alert-engine (port 5006)
- `POST /evaluate {stock, severity, message, signalTypes?, actionCode?, sendTelegram?}` → `{fired, cooldown_sec, reason, fingerprint}`
- `GET /health`

## Design Notes

### kinh-dich-service
- All 64 hexagrams + QUE_DATA embedded in domain/services.ts (no file I/O in domain)
- 6-dimension price score computed from SQLite price_history table
- Falls back to stored kinhdich_readings table when price data insufficient
- Markov data from hexagram_markov table (gracefully skipped if table missing)

### alert-engine
- djb2 fingerprint dedup (same as alertDedup.ts in mcp-server)
- CRITICAL severity bypasses cooldown EXCEPT MACRO actionCode (matches alertCooldown.ts logic)
- Daily cap: 3 alerts/stock/day (DEFAULT_COOLDOWN_CONFIG)
- TelegramClient skips silently if no bot token configured (safe for dev/test)
- sendTelegram defaults to false in microservice mode (caller opts in)

## QA Checklist
- [ ] `GET http://localhost:5005/reading/VCB?days=30` returns KinhDichResponse
- [ ] `GET http://localhost:5005/market` returns MarketReadingResponse
- [ ] `GET http://localhost:5005/health` returns `{status: "ok"}`
- [ ] `POST http://localhost:5006/evaluate {"stock":"VCB","severity":"high","message":"test"}` returns EvaluateAlertResponse
- [ ] Second identical POST within 60min returns `{fired: false, reason: "duplicate fingerprint..."}`
- [ ] `GET http://localhost:5006/health` returns `{status: "ok"}`
- [ ] `docker-compose up --build kinh-dich-service alert-engine` starts both services

---

## [Developer] Implementation Record

files_actually_modified:
- `/apps/kinh-dich-service/` — new service: 14 files, full DDD structure
- `/apps/alert-engine/` — new service: 14 files, full DDD structure
- `/apps/api-gateway/src/index.ts` — added kinh-dich + alert URL registration
- `/docker-compose.yml` — replaced placeholder comments with real service definitions

tests_written:
- `apps/kinh-dich-service/src/__tests__/unit/kinh-dich-service.test.ts` — 11 assertions, all GREEN
- `apps/kinh-dich-service/src/__tests__/integration/kinh-dich-handlers.test.ts` — 10 assertions, all GREEN
- `apps/alert-engine/src/__tests__/unit/alert-engine.test.ts` — 11 assertions, all GREEN
- `apps/alert-engine/src/__tests__/integration/alert-handlers.test.ts` — 10 assertions, all GREEN

tests_skipped:
- Real SQLite integration tests (deferred: would require seeding price_history table)
- End-to-end Telegram send test (deferred: requires live bot token)

tsc_clean: true
full_suite_pass: true (mcp-server subset: 9 pass; new services: 42 pass; api-gateway: 17 pass)
