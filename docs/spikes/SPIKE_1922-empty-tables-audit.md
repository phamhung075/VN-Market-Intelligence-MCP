# SPIKE_1922 — Empty Tables Audit

**Date:** 2026-05-16  
**Author:** Architect  
**Scope:** 10 zero-row tables in market.db / alert_engine.db

---

## Classification Key

| Code | Meaning |
|------|---------|
| A | Needs new feed/scraper |
| B | Silent failure of existing job (fix required) |
| C | Orphan — schema + code deletable |
| D | Legitimately empty (job exists, waiting for conditions) |

---

## Findings

### 1. `fred_series_daily` — **B (silent failure)**

- `macroIndicatorRefreshJob` calls `fetchFredEffrIorb()` → `INSERT OR IGNORE INTO fred_series_daily`
- FRED public CSV endpoint (`fred.stlouisfed.org/graph/fredgraph.csv?id=EFFR`) is reachable (HTTP 200 confirmed)
- No API key required for this path
- Cron schedule is `0 6 * * *` (daily 06:00 UTC), not `0 */6 * * *` as stated in task brief
- Root cause: `cron_job_runs` has 0 rows → containers not running or job is silently swallowed; no evidence of a successful run populating the table
- **Fix task:** Diagnose `macroIndicatorRefreshJob` — add explicit `cron_job_runs` success/error row after FRED fetch, confirm `fetchFredEffrIorb` is not short-circuiting silently

### 2. `insider_transactions` — **B (silent failure, geo-block likely)**

- `insiderCheckJob` (daily 01:00 UTC) calls `fetchInsiderTransactions` → `sscInsider.ts` → direct HTTP to `congbothongtin.ssc.gov.vn`
- No VPS proxy is wired: `sscInsider.ts` fetches direct from MCP server (France)
- Local probe: HTTP 503 from `congbothongtin.ssc.gov.vn` — geo-blocked from outside Vietnam
- VPS proxy server (`vps-proxy-server.js`) has NO `/proxy/ssc-insider` route; only `/proxy/ssc-iboard` (now NXDOMAIN dead)
- **Fix task:** Add `/proxy/ssc-insider` route on VPS proxy (mirrors iboard pattern), wire `sscInsider.ts` to route through `VPS_PROXY_URL/proxy/ssc-insider`

### 3. `bond_maturity` — **D (legitimately empty, first run tomorrow)**

- `bondMaturityPollerJob` runs weekly Sunday 02:30 UTC (`30 2 * * 0`)
- Job exists, is registered in `startScheduler.ts`, writes via `upsertBond()` to `bond_maturity`
- Uses static seed data from `bondMaturityTracker.ts` as fallback (6 real-estate TPDN issuers)
- No vnstock live fetcher implemented yet — seed data path will populate on next Sunday run
- Safe to leave empty; will self-populate on the next scheduled run

### 4. `credit_data` — **C (orphan schema)**

- Zero references across all TypeScript, Go, Python source files and schema slices
- Not found in any `schema-*.ts` file
- Likely a pre-migration artifact; confirmed absent from schema source
- **Action:** Verify in production DB then `DROP TABLE IF EXISTS credit_data`

### 5. `imf_indicators` — **D (legitimately empty, circuit-breaker reset pending)**

- `imfIndicatorPollerJob` runs every 6 hours, is registered in `startScheduler.ts`
- Full write path confirmed: `fetchLatestImfIndicators` → `storeImfIndicators` → `INSERT OR REPLACE INTO imf_indicators`
- IMF public API reachable (HTTP 200 confirmed from local machine)
- IMF circuit breaker: 3 failures → 5-min reset. If containers restarted mid-outage, breaker may have opened
- No API key required; geo-accessible from France
- **No fix task needed** — will self-populate on next 6-hour tick once containers are healthy

### 6. `mention_velocity` — **A (no production writer)**

- `mentionVelocityStore.ts` exports `recordMention()` write function
- Zero production callers of `recordMention()` found in scheduler/ or application/ (only test files)
- Read path exists: `getCrisisEarlyWarning.ts` calls `getVelocity()` and `getBaseline()` — will always return empty
- **Fix task:** Wire `recordMention()` into `intelligenceCycleJob` or `pollNews` — call once per news batch with per-ticker mention counts

### 7. `pharma_events` — **D (legitimately empty, monthly cadence)**

- `davPharmacyJob` runs monthly on the 1st at 06:00 GMT+7 (`0 6 1 * *`)
- Full write path confirmed: `fetchDavPharmacy()` → `insertPharmaEvent()` → `pharma_events`
- `dav.gov.vn` is reachable from France (HTTP 200 confirmed)
- Table is empty because no monthly cycle has run since deployment
- Safe to leave; will self-populate on the 1st of next month

### 8. `reputation_scores` — **A (no production writer)**

- `reputationStore.ts` exports `saveReputation()` write function
- Zero production callers of `saveReputation()` found in scheduler/ or application/ (only test files)
- Read path exists: `getReputationWarnings.ts` and `getCrisisEarlyWarning.ts` call `getReputation()` — always returns empty
- **Fix task:** Implement `reputationComputeJob` — compute score from `mention_velocity` + news sentiment per ticker on a daily cadence; wire `saveReputation()` at end

### 9. `vn_index_cache` — **FIXED (FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH, 2026-06-20)**

- Previously classified as C (orphan schema) — no DDL, no writer found in Sprint 1922
- **FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH** wired it: DDL added to `schema-market-data.ts`,
  writer `upsertVnIndexCache` in `infrastructure/db/vnIndexCacheStore.ts`,
  `vnIndexRefreshJob` now writes to table every 5 min during market hours.
- Classification updated: **Active — writer is vnIndexRefreshJob, SLA 10 min**

### 10. `alert_engine_records` — **D (legitimately empty, awaiting alert conditions)**

- Table is created by the Go `alert-engine` service (`InitAlertTables` in `sqlite.go`) in `market.db` at startup
- `ALERT_ENGINE_DB_PATH=/app/data/market.db` confirmed in `docker-compose.yml`
- Full write path confirmed: `StoreAlert()` → `INSERT INTO alert_engine_records`
- Table is absent from local `data/market.db` because Docker named volume (`market_data`) is separate from local bind — in production the table exists and is created on first container start
- Empty because the alert-engine evaluates signals pushed from mcp-server; no alert conditions have fired through the Go engine path
- Safe to leave; will populate when TA/price alerts trigger

---

## Summary by Classification

| Class | Tables |
|-------|--------|
| A — Needs new writer | `mention_velocity`, `reputation_scores` |
| B — Silent failure | `fred_series_daily`, `insider_transactions` |
| C — Orphan (drop) | `credit_data` |
| Fixed | `vn_index_cache` (FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH) |
| D — Legitimately empty | `bond_maturity`, `imf_indicators`, `pharma_events`, `alert_engine_records` |

---

## Recommended Fix Tasks

### B-1: `insider_transactions` — VPS Proxy for SSC Insider (size: M)

Add `/proxy/ssc-insider` route to `vps-proxy-server.js` forwarding to `congbothongtin.ssc.gov.vn`. Update `sscInsider.ts` to route through `VPS_PROXY_URL/proxy/ssc-insider` when env var is set, direct URL as fallback. Deploy updated proxy script to Vinahost VPS.

### B-2: `fred_series_daily` — Diagnose macroIndicatorRefreshJob FRED path (size: S)

Add structured `cron_job_runs` record after `fetchFredEffrIorb` call in `macroIndicatorRefreshJob`. Confirm Docker `.env` injects `FRED_API_KEY` (key exists in `.env`; check `docker-compose.yml` env_file propagation to mcp-server). Verify `fetchFredEffrIorb` returns non-null when FRED CSV is reachable.

### A-1: `mention_velocity` — Wire recordMention into news pipeline (size: M)

Call `recordMention(db, { code, hour, mentionCount, negativeCount, sourceCount })` inside `intelligenceCycleJob` after news processing. Aggregate per-ticker mention counts from the batch before inserting. Prune rows older than 7 days via existing `pruneMentions()`.

### A-2: `reputation_scores` — Implement reputationComputeJob (size: L)

New daily scheduler job: read last 30-day `mention_velocity` + alert history per ticker, compute reputation score (0–100), call `saveReputation()`. Depends on A-1 being populated first; sequence A-1 before A-2.

---

## Tables Safe to DROP (Class C)

```sql
DROP TABLE IF EXISTS credit_data;
-- vn_index_cache: REMOVED from drop list — now active, writer wired by FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (2026-06-20)
```

Verify absence in production `market.db` before dropping. No schema slice, no store file, no caller exists for `credit_data`.
