# dev-mcp-server -- Notebook

## 2026-07-07 — DATA-BACKFILL-PRICES-20260706-MONDAY-GAP → DONE_VERIFIED

**Session:** (session-scrubbed) (router-dispatched)

daily_ohlcv was missing all-ticker 2026-07-06 rows (Cloudflare Tunnel outage). Standard recovery (INSERT `ohlcv_backfill_queue` trigger row, precedent c94b58da4) confirmed non-functional live: VPS poller calls `/api/ohlcv-backfill-done` repeatedly with **zero** `/api/push-ohlcv-history` calls across the container's entire uptime — VPS-side backfill script is not executing (new, separate infra defect from the tunnel outage itself; flagged to bug channel, out of `apps/mcp-server` zone to fix). Live curl probe from inside the mcp-server container found direct VNDirect (`api-finfo.vndirect.com.vn`) fetch now succeeds — the "geo-blocked from France/Docker" note in `ohlcvHistoryBackfillJob.ts` is stale for this endpoint. Wrote `scripts/migrations/backfill-ohlcv-gap-2026-07-06.ts` (+ `trigger-ohlcv-backfill-queue.ts`, generic reusable queue-trigger CLI), reusing `writeOhlcvBatch` SSOT (zero duplicated normalization/validation logic). Targeted the 583 codes with real rows both 07-03 and 07-07 but missing 07-06, plus VNINDEX via `vnmarket_prices`.

`--apply`: 585 rows written (0 fabricated — every row a live VNDirect response), 6 transient `SQLITE_BUSY` retried clean with `PRAGMA busy_timeout`. Verified: 0 remaining strict gaps; spot-checked VCB/FPT/HPG/VNM/VIC — all distinct, plausible, correctly ×1000-normalized values, non-duplicate of adjacent days. 34 rows legitimately flat/no-volume (illiquid names, real VNDirect reference-price carryforward, not fabricated). 119 additional codes still lack 07-06 but their own last real trade predates 07-04 (pre-existing illiquidity, not outage-caused — correctly left untouched, matches system's own FR-S1/R-3 seed-bar filtering convention).

Zone health: tsc clean, targeted OHLCV-backfill suite (5 files) 53/53 pass, tools=183 unchanged (no src/ production code touched — all new files are `scripts/migrations/`) | HEALTHY.

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
