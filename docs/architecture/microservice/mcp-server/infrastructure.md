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

daily_foreign_flow (code TEXT, date TEXT, foreign_buy_vol, foreign_sell_vol,
  foreign_net_vol, put_through_vol, foreign_buy_value, foreign_sell_value,
  updated_at DEFAULT '', PK(code, date),
  INDEX idx_daily_foreign_flow_code_date(code, date DESC))
  -- SUBTASK-DAILY-FF-1 (ARCH-DAILY-FOREIGN-FLOW-TABLE, 2026-07-12): additive-only
  -- new authoritative foreign-flow table. Eliminates R-1 (foreign-flow write
  -- dropped when no daily_ohlcv row exists) because none of these columns are
  -- coupled to price data / NOT NULL constraints — the write is unconditional.
  -- Design: docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Change 1
  -- Schema: apps/mcp-server/src/infrastructure/db/schema-market-data.ts
  --
  -- SUBTASK-DAILY-FF-2 (TASK_2001, 2026-07-12): one-time idempotent backfill —
  -- `backfillDailyForeignFlow()` in schema.ts, wired into initDatabase() right
  -- after migrateForeignFlowColumns() (same INSERT OR IGNORE, PK-guarded,
  -- safe-on-every-boot pattern). Copies every daily_ohlcv row with foreign_* data
  -- into daily_foreign_flow. Additive-only — never overwrites an existing row.
  -- Design: docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Change 4
  --
  -- SUBTASK-DAILY-FF-3 / TASK_2002 (2026-07-12, WRITER CUTOVER — SHIPPED):
  -- `writeForeignFlowToOhlcv()` (ohlcvForeignFlowStore.ts) now performs an
  -- UNCONDITIONAL `INSERT ... ON CONFLICT(code,date) DO UPDATE` into THIS table
  -- only. It no longer writes daily_ohlcv.foreign_* in ANY mode — those columns
  -- are FROZEN/historical-only from this point on (populated once by the
  -- SUBTASK-DAILY-FF-2 backfill above, never again). R-1 is now structurally
  -- closed: `changes` can never be 0 for a valid (non-empty) row.
  -- Design: docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Change 2

daily_ohlcv_with_flow (VIEW — [daily_ohlcv LEFT JOIN daily_foreign_flow ON code,date]
  UNION ALL [anti-join: daily_foreign_flow rows with no daily_ohlcv match])
  -- Compatibility read view: same column names as daily_ohlcv's legacy foreign_*
  -- columns, COALESCE-preferring daily_foreign_flow (new table) and falling back
  -- to the frozen legacy daily_ohlcv.foreign_* columns for any (code,date) not
  -- yet present in the new table. Lets read sites migrate `FROM daily_ohlcv` ->
  -- `FROM daily_ohlcv_with_flow` one at a time with zero query-shape change.
  -- Design: docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Change 3
  --
  -- FIX-DAILY-FF-VIEW-JOIN-ANCHOR (2026-07-13, SHAPE A — bidirectional view):
  -- the LEFT JOIN alone is anchored on daily_ohlcv, so a (code,date) key that
  -- exists ONLY in daily_foreign_flow (FF data landed, OHLCV bar not yet) was
  -- NEVER emitted — R-1 read-side gap across all 5 Class-A sites. SQLite has
  -- no FULL OUTER JOIN, so the fix UNION ALLs a second SELECT: an anti-join
  -- pass over daily_foreign_flow (`LEFT JOIN daily_ohlcv ... WHERE o.code IS
  -- NULL`) for exactly the keys the first half misses. 15 columns, identical
  -- order both halves; price cols (open/high/low/close/volume) + data_env are
  -- NULL on the anti-join half (no OHLCV bar exists yet — honest NULL, not
  -- fabricated); updated_at uses f.updated_at (the FF write's own freshness
  -- signal). Definition is `DROP VIEW IF EXISTS` + unconditional `CREATE VIEW`
  -- (NOT `IF NOT EXISTS`) — the live DB is a persistent named Docker volume, so
  -- `IF NOT EXISTS` would be a silent no-op on redeploy despite tests (fresh
  -- `:memory:` DB) going green. View: apps/mcp-server/src/infrastructure/db/
  -- schema-market-data.ts:162-200.
  -- Design: docs/architecture-briefs/2026-07-13-daily-ff-view-join-anchor.md
  --
  -- SUBTASK-DAILY-FF-4 / TASK_2003 (2026-07-12, CLASS-A READ MIGRATION — SHIPPED):
  -- all 5 Class-A "value reader" sites now query this view instead of raw
  -- daily_ohlcv: marketWideForeignFlowTool.ts, foreignFlowTools.ts,
  -- foreignFlowAlertJob.ts, assembleEveningSummary.ts (default
  -- getForeignFlowMoversFn), franceSummaryJob.ts (default getForeignFlowMoversFn,
  -- both the latest-date lookup and the mover query). This closes the
  -- writer-cutover transition gap: post-cutover daily_foreign_flow writes are
  -- now visible to every Class-A reader, not just via the frozen legacy columns.
  -- Class-B freshness/health probes (freshnessSlaMonitorJob.ts, slaStatusTools.ts,
  -- vpsProxyWatchdogJob.ts, vpsHealthPoller.ts) deliberately do NOT go through
  -- this view — they query daily_foreign_flow directly (see below).
  -- Design: docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Read-site inventory
  --
  -- SUBTASK-DAILY-FF-5 / TASK_2004 (2026-07-12, CLASS-B PROBE MIGRATION — SHIPPED):
  -- all 4 Class-B freshness/health probes now query `daily_foreign_flow WHERE
  -- foreign_buy_vol IS NOT NULL` DIRECTLY (not via this view — its COALESCE
  -- fallback to the frozen legacy daily_ohlcv.foreign_* columns would mask a
  -- stale/dead foreign-flow writer behind a healthy-looking OHLCV row):
  -- freshnessSlaMonitorJob.ts (querySignalAges), slaStatusTools.ts
  -- (querySignalAges, tool-surface twin), vpsProxyWatchdogJob.ts
  -- (readLatestForeignFlowTimestamp), vpsHealthPoller.ts
  -- (DEFAULT_FRESHNESS_CONFIGS vn-foreign-flow entry). Closes the last
  -- ARCH-DAILY-FOREIGN-FLOW-TABLE read-site subtask — foreign-flow pipeline
  -- health is now fully decoupled from OHLCV pipeline health.
  -- Design: docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Change 3

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
  resolved_at, resolution_notes, sent_by DEFAULT 'server', confidence_score, validated_at,
  fingerprint)
  -- idx_alerts_fingerprint: partial UNIQUE(fingerprint) WHERE fingerprint IS NOT NULL
  -- (schema-alerts.ts). Authoritative dedup gate for taAlertScanJob/bbAlertScanJob/
  -- foreignFlowAlertJob/predictionMarketJob (computeScanAlertFingerprint, day-bucket)
  -- and, since FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION (2026-07-29), generateAlerts()'s
  -- "otherwise" fallback path too (computeGenericAlertFingerprint, minute-bucket) —
  -- see alerts.md invariant 8.

custom_alert_rules (id INTEGER PK, code, predicate, threshold, status DEFAULT 'active',
  created_at, triggered_at, notes)

alert_mutes (code TEXT PK, muted_until, reason)
price_alerts (id INTEGER PK, code, alert_type, threshold, status DEFAULT 'active', ...)
broker_sanctions (id INTEGER PK, broker_name, sanction_start, sanction_end, severity, source, ...)
```

### agent_signals (schema-news.ts — inter-agent signal bus)
```sql
agent_signals (id INTEGER PK, from_agent, to_agent, signal_type, stock_code, payload,
  status DEFAULT 'unread', created_at, expires_at, cycle_id, finding_data, causal_ref,
  chain_depth, causal_root_id, causal_root_label, signal_class, confidence_score,
  validated_at, news_sentiment, kinh_dich_confidence, agent_signals_majority,
  critic_score, critic_notes, retry_count, alert_id, is_correlation_stub)
  -- idx_agent_signals_dedup_identical (FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION,
  -- 2026-07-29): partial UNIQUE(from_agent, signal_type, COALESCE(stock_code,''),
  -- payload, substr(created_at,1,16)) WHERE payload != '{}'. Data-layer backstop
  -- against genuine double-EMISSION (NOT retry) duplicates — paired with
  -- postSignal()'s INSERT OR IGNORE (agentSignalStore.ts), returns -1 on suppression.
  -- WHERE payload != '{}' originally excluded alertStore.ts's verified_decision
  -- correlation stubs (from_agent='alert-engine') back when their payload was
  -- always the literal '{}'. FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-
  -- NULL-STOCKCODE (2026-07-29) fixed alertStore.ts to populate real decision
  -- content (alert_id/alert_type/title/severity/confidence/detected_at)
  -- instead — alert_id is embedded so the JSON stays byte-unique per alert,
  -- so these rows now safely fall inside this index's coverage too without
  -- colliding for 2 genuinely-different alerts on the same stock/minute.
  -- alertStore.ts's own precise alert_id-scoped guard (FIX-AGENT-SIGNALS-
  -- ORPHAN-ALERT-ID) remains the primary dedup mechanism for this row class;
  -- this index is a secondary, emitter-agnostic backstop.
```

**agent_signals.payload for from_agent='alert-engine' (verified_decision correlation stubs)**
Populated by `buildVerifiedDecisionPayload()` in `alertStore.ts` (called from both
`storeAlerts()` and `storeAlertsFromCommander()`): `{alert_id, alert_type, title,
severity, confidence, detected_at}` — built from the `Alert`/`Signal` object being
written (never the caller-supplied literal). Emit-time guard: refuses (fail-loud
`logger.warn`, no insert) to write a verified_decision row when the resulting
payload would be empty or `alert.message` is falsy — the paired `alerts` row is
never blocked by this guard, only the decorative correlation stub. `stock_code` is
`NULL` only for `actionCode === "MACRO"` alerts (by design, unrelated tickers);
otherwise always the real ticker.

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
| `sbv.ts` | VCB XML FX rate (live) + SBV interest-rate env-var fallbacks (portal 404) | - |

**`sbv.ts` — `storeSbvSnapshot()` zero-overwrite guard (FIX-SBV-FETCHER-ZERO-VALUE-EMIT).**
`sbv_rates` holds one row per `source` (`INSERT OR REPLACE`, full-row upsert — no
partial-column update support). `SENTINEL_ZERO_COLUMNS`
(`overnight_rate_pct`/`refinancing_rate_pct`/`usd_vnd_official`/
`max_deposit_rate_pct`/`max_lending_rate_pct`) are "0 means missing, not real" —
`storeSbvSnapshot` (`infrastructure/fetchers/sbv.ts:430`) REJECTS the entire
snapshot (`{skipped:true, zeroColumns}`) when any sentinel column is ≤0 AND the
prior persisted row already holds a positive value for it, so a partial/failed
fetch can never clobber a good prior row. `interbank_overnight_pct` and
`discount_rate_pct` are intentionally NOT sentinel-guarded (can legitimately be
0 on market close/holiday). `getLatestSbvRatesRow()`
(`infrastructure/fetchers/sbv.ts:384`) is the exported read-side counterpart —
callers that only ever carry a PARTIAL snapshot use it to carry-forward the
last-known-good value for every field they don't have, instead of defaulting
omitted fields to a synthetic 0 that would trip the guard above. Two call
sites: `pushSbvRatesHandler.ts` (`interface/mcp/routes/pushSbvRatesHandler.ts`)
— the VPS-push handler for `POST /api/push-sbv-rates`; `vps-scripts/fetch-sbv.sh`
only ever posts `{usdVndOfficial, fetchedAt}`, so every optional rate field is
merged from `getLatestSbvRatesRow()` rather than zero-defaulted, and the
handler checks `storeSbvSnapshot`'s `{skipped, zeroColumns}` return before
logging "stored" (previously logged a false-positive "stored" line
unconditionally). `sbvRatesJob.ts` (`scheduler/macro/sbvRatesJob.ts`, 4h cron)
and `intelligenceCycleJob.ts` step A2 (`scheduler/news-analysis/
intelligenceCycleJob.ts`, every cycle) both call the full `fetchSbvRates()`
(all 7 fields always present) via `runSbvRatesRefreshJob()`, which runs its own
pre-flight sentinel check (`detectZeroSentinelFields`) BEFORE calling
`storeSbvSnapshot` — a WORK-channel alert + skip on a hit, never a
guard-tripping store call.

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

### Data Audit Job (`scheduler/news-analysis/dataAuditJob.ts` + `audit-checks/` + `dataAuditShared.ts`)
FACTORY-SCHEDULER-split-dataAuditJob extracted the D-1..D-11 (daily) and
W-1..W-7 (weekly) inline check bodies (previously ~800L combined inside
`runDailyChecks`/`runWeeklyChecks`) into one file per check group under
`scheduler/news-analysis/audit-checks/` (20 files, each ≤120L, each a pure
`(db: Database) => AuditFinding[]` — W-7's `checkLancedbDrift` is the one
async exception, taking an injected `GetCountFn`). D-NEW2
`checkOrphanAgentSignalsAlertId` (FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID,
2026-07-10) is the ongoing regression tripwire for
`agent_signals.alert_id` dangling-FK rows (inverse of C-08/W-6
`checkOrphanAlerts`) — flags `agent_signals.alert_id IS NOT NULL AND
alerts.id` missing; the root writer defect (alertStore.ts `storeAlerts`/
`storeAlertsFromCommander` co-writing the correlation row without
confirming the paired `alerts` INSERT OR IGNORE actually persisted a row —
it can silently no-op on an `alerts.fingerprint` UNIQUE-index collision,
not just an `id` collision) is fixed at the writer with an existence guard.
`AuditFinding`/
`TelegramFn`/`GetCountFn`, the category/priority mapping, the
`insertFeedbackIfNew` dedup-guarded feedback insert, `getPreviousRowCounts`,
`INDICATOR_RANGES`/`SNAPSHOT_TABLES`, and the Telegram message formatter now
live in `dataAuditShared.ts`. `dataAuditJob.ts` is a thin composition root:
`runDailyChecks`/`runWeeklyChecks` are `[...checkA(db), ...checkB(db), ...]`
spreads in the original D-n/W-n order (finding order + `insertFeedbackIfNew`
side-effect ordering preserved exactly), plus the `writeSystemLog`/
`upsertAuditState`/`maybeSendTelegram` finalize steps and the public
`runDailyAudit`/`runWeeklyAudit`/`runDailyAuditIfStale` entry points.
`AuditFinding`/`TelegramFn`/`GetCountFn`/`buildFindingTitle` are re-exported
from `dataAuditJob.ts` for backward-compatible import paths (existing
tests + `bctcReparseJob.ts` import them from there, unchanged).

RAW-verify: a scratch pre/post comparison script ran `runDailyAudit`/
`runWeeklyAudit` against identical seeded fixture DBs using a git-HEAD copy
of the pre-split monolith vs the post-split module — findings[] output and
`agent_feedback` insert ordering were byte-identical (JSON deep-equal).

**D-NEW3 `checkConvictionHistoryGap`** (`audit-checks/checkConvictionHistoryGap.ts`,
FIX-CONVICTION-HISTORY-EOD-BACKFILL, 2026-07-29) — EOD reconciliation/backfill
for `conviction_history`. `findConvictionHistoryGapDays(db, vnToday)` finds
trading days present in `daily_ohlcv` (code coverage >= live `watchlist`
count — self-deriving "confirmed trading day" floor, no hardcoded ticker
count) with ZERO `conviction_history` rows, bounded to
`[MIN(conviction_history.date) or a 30-day fallback, vnToday)` and capped at
15 days per run (oldest-first — a large backlog converges over consecutive
nightly runs). `backfillConvictionForDate(db, date)` recomputes conviction
per current-watchlist stock from `daily_ohlcv` alone (no live fetch —
sentiment/IMF dimensions default to neutral, matching
`computeConviction`'s documented behaviour for any omitted dimension) and
writes via `SqliteMarketPriceRepository.upsertConvictionHistory` (SSOT
writer, no duplicated INSERT). A "confirmed" gap day that cannot be
backfilled (e.g. the earliest `daily_ohlcv` row on file for every watchlist
code, no prior-day row to compute `changePct` from) is reported
`action:"none"` — never fabricated, and never re-flagged as
`insertFeedbackIfNew` spam since it can never gain a row. Root cause
(RAW-verified live via `cron_job_runs.rows_written`): `scanMarket`'s Step 5c
conviction persistence used to run AFTER an early "0 signals -> return"
guard, so any scan cycle with zero qualifying signals across the whole
watchlist silently lost conviction_history for that cycle — fixed at the
source in `application/usecases/scanMarket.ts` (Step 5c now runs
unconditionally, see `usecases.md`); this check is the EOD self-heal for the
pre-existing backlog plus any future write-path failure.

### Intelligence Cycle Job (`scheduler/news-analysis/intelligenceCycleJob.ts` + `intelligenceCycle/`)
FACTORY-SCHEDULER-split-intelligenceCycleJob extracted the `CycleResult`/
`CycleDeps` contracts into `intelligenceCycle/types.ts`, `isMarketHours`
into `intelligenceCycle/marketHours.ts` (imports `VN_OFFSET_MS` from the
shared `timeConstants.ts` rather than redefining it), and all 9
`defaultXxx` production implementations (Steps A/B/C/D/E/A4's DI-seam
defaults: `defaultPollNews`, `defaultListSscDocs`, `defaultFetchPrices`,
`defaultRunImpactChain`, `defaultSendAlerts`, `defaultGetWatchlistCodes`,
`defaultReadUnnotifiedAlerts`, `defaultMarkAlertNotified`,
`defaultComputeHexagrams`) into one file per default under
`intelligenceCycle/defaults/`. `defaultComputeHexagrams` and
`resetHexagramCooldown` — plus the module-level `_lastHexagramComputedAt`
cooldown map both functions read/write — were kept together in the same
file (`defaults/defaultComputeHexagrams.ts`) by design: splitting them
apart would silently break the 15-minute per-stock cooldown closure.
`intelligenceCycleJob.ts` is now a 975L thin orchestrator: the concurrency
guard (`cycleRunning`/`cycleStartedAt`/`resetCycleGuard`), the per-step
timeout helper (`withTimeout` + `STEP_TIMEOUT_MS`/`POLL_NEWS_TIMEOUT_MS`/
`SYNC_PEERS_TIMEOUT_MS`/`STEP_B_SSC_TIMEOUT_MS`), the `ALERT_WINDOW_MS`/
`CYCLE_WARN_THRESHOLD_MS` named constants, the 7-step `_runCycle` body,
`runIntelligenceCycle`, and the Step G chain-synthesis helpers
(`mapChainAction`, `isoDatePlusDays`, `runChainSynthesis`).
`CycleResult`/`CycleDeps`/`isMarketHours`/`resetHexagramCooldown` are
re-exported from `intelligenceCycleJob.ts` for backward-compatible import
paths (existing tests import them from there directly, unchanged).

RAW-verify: a scratch pre/post comparison script imported both a git-HEAD
snapshot of the pre-split monolith and the post-split module (same
directory, so relative import depths resolve identically) and ran
`runIntelligenceCycle` with an identical fully-injected `CycleDeps` object
across market-hours=true/false scenarios — the returned `CycleResult` was
MD5-identical in both scenarios, and `isMarketHours` matched across a
spread of fixed timestamps. Every extracted function body was additionally
diffed against the git-HEAD original (import-path depth normalized) and
confirmed byte-identical.

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
- **RAG HTTP client:** `rag/ragHttpClient.ts` — HTTP boundary to rag-service (port 5002), the single LanceDB writer (G5b, R-1 resolved). Legacy direct-LanceDB `rag/_deprecated/{embeddings,vectorstore,retriever}.ts` (tests-only, zero production imports) deleted as dead-code removal (CI-RED-da847805-FIX) — its native `@lancedb/lancedb` addon import was crashing `bun test` on load.

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
