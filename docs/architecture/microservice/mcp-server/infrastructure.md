# mcp-server — Infrastructure

## Database Schema (SQLite)

### Core Market Tables
```sql
watchlist (code TEXT PK, company_name, exchange DEFAULT 'HOSE', domain DEFAULT 'other',
  notes, added_at, alert_drop_pct DEFAULT -3, alert_rise_pct DEFAULT 5,
  alert_impact_min DEFAULT 7, alert_report_new DEFAULT 1)

market_prices (code TEXT PK, price REAL, change_amt, change_pct, volume, updated_at, exchange DEFAULT 'HOSE')

market_prices_history (code TEXT, price, volume, fetched_at, exchange, PK(code, fetched_at),
  INDEX idx_mph_code_fetched(code, fetched_at DESC))

daily_ohlcv (code TEXT, date TEXT, open, high, low, close, volume,
  updated_at, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
  PK(code, date), INDEX idx_daily_ohlcv_code_date(code, date DESC))

vn_index_cache (code TEXT PK, price REAL NOT NULL, prev_price REAL DEFAULT 0,
  change_pct REAL DEFAULT 0, volume REAL DEFAULT 0, fetched_at TEXT NOT NULL)
  -- FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (2026-06-20)
  -- Single-row cache per index code; INSERT OR REPLACE upsert.
  -- Writer: vnIndexRefreshJob (every 5 min, 02:00-08:59 UTC Mon-Fri)
  -- Freshness SLA: <= 10 min stale during market hours
  -- Store: apps/mcp-server/src/infrastructure/db/vnIndexCacheStore.ts
```

### Alert Tables
```sql
alerts (id TEXT PK, triggered_at, severity, signals_json, affected_actions_json,
  analysis_ids_json, message, read DEFAULT 0, user_note, notified_telegram DEFAULT 0,
  resolved_at, resolution_notes, sent_by DEFAULT 'server', confidence_score, validated_at)

custom_alert_rules (id INTEGER PK, code, predicate, threshold, status DEFAULT 'active',
  created_at, triggered_at, notes)

alert_mutes (code TEXT PK, muted_until, reason)
price_alerts (id INTEGER PK, code, alert_type, threshold, status DEFAULT 'active', ...)
broker_sanctions (id INTEGER PK, broker_name, sanction_start, sanction_end, severity, source, ...)
```

**Additional schema files:** macro, financial-reports, briefings, system, news, portfolio, backtesting (16 total)

## Fetcher Implementations (41 fetchers)

### Price Data
| Fetcher | Source | Timeout | Fallback |
|---------|--------|---------|----------|
| `hose.ts` | VnDirect api-finfo v4 | exponential backoff (1m→30m cap) | legacy finfo-api |
| `foreignFlowFetcher.ts` | VPS :5005 | 5s + circuit breaker (5 fail→open, 30s reset) | cache→SSE→none |
| `ohlcvBackfill.ts` | VNDirect api-finfo v4/stock_prices | 15s abort per ticker; 200ms inter-ticker delay | none |

**ohlcvBackfill flat-seed-bar guard (FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0):**
VNDirect returns `open=high=low=close=reference_price, volume=0` for non-traded/illiquid tickers on
the current trading day. Writing these rows creates fake seed bars that poison TA consumers (RSI/BB/MACD).

Guard in `runOhlcvBackfill` transaction loop (`apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts:236-248`):
- Applied AFTER `normalizeOhlcvToVnd` (catches thousand-scale flat bars: 5.9→5900, still flat)
- Skip predicate: `vol===0 AND norm.open===norm.high===norm.low===norm.close` — same shape as `purgeStrandedSeedRows()`
- Halt-day candles (O=H=L=C but vol>0) are NOT skipped — vol>0 discriminates halt candles from placeholders
- Leaves gap — real traded data filled by VPS price push or `taOhlcvBackfillJob`

Injectable `fetchFn` option for testability: `runOhlcvBackfill(db, { fetchFn: mockFn })` bypasses network.

### News & Events
| Fetcher | Source |
|---------|--------|
| `rss.ts` | Cafef, VnExpress, VnEconomy feeds |
| `newsapi.ts` | NewsAPI.org (100 req/day limit) |
| `cafef.ts`, `vnexpress.ts`, `reuters.ts` | Direct scrapers |
| `sscInsider.ts` | SSC insider trading registry |
| `sbvCircular.ts` | Central Bank circulars |

### Macro
| Fetcher | Source | Rate Limit |
|---------|--------|------------|
| `fredApi.ts` | US Federal Reserve (FRED) | 120 calls/60s |
| `tradingEconomics.ts` | TE macro calendars | - |
| `shippingIndex.ts` | BDI, FBX, SCFI | - |
| `weatherVn.ts` | Typhoon/flood forecasts | - |
| `polymarket.ts` | Prediction market odds | - |

### Specialized
| Fetcher | Purpose |
|---------|---------|
| `bctcSourceRouter.ts` | BCTC PDF discovery routing |
| `bctcHttpFetcher.ts` | BCTC PDF download |
| `pdf.ts` + `pdfOcrWorker.ts` | Multi-tier extraction (Tabula→PyMuPDF→OCR) |
| `davPharmacy.ts` | Pharma supply data |
| `hydrologicalData.ts` | Water level forecasts |

### vnstock Python Bridge (`fetchers/vnstockBridge.ts` + `fetchers/vnstock/`)

Spawns Python subprocesses to call the `vnstock` library (v4, community edition) for financial fundamentals, price history, and corporate data.

**FACTORY-INFRA-split-vnstockBridge (2026-07-08):** the 11 inline `*_SCRIPT`
Python templates and the rate-limiter/backoff/junk-detection runtime moved out
of `vnstockBridge.ts` into a `vnstock/` subdirectory:
- `vnstock/runtime.ts` — `VnstockRateLimiter`, `isRateLimitResponse`, `calcBackoffMs`,
  `stripAnsiAndDetectJunk`, `runPython`/`runPythonWithBackoff`, and
  `wrapVnstockScript` (the shared stdout-capture + error-handling template).
- `vnstock/scripts/*.ts` — one `buildXxxScript(symbol, ...)` function per
  data type (financials, tradingStats, officers, shareholders, intraday,
  orderBook, balanceSheet, cashFlow, news, prices, events).
- `vnstock/index.ts` — barrel re-exporting `runtime.ts`.
- `vnstockBridge.ts` stays the single public import path: owns the domain
  types + the 11 thin `fetchVnstockXxx()` wrapper functions (each calls a
  script builder, then `runPython`/`runPythonWithBackoff`), and re-exports the
  tested runtime helpers for backward compat with existing test imports.

**Banner suppression (FIX-FUNDAMENTALS-REFRESH-CRON-DEAD, 2026-06-14):**
vnstock v4 emits two stdout banners that corrupt JSON output detection:
1. Deprecation notice (box-drawing chars ╭──╮) on `Vnstock().stock()` init → mis-detected as rate-limit by `isRateLimitResponse()` via `BOX_DRAWING_RE`
2. Community-edition notice (ℹ️ prefix) on each data API call (`income_statement()`, `balance_sheet()`, `cash_flow()`, etc.) → detected as junk by `stripAnsiAndDetectJunk()`

**Fix:** `wrapVnstockScript()` in `vnstock/runtime.ts` now owns this preamble
once (previously hand-copied into 9 of the 11 script templates — the same
fix-comment repeated per script was evidence of N hand-applications):
```python
_real_stdout = sys.stdout
try:
    sys.stdout = _io.StringIO()   # suppress init banner
    stock = Vnstock().stock(...)
    sys.stdout = _io.StringIO()   # suppress data call banner
    df = stock.finance.income_statement(...)
except Exception as e:
    _fetch_err = e
finally:
    sys.stdout = _real_stdout     # always restore before JSON output
```
`prices.ts` (multi-symbol loop) and `events.ts` (bypasses `Vnstock().stock()`
entirely via a `vnstock.common.viz` mock) have genuinely different control
flow and stay bespoke, not built through `wrapVnstockScript`.

**Exported constants** (for tests, re-exported from `vnstockBridge.ts`):
- `SUPPRESS_BANNER` — Python snippet that redirects stdout to StringIO
- `RESTORE_STDOUT` — Python snippet that restores `_real_stdout`

**Key detection functions** (in `vnstock/runtime.ts`, re-exported from `vnstockBridge.ts`):
- `isRateLimitResponse(output)` — matches `BOX_DRAWING_RE` against stderr/stdout
- `stripAnsiAndDetectJunk(output)` — returns `{junk: true}` when first non-whitespace char is not `{` or `[` (catches non-JSON like ℹ️)
- `runPythonWithBackoff(script, ticker)` — 3 retries with exponential backoff on RATE_LIMITED; returns null on junk

**Rate limiter:** `VnstockRateLimiter` — token bucket, shared across all 30 watchlist tickers

**Circuit breaker integration:** `syncVnstockData.ts` tracks `consecutiveOpens`; after `FAIL_THRESHOLD=3` failures opens for `RESET_MS=2h` (doubles on each open: 2h→4h→8h)

## Cron Status Infrastructure (DASH-CRON-RECHECK-TABLE, TASK-DASH-CRON-1)

### apps/mcp-server/src/infrastructure/cron/layerBCronRegistry.ts
`parseLayerBCrons(commandsDir)` parses `.claude/commands/crons/*.md` ONLY (13 live files; `cron-fb-market-poster.md` DEPRECATED, skip-listed via `DEPRECATED_LAYER_B_FILES`). Primary regex `` - **cron**: `<expr>` `` (12 files, multi-cron numbered `#1/#2/#3`); fallback `# Schedule: '<expr>'` used only when primary yields 0 matches (`cron-refine-bctc.md`). Excludes `cron-detect-loop`/`cron-cowork-team` skill files — they verbatim-copy 5 crons already in the command files (would double-count, AC-12). `getLayerBCronRows(commandsDir)` — CN-5 module-level memoized singleton, parsed once at server startup (test reset hook: `_resetLayerBCronCacheForTests`).

### apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts (2 new additive exports)
- `getLastRunForJob(db, jobName)` — single-job `MAX(started_at)` + status, same `status IN ('success','error')` filter as `schedulerWatchdogJob.queryLastStartedAt` (CN-3 parity).
- `getDistinctJobNames(db)` — `SELECT DISTINCT job_name FROM cron_job_runs`, used by `cronStatusCompute`'s CN-1 tier-2 fallback.

### Scheduler Job Table (`scheduler/schedulerJobTable.ts` + `scheduler/walEscalation.ts`)
FACTORY-SCHEDULER-job-table-registry replaced 79 copy-paste `scheduleCron(CRONS.x, async () =>
{ jobRunRepo.wrapRun('xJob', ...) }, opts)` blocks that used to live inline in
`startScheduler.ts` (1257L → 305L). 57 jobs share the plain `jobRunRepo.wrapRun(name,
runner)` envelope — declared as `{name, cron, options, runner}` entries in
`buildJobTable(ctx)`, registered by a single generic loop `registerJobTable(table,
jobRunRepo)`. 22 bespoke jobs (skip `wrapRun` entirely, use a `run*WithDb`
`startupHelpers.ts` DB-backed dedup wrapper, or build extra local state before
registering — e.g. the WAL-checkpoint escalation closure, the scheduler-watchdog
self-heal manifest) keep individual verbatim `scheduleCron(...)` call sites in
`registerBespokeJobs(ctx)`. `startScheduler.ts` stays the composition root: DB/repo init,
startup repairs/probes/backfills that are NOT cron registrations, and the two calls
`registerJobTable(buildJobTable(ctx), jobRunRepo)` + `registerBespokeJobs(ctx)`.

`walEscalation.ts`'s `createWalEscalateFn(orchStatePath?)` extracts the WAL-checkpoint
D-1 guardrail closure (appends a `WAL_ESCALATION` `signal_queue` row when WAL > 10 MB) —
previously an inline closure in `startScheduler.ts`, now independently testable.

Equivalence (cron key + options + wrapRun job-name, all 79 registrations) verified via a
scratch pre/post comparison script — see `docs/agent-memory/notebooks/dev-mcp-server.md`
2026-07-08/09 entry.

## Repositories (6 SQLite implementations)
- `SqliteWatchlistRepository`, `SqliteMarketPriceRepository`
- `SqliteKinhDichScoreRepository`, `SqliteHexagramRepository`
- `SqliteJobRunRepository`, `SqliteVnstockRepository`

## Stores (40+ specialized)
- Alert lifecycle: `alertStore`, `alertMuteStore`, `customAlertRuleStore`
- Backtesting: `backtestPriceRepo`, `backtestSignalRepo`, `backtestResultRepo`
- Portfolio: `positionStore`, `tradeStore`, `pnlSnapshotStore`
- Predictions: `predictionStore`, `predictionClaimStore`
- Signal: `agentSignalStore`, `bctcSignalDebounce`

## Key Infrastructure Patterns
- **Circuit breaker:** `circuitBreakerRegistry.ts` (open/closed/half-open)
- **Rate limiter:** `rateLimiter.ts`
- **Resilient fetcher:** `resilientFetcher.ts` (retry + timeout + fallback)
- **Telegram notifier:** `notifiers/telegram.ts`
- **Telegram command router:** `notifiers/telegramCommands.ts` (+ `notifiers/telegram/`) — see below
- **RAG vector store:** `rag/vectorstore.ts` (LanceDB)

### Telegram Command Router (`notifiers/telegramCommands.ts` + `notifiers/telegram/`)

Processes incoming Telegram webhook updates (`/help`, `/watchlist`, `/price`,
`/health`, `/news`, `/recap`, `/recapw`, `/recapm`, `/set_position`,
`/check_position`, `/ask`, `/report`, `/fix`). Never throws; plain-text only.

**FACTORY-INFRA-split-telegramCommands (2026-07-08):** split by seam out of a
1071L monolith:
- `telegram/format.ts` — presentation helpers (`fmtNum`, `stripHtml`,
  `HELP_TEXT`, `chunkStories`, `splitBlockAtNewlines`).
- `telegram/commandHandlers.ts` — the 8 non-`/news`/`/recap*` handlers; raw SQL
  moved into `infrastructure/db/{watchlistReadStore,systemHealthStore,
  agentFeedbackStore}.ts`.
- `telegram/newsHandler.ts` — `/news` (dedup + chunking, unchanged logic).
- `telegram/recapRenderer.ts` — **pure** `/recap*` rendering. Deliberately has
  ZERO imports from `application/usecases/` — its `EveningRecapData`/
  `PeriodicRecapData` types are narrow, LOCAL, structural views (not the
  producer's `EveningSummary`/`PeriodicSummary` types), so real application
  objects satisfy them via TypeScript structural typing with no coupling.
- `telegramCommands.ts` — thin router; exports a `RecapResolvers` DI contract
  (`evening`/`weekly`/`monthly` async resolvers). When a resolver is omitted
  the router degrades to a friendly Vietnamese error message — never throws.

**Layering fix:** telegramCommands.ts previously imported
`assembleEveningSummary`/`generatePeriodicSummary` directly from
`application/usecases/` to BOTH fetch and render `/recap*` (infra reaching
UP into application). The fetch step now lives in
`application/usecases/orchestrateRecapCommand.ts`
(`orchestrateEveningRecap`/`orchestrateWeeklyRecap`/`orchestrateMonthlyRecap`),
invoked by the INTERFACE layer (`interface/mcp/routes/webhookHandler.ts`),
which passes the 3 resolvers into `handleTelegramCommand`'s `RecapResolvers`
parameter. `telegramCommands.ts` and everything it imports now has zero
`application/usecases/` imports.

## Telemetry

### Per-Call Counter Store (TSU-DEV-U1)
- **Module:** `apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts`
- **Purpose:** Counts tool invocations in-process; survives across gateway SSE cutover (gateway dials per-call, drops connection — no sessionId)
- **API:** `incrementTool(name)` / `getSnapshot(): Record<string,number>` / `resetCounters()` / `getTool(name)`
- **Hook:** Handler proxy installed in `server.ts` after `registerAllTools()` — iterates `server._registeredTools`, wraps each handler with synchronous `Map.set()` increment
- **Flush job:** `scheduler/system/trackSessionToolUsageJob.ts` runs every 8h, writes `docs/agent-memory/modules/tool-usage-stats.json`
- **Schema:** `{ generatedAt, uniqueTools, toolCounts }` — `sessionCount` removed (meaningless post-gateway)

### Session Tool Cache (legacy — effectively dead in gateway model)
- **Module:** `apps/mcp-server/src/infrastructure/cache/sessionToolCache.ts`
- **Status:** Populated only when SSE sessionId is available; never fires in gateway mode. Retained for non-gateway deployments.

## Environment Variables
```
PORT, DB_PATH, VINAHOST_IP, VPS_PUSH_API_KEY,
FRED_API_KEY, NEWSAPI_KEY,
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```
