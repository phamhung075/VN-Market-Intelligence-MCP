# dev-mcp-server — Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### push-path-fix — VPS push path failures (2026-05-13, DONE)

**Mission:** Fix two MCP-side push path failures flagged by dev-vps-crawls recon.

**Failure 1 (vps-prices):** fetch-prices.sh posting to `__MCP_BASE__/api/push-prices` → 404.
**Failure 2 (vn-news-rss):** fetch-vn-news.sh posting to `__MCP_BASE__/api/push-news` → 404.

**Investigation outcome:**
- Both `/api/push-prices` (server.ts:317) and `/api/push-news` (server.ts:387) ARE registered and correctly handled.
- Root cause: Cloudflare tunnel had no `/api/*` ingress rule — all `/api/` traffic hit catch-all `http_status:404` before reaching mcp-server. Config fix was already applied (`~/.cloudflared/config.yml` has `path: ^/api/` rule). Tunnel restart needed (ops task).
- VPS body shapes confirmed: stock price unit conversion (×1000) correct; index/global_index as-is correct; news body `{title, url, publishedAt, content, source}` matches handler exactly.

**Code changes:**
- NEW `src/__tests__/1892b-vps-contract-push.test.ts` — 10 tests, 0 fail (P1-P6 prices, N1-N4 news)
- UPDATED `docs/vps-sources/vps-prices/recon.md` — root cause + contract confirmation
- UPDATED `docs/vps-sources/vn-news-rss/recon.md` — root cause + contract confirmation
- NEW `docs/signals/qa-2026-05-13T09-32-54Z.json` — QA signal with ops action required

**No mcp-server route/handler changes needed. Zone is healthy.**

SHA: 3d6383a2. tsc clean. 10 new tests pass.

Zone health: both push routes healthy and contract-verified; Cloudflare tunnel restart still pending (ops dependency); no code drift detected.

---

### TASK-PUSH-1 — VPS prices 404 root cause (2026-05-13, SUPERSEDED BY push-path-fix)

**Investigation result:** NOT a key drift, NOT an unsubstituted placeholder, NOT Cloudflare connectivity.

**Actual root cause:** `~/.cloudflared/config.yml` has NO ingress rule for `/api/*`. Every request to `https://zenmidi.com/api/*` hits the catch-all `http_status:404` rule. This affects ALL VPS push services (prices, news, sbv, foreign-flow, OHLCV) — not just prices.

**Verified:**
- VPS `fetch-prices.sh` line 15-18: `__MCP_BASE__` and `__API_KEY__` are substituted correctly. Key = `38955a0a...` matches `.env`.
- `curl https://zenmidi.com/api/watchlist` from VPS: HTTP 404 (Cloudflare, not mcp-server).
- `curl http://localhost:3000/api/watchlist`: HTTP 200, returns 39 codes + 11 global indices.
- `curl http://localhost:4000/api/watchlist`: HTTP 200 via api-gateway.
- `curl https://zenmidi.com/health`: HTTP 404 — even `/health` not routed.
- Current tunnel ingress: only `/vn-market/*` paths routed to `localhost:3000`.

**Fix required (ops, NOT mcp-server zone):**
Add ingress rule to `~/.cloudflared/config.yml` BEFORE the default 404:
```yaml
  - hostname: zenmidi.com
    path: ^/api/
    service: http://localhost:4000
    originRequest:
      keepAliveTimeout: 30s
  - hostname: zenmidi.com
    path: ^/health
    service: http://localhost:4000
    originRequest:
      keepAliveTimeout: 10s
```
Then: `brew services restart cloudflared`
Verify: `curl https://zenmidi.com/api/watchlist -H "X-API-Key: <key>"` → 200.

**No mcp-server code changes needed. All services and routes are correct.**

---

### SPIKE_006-c61-T4 — AC-4 insufficientSample guard (2026-05-13, DONE)

**Problem:** `formatAccuracyReport` showed accuracy % even with tiny sample sizes (n=1, 2), making precision figures misleading.

**Fix:** Compute `scoreable = hits + misses`. If `scoreable < 20`: set `insufficientSample = true`, prepend Vietnamese warning `"Chua du du lieu danh gia (N=X, can >=20)"`, suppress ALL `%` output (summary line + signal breakdown + worst-stocks section). Else: normal path unchanged.

**Type change:** `AccuracyReport` gains `insufficientSample: boolean`. Additive — `dailyDashboardJob` uses `Pick<AccuracyReport, ...>` without this field, no break.

**Test changes:**
- AC-4 test: 9 pre-scored rows (2 HIT, 7 MISS via `outcome` column) — verifies flag=true, no `\d+%`, warning present.
- "worst performer" test: updated from 3 to 20 pre-scored MISS rows (Path 1) to clear the guard.
- "calculates correct %" test: updated from 2 to 20 pre-scored HIT rows (Path 1) to clear the guard.

**Key lesson:** When `insufficientSample` suppresses %, must suppress breakdown + worst-stock sections too — they also emit `%`. Pre-scored rows (`outcome` column) bypass domain scorer / price lookups, making tests deterministic.

**Counts:** 20 pass / 0 fail. SHA 7bc5853b. tsc clean.

---

### SPIKE_006-c61-T3 — AC-2 calendarDaysElapsed + intraday gate (2026-05-13, DONE)

**Problem:** `scoreAlert` Path 2 always tried intraday 1-12h fallback, including for same-calendar-day alerts. This biased accuracy upward on day-1 data.

**Fix:** In `scoreAlert`, compute `calendarDaysElapsed = Math.floor((now - alertTs) / 86_400_000)` and gate intraday block behind `calendarDaysElapsed >= 1`. One condition change (`if (!priceAfter)` → `if (!priceAfter && calendarDaysElapsed >= 1)`).

**Tests:** 4 new AC-2 cases in `183-alert-accuracy.test.ts`:
- AC-2a: elapsed=0 (30min ago) + intraday 5% drop → UNKNOWN (gate closed)
- AC-2b: elapsed=1 (25h ago) + intraday 5% drop → HIT (gate open)
- AC-2c/d: pure math verification (floor division correctness)

**Key lessons:**
- Biome linter auto-removes unused imports on file save — must use imported symbol immediately in same edit
- `Parameters<typeof fn>[0][number]` pattern extracts array element type for test row construction
- RED confirmation: 1 fail before impl (AC-2a unknowns=0 instead of 1); GREEN after: 16/16

**Counts:** 16 pass / 0 fail. SHA 4aeb3470. tsc clean.

Zone health: alertAccuracy.ts line coverage 66.67% (Path 1 DB-scored branch partially uncovered); no drift detected in zone structure.

---

### Task 1879b — get_fed_liquidity_spread MCP tool (#130) (2026-05-12, DONE)

**Files:** 4 new, 3 modified
- NEW `domain/services/macro/computeFedLiquiditySpread.ts` — pure fn, OLS slope, InsufficientDataError
- NEW `infrastructure/db/fredQueries.ts` — fetchEffrIorbSamples (INNER JOIN EFFR+IORB on date)
- NEW `interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts` — registerFedLiquiditySpreadTool, tool #130
- NEW `src/__tests__/1879b-fed-liquidity-spread.test.ts` — 10 tests (5 describes × 2 its each)
- `domain/services/macro/index.ts` — barrel export for computeFedLiquiditySpread
- `interface/mcp/tools/macro/index.ts` — barrel export for registerFedLiquiditySpreadTool
- `interface/mcp/tools/registry.ts` — registered as tool #130

**Key decisions:**
- OLS slope over last 30 samples (not all samples) — per spec
- slope > 0.01 = widening, < -0.01 = narrowing, else stable
- InsufficientDataError thrown on empty input (spec requirement)
- trend30d=null when < 30 samples (not error — valid partial data state)
- T5 DDD audit: strips comment lines before checking for banned patterns (Date.now() appeared in JSDoc comment)
- fredQueries.ts uses `date('now', '-' || ? || ' days')` — SQLite dynamic date math
- `window` renamed to `window30` to avoid JS reserved word collision

**Results:** 10/10 pass. tsc clean. SHA a6d4b555.
Note: worktree branch does NOT include 1879a (sha 4e4aaf5e not in history). fred_series_daily schema
created in test in-memory DB; prod schema created by 1879a when it merges.

---

### Task 1879a — FRED EFFR/IORB fetcher + fred_series_daily table (2026-05-12, DONE)

**Files:** 5 touched (2 new)
- NEW `infrastructure/fetchers/fredEffrIorb.ts` — fetchFredEffrIorb(httpClient?, db?, sleepFn?)
- NEW `src/__tests__/1879a-fred-effr-iorb-fetcher.test.ts` — 6 tests (all AC)
- `infrastructure/db/schema-macro.ts` — fred_series_daily DDL + index
- `infrastructure/fetchers/index.ts` — export fetchFredEffrIorb + types
- `scheduler/macro/macroIndicatorRefreshJob.ts` — hook after fetchFedFundsRate

**Key decisions:**
- sleepFn injectable (3rd param) → T5 HTTP-500 retry test runs in <100ms (no real backoff)
- Sequential EFFR then IORB (not parallel) — FRED public tier is generous, sequential is simpler
- INSERT OR IGNORE on UNIQUE(series, date) — re-runs idempotent; count via before/after select
- Schema in schema-macro.ts (not migrations/ folder — project uses TS function pattern)

**Results:** 9130 pass (baseline) → 9136 pass after. 118 fail (pre-existing, was 124 pre-stash).
SHA: 4e4aaf5e. All 6 ACs PASS. TSC clean.

---

### Task 1876a-A2 — Emission bridge gap log in scanMarket.ts (2026-05-11, DONE)

**Change:** After `storeAlerts()` returns, loop over each alert and emit:
`[scanMarket] alert_written ticker=X type=Y severity=Z notified_telegram=0 — emission_bridge_to_agent_signals=MISSING (1876a/B1 pending)`
3 LOC. Logging-only. No logic change.

**Result:** TSC clean. Test suite exit 0. Confirms VRE -6.41% class of silent alerts will now be visible in container logs.

**Next:** Sprint 1877 B1 implements the actual bridge (agent_signals emission).

---

### Task 1876a-A3 — FR-5 observability log in taAlertNotifierJob (2026-05-11, DONE)

**Change:** Added startup log at top of `runTaAlertNotifier` emitting `pending=<N>` count of `price_anomaly` signals with `outcome IS NULL`. Wrapped in try/catch (best-effort). `processed_last_run=?` (no stats table). 9 LOC, logging-only.

**Result:** 28 pass / 0 fail. tsc clean. Log confirmed in test output (pending=1 when signals seeded, pending=0 otherwise).

**After Sprint 1877 B1 (bridge):** log will show `pending=N>0` confirming emission bridge is live.

---

### Task 1869b-seed — Watchlist alert_drop_pct migration (2026-05-11, DONE)

**Problem:** All watchlist rows had `alert_drop_pct = -3` (old schema default). 1869b wired per-stock thresholds into `detectSignals` but DB still had stale values.

**Fix:** `migrateWatchlistThresholds(db)` in `seedWatchlist.ts`:
- Standard tier: `UPDATE watchlist SET alert_drop_pct = -7.0 WHERE (alert_drop_pct IS NULL OR alert_drop_pct = -3) AND code NOT IN (high-vol-list)`
- High-vol tier: `UPDATE watchlist SET alert_drop_pct = -9.0 WHERE code IN ('NVL','DPM','REE','VNH','KBC','MWG','TCH')`
- Wired in `schema.ts` post-init migrations section (called after all tables created)
- Idempotent: standard guard `IS NULL OR = -3` skips already-migrated rows

**Key findings:**
- No `migrations/` folder exists. Pattern = TS functions in `seedWatchlist.ts` + post-init block in `schema.ts`
- HIGH_VOL_TICKERS not in WATCHLIST_SEED — they may be in prod DB as custom additions
- `alert_rise_pct` default is already correct (5) — no migration needed
- Negative sign convention confirmed: `-7.0` and `-9.0`

**Tests:** 10 new in `1869b-seed-watchlist-thresholds.test.ts` — AC1-AC6 + full 25+7 scenario. All pass.

**Counts:** 9153 pass / 16 fail (16 pre-existing). SHA 44d5bf2c. 3 files touched.

---

### Task 1869b — Wire watchlistThresholds into scanMarket (2026-05-11, DONE)

**Problem:** `detectSignals(snapshot)` — no second argument. `volatilityCalculator.ts` produced thresholds, `signalDetector.ts` accepted them, but `scanMarket.ts` never passed them. Dead wiring since Task 133.

**Fix:**
1. `IWatchlistRepository`: added `WatchlistThresholds` interface + `getThresholds(): Map<string, WatchlistThresholds>` port method
2. `SqliteWatchlistRepository`: implemented `getThresholds()` — `SELECT code, alert_drop_pct, alert_rise_pct FROM watchlist WHERE alert_drop_pct IS NOT NULL AND alert_rise_pct IS NOT NULL`
3. `scanMarket.ts`: Step 1b loads threshold map; per-stock loop builds `SignalContext` with `watchlistThresholds` when present; calls `detectSignals(snapshot, signalContext)`
4. `1076` test: `addWatchlistEntry` now inserts explicit `alert_drop_pct=-7` — schema DEFAULT was `-3` (not `-7`), which conflicted with the "3% is noise" assertion

**Tests:** 10 new in `1869b-watchlist-threshold-wiring.test.ts` (4 unit, 4 integration)
- NVL (threshold=-9) silent on -7.5% drop
- VCB (threshold=-7) fires on -7.5% drop
- Two-stock selective alerting
- watchlistThresholds priority over volatility

**Counts:** 9148 pass / 11 fail. SHA dbefc47c. 5 files touched.

**Next:** 1869b-seed — DB migration to populate stock-tier defaults (standard=7%, high-vol=9%)

---

### Task 1869a — price_drop threshold -5% → -7% (2026-05-11, DONE)

**Problem:** `DEFAULT_DROP_PCT = -5` too low for 30-stock watchlist volatility profile. Precision 50% (8/16) vs 60% gate.

**Fix:** `DEFAULT_DROP_PCT = -7` in `signalDetector.ts`. Aligns with VN circuit breaker significance.

**Test fixture updates:**
- `063`: TC-1 price 95k→93k (−7%)
- `122`: SD-03 boundary −5→−7, SD-04 boundary −4.99→−6.99, SD-14 via watchlistThreshold (medium severity still testable)
- `133`: TC-17/TC-22 comments updated
- `1076`: `FIVE_PCT_DROP` fixture price 95k→93k, changePct −5→−7

**Counts:** 124/124 targeted, 9132/9132+ full suite, 17 pre-existing fails unchanged. SHA d884be66.

**Caveat:** SD-14 severity-medium branch now requires `watchlistThresholds` override to exercise — default -7% means 5-6.9% drops don't fire at default. `priceSeverity()` ladder unchanged.

---

### Task 1850f — Polymarket fixture contamination (2026-05-07, DONE)

**Root cause:** `163-prediction-schema.test.ts` inserts `t163-mkt-*` rows with `fetched_at='2026-04-01T08:00:00Z'` (hardcoded stale date). These rows can reach production `market.db` if tests ever run against a real DB, or the prod DB was seeded with them.

**Fix applied in** `apps/mcp-server/src/interface/mcp/tools/macro/predictionTools.ts`:
1. Tightened `staleCutoff` from 30d to **7d** — entries older than 7 days excluded from prod output
2. Added `AND pm.id NOT LIKE 't___-mkt-%'` to SQL WHERE clause — belt-and-suspenders block for fixture IDs even if they get a recent `fetched_at`

**Pattern precision:** `t___-mkt-%` = `t` + exactly 3 chars + `-mkt-` + anything. Matches `t163-mkt-001`, `t163-mkt-defaults`. Does NOT match `t168-m1`/`t168-m2` (no `-mkt-` segment).

**Pre-existing failures (not introduced):** Task 178 (7), TASK-1549 (1), Sprint 145 (1), Task 1100 (1) = 10 tests. All pre-date this task.

**Files changed:**
- `apps/mcp-server/src/interface/mcp/tools/macro/predictionTools.ts` (staleCutoff + ID filter)
- `apps/mcp-server/src/__tests__/1850f-fixture-contamination.test.ts` (7 new tests, all pass)

**Commit:** `52d63b61`

### Task 1878b — compute_accruals MCP tool (#129) (2026-05-12, DONE)

**Domain:** `computeAccrualPoint(input: AccrualsInput): AccrualPointResult` — pure function in `domain/services/financial-reports/accruals.ts`. Zero infrastructure imports. Formula: `(NetIncome - OCF) / TotalAssets`.
**Null handling:** missing array accumulates "NET_INCOME", "OCF", "TOTAL_ASSETS" as applicable. Row always included.
**Zero-TA:** `total_assets = 0` → `accruals_ratio: null`, `error: "zero_total_assets"`.
**Sort:** DB query DESC LIMIT N, then `.reverse()` → ascending oldest-first in output.
**MCP handler:** `buildComputeAccrualsHandler(db)` factory (testable injection pattern). `registerComputeAccrualsTool` in `computeAccrualsTool.ts`.
**Registry:** tool #129, entry added after registerPyramidTierTool.
**Barrel:** `financial-reports/index.ts` exports `registerComputeAccrualsTool`.
**Tests:** 12 pass / 0 fail in `1878b-compute-accruals.test.ts`. T1-T6 domain unit (no SQLite), T7-T12 tool integration (in-memory SQLite). tsc clean. SHA 4d7ab740.

Key patterns:
- Domain fn has zero imports from infra or interface. DDD audit: grep confirms only comment text references infra, no import statements.
- Full suite bun OOM crash is pre-existing (9273+ tests, 1.6GB peak, Bun 1.3.13). Targeted 44-test run (task + 3 neighbors) = 0 fail.
- T12 validates Zod schema directly without touching DB (correct isolation for schema rejection test).

---

### Task 1880b — get_pyramid_tier MCP tool (#128) (2026-05-12, DONE)

**Domain:** `classifyPyramidTier(assetClass: string): PyramidTierResult` — pure static Map lookup, 18 entries covering VN + global asset classes, 5 tiers (cash/bonds/equity/alt/speculative).
**Normalization:** `.toLowerCase().trim()` before lookup. Unknown → `{ tier: null, reason: "unknown_asset_class" }`. Never throws.
**MCP handler:** `registerPyramidTierTool` appended to `investmentClockTools.ts`. Input schema `{ asset_class: z.string() }`. Output `{ asset_class, tier, tier_description }`.
**Registry:** tool #128, `registerPyramidTierTool` in `registry.ts`.
**Tests:** 23 pass / 0 fail in `1880b-pyramid-tier.test.ts`. Full suite 9273 pass. tsc clean.
**Commit:** `d73e70f7` on branch `task/1880b-pyramid-tier`.

Key patterns:
- Domain fn has zero imports (no infra, no schema). Arch brief §4 R4 maintained.
- handler imports domain fn from `../../../../domain/services/macro/pyramidTier.js`
- `tier_description` omitted from unknown-input return shape (undefined, not null)

---

### Task 1876a-A1 — alertAccuracy precision denominator fix (2026-05-11 UTC, DONE)

**Problem:** Top-level Tổng precision used `hits / totalAlerts`, including UNKNOWN rows in denominator. Understated real precision. Example: 1 HIT, 3 MISS, 10 UNKNOWN → showed 7% instead of 25%.

**Fix:** Changed L340 to `hits / (hits + misses)` with divide-by-zero guard (scoreable=0 → 0%). Matches per-type formula at L369. 4 LOC change.

**Test:** `src/__tests__/1876a-precision-denominator.test.ts` — 2 cases, both pass.

**Commit:** `6d1ad3af`
