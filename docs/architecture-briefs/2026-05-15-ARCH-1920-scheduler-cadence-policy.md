# ARCH-1920 — DB Pipeline Cadence Policy
<!-- Architect brief | 2026-05-15 | Blocks: 1920a/b/c/d -->

## 1. Context

Sprint 1920 identified 10 SQLite tables with writers but zero scheduler callers.
This brief defines cadence, zone assignment, idempotency, and failure handling for
all tables before BA decomposes sub-tasks 1920a–d.

Brownfield inputs read:
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`
- `apps/mcp-server/src/infrastructure/db/schema-macro.ts`
- `apps/mcp-server/src/infrastructure/db/schema-alerts.ts`
- `apps/mcp-server/src/infrastructure/db/schema-system.ts`
- `apps/mcp-server/src/scheduler/cronConfig.ts`
- `apps/mcp-server/src/scheduler/startScheduler.ts`
- `apps/mcp-server/src/infrastructure/db/bondMaturityStore.ts`
- `apps/mcp-server/src/infrastructure/db/brokerSanctionStore.ts`
- `apps/mcp-server/src/infrastructure/db/commodityTracker.ts`
- `apps/mcp-server/src/infrastructure/fetchers/shippingIndex.ts`
- `apps/mcp-server/src/application/usecases/syncVnstockData.ts`

---

## 2. Cadence Policy

### Cadence principle: per-domain beats per-source-tier

After reviewing the existing 59 cron entries in `cronConfig.ts`, the rule is:
**cadence follows data volatility, not source tier**. Source tier affects
`source_tier` metadata on MCP tool outputs (1881a standard) but does not directly
dictate the scheduler interval. The domain determines volatility.

| Domain | Volatility | Recommended cadence |
|--------|-----------|---------------------|
| Company fundamentals (income/balance/cashflow) | Quarterly filing event | Weekly on weekdays — catches same-week filings without daily overhead |
| Corporate events / officer changes / shareholders | Low (few per year) | Weekly — same job as fundamentals (single vnstock batch) |
| Trading stats (foreign room, 52w high/low) | Daily market data | Daily 08:00 UTC (pre-VN open) |
| Bond maturity calendar | Slow (new issuances monthly) | Weekly Sunday — aligns with existing weekly audit cadence |
| Commodity prices (macro input) | Daily NY-close pricing | Daily 06:00 UTC — co-fires with `macroIndicatorRefresh` |
| Shipping index (BDI/FBX via Yahoo Finance) | Daily | Daily 06:00 UTC — same job as commodity (shared `tracked_indicators` table) |
| Broker sanctions (SSC enforcement page) | Quarterly | Quarterly — last Friday of Mar/Jun/Sep/Dec |

---

## 3. Per-Table Policy

### TIER 1 — vnstockStore (7 tables)

**Tables:** `vnstock_financials`, `vnstock_balance_sheet`, `vnstock_cash_flow`,
`vnstock_events`, `vnstock_officers`, `vnstock_shareholders`, `vnstock_trading_stats`

**Source:** vnstock API via existing `vnstockBridge.ts` fetchers. Already called by
`syncVnstockData.ts` (application use case) with staleness thresholds (6h financials,
24h officers/shareholders, 7d events). This use case is never scheduled — it is only
invoked on-demand from tool calls.

**Cadence decision:**
- `vnstock_financials` / `vnstock_balance_sheet` / `vnstock_cash_flow` / `vnstock_events` /
  `vnstock_officers` / `vnstock_shareholders` → **weekly, Monday 01:00 UTC** (08:00 VN).
  Quarterly earnings land before Monday after filing. Catches same-week BCTC updates.
- `vnstock_trading_stats` → **daily, 08:30 UTC** (15:30 VN, 30 min after market close).
  Foreign room and 52w stats are market-day data.

**Existing rate-limit context:** `syncVnstockData.ts` enforces 2500ms inter-call delay
and caps at ~24 calls/min against a 60 req/min ceiling. With 30 watchlist tickers, a
full batch is ~7–10 minutes wall-clock. The new `vnstockFundamentalsJob.ts` must reuse
this use case; do NOT bypass the delay.

**Cron keys to add to `cronConfig.ts`:**
```
vnstockFundamentalsRefresh   = Bun.env.CRON_VNSTOCK_FUNDAMENTALS  ?? '0 1 * * 1'    // Mon 01:00 UTC
vnstockTradingStatsRefresh   = Bun.env.CRON_VNSTOCK_TRADING_STATS ?? '30 8 * * 1-5' // daily weekdays 08:30 UTC
```

**Idempotency:** All 7 tables carry `UNIQUE` constraints (on `(code, year_report, quarter, source)` or `(code, date)`). Use `INSERT OR IGNORE` or the existing `ON CONFLICT DO UPDATE` (`upsert`) pattern already present in `vnstockStore.ts`. For `vnstock_trading_stats` upsert is correct (daily snapshot should replace same-day row). For fundamental tables (income/balance/cash), upsert is correct — vnstock may revise quarterly data after initial publication.

**Scheduler zone:** `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`

---

### TIER 1 — bond_maturity

**Source:** HSX/HNX bond-issuance calendar. No automatic API — requires either:
(a) VPS Playwright scrape from SSC/HNX bond portal, or
(b) Manual seed + periodic top-up.
The `upsertBond()` store function uses `ON CONFLICT(issuer_code) DO UPDATE` already.

**Cadence decision:** **Weekly, Sunday 02:30 UTC** (09:30 VN). Bonds rarely issue
mid-week. This runs after `baseRateComputation` (Sunday 19:00 UTC previous week) and
before Monday market open.

**Cron key to add:**
```
bondMaturityPoller   = Bun.env.CRON_BOND_MATURITY_POLLER ?? '30 2 * * 0'   // Sun 02:30 UTC
```

**Idempotency:** `upsertBond()` already does full `ON CONFLICT(issuer_code) DO UPDATE`. No INSERT OR IGNORE needed — upsert is the correct pattern because bond amounts and statuses change.

**VPS dependency:** HSX/HNX bond portal is geo-accessible from France (not geo-blocked). If the chosen scrape source is SSC enforcement page — that IS reachable. Confirm source before dev starts. If VPS scrape is chosen anyway, coordinate with ops.

**Scheduler zone:** `apps/mcp-server/src/scheduler/macro/bondMaturityPollerJob.ts`

---

### TIER 2 — commodity_prices / commodity_prices_history

**Source:** Yahoo Finance (existing `commodityTracker.ts` + `shippingIndex.ts` both write to `tracked_indicators`). The `commodity_prices` table is a snapshot table (PRIMARY KEY on `source`). `commodity_prices_history` is append-only.

**Cadence decision:** **Daily 06:00 UTC** — co-fires with `macroIndicatorRefresh`
(already at `0 6 * * *`). Commodity prices are NY-close data; 06:00 UTC is after
22:00 NY (01:00 UTC next day) so data is settled. This is a Tier-2 source per 1881a.

**Cron key to add:**
```
commodityTrackerRefresh   = Bun.env.CRON_COMMODITY_TRACKER ?? '0 6 * * *'    // daily 06:00 UTC
```

NOTE: This is the same cron expression as `macroIndicatorRefresh`. **Do NOT merge into
a single cron registration** — keep separate job files. Node-cron supports two
registrations on the same expression without conflict. This preserves independent
`cron_job_runs` observability.

**Shipping index** (`shippingIndex.ts` writes to `tracked_indicators`, same table):
Wire into the same `commodityTrackerRefreshJob.ts` as a second call block. Both
ship to `tracked_indicators` so there is no schema conflict.

**Idempotency:** `commodity_prices` — `source` is PRIMARY KEY, use `INSERT OR REPLACE`
(current schema: `UNIQUE(source)` with no explicit conflict clause in DDL, so the
job must use `INSERT OR REPLACE` or `ON CONFLICT(source) DO UPDATE`). `commodity_prices_history`
is append-only — plain INSERT is correct (no dedup key needed; two inserts at the same
timestamp are tolerated as separate history rows).

**Scheduler zone:** `apps/mcp-server/src/scheduler/macro/commodityTrackerRefreshJob.ts`

---

### TIER 3 — broker_sanctions

**Source:** SSC enforcement page. Geo-accessible from France (not blocked).
The `insertBrokerSanction()` store function uses plain INSERT (no upsert).

**Cadence decision:** **Quarterly — last Friday of Mar/Jun/Sep/Dec, 08:00 UTC**.
SSC publishes enforcement decisions quarterly aligned with reporting seasons.
Exact cron: `0 8 L 3,6,9,12 5` — NOTE: standard node-cron does not support `L`
(last weekday). Use a fixed proxy: `0 8 25-31 3,6,9,12 5` (Fri between 25th–31st
of quarter-end months). Alternatively, run monthly on the last Friday with a domain
guard that skips non-quarter-end months.

Recommended implementation: **monthly cron on last Friday with quarter filter**:
```
brokerSanctionsQuarterlySweep = Bun.env.CRON_BROKER_SANCTIONS ?? '0 8 25-31 * 5'
```
Job function checks `new Date().getMonth() + 1` ∈ `{3, 6, 9, 12}` and skips otherwise.

**Idempotency:** `insertBrokerSanction()` uses plain INSERT — no UNIQUE constraint
on `(broker_name, sanction_start)`. Before 1920d ships, BA spec must add a
`UNIQUE(broker_name, sanction_start)` constraint (via ALTER TABLE migration) and
change the store function to `INSERT OR IGNORE`. This prevents duplicate rows if
the quarterly sweep runs twice (Docker restart scenario).

**Risk flag:** Schema currently lacks dedup constraint — this is a pre-condition for
the scheduler job to be safe. BA must specify schema migration as part of 1920d AC.

**Scheduler zone:** `apps/mcp-server/src/scheduler/news-analysis/brokerSanctionsJob.ts`
(zone rationale: news-analysis hosts SSC-related jobs; `sscCheckerJob.ts` is already
here; broker sanctions are SSC-sourced enforcement data)

---

## 4. Scheduler Zone Assignment Summary

| Table(s) | New Job File | Scheduler Subdirectory |
|----------|-------------|------------------------|
| vnstock_financials, vnstock_balance_sheet, vnstock_cash_flow, vnstock_events, vnstock_officers, vnstock_shareholders | `vnstockFundamentalsJob.ts` | `financial-reports/` |
| vnstock_trading_stats | `vnstockFundamentalsJob.ts` (same file, separate cron entry) | `financial-reports/` |
| bond_maturity | `bondMaturityPollerJob.ts` | `macro/` |
| commodity_prices, commodity_prices_history, tracked_indicators (shipping) | `commodityTrackerRefreshJob.ts` | `macro/` |
| broker_sanctions | `brokerSanctionsJob.ts` | `news-analysis/` |

Zone rationale follows existing conventions in `startScheduler.ts`:
- `financial-reports/` — all vnstock + BCTC scheduled work
- `macro/` — macro indicators, prediction markets, bond calendar
- `news-analysis/` — SSC, intelligence cycle, pattern watch

---

## 5. Idempotency Pattern per Table

| Table | UNIQUE constraint exists | Pattern |
|-------|--------------------------|---------|
| vnstock_financials | YES `(code, year_report, quarter, source)` | Upsert (`ON CONFLICT DO UPDATE`) |
| vnstock_balance_sheet | YES `(code, year_report, quarter, source)` | Upsert |
| vnstock_cash_flow | YES `(code, year_report, quarter, source)` | Upsert |
| vnstock_trading_stats | YES `(code, date)` | Upsert |
| vnstock_events | YES `(code, event_name, event_date)` | Upsert |
| vnstock_officers | YES `(code, name)` | Upsert |
| vnstock_shareholders | YES `(code, name)` | Upsert |
| bond_maturity | YES `(issuer_code)` | Upsert (existing `upsertBond()`) |
| commodity_prices | YES `source` is PRIMARY KEY | `INSERT OR REPLACE` |
| commodity_prices_history | NO (append-only) | Plain INSERT |
| broker_sanctions | NO (missing — **pre-condition for 1920d**) | Must add `UNIQUE(broker_name, sanction_start)` + `INSERT OR IGNORE` |

All jobs must wrap inserts in `recordJobRun(db, jobName, fn)` following
`sscCheckerJob.ts` / `macroIndicatorRefreshJob.ts` pattern. `cron_job_runs` is the
observability layer.

---

## 6. Failure Handling

| Job | Behavior | Rationale |
|-----|----------|-----------|
| `vnstockFundamentalsJob` | **Fail-loud (WORK channel)** + continue per ticker | Rate-limit errors must be visible; individual ticker failures must not abort the batch |
| `bondMaturityPollerJob` | **Fail-loud (WORK channel)** | Zero-row bond calendar breaks news-scout + unified-agent bond-roll detection |
| `commodityTrackerRefreshJob` | **Fail-loud (WORK channel)** | Commodity data feeds regime/phase-clock; stale data = silent regime error |
| `brokerSanctionsJob` | **Fail-loud (WORK channel)** | Quarterly job; a silent skip means 3-month data gap |

**Definition of fail-loud here:** `send_telegram(channel="work", ...)` with job name +
error summary. NOT the BUG channel (these are data-pipeline failures, not system
errors; BUG channel is for infrastructure/code panics). If the job fails hard
(unhandled throw), the existing `cron_job_runs` `status='error'` + `error_msg` column
records the failure for ops review.

**Per-ticker error isolation (vnstockFundamentalsJob):** The job must iterate watchlist
tickers and wrap each `syncVnstockData()` call in a try/catch. A single 429 from
vnstock must not abort the remaining 29 tickers. Log failed tickers to `cron_job_runs`
as `rows_written` + appended `error_msg`.

---

## 7. Risk Flags

**R-1 — vnstock rate-limit (HIGH)**
`syncVnstockData.ts` caps at ~24 req/min with 2500ms delays. A full 30-ticker
fundamental sweep = 7–10 min. The weekly cron window is safe. Risk: if the watchlist
expands beyond ~60 tickers, the job will spill past 15 min and the next daily cron
could double-fire mid-sweep. Add a `isRunning` guard (concurrency flag) in the job
function — same pattern as `sscCheckerJob.ts`.

**R-2 — bond_maturity VPS dependency (MEDIUM)**
If the bond source requires VPS scrape (HNX/SSC portal needs Vietnamese IP), the job
must route through `VPS_PROXY_URL` in the same pattern as `bctcQueueEnricherJob.ts`.
BA spec (1920b) must confirm source reachability from France before committing to
a no-VPS design.

**R-3 — broker_sanctions missing UNIQUE constraint (HIGH)**
`broker_sanctions` has no dedup key. A quarterly job running twice (Docker restart
during the cron window) will insert duplicate rows. The pre-condition schema migration
(ALTER TABLE + UNIQUE constraint) must be part of 1920d acceptance criteria and land
in the same PR as the job, otherwise the job is unsafe to deploy.

**R-4 — commodity_prices INSERT OR REPLACE semantic (LOW)**
`commodity_prices` uses `source` as PRIMARY KEY. `INSERT OR REPLACE` deletes + reinserts
the row, which resets `rowid`. This is acceptable for a snapshot table but the dev
must confirm no FK references to `commodity_prices.rowid` before using this pattern.
Inspection of schema shows no FK from `commodity_prices_history` to `commodity_prices`
— safe.

**R-5 — shipping index Yahoo Finance geo-access (LOW)**
`shippingIndex.ts` supports `BDI_VPS_PROXY_URL` env override for geo-block. Yahoo
Finance is reachable from France in tests. No VPS required unless geo-block observed
post-deploy.

**R-6 — DDD boundary: commodityTracker.ts imports `getDb()` directly (MEDIUM)**
`commodityTracker.ts` calls `import { getDb } from "./schema.js"` — this couples the
infrastructure adapter to the global DB singleton instead of receiving `db` as a
parameter. The `commodityTrackerRefreshJob.ts` should inject `getDb()` at the
scheduler layer and pass `db` down, consistent with the `recordJobRun(db, ...)` pattern.
If `commodityTracker.ts` already calls `getDb()` internally, the job may call it without
injection — but BA spec must note this as a code-smell to address in a future refactor
sprint (not a blocker for 1920c).

---

## 8. cronConfig.ts Additions

Four new keys to append to the `CRONS` export:

```typescript
/** vnstockFundamentalsRefresh — weekly Monday 01:00 UTC — task 1920a */
vnstockFundamentalsRefresh: Bun.env.CRON_VNSTOCK_FUNDAMENTALS  ?? '0 1 * * 1',
/** vnstockTradingStatsRefresh — daily weekdays 08:30 UTC — task 1920a */
vnstockTradingStatsRefresh: Bun.env.CRON_VNSTOCK_TRADING_STATS ?? '30 8 * * 1-5',
/** bondMaturityPoller — weekly Sunday 02:30 UTC — task 1920b */
bondMaturityPoller:         Bun.env.CRON_BOND_MATURITY_POLLER  ?? '30 2 * * 0',
/** commodityTrackerRefresh — daily 06:00 UTC (post-NY close) — task 1920c */
commodityTrackerRefresh:    Bun.env.CRON_COMMODITY_TRACKER     ?? '0 6 * * *',
/** brokerSanctionsSweep — last Fri of each month 08:00 UTC, quarter-guard in job — task 1920d */
brokerSanctionsSweep:       Bun.env.CRON_BROKER_SANCTIONS      ?? '0 8 25-31 * 5',
```

All keys follow existing `Bun.env.CRON_*` pattern in `cronConfig.ts`. Zero-side-effect
at module load time (existing rule).

---

## 9. Test Strategy (per sub-task)

| Sub-task | Test type | What to cover |
|----------|-----------|---------------|
| 1920a | Unit | `vnstockFundamentalsJob` with mock `syncVnstockData` — verify all 7 tables touched, rate-limit error per ticker does not abort batch, `isRunning` guard prevents double-fire |
| 1920a | Integration | In-memory DB: after job run, `SELECT COUNT(*) FROM vnstock_financials WHERE code='VCB'` > 0 |
| 1920b | Unit | `bondMaturityPollerJob` with mock fetcher — verify upsert called, empty-result skipped gracefully, WORK alert sent on zero rows |
| 1920c | Unit | `commodityTrackerRefreshJob` — verify both commodity + shipping calls fire, commodity_prices_history append-only, snapshot table upserted |
| 1920d | Unit | `brokerSanctionsJob` — quarter-guard skips non-quarter months, INSERT OR IGNORE fires on dedup row |

All tests follow `apps/mcp-server/src/__tests__/NNN-task-name.test.ts` naming with
in-memory DB via `setup.ts` preload.

---

## 10. Sequencing for BA

1920a and 1920c are **fully independent** (disjoint file scopes, no shared SSOT writes).
BA may spec them for parallel developer dispatch.

1920b has a possible VPS dependency — BA must include a source-reachability check as
AC-0 before dev starts.

1920d requires the schema pre-condition (UNIQUE constraint migration). BA spec must
include this as a migration AC and sequence the migration before the job registration
in the same PR.

---

*Authored: 2026-05-15 | Zone: apps/mcp-server/ (cross-service scheduler policy)*
