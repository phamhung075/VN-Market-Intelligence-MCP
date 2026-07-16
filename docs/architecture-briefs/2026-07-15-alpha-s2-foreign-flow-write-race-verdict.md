# ALPHA-S2-FOREIGN-FLOW-WRITE-RACE — Verdict + Intraday Archive Brief

**Task:** Archive-now — foreign buy/sell/value/room 60s pushes are collapsed by per-(code,date)
last-write-wins upserts before any intraday curve is preserved.
**Sprint:** FLOW-PRICE-ALPHA-LOOP (wave 2)
**Verdict:** **SPRINT-S-BUILD** (residual work is real; FIX-half is DONE_VERIFIED)
**Zone:** `apps/mcp-server/` — **SINGLE zone, not multi.** Same class of stale BOUNDED-1 routing
placeholder as sibling `ALPHA-S2-TICK-DOWNSAMPLE-5MIN`.
**BUILD-STANDARD:** lean (`apps/mcp-server/` already exists — new tables + new job, not a new
service).

---

## 1. RAW-verification of the FIX-half claim (per dispatch instruction)

Confirmed live, not re-implemented:

- `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts::writeForeignFlowToOhlcv` —
  `INSERT INTO daily_foreign_flow (...) VALUES (...) ON CONFLICT(code,date) DO UPDATE ...`,
  unconditional, zero dependency on `daily_ohlcv`. `changes` is always `>=1` for a non-empty
  input; the module JSDoc explicitly documents the retired merge-only strategy and this cutover.
- `git show 3201c86cc --stat` confirms commit is real (TASK_2002/SUBTASK-DAILY-FF-3,
  ARCH-DAILY-FOREIGN-FLOW-TABLE), touches exactly the test files the commit message claims.
- The daily foreign plane `ALPHA-S3` (divergence screen) depends on is delivered by this
  cutover — `ALPHA-S3`'s foreign-plane dependency is satisfied. **Confirmed, not re-litigated.**

**Verdict on FIX-half: DONE. Do not re-open.**

---

## 2. Residual scope — why this is NOT a copy-paste of the sibling design

### 2.1 The critical architectural difference from `ALPHA-S2-TICK-DOWNSAMPLE-5MIN`

The price-plane sibling had a huge advantage: `market_prices_history` **already existed** as an
append-only raw-tick table (many consumers, its own 24h rolling purge) — the 5-min compactor is
purely additive: read an existing feed, write a new rollup table, touch zero write-path code.

**Foreign flow has no equivalent.** RAW-verified `pushForeignFlowHandler.ts` (Steps 5-6) and
`foreignFlowFetcher.ts`: **every** 60s push writes **directly** into the final per-day tables via
unconditional `ON CONFLICT DO UPDATE`:
- Step 5 → `upsertForeignFlow()` (`vnstockStore.ts`) → `vnstock_trading_stats` (`foreign_room`,
  `current_holding_ratio` columns).
- Step 6 → `writeForeignFlowToOhlcv()` (`ohlcvForeignFlowStore.ts`) → `daily_foreign_flow`
  (`foreign_buy_vol/sell_vol/value`, `put_through_vol`).

There is **no intermediate raw-ticks table** anywhere in this path — each 60s snapshot overwrites
the prior one for that `(code, date)` the instant it lands, in **both** target tables. `git grep`
for any foreign-flow raw store (`vpsPushLogStore.ts` logs only aggregate push metrics — item
counts, timings — never per-code payload) confirms there is nothing to retroactively downsample.
**Building the archive requires touching the write path** (append the incoming normalized item to
a new raw table, additively, alongside — not instead of — the two existing upserts). This is the
one part of the design that cannot mirror the sibling's "zero write-path change" shape.

### 2.2 Both existing writers share the same problem — from the same source payload

`pushForeignFlowHandler.ts` builds one `normalizedItems` array from the VPS payload and feeds it to
**both** writers in the same request. The task title's "room" is not a misnomer — `foreign_room` /
`holding_ratio` in `vnstock_trading_stats` suffer the identical last-write-wins collapse
(`upsertForeignFlow`'s own dedup comment: "Deduplicate by (code, date) — last occurrence wins").
**One new raw-ticks table capturing the full normalized item once, at push time, covers both
currently-lossy planes** — no need for two separate raw stores.

### 2.3 Aggregation semantics differ from OHLC (important — do not copy sibling's MAX/MIN(price) shape)

`foreignBuyVol` / `foreignSellVol` / `foreignBuyValue` / `foreignSellValue` are **cumulative
counters for the trading day** (same convention as `daily_ohlcv.volume`, confirmed by the very fact
the existing writer safely overwrites rather than sums — additive semantics would double-count
under an overwrite strategy). There is no open/high/low concept for a cumulative counter. Per
5-min bucket the correct aggregate is **LAST snapshot value in the bucket** (chronologically last
`fetched_at`), analogous to `close`, with `COALESCE`-style null-preservation for the optional value
fields (mirrors `ohlcvForeignFlowStore.ts`'s own `COALESCE(excluded.foreign_buy_value,
foreign_buy_value)` pattern) so a payload missing `fBValue` doesn't blank out a previously-known
value mid-bucket. `foreign_room` / `holding_ratio` are point-in-time gauges (not cumulative) — LAST
value in bucket is still correct (most-recent-known state), same rule, different justification.

---

## 3. Consolidate vs standalone — the decision this brief was asked to make

**Recommendation: STANDALONE table + job from the price plane** (do NOT reuse `intraday_ohlcv_5m`
or `intraday5mCompactorJob.ts`), **but internally unify the two existing foreign-flow writers'
loss into ONE new archive table + ONE new raw-ticks table**, not two.

**Rationale:**
1. **Domain separation (DDD).** Foreign investor flow and OHLCV price/volume are distinct bounded
   contexts. `intraday_ohlcv_5m`'s schema (`open/high/low/close/volume`) has no natural columns for
   `foreign_buy_vol/sell_vol/value/room/holding_ratio` — sharing the table would force nullable
   cross-domain columns on every row (price rows with foreign columns always NULL and vice versa),
   which is exactly the anti-pattern `daily_ohlcv`'s own frozen `foreign_*` columns just got
   migrated OFF of in the sibling `ARCH-DAILY-FOREIGN-FLOW-TABLE` sprint (§1 above). Re-coupling
   the two planes in the NEW archive layer would reintroduce the same coupling this sprint just
   spent 3 subtasks removing from the daily layer.
2. **Aggregation semantics differ.** OHLC (open/high/low/close/max-volume) vs LAST-value-only
   (§2.3) — a shared compactor function would need a branch per plane, which is more complex than
   two small, single-responsibility jobs.
3. **The price plane's raw-ticks table cannot be reused regardless.** `market_prices_history` has
   no foreign-flow columns; a new raw table is unavoidable either way, so "reuse the existing
   table" (the sibling's main advantage) is not on offer here in any consolidation shape.
4. **Real, cheap code-reuse opportunity that IS worth taking:** extract the "group timestamped rows
   into 5-min UTC-aligned buckets" loop from `intraday5mCompactorJob.ts` into a small shared helper
   (e.g. `bucketBy5Min<T>(rows, tsField)`) so both compactors call the same bucketing primitive with
   different per-bucket reducers. Nice-to-have DRY win, not a table/job merge — flag for developer,
   not required for DoD.

---

## 4. New tables DDL

Add to `apps/mcp-server/src/infrastructure/db/schema-market-data.ts`, co-located near
`daily_foreign_flow` (§ line 170):

```sql
-- Raw ticks — append-only, mirrors market_prices_history's role for the price plane.
-- Populated additively by pushForeignFlowHandler.ts alongside (not instead of) the
-- existing upsertForeignFlow / writeForeignFlowToOhlcv calls (§2.1/§6).
CREATE TABLE IF NOT EXISTS foreign_flow_history (
  code               TEXT NOT NULL,
  fetched_at         TEXT NOT NULL,   -- ISO-8601, push-time timestamp
  foreign_buy_vol    REAL,
  foreign_sell_vol   REAL,
  put_through_vol    REAL,
  foreign_buy_value  REAL,
  foreign_sell_value REAL,
  foreign_room       REAL,
  holding_ratio      REAL,
  PRIMARY KEY (code, fetched_at)
);
CREATE INDEX IF NOT EXISTS idx_ffh_code_fetched
  ON foreign_flow_history(code, fetched_at DESC);

-- 5-min compacted archive — LAST-value-in-bucket semantics (§2.3), not OHLC.
CREATE TABLE IF NOT EXISTS intraday_foreign_flow_5m (
  code               TEXT NOT NULL,
  bucket_ts          TEXT NOT NULL,   -- ISO-8601 UTC, 5-min-aligned bucket START
  foreign_buy_vol    REAL,
  foreign_sell_vol   REAL,
  foreign_net_vol    REAL,            -- computed: buy_vol - sell_vol, same convention as daily_foreign_flow
  put_through_vol    REAL,
  foreign_buy_value  REAL,
  foreign_sell_value REAL,
  foreign_room       REAL,
  holding_ratio      REAL,
  tick_count         INTEGER NOT NULL DEFAULT 0,
  compacted_at       TEXT NOT NULL,
  PRIMARY KEY (code, bucket_ts)
);
CREATE INDEX IF NOT EXISTS idx_iff5m_code_bucket
  ON intraday_foreign_flow_5m(code, bucket_ts DESC);
```

Rolling purge for `foreign_flow_history`: mirror `pushPricesHandler.ts`'s inline rolling-24h
`DELETE ... WHERE fetched_at < cutoff` pattern, added at the end of Step 6 in
`pushForeignFlowHandler.ts` (same file already doing the writes — same hot-path-inline idiom, not
a separate cron, matching the price plane's own precedent exactly).

---

## 5. Write-path change (the one piece with no sibling precedent)

**File:** `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts`, Step 6 block
(where `ohlcvItems` is already built for `writeForeignFlowToOhlcv`). Add one additive `INSERT OR
IGNORE INTO foreign_flow_history` per normalized item (full fields, including `foreign_room` /
`holding_ratio` already available in `normalizedItems` from Step 3a) — **best-effort, wrapped in
the same non-fatal try/catch already wrapping Step 6**, so a failure here can never regress the
existing upsert paths (matches this file's existing error-isolation convention line-for-line).
Zero change to `upsertForeignFlow` / `writeForeignFlowToOhlcv` themselves — additive only.

---

## 6. Compaction job design

**New file:** `apps/mcp-server/src/scheduler/market-data/intradayForeignFlow5mCompactorJob.ts`,
exporting `runIntradayForeignFlow5mCompactor(deps?)` — same DI shape (`db`, `nowMsFn`) as
`runIntraday5mCompactor`.

1. `SELECT * FROM foreign_flow_history ORDER BY code ASC, fetched_at ASC` (bounded ~24h scan).
2. Group by `(code, 5-min bucket)` using the shared bucketing helper (§3.4) or an inlined copy if
   extraction is deferred.
3. Per group: **LAST-value reducer** (§2.3) for every numeric column, `COALESCE`-style
   null-preservation on `foreign_buy_value`/`foreign_sell_value`, computed
   `foreign_net_vol = foreign_buy_vol - foreign_sell_vol` at the last-known buy/sell pair.
4. `INSERT OR REPLACE` into `intraday_foreign_flow_5m`.
5. Return `{codesProcessed, bucketsWritten, ticksScanned}` — same result shape idiom.

**No market-hours gate** (same rationale as sibling §4 — empty table on off-hours no-ops for
free). **Cron:** `*/5 * * * *`, new `CRONS.intradayForeignFlow5mCompactor` entry in
`cronConfig.ts`, registered in `schedulerJobTable.ts` `buildJobTable()`, startup one-shot call in
`startScheduler.ts` alongside the price-plane compactor's startup call (§5 of sibling brief) — same
migration-free backfill argument applies (first invocation reprocesses whatever survives at
deploy time).

---

## 7. Out of scope

- No new MCP read tool for the 5-min foreign-flow archive (future task if a consumer needs it).
- No change to `daily_foreign_flow` / `vnstock_trading_stats` daily semantics — those stay exactly
  as TASK_2002 left them.
- No `WATCHDOG_MANIFEST` entry required for DoD (optional stretch, same as sibling §4).

---

## 8. Acceptance criteria (for PM decomposition)

1. `foreign_flow_history` + `intraday_foreign_flow_5m` tables + indexes created idempotently.
2. `pushForeignFlowHandler.ts` Step 6 additively appends every normalized item to
   `foreign_flow_history` (best-effort, non-fatal, zero change to existing two upserts) + rolling
   24h purge added inline (mirrors `pushPricesHandler.ts` exactly).
3. `runIntradayForeignFlow5mCompactor()` aggregates ALL codes into 5-min UTC buckets using
   LAST-value-in-bucket semantics (§2.3) — NOT OHLC min/max.
4. Idempotent + gap-tolerant (same test shape as sibling AC-3/AC-4).
5. Zero market-hours dependence (test: empty-table no-op).
6. Startup one-shot call wired, non-fatal on error.
7. Cron + docs registered: `cron-registry.json`, `system-map.json` crons count, `cron-jobs.md` row.
8. Forward-preservation e2e test: push → `foreign_flow_history` row exists → compactor runs →
   `intraday_foreign_flow_5m` bucket correct → rolling purge deletes the raw tick → bucket survives.
9. Board hygiene: `zone` corrected `"multi"` → `"apps/mcp-server/"` (this handoff's own write, §9).

---

## 9. Zone / board correction + subtask split

Board row `zone` corrected `"multi"` → `"apps/mcp-server/"` in the same orch-state write that
advances `.task_board` — single-zone once analyzed, same class of stale BOUNDED-1 placeholder as
the sibling.

**Suggested atomic subtask split for PM (sequential, shared-SSOT files):**

| # | Subtask | Files |
|---|---|---|
| 1 | DDL — `foreign_flow_history` + `intraday_foreign_flow_5m` tables + indexes | `schema-market-data.ts` |
| 2 | Write-path: additive raw-tick insert + rolling purge in push handler | `pushForeignFlowHandler.ts` |
| 3 | Compaction job + startup hook + cron registration | `intradayForeignFlow5mCompactorJob.ts` (new), `startScheduler.ts`, `cronConfig.ts`, `schedulerJobTable.ts` |
| 4 | Docs sync (cron registry dual-update) | `docs/data/cron-registry.json`, `docs/data/system-map.json`, `docs/standards/cron-jobs.md` |
| 5 | Tests — idempotency, gap-tolerance, no-market-hours-dependence, forward-preservation e2e | new `__tests__` file |
| 6 (optional) | Extract shared 5-min bucketing helper (§3 point 4), refactor `intraday5mCompactorJob.ts` to use it too | `intraday5mCompactorJob.ts`, new helper file |

**Urgency note:** NOT required by `ALPHA-S3` (needs the daily plane only, already delivered per
§1) — lower priority than the original P1 FIX classification. Recommend P2/P3, not P1.
