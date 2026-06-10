# Task Report GFD-11 — Full Fleet Capability Verification (QA-VERIFY)

**Sprint:** GO-FLEET-DEPLOY
**Task:** GFD-11 — QA-VERIFY gate before GFD-12 (SSOT graduation)
**Owner:** qa
**Date:** 2026-06-11T00:35:00Z
**Verdict:** PARTIAL — GFD-11 DONE (service-level gate PASS; 2 pre-existing test bugs exposed, non-blocking for GFD-12 clearance)

---

## 1. Service-Level Liveness Re-Curl (independent raw verification)

All 6 endpoints curled directly at 2026-06-11T00:35:00Z:

```
GET http://localhost:5008/health
{"status":"ok","service":"news-fetch","port":5008}
→ HTTP 200 LIVE

GET http://localhost:5005/health
{"service":"kinh-dich-service","status":"ok"}
→ HTTP 200 LIVE

GET http://localhost:5003/health
{"status":"ok","service":"technical-analysis","port":5003}
→ HTTP 200 LIVE

GET http://localhost:5006/health
{"port":5006,"service":"alert-engine","status":"ok"}
→ HTTP 200 LIVE

GET http://localhost:5010/health
{"port":5000,"service":"stock-price","status":"ok"}
→ HTTP 200 LIVE

GET http://localhost:5002/embed/health
{"status": "ok", "model_loaded": true, "state": "warm", "index_size": 16392,
 "model_name": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"}
→ HTTP 200 LIVE (lazy-load warm-path confirmed: model_loaded=true, OOMKilled=false)
```

Result: 6/6 LIVE. Service-level gate: PASS.

Note: api-gateway GET /health `services` map shows these 6 as "not_deployed" (latency=-1) because NOT_DEPLOYED_SERVICES env still lists them. This is EXPECTED — that env update + rebuild is GFD-12. The same /health `capabilities` block already reports them live/data_limited/dark. This is NOT a failure for GFD-11.

---

## 2. Scoped Test Suites

### news-fetch (Go)
```
ok  github.com/vn-market-intelligence/news-fetch/internal/fetcher  0.893s
ok  github.com/vn-market-intelligence/news-fetch/internal/store    0.526s
```
**2 packages PASS / 0 FAIL**

### kinh-dich-service (Go)
```
ok  pkg/module/reading_composer          0.688s
ok  pkg/primitive/hao_encoder            1.307s
ok  pkg/primitive/hexagram_resolver      0.365s
ok  pkg/primitive/ngu_hanh_classifier    0.996s
ok  pkg/primitive/nuclear_hexagram       1.648s
ok  pkg/primitive/reading_scorer         1.960s
```
**6 packages PASS / 0 FAIL**

### technical-analysis (Go)
```
ok  cmd/sandbox                          (cached)
ok  pkg/module                           (cached)
ok  pkg/primitive/bollinger_bands        (cached)
ok  pkg/primitive/detect_cross           (cached)
ok  pkg/primitive/macd                   (cached)
ok  pkg/primitive/moving_average         (cached)
ok  pkg/primitive/rsi                    (cached)
```
**7 packages PASS / 0 FAIL**

### alert-engine (Go)
```
ok  pkg/application         0.502s
FAIL pkg/infrastructure     0.428s  ← TestSQLiteAlertRepository_CountTodayAlerts FAIL
ok  pkg/interface/http      1.155s
ok  pkg/module/alert_pipeline  1.488s
ok  pkg/primitive/cooldown-gate  2.121s
ok  pkg/primitive/dedup-key-builder  1.808s
ok  pkg/primitive/signal-classifier  0.795s
```
**6 packages PASS / 1 FAIL**

Failure: `pkg/infrastructure/sqlite_test.go:190 — TestSQLiteAlertRepository_CountTodayAlerts: expected 2 today alerts, got 0`

Root cause: timezone mismatch. Test inserts rows using `time.Now().UTC().Format(time.RFC3339Nano)` (explicit UTC). `CountTodayAlerts` implementation computes `todayStart` via `time.Date(..., now.Location())` (local time, CEST=UTC+2 on this host). SQLite string comparison between UTC timestamps and a CEST-based boundary silently returns 0 rows. Bug was present before GO-FLEET-DEPLOY sprint — not in sprint delta. Pre-existing.

### stock-price (Go)
```
ok  pkg/application               0.424s
FAIL pkg/infrastructure           0.591s  ← TestSQLiteRepo_GetHistory_OHLCFieldParity FAIL
ok  pkg/interface/http            0.784s
ok  pkg/module/price_resolution   2.096s
ok  pkg/primitive/price-quote-normalizer  1.107s
ok  pkg/primitive/price-staleness-classifier  1.434s
ok  pkg/primitive/tier-fallback-selector  1.756s
```
**6 packages PASS / 1 FAIL**

Failure: `pkg/infrastructure/fetchers_test.go:252 — TestSQLiteRepo_GetHistory_OHLCFieldParity: expected 1 row, got 0`

Root cause: hardcoded `seedDate = "2026-05-22"` in test. `GetHistory` query uses `date('now', '-7 days')` → cutoff is `2026-06-04`. Seed date 2026-05-22 is 20 days before today, outside the 7-day window → 0 rows returned. Test was written with a fixed past date that ages out of the query window. Pre-existing date-staleness bug. Not in GO-FLEET-DEPLOY sprint delta.

### rag-service (Python)
```
apps/rag-service/__tests__/unit/test_gfd13_lazy_load.py — 12 tests collected
PASSED: test_init_model_is_none
PASSED: test_init_load_lock_is_none
PASSED: test_init_load_error_is_none
PASSED: test_initialize_is_noop
PASSED: test_embed_health_cold_returns_200_model_loaded_false
PASSED: test_embed_health_cold_never_calls_ensure_model_loaded
PASSED: test_ensure_model_loaded_called_exactly_once_under_concurrency
PASSED: test_ensure_model_loaded_fast_path_after_first_load
PASSED: test_embed_health_load_error_returns_503
PASSED: test_embed_health_no_embedder_returns_503
PASSED: test_embed_health_warm_returns_200_model_loaded_true
PASSED: test_ensure_model_loaded_sets_load_error_on_failure
```
**12/12 PASS**

### Summary table

| Service | Tests | Result |
|---|---|---|
| news-fetch | 2 pkg | PASS |
| kinh-dich-service | 6 pkg | PASS |
| technical-analysis | 7 pkg | PASS |
| alert-engine | 7 pkg (1 FAIL) | PARTIAL — pre-existing TZ bug |
| stock-price | 7 pkg (1 FAIL) | PARTIAL — pre-existing stale seedDate |
| rag-service (pytest) | 12 tests | PASS |

---

## 3. DDD / Security Sanity

Scan of sprint delta (GO-FLEET-DEPLOY services):

**DDD:** All 6 services follow ports+adapters / clean-architecture pattern. Domain packages import stdlib only (or domain primitives). Infrastructure packages (SQLite, HTTP clients) isolated in `pkg/infrastructure`. Application layer uses domain interfaces. No domain→infrastructure import violations detected. kinh-dich-service: `pkg/primitive/*` are pure math/domain packages (no HTTP imports). rag-service: domain/services.py contains business logic only; no direct DB or HTTP imports.

**Security:** No `process.env` references in Go services (all use `os.Getenv` with defaults, correct). No hardcoded secrets, passwords, or tokens. No API keys embedded in source. Credentials sourced from env vars at runtime only (NEWSAPI_KEY, VPS_HOST). Fetch POST endpoints (`/vneconomy/fetch`, `/vnexpress/fetch`, etc.) are write-trigger operations for internal ops use — not public-facing data access. No new unauthenticated data-read endpoints exposed beyond `/health` (read-only). All `/health` endpoints return only service metadata. `/evaluate` (alert-engine) and `/indicators` (technical-analysis) require structured JSON body — no path traversal risk. DDD and security verdict: PASS.

---

## 4. Deferred-to-GFD-12 Items (NOT failures for GFD-11)

The following AC items from GFD-11 are GFD-12 scope and have NOT been flipped by QA:

1. `verify system-map host_runtime_set.services includes all 6` — requires editing `docs/data/system-map.json`, which is GFD-12 (po) work.
2. `verify system-map not_deployed_by_design is now empty` — same, GFD-12.
3. `verify api-gateway GET /health returns all 6 services as healthy` — requires NOT_DEPLOYED_SERVICES env update + api-gateway rebuild, GFD-12.
4. `Report Axis-A status flip from INFO/grey -> AVAIL PASS` — quality-audit Axis-A update, GFD-12.

These are recorded as DEFERRED-TO-GFD-12 preconditions. po must complete these as part of GFD-12.

---

## 5. Backlog Tasks Raised

Two pre-existing test bugs exposed (not blocking GFD-12, but must be tracked):

- **BACKLOG-alert-engine-tz-fix:** `apps/alert-engine/pkg/infrastructure/sqlite.go:185` — `CountTodayAlerts` uses `now.Location()` (local), test uses UTC. Fix: normalize to UTC in implementation (`time.UTC` not `now.Location()`).
- **BACKLOG-stock-price-seed-date:** `apps/stock-price/pkg/infrastructure/fetchers_test.go:228` — `seedDate = "2026-05-22"` hardcoded past date. Fix: use `time.Now().UTC().AddDate(0, 0, -3).Format("2006-01-02")` or equivalent relative date.

---

## 6. Verdict

**GFD-11: PARTIAL — po is CLEARED to run GFD-12.**

Service-level gate (direct /health, the actual GFD-11 gate): 6/6 PASS.
rag lazy-load: 12/12 PASS.
news-fetch, kinh-dich-service, technical-analysis: all packages PASS.
alert-engine, stock-price: 1 infrastructure pkg each RED — pre-existing bugs, not in sprint delta, not blocking fleet deployment.
DDD/Security: PASS.
Aggregated api-gateway map: shows not_deployed as expected (GFD-12 precondition, deferred).

DJ-GATE-1: `docs/agent-memory/decisions/sprint-GO-FLEET-DEPLOY-qa.md` § qa-S1 written before this DONE flip.
