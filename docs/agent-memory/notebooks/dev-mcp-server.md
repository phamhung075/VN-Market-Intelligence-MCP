# dev-mcp-server -- Notebook

## 2026-07-07 — KD-OBS-01-FIX → REVIEW

**Provenance:** BOUNDED-1 idle-capacity auto-pickup (dev-team dispatcher)

KD-OBS-01: kinh-dich MCP tool/route catch blocks caught genuine DB/HTTP errors and only `logger.error`'d them — never surfaced to a human. New `kinhDichErrorNotify.ts` (`notifyKinhDichError`, dynamic-import `sendTelegramBug`, fire-and-forget, non-fatal — never rejects even if `sendBugFn` throws) wired into all 5 `kinhDichTools.ts` catches (`get_kinhdich_reading`, `get_market_hexagram`, `get_hexagram_history`, `get_transition_probabilities`, `run_hexagram_backtest`) + all 3 HTTP route handlers (`kinhDichReadingHandler.ts`, `kinhDichSignalsHandler.ts`, `kinhDichMarketHandler.ts`). Message embeds a `📋 <category>` marker per call site (e.g. `kinhdich-reading-error`) that reuses `sendTelegramBug`'s existing 4h dedup — no new dedup machinery. Both `registerKinhDichTools(server, notifyError?)` and each route handler accept an optional injectable `notifyError` (defaults real) for testability.

**Explicitly out of scope (benign, not silent-drop):** `appendMarketHexagram`/`appendStockHexagram` in `marketTools.ts` catch kinh-dich-service unreachable/non-200 and omit the hexagram block by design (`logger.warn` only) — degrade-gracefully path, confirmed working as intended, left untouched.

New `KD-OBS-01-FIX-kinhdich-bug-notify.test.ts` (11 tests, 43 expect): unit contract for `notifyKinhDichError` (message shape incl. 📋 marker, never-rejects on `sendBugFn` throw, safe default path) + one integration test per catch block (injected spy, deterministic zero-mock error trigger — MCP tools via `DB_PATH` pointed at a directory so `initDatabase()`'s first `getDb()` throws; routes via the pre-existing AC-29 stale-closed-db-handle trick) proving source/category/detail + response still returns gracefully.

Zone health: tsc clean, tools=183 unchanged, server boot verified (PORT=3099, health 200, `/api/bctc-inspect` 200). Targeted kinh-dich + registry suite (11 files) 197/197 pass. Full `bun test`: 14290 pass / 40 skip / 63 fail / 9 errors (1173 files) — failures match the documented pre-existing set (RSS/pollNews network-flaky in local sandbox, `_deprecated/1302-*`, Bun-1.3.13 C++ teardown panic; confirmed via isolated re-run of the RSS file alone, fails identically with zero kinh-dich files involved). Scheduler probe = 3 (known-stale baseline, 0 scheduler/ files touched) | HEALTHY.

## 2026-07-08 — CI-RED-0d28104a-FIX → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (router-dispatched)

3rd recurrence of the class 1efb6f918 already fixed (weatherVn/hydrologicalData real-network calls with no DI hook racing bun-test's 5s timeout under CI's 16-way isolation). `DSI-S3-sector-fin.test.ts` AC-SEC-2a/2b call `getEnergyGridStatus({})` → `fetchReservoirLevels()` with **no** injected client → falls through to the real axios default client (`hydrologicalData.js`→vneconomy.vn RSS, 15s timeout). Confirmed live via `gh run view 28910244855 --log-failed` (head `0d28104ac`, the exact commit named in this task): sole per-file-isolation failure was `FAILEDFILE: src/__tests__/DSI-S3-sector-fin.test.ts`.

Fix: copied the `1efb6f918` pattern exactly — freeze-before-mock (`{...realNs}` value-copy) + `mock.module()` of `hydrologicalData.js` (`fetchReservoirLevels: async () => []`) placed textually before the `energyTools.js` import, + `afterAll` restore. Verified `[ƯỚC TÍNH]`/`ước tính` assertions still pass with `reservoirs=[]` (the fallback-default-70% branch already emits the literal string).

Swept the 2 flagged siblings: `257-weather-vn.test.ts`/`258-hydro-data.test.ts` both pass an **injected** HTTP client to `fetchWeatherWarnings(client)`/`fetchReservoirLevels(client)` on every call (confirmed by reading both files in full) — they never fall through to the default-client/live-network branch, so they were never actually exposed to this bug class. Explicit decision: left untouched, out of scope (verified not assumed).

Verified: `DSI-S3-sector-fin.test.ts` alone 17/17 pass × 3 consecutive runs (150–250ms each, was previously racing a 15s network call). tsc clean. `scripts/ci-per-file-isolation.sh 16` (CI's actual mechanism) full-repo run: DSI-S3 absent from the 12 FAILED FILES (all pre-existing pollNews/RSS network-flaky-in-sandbox files, same class the pruned 07-07 entry documented — not a regression). Bare `bun test` (whole tree) crashed the Bun 1.3.13 engine exit 144 as previously documented — disregarded as non-authoritative per this repo's own script comment.

Zone health: tsc clean, tools=183 unchanged (test-only change, no src/ production file touched), scheduler cron.schedule grep=3 (known-stale baseline, unaffected) | HEALTHY.

## 2026-07-08 — CONTAM-10-WRITER-H → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (pm-decomposed, dev-team dispatch)

VPS backfill queue poller (`POST /api/push-ohlcv-history`, ~15–30min cadence) was actively re-contaminating `daily_ohlcv` with whole-row thousand-scale bars (6,533 rows/27 tickers as of 2026-07-07) because `handlePushOhlcvHistory` did a raw INSERT + manual `validateOhlcvUnit` on **raw un-normalized** values — a naive per-row `>=100` floor that contaminated bars (e.g. open=131/close=130 for a stock worth ~130,000) pass undetected. Swapped for `writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"})` — runs `normalizeOhlcvToVnd` + `detectAndNormalizeScaleFromPrevClose` (cross-day + `fetchCleanReferenceCloseMap` cleanRef guard) ahead of `validateOhlcvUnit`, matching Writers A/C/D. WIC-2 parse-and-reject pre-pass preserved verbatim; response `{ok,inserted,skipped,code}` now derives from `writeResult.written` / `writeResult.skipped + rejected.length`.

New `CONTAM-10-WRITER-H-backfill-scale-guard.test.ts` (3/3, live-HTTP-route, not unit-only): TC-WH-1 contaminated batch + cleanRef history → ×1000 corrected; TC-WH-2 brand-new ticker (no prior history) → written as-is (documents accepted cold-start gap); TC-WH-3 legit cheap stock → unchanged. Found + fixed 1 real regression while running the full suite: `TASK-VNINDEX-RS-B-durability.test.ts` FR-B1-TC2 asserted the OLD reject-on-open<100 semantics — updated (with inline rationale) to expect the new, correct, cross-writer-consistent ×1000 auto-correction instead of outright rejection.

Rebuilt `mcp-server` image (id `4c8ea4cfd41f`) but did NOT swap it into the running container — `docker compose up -d` is a gated live-container swap (standing policy, ops-owned). Full `bun test`: 14302 pass/57 fail/6 errors + Bun 1.3.13 crash-at-teardown (panic after summary line — known engine bug). Confirmed via git-stash-to-baseline isolation testing that the 57 failures are pre-existing full-suite-only flakiness unrelated to this change (2 representative files reproduce identically on baseline). Flipped task to REVIEW (not done_verified) — pending QA RAW-probe + ops-gated container swap before `CONTAM-10-EXEC-2` can proceed.

Zone health: tsc clean, tools=183 unchanged, targeted CONTAM-10 suite (5 files) 38/38 pass | HEALTHY.
