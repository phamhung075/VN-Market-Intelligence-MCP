# ALPHA-S2-TICK-DOWNSAMPLE-5MIN — Architecture Brief

**Task:** Archive-now — permanent 5-min OHLCV bars table + compaction cron, populated from
`market_prices_history` BEFORE the rolling 24h purge deletes surviving intraday ticks.
**Sprint:** FLOW-PRICE-ALPHA-LOOP (wave 2, gap #2 archive-now)
**Zone:** `apps/mcp-server/` — **SINGLE zone, not multi.** The board row's `zone: "multi"` was a
BOUNDED-1 routing placeholder (zone-detect Tier-3 cannot infer a zone from a title with no
`apps/<svc>` hint) — brownfield analysis below confirms every touched file (schema, scheduler,
cron config, docs) lives in `apps/mcp-server/`. PM should decompose into SEQUENTIAL subtasks
within this one zone, not a multi-service fan-out.
**BUILD-STANDARD:** lean (`apps/mcp-server/` already exists — new table + new cron job, not a new
service).

---

## 1. Brownfield findings — verified live state

### 1.1 Where ticks actually live and when the purge fires

- **Schema:** `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:77-87` —
  `market_prices_history(code, price, volume, fetched_at, exchange)`, PK `(code, fetched_at)`,
  index `(code, fetched_at DESC)`.
- **Writer + purge (SAME request handler, inline, NOT a scheduled job):**
  `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts`:
  - Line 154-164: `INSERT OR IGNORE INTO market_prices_history` on every `/api/push-prices` POST.
  - Line 238-243: `DELETE FROM market_prices_history WHERE fetched_at < ?` with
    `cutoff = new Date(Date.now() - 24*3600*1000).toISOString()` — a **rolling** 24h window
    computed fresh on every push, not a fixed daily job.
  - **Correction to the task framing:** there is no separate "24h purge cron" to race against —
    the purge is embedded in the price-push hot path itself and fires every time the VPS pushes.
- **VPS push cadence (source of truth: `docs/standards/cron-jobs.md` § VPS Services):**
  `vn-price-fetch.service` pushes every **60s, market hours only** (HOSE 02:00-08:59 UTC Mon-Fri).
  No pushes occur outside market hours → **the purge itself never fires outside market hours**
  (it's a side-effect of the push handler, not an independent timer). Consequence: a full trading
  day's ticks survive until roughly the same time-of-day on the *next* day a push occurs — across
  a weekend that can be Friday session ticks surviving until Monday's first push, at which point
  they are >24h old and get deleted in one shot. This is why "forward-only preservation" must not
  assume a tidy nightly cutoff — the compaction job has to be running continuously, independent of
  session state, well before that boundary is ever reached.
- **Prior corroborating incident (independent proof this exact problem already bit a consumer
  once):** `apps/mcp-server/src/interface/mcp/tools/market-data/priceHistoryTools.ts:11-13` — Task
  1804c had to migrate `get_price_history` OFF `market_prices_history` onto `daily_ohlcv` because
  "The old table was pruned on every VPS push so a `days=30` query only returned 24h of data."
  Confirms VN intraday ticks are already being silently lost today; this task closes that
  permanently rather than routing around it again.

### 1.2 Closest existing precedent (reuse target)

`apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` — aggregates
`market_prices_history` ticks into `daily_ohlcv` rows once/day: `open` = price of earliest tick in
window, `close` = price of latest tick, `high`/`low` = MAX/MIN(price), `volume` = **MAX(volume)**
(comment at line 140-143 confirms `market_prices_history.volume` is the *cumulative session
volume* reported by the exchange at each snapshot, not a per-interval delta — end-of-day max =
day total). This is the exact aggregation shape to reuse at 5-min granularity instead of 1-day
granularity — extend the pattern, do not invent new OHLCV semantics.

### 1.3 Risk flag — pre-existing landmine on the SAME table (found during this analysis, not asked for)

`apps/mcp-server/src/scheduler/news-analysis/audit-checks/checkDuplicatePriceHistory.ts` (W-3,
part of the weekly `dataAuditJob`) deletes every `market_prices_history` row except
`MAX(rowid)` **per `(code, DATE(fetched_at))`** — i.e. collapses a whole day down to ONE row per
ticker. It is guarded by a 50%-of-rows safeguard (aborts + emits a `critical` finding instead of
deleting if the dedup would remove >50% of rows), which is why a normal ~390-tick trading day
(1/min × 6.5h) never actually triggers the DELETE today (390/391 ≈ 99.7% > 50% → abort branch).
**But this is a live landmine, not a dead one**: any day/ticker combination with tick volume low
enough to land under the 50% threshold (partial VPS outage, a newly-watchlisted ticker, a
half-day holiday session) *will* execute the DELETE and collapse that slice to 1 row — directly
undermining this very task's "stop deleting irreplaceable ticks" goal, on a path this task does
not touch. **Not fixed here** (distinct concern, would scope-creep this M-sized task) — flagging
for PO/backlog as a follow-on hardening candidate. Once `intraday_ohlcv_5m` (below) is live and
authoritative, W-3's underlying justification for existing on the raw-tick layer disappears
entirely (the raw ticks become disposable once compacted), which is the cleanest argument for
retiring/simplifying W-3 in that follow-on rather than hardening it further.

---

## 2. Chosen shape

**Standalone 24/7 cron job, decoupled from the push handler's hot path**, that on every tick
re-aggregates the **entire current content** of `market_prices_history` (bounded by the table's
own ~24h retention) into 5-min UTC-aligned bars, UPSERTing every bucket unconditionally.

### Rejected alternative: inline compaction inside `handlePushPrices`

Considered adding the 5-min upsert directly into the push handler, immediately before its existing
`DELETE`, so compaction and purge are atomic in the same request. Rejected: (a) the DoD explicitly
asks for "a cron/job", (b) `pushPricesHandler.ts` is already a large, fragile hot path (OHLCV
writes, signal detection, alert generation all fire from the same handler) — adding more
synchronous DB work there raises latency/regression risk on the VPS ingestion path for zero
correctness gain, since a decoupled cron with a wide safety margin achieves the same guarantee.

### Why "always reprocess the full surviving table" (no per-code watermark) is correct here, not lazy

- **Idempotent by construction** — UPSERT recomputes each bucket's open/high/low/close/volume
  fresh from whatever source ticks currently exist; re-running produces byte-identical rows for
  unchanged input.
- **Gap-tolerant by construction** — if the cron is delayed or misses N ticks, the next successful
  run simply sees more accumulated ticks in the same bounded scan and catches every bucket up in
  one pass. No external watermark/state table needed.
- **Bounded cost for free** — `market_prices_history` cannot hold more than ~24h of data (the
  existing purge already guarantees this), so "full table scan" is never unbounded. At current
  watchlist size (~30 codes × ~1 push/min × ~6.5h) this is a few thousand rows — trivial for
  SQLite every 5 min.
- **This design doubles as the migration/backfill step** — see §5.

### Irreducible residual risk (call out, do not silently accept)

If the compaction cron itself is down for a continuous stretch ≥ the source table's own rolling
purge horizon (~24h, in practice longer since the purge only fires on VPS pushes — see §1.1), the
underlying ticks for that stretch are gone before any cron can rescue them. No cron design can
out-run a purge that has already executed. Mitigate via the existing self-heal watchdog extension
point (§4), same residual-risk class already accepted for `ohlcv-daily-aggregator` /
`reputationComputeJob` / `ta-ohlcv-backfill` in `WATCHDOG_MANIFEST`.

---

## 3. New table DDL

Add to `apps/mcp-server/src/infrastructure/db/schema-market-data.ts`, inside
`initMarketDataTables()`, immediately after the existing `market_prices_history` block (§1.1
line 87) — co-located with its source table, mirroring how `daily_ohlcv` sits next to it today:

```sql
CREATE TABLE IF NOT EXISTS intraday_ohlcv_5m (
  code         TEXT NOT NULL,
  bucket_ts    TEXT NOT NULL,   -- ISO-8601 UTC, 5-min-aligned bucket START
                                 -- e.g. '2026-07-14T02:35:00.000Z'
  open         REAL NOT NULL,
  high         REAL NOT NULL,
  low          REAL NOT NULL,
  close        REAL NOT NULL,
  volume       REAL NOT NULL DEFAULT 0,  -- SAME cumulative-to-date convention as daily_ohlcv.volume
                                          -- (MAX(volume) of ticks in the bucket) — NOT a per-bar
                                          -- delta. Consumers wanting delta-volume derive it at read
                                          -- time via LAG(volume) OVER (PARTITION BY code ORDER BY
                                          -- bucket_ts). No new volume semantics invented.
  tick_count   INTEGER NOT NULL DEFAULT 0,  -- # source ticks compacted into this bar — gap/sparsity
                                             -- observability, NOT used for correctness
  compacted_at TEXT NOT NULL             -- last (re)write timestamp
  , PRIMARY KEY (code, bucket_ts)
);
CREATE INDEX IF NOT EXISTS idx_intraday_5m_code_bucket
  ON intraday_ohlcv_5m(code, bucket_ts DESC);
```

Write pattern: `INSERT OR REPLACE INTO intraday_ohlcv_5m (...) VALUES (...)` — full-row overwrite
is correct (not `daily_ohlcv`'s partial-merge `ON CONFLICT` rules) because every run recomputes the
**complete** bucket from all currently-surviving source ticks, not an incremental partial push. No
unit/scale normalization guard needed either — `market_prices_history.price` is already
VND-normalized once at write time (`pushPricesHandler.ts:161-163`, `pv = isStock ? p.price*1000 :
p.price`), so `writeOhlcvBatch`'s scale-detection machinery (built for raw multi-source daily
inputs) does not apply here and should NOT be reused — a plain prepared-statement UPSERT is the
correct, simpler tool.

---

## 4. Compaction job design

**New file:** `apps/mcp-server/src/scheduler/market-data/intraday5mCompactorJob.ts`, exporting
`runIntraday5mCompactor(deps?)` — same DI shape as `runOhlcvDailyAggregator` (`db`, `nowMsFn`
injectable for tests).

**Algorithm (single query + JS grouping — simpler and more testable than a SQL window-function
pass; the codebase already has both idioms available, e.g. `moneyRadarStore.ts` uses window
functions, `ohlcvDailyAggregatorJob.ts` uses per-window queries — this recommends the latter style
since it is the more directly analogous precedent for this exact source table):**

1. `SELECT code, price, volume, fetched_at FROM market_prices_history ORDER BY code, fetched_at ASC`
   — one bounded scan (≤~24h of data, see §2).
2. In JS, for each row compute `bucketStartMs = Math.floor(new Date(fetched_at).getTime() / 300_000) * 300_000`
   and group by `(code, bucketStartMs)`.
3. Per group, reduce to `{open: first.price, high: max(price), low: min(price), close: last.price,
   volume: max(volume), tick_count: rows.length}` (rows already time-ordered from the query).
4. `INSERT OR REPLACE` one row per group into `intraday_ohlcv_5m`, `bucket_ts =
   new Date(bucketStartMs).toISOString()`, `compacted_at = new Date(nowMs).toISOString()`.
5. Return `{codesProcessed, bucketsWritten, ticksScanned}` (mirrors `OhlcvAggregatorResult`'s
   shape) for `cron_job_runs` / WORK-channel observability, same idiom as every other job in
   `schedulerJobTable.ts`.

**Hard constraint — no market-hours gate anywhere in this job.** DoD explicitly requires
"no dependence on market open". Do NOT call `isVnTradingWindowUtc()` / `isVnMarketHoursUtc()` or
add a market-hours cron restriction (contrast with `taAlertScanJob`/`vpsProxyWatchdogJob`, which
correctly DO restrict to market hours for their own domains — that pattern must NOT be copied
here). An empty `market_prices_history` on a weekend/holiday makes step 1's query return zero
rows — the job naturally no-ops at negligible cost; that is the correct behavior, not a bug to
guard against with an explicit skip.

**Registration (matches the 76-job declarative table, `apps/mcp-server/src/scheduler/`):**
- `cronConfig.ts`: `intraday5mCompactor: Bun.env.CRON_INTRADAY_5M_COMPACTOR ?? '*/5 * * * *'`
  (unrestricted 24/7, same idiom as `vpsServiceHealth: '*/5 * * * *'` — line 119).
- `schedulerJobTable.ts` `buildJobTable()`: new entry using the plain
  `jobRunRepo.wrapRun(name, runner)` envelope (no bespoke shape needed — this job has no
  same-day dedup concern, unlike `runAlertDigest`/`runAccuracyDigest`).

**Cadence rationale:** 5 min matches the bucket width and gives continuous re-confirmation (every
run re-verifies/re-writes the still-open current bucket in addition to any older gap) with wide
safety margin against the purge's ≥24h horizon (§1.1) — many consecutive missed ticks would be
needed before any risk materializes.

**`wrapRun` has no overlap/mutex guard** (verified via
`apps/mcp-server/src/domain/repositories/IJobRunRepository.ts:34-37` — no `isRunning` check, unlike
`bctcQueueEnricherJob`'s pattern). At 5-min cadence against a bounded, cheap, indexed query this is
a low-probability/low-impact risk (worst case: two overlapping UPSERTs of the same bucket, both
converging to the same correct value) — not a blocker, but noted for QA test coverage.

**Optional hardening (flag for PM, not required to close this task's DoD):** add an entry to
`schedulerWatchdogJob.ts`'s `WATCHDOG_MANIFEST` (cadence `300_000`ms, `thresholdMultiplier: 3`,
`action: 'self-heal'`) mirroring the existing `ohlcv-daily-aggregator`/`reputationComputeJob`/
`ta-ohlcv-backfill` entries in `schedulerJobTable.ts:1170-1215` — defense-in-depth against the
residual risk in §2.

---

## 5. Migration / backfill of currently-surviving ticks

**No separate migration script is needed.** Because the job's steady-state algorithm (§4) already
reprocesses the *entire* current content of `market_prices_history` on every invocation, the very
first invocation — whether the first cron tick or an explicit startup call — IS the backfill of
whatever ticks currently survive at deploy time. Add one fire-and-forget startup call in
`apps/mcp-server/src/scheduler/startScheduler.ts`, alongside the existing startup-time repairs
(`purgeStrandedSeedRows`, `runOhlcvStartupProbe`, the ALPHA-S1 candle guard — lines 74-100), so the
gap between container deploy and the first 5-min cron tick is also covered:

```ts
try {
  const r = await runIntraday5mCompactor()
  log(`[startup] intraday5mCompactor: buckets=${r.bucketsWritten} codes=${r.codesProcessed}`)
} catch (err) {
  log(`[startup] intraday5mCompactor error (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
}
```

Non-fatal by the same convention as every other startup repair in this file — a failure here must
never block server boot.

---

## 6. Scope decision — ALL codes, not just watchlist

`ohlcvDailyAggregatorJob` scopes to `SELECT code FROM watchlist` only. This job should compact
**every distinct code currently present in `market_prices_history`** (stocks, indices,
global indices — anything the VPS push writes), not just the watchlist subset. Rationale: the
source rows already exist in the one table being scanned regardless of watchlist membership, so
there is zero extra fetch cost to including them, and the task's stated motivation ("VN intraday
tick history is not purchasable") is not watchlist-scoped — a non-watchlist ticker's intraday
history is equally irreplaceable once purged. Deliberate deviation from the daily aggregator's
scope — call this out explicitly to PM/dev so it isn't "corrected" back to watchlist-only under a
mistaken consistency assumption.

---

## 7. Explicitly out of scope (keep this M-sized, avoid scope creep)

- **No new MCP read tool.** This task is the archive-now write/compaction path only. A
  `get_intraday_bars`-style read tool is a separate, future task if/when a consumer needs it.
- **No fix to the W-3 `checkDuplicatePriceHistory` landmine** (§1.3) — flagged for PO/backlog,
  not attempted here.
- **No change to `pushPricesHandler.ts`** — the purge and the ingestion hot path are untouched;
  this task adds a decoupled reader/compactor only.

---

## 8. Acceptance criteria (for PM decomposition)

1. `intraday_ohlcv_5m` table + index created idempotently in `schema-market-data.ts` (§3).
2. `runIntraday5mCompactor()` aggregates ALL codes in `market_prices_history` (§6) into 5-min
   UTC-aligned bars per the open/high/low/close/volume/tick_count rules in §3-4.
3. Idempotent: re-running with unchanged source ticks produces byte-identical rows (test: run
   twice, diff `intraday_ohlcv_5m` before/after 2nd run — zero delta).
4. Gap-tolerant: simulate a skipped cron cycle (accumulate 2+ bucket-widths of ticks in one pass)
   and verify every bucket in the gap is correctly compacted in a single run (test).
5. Zero market-hours dependence: no `isVnTradingWindowUtc()`/market-hours predicate anywhere in
   the job body or its cron string; empty-table no-op verified by test.
6. Startup one-shot call wired in `startScheduler.ts` (§5), non-fatal on error.
7. Cron registered: `cronConfig.ts` + `schedulerJobTable.ts` `buildJobTable()`, PLUS the existing
   dual-doc-update precedent (`docs/data/cron-registry.json` `.jobs[]` +
   `.schedulerFileCount`, `docs/data/system-map.json`
   `.project.microservices[id=mcp-server].crons` 66→67, `docs/standards/cron-jobs.md` new row) —
   per the SAME precedent already documented at `docs/data/cron-registry.json:_trigger`.
8. Forward-preservation proof test: ticks compacted into `intraday_ohlcv_5m` THEN the existing
   `pushPricesHandler.ts` purge deletes them from `market_prices_history` — bars remain and
   summarize the deleted window correctly (end-to-end regression test tying both tables together).
9. **Board hygiene (dispatcher-side, not a dev task):** correct `task_board` row `zone` field from
   `"multi"` to `"apps/mcp-server/"` — done by this handoff's own orch-state write, see §9.

---

## 9. Zone / board correction

Board row `ALPHA-S2-TICK-DOWNSAMPLE-5MIN.zone` is corrected from `"multi"` to
`"apps/mcp-server/"` in the same `orch-apply.sh` transform that advances `.head.next_agent` to
`pm` — this task is single-zone once brownfield-analyzed; leaving the stale `"multi"` label would
mis-route PM's downstream `dev-mcp-server` handoff through zone-detect Tier-3 unnecessarily.

**Suggested atomic subtask split for PM (all zone `apps/mcp-server/`, sequential — shared-SSOT
files, not parallelizable per `docs/policies/dev-standards.md` § Parallel Agent Dispatch):**

| # | Subtask | Files |
|---|---|---|
| 1 | DDL — `intraday_ohlcv_5m` table + index | `schema-market-data.ts` |
| 2 | Compaction job + startup hook + cron registration | `intraday5mCompactorJob.ts` (new), `startScheduler.ts`, `cronConfig.ts`, `schedulerJobTable.ts` |
| 3 | Docs sync (cron registry dual-update) | `docs/data/cron-registry.json`, `docs/data/system-map.json`, `docs/standards/cron-jobs.md` |
| 4 | Tests — idempotency, gap-tolerance, no-market-hours-dependence, forward-preservation e2e | `apps/mcp-server/src/__tests__/ALPHA-S2-intraday-5m-compactor.test.ts` (new) |
| 5 (optional/stretch) | `WATCHDOG_MANIFEST` self-heal entry | `schedulerJobTable.ts` |
