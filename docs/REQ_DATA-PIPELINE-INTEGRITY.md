<!-- size-justification: 4 root-caused bugs, multi-zone split, per-bug DDD layer mapping, acceptance criteria, cross-zone coupling analysis — all are specification content required for architect + dev -->

# REQ — Sprint DATA-PIPELINE-INTEGRITY

**Author:** BA | **Date:** 2026-05-30 | **Status:** READY — zero PO blockers
**Spec size:** ~130L — 4 bugs, multi-zone, bounded scope

---

## Scope

4 root-caused CODE bugs (ops-diagnosed, VPS infra confirmed healthy). No re-diagnosis.
Zone split:
- **Zone A — `apps/macro-indicators`:** DPI-1, DPI-2, DPI-3 (Go service, port 5004)
- **Zone B — `apps/mcp-server`:** DPI-4 (TypeScript/Bun, SQLite)
No cross-zone coupling between the four bugs (confirmed below). Parallel dev execution permitted.

---

## DPI-1 — FX Dual-Path Divergence

**Zone:** `apps/macro-indicators` | **DDD Layer:** Infrastructure (data-source adapter wiring)

### Root Cause (code-confirmed)

Two independent read paths produce different USDVND values:

1. `get_macro_snapshot` → HTTP POST to macro-indicators `/snapshot` → `usecases.go Execute()` → `SQLiteCommodityRepository.FetchPrices()` reads `commodity_prices WHERE source='yahoo'` (Yahoo Finance; updated daily 06:00 UTC by `commodityTrackerRefreshJob`). Current value: **26255**.

2. `get_cycle_bootstrap` → `marketContextBuilder.ts buildMacroSection()` → direct SQLite read of `sbv_rates.usd_vnd_official` (SBV Vietcombank XML; pushed every 4h by `sbvRatesRefresh` cron). Current value: **26115**.

These two surfaces never read the same table. There is no shared canonical FX store.

### Requirements

**FR-DPI-1a — Canonical FX source selection:**
Pick ONE authoritative USDVND source for the `apps/macro-indicators` snapshot path. Per `feedback_data_sources_vn`: SBV official = policy-correct VN rate. Recommended: extend `SQLiteCommodityRepository` (or add a new `SBVRateSQLiteAdapter`) to read `sbv_rates.usd_vnd_official` for the USDVND symbol, making it consistent with the `get_cycle_bootstrap` path. The Yahoo Finance USDVND (offshore/global feed) should be demoted or tagged.

**FR-DPI-1b — Source attribution (EITHER canonical-source OR dual-tagged):**
Two acceptable fixes:
- Option A (canonical): `get_macro_snapshot` USDVND reads SBV official rate from `sbv_rates`. Both surfaces return ~26115. No attribution label needed.
- Option B (dual-tagged): `get_macro_snapshot` response carries explicit `usdVndSource: "yahoo"` and `get_cycle_bootstrap` context carries `usdVndSource: "sbv_official"`. No silent divergence.

Architect picks Option A or B and documents the rationale.

**FR-DPI-1c — No new network calls from macro-indicators service.** The SBV data already exists in `sbv_rates` (pushed by mcp-server's `sbvRatesRefresh`). The fix is a DB read, not a new HTTP adapter.

**NFR-DPI-1:** The `SBVRatePort` in `apps/macro-indicators/pkg/domain/ports.go` has a `GetRate(ctx, from, to)` interface already wired in `usecases.go` but its `SBVRateRepository` is fixture-only (`fixtures["USD/VND"]=24500`). The fix upgrades this to a live DB reader — consistent with the `SQLiteCommodityRepository` pattern (`DB_PATH` env var, read-only open, staleness guard).

**Edge case:** `sbv_rates` table may be absent or empty (older schema). Apply same safe-degradation pattern as `SQLiteCommodityRepository`: return 0, let `useCase` fall back to fixture — log a warning, do NOT error.

**AC-DPI-1:**
- `get_macro_snapshot` USDVND and `get_cycle_bootstrap` USDVND block show the same value within 1 VND (same source) or each is explicitly source-tagged.
- No silent divergence. Verified by live re-probe of both tools after rebuild.

---

## DPI-2 — Carry/Yield Regime STALE

**Zone:** `apps/macro-indicators` | **DDD Layer:** Application (use-case static constant bug)

### Root Cause (code-confirmed)

`usecases.go` L45: `const fixtureComputedAt = "2026-05-23T00:00:00Z"` — hardcoded string constant.

`Execute()` L108-116 passes this constant directly into both `CarryTrade.ComputedAt` and `YieldSpread.ComputedAt` fields on every call. There is no scheduler, no recompute job, no `time.Now()` — just a frozen constant from the initial fixture setup. The value never changes regardless of how many times the job runs.

### Requirements

**FR-DPI-2a — Replace `fixtureComputedAt` constant with `time.Now().UTC().Format(time.RFC3339)` at call time.**
The carry/yield regime is computed on every `Execute()` call using real (live or fixture) input values. The `computedAt` must reflect WHEN the computation actually ran, not a frozen sandbox constant.

**FR-DPI-2b — The `ComputedAt` field in `CarryTrade` and `YieldSpread` primitives receives a FRESH timestamp on every `Execute()` call.** The primitive types accept it as a string parameter — no primitive-layer change required.

**FR-DPI-2c — Preserve R-1 determinism in tests.** Existing tests that assert on `computedAt = "2026-05-23T00:00:00Z"` must be updated to accept any valid RFC3339 timestamp (not a fixed string). Tests must NOT hardcode the value.

**NFR-DPI-2:** This is a 2-line change in `usecases.go`. No new infrastructure, no scheduler, no new job. Carry and yield inputs (`VNDDepositRate`, `FedFundsRate`, `EarningYield`) remain fixture values — that is acceptable. Only `computedAt` must be fresh.

**Edge case:** If future design wants to cache regime computations, the caching logic must update `computedAt` on every cache refresh cycle. BA defers this to architect if caching is introduced.

**AC-DPI-2:**
- `get_macro_snapshot` response: `signals.carry.computedAt` and `signals.yield.computedAt` reflect today's date (2026-05-30 or later).
- Values are NOT "2026-05-23T00:00:00Z".
- Verified by live re-probe after rebuild.

---

## DPI-3 — Brent/Gold Delta +0.00%

**Zone:** `apps/macro-indicators` (surface) + `apps/mcp-server` (data seam) | **DDD Layer:** Infrastructure (DB write seam in mcp-server; display seam in macro-indicators)

### Root Cause (code-confirmed)

`storeCommoditySnapshot()` in `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts` L410-415:

```sql
INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
VALUES (?, ?, 0, 0, 0, ?)
ON CONFLICT(code) DO UPDATE SET
  price      = excluded.price,
  updated_at = excluded.updated_at
```

`change_amt=0` and `change_pct=0` are **hardcoded literals**. The ON CONFLICT branch updates only `price` and `updated_at` — `change_pct` and `change_amt` are never modified. No prev-close is read; no delta is computed. Every upsert writes zero.

The `commodity_prices_history` table holds the historical series (one row per hour), which provides the prev-close data needed — it is NOT used by this write path.

### Requirements

**FR-DPI-3a — Compute delta before upsert in `storeCommoditySnapshot()`:**
Before upserting BRENT and GOLD into `market_prices`, read the previous close from `commodity_prices_history` (the most recent row for the same source with a `fetched_at` older than the current snapshot's `fetched_at`, or the prior calendar-day row). Compute `change_amt = current - prev_close` and `change_pct = (change_amt / prev_close) * 100`.

**FR-DPI-3b — Update ON CONFLICT branch to also set `change_amt` and `change_pct`:**
```sql
ON CONFLICT(code) DO UPDATE SET
  price      = excluded.price,
  change_amt = excluded.change_amt,
  change_pct = excluded.change_pct,
  updated_at = excluded.updated_at
```

**FR-DPI-3c — Prev-close unavailable: tolerate gracefully.** If `commodity_prices_history` has no prior row (first run, history empty), write `change_amt=0, change_pct=0` as before — no error, no fallback to news-mined values. Do NOT use `tracked_indicators` as a prev-close source (different cadence, news-mined values known to drift $3+).

**FR-DPI-3d — Apply to both BRENT and GOLD.** USDVND change_pct is deliberately excluded from this fix (USDVND change handling is separate from DPI-1 fix path).

**NFR-DPI-3:** The fix is confined to `yahooFinance.ts storeCommoditySnapshot()`. No schema change needed (`change_amt` and `change_pct` columns already exist in `market_prices`). Architect confirms the history-read query is safe inside the existing transaction.

**Edge case:** If `commodity_prices_history` has multiple rows within the same hour (dedup guard in the append query prevents this per Sprint 052 — but confirm in tests that the dedup holds). Use `ORDER BY fetched_at DESC OFFSET 1 LIMIT 1` pattern (skip the current hour's row) to find prev-close.

**Architect-deferred:** exact SQL for prev-close lookup inside the transaction — the pattern above is the intent; architect confirms the sub-query form and whether a separate pre-transaction read is cleaner.

**AC-DPI-3:**
- `get_macro_snapshot` shows non-zero `change_pct` for BRENT and GOLD after rebuild.
- Values are directionally plausible (not frozen +0.00%).
- Verified by live re-probe. If commodity_prices_history has <2 rows on rebuild day, zero delta on first run is acceptable — next daily tick must show a non-zero delta.

**Zone clarification:** The fix lives in `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts`. The surface where the bug is visible is `get_macro_snapshot` (macro-indicators service). There is NO cross-service API change — macro-indicators reads from the `market_prices` table which mcp-server writes. This means dev-mcp-server owns the fix; the macro-indicators container does not need to change for DPI-3. However, since all 3 macro bugs need a macro-indicators REBUILD for DPI-1 and DPI-2, ops must also rebuild mcp-server for DPI-3 + DPI-4.

---

## DPI-4 — Foreign-Flow Data Loss

**Zone:** `apps/mcp-server` | **DDD Layer:** Infrastructure (DB write strategy)

### Root Cause (code-confirmed)

`apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` L31-36:

```sql
UPDATE daily_ohlcv
   SET foreign_buy_vol  = ?,
       foreign_sell_vol = ?,
       foreign_net_vol  = ?,
       put_through_vol  = ?
 WHERE code = ? AND date = ?
```

UPDATE-only strategy. `daily_ohlcv (code, date)` rows are created by the OHLCV price push pipeline. Foreign-flow data arrives from VPS via a separate push (102 items, HTTP 200 confirmed). When foreign-flow arrives before the OHLCV row exists for that `(code, date)`, the UPDATE matches 0 rows and silently returns `changes=0`. No error, no log, no retry. Data is lost.

### Requirements

**FR-DPI-4a — Replace UPDATE-only with INSERT…ON CONFLICT (UPSERT) strategy:**
```sql
INSERT INTO daily_ohlcv (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(code, date) DO UPDATE SET
  foreign_buy_vol  = excluded.foreign_buy_vol,
  foreign_sell_vol = excluded.foreign_sell_vol,
  foreign_net_vol  = excluded.foreign_net_vol,
  put_through_vol  = excluded.put_through_vol
```
This creates a stub row with NULL OHLCV columns if the price row does not yet exist, and overwrites foreign-flow columns if it does.

**FR-DPI-4b — Null-safety for OHLCV stub rows.** All existing OHLCV readers (`get_market_snapshot`, analysis chains) must tolerate NULL in `open`, `high`, `low`, `close`, `volume` — confirm this is already the case (schema uses REAL, no NOT NULL constraint on OHLCV columns). BA believes this is safe based on the current schema (columns added via ALTER TABLE, nullable by default). Architect confirms.

**FR-DPI-4c — `changes` return value must reflect INSERTED rows.** The current function returns `{ changes: totalChanges }` from `stmt.run(...)`. With INSERT…ON CONFLICT, `result.changes` correctly reflects 1 for every inserted or updated row. No additional tracking needed.

**FR-DPI-4d — No doc-comment lie.** The module-level comment and the function JSDoc currently say "UPDATE-only strategy: no stub rows are inserted when there is no matching OHLCV row. Rows without a matching (code, date) primary key are silently skipped." These must be updated to document the new UPSERT behavior.

**NFR-DPI-4:** Schema is unchanged — no migration needed. `daily_ohlcv (code, date)` is the primary key per `PRAGMA table_info` pattern already used in the schema migration code. The fix is a single SQL statement replacement in `ohlcvForeignFlowStore.ts`.

**Edge case:** Race condition — OHLCV arrives and upserts the stub row after foreign-flow already inserted it. The OHLCV path (`daily_ohlcv` price writer) must also be UPSERT-safe or the stub row left by DPI-4 fix must not interfere with the price write. BA flags this for architect: verify the OHLCV write path also uses INSERT OR REPLACE / ON CONFLICT so it overwrites the stub row cleanly.

**AC-DPI-4:**
- `get_foreign_flow(HPG)` returns populated data (real buy/sell/net values) after rebuild.
- Direct DB count in-container: `SELECT COUNT(*) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL AND foreign_buy_vol > 0` returns > 0.
- VPS push echo (HTTP 200) is NOT sufficient verification per `project_mcp_server_write_wedge`.

---

## Non-Functional Requirements (all bugs)

**NFR-REBUILD:** Both containers must be rebuilt (`docker compose build` + `up -d --no-deps --force-recreate`) after code changes per `feedback_rebuild_after_dev_change`. Restart relaunches stale image. NOT sufficient.
- DPI-1 / DPI-2 / DPI-3 surface fix: macro-indicators rebuild required.
- DPI-3 data seam fix + DPI-4 fix: mcp-server rebuild required.
- Ops will rebuild BOTH containers (safest; avoids sequence-dependency ambiguity).

**NFR-VERIFY:** All four surfaces verified by agent calling live MCP tools post-rebuild. NOT user sign-off per `feedback_trust_verification_is_system_job`.

**NFR-NO-FALSE-GREEN:** Unit tests passing ≠ done. DoD is the live tool returning correct data per `feedback_fence_false_green`.

**NFR-COMMIT:** Explicit-file staging; all on `main`; main terminal commits; subagents leave files unstaged.

---

## Cross-Zone Coupling Analysis

| Bug | Fix Zone | Reads data from | Produces data for | Cross-zone dep? |
|-----|----------|-----------------|-------------------|-----------------|
| DPI-1 | macro-indicators | `sbv_rates` (written by mcp-server cron) | `get_macro_snapshot` response | Read-only dep; no write-back. |
| DPI-2 | macro-indicators | time.Now() — no DB read | `get_macro_snapshot` response | None. |
| DPI-3 | mcp-server (yahooFinance.ts) | `commodity_prices_history` (same DB) | `market_prices.change_pct` read by macro-indicators | Write seam in mcp-server; macro-indicators reads the result. Rebuild order: mcp-server first (writes fresh change_pct), then macro-indicators reads it. |
| DPI-4 | mcp-server | `daily_ohlcv` table | `get_foreign_flow` | None — isolated to mcp-server. |

**No hard cross-zone blocking.** DPI-3 has a soft ordering preference (mcp-server rebuilt first so fresh change_pct rows are available when macro-indicators comes up), but since both containers will be rebuilt, ops should rebuild mcp-server first, then macro-indicators.

**Confirmed parallel dev:** dev-macro-indicators (DPI-1 + DPI-2) and dev-mcp-server (DPI-3 + DPI-4) can work simultaneously without code collision.

---

## Zone Split Confirmation

| Bug | Developer Zone | Files |
|-----|---------------|-------|
| DPI-1 | dev-macro-indicators | `apps/macro-indicators/pkg/infrastructure/repositories.go` (new `SBVRateSQLiteAdapter`) + `apps/macro-indicators/cmd/server/main.go` (DI wiring) |
| DPI-2 | dev-macro-indicators | `apps/macro-indicators/pkg/application/usecases.go` L45 + associated tests |
| DPI-3 | dev-mcp-server | `apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts` (storeCommoditySnapshot) |
| DPI-4 | dev-mcp-server | `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` |

**Split: CONFIRMED.** Bugs 1-3 surface fix zone = `apps/macro-indicators`; DPI-3 data seam = `apps/mcp-server`. Bug 4 = `apps/mcp-server`.

---

## Blockers

None. All four root causes are code-confirmed. No PO questions outstanding.

---

## DoD (per `docs/SPRINT_GOAL.md` Success Metric)

1. **FX (DPI-1):** `get_macro_snapshot` USDVND == `get_cycle_bootstrap` USDVND block (same value or explicit source tags).
2. **Carry/Yield (DPI-2):** `get_macro_snapshot` `signals.carry.computedAt` and `signals.yield.computedAt` show today's date or newer.
3. **Brent/Gold (DPI-3):** `get_macro_snapshot` BRENT and GOLD `change_pct` non-zero and directionally plausible.
4. **Foreign-flow (DPI-4):** `get_foreign_flow(HPG)` returns populated data; in-container DB count > 0.

All four verified by agents calling live tools post-rebuild. NOT user sign-off.

---

## RETURN

```
DONE: BA spec complete — docs/REQ_DATA-PIPELINE-INTEGRITY.md written; 4 bugs decomposed; zone split confirmed.
NEXT: architect | produce technical design for DPI-1..4 (FX canonical-source policy; carry/yield constant fix; delta-pipeline prev-close SQL; foreign-flow UPSERT contract + OHLCV-stub race check). Brief only → docs/architecture-briefs/.
HANDOFF: docs/REQ_DATA-PIPELINE-INTEGRITY.md
PIPELINE: continue
```

---

## Follow-ups (post-sign-off, zone `apps/mcp-server`)

**FU-A — fresh EFFR + fail-loud staleness.** ✅ DONE `ff9a64ce` — PO-SIGNOFF 2026-05-30 (DPI-FU-EXIT). Independent live `get_macro_snapshot`: `carry.fedFundsRate=3.62` LIVE (not fixture 5.33); `carry.computedAt=2026-05-30T09:20:43Z` fresh; regime flipped FII_OUTFLOW_RISK→NEUTRAL (−0.63→+1.08); carry math 4.70−3.62=1.08 ✓. Forward-dependency: freshness requires `macroIndicatorRefreshJob` (19:13 UTC daily) firing + FRED (`fred.stlouisfed.org`) reachable from container; new `checkAndAlertEffrStaleness()` guard ALERTS WORK on 96h re-staleness (no silent degrade). Container outbound connectivity to FRED is a separate ops concern if it re-staleness.

**FU-B — restore `market_earning_yield` (reachable-count denominator).** ✅ DONE `ff9a64ce` — PO-SIGNOFF 2026-05-30. Live `yield.earningYield=6.83` LIVE (not fixture 8.2); 1 row in `tracked_indicators`; yield math 6.83−4.70=2.13 ✓; label CHEAP. DPI-2b now serves **2 of 3 inputs LIVE** (fedFunds + earningYield); deposit is the documented-degraded exception (see FU-D).

**FU-C — DPI-4 test-debt.** 🔄 OPEN, MEDIUM. dev-mcp-server: retro-own ops commit `36a91a59` (foreign-flow stub-row NOT NULL fix) under proper dev authorship + add `writeForeignFlowToOhlcv` real-schema integration test (no creds, fakes only).

**FU-D — SBV deposit-rate zero-overwrite (data-integrity).** 🔄 OPEN, MEDIUM, NEW (qa-found, PO-confirmed live 2026-05-30). The SBV cron persisted `max_deposit_rate_pct=0` at 2026-05-30T08:36Z, clobbering the live 5.0 row from 2026-05-29T23:15Z. The DPI-2b staleness guard then safe-degrades to fixture 4.7 — a sane value, but it MASKS a silent zero-write (a fetcher overwriting good data with 0). Confirmed live: `signals.carry.vndDepositRate` and `signals.yield.depositRate` both = 4.7 (fixture) instead of 5.0 (live). **Fix:** SBV fetcher must REJECT/SKIP zero-value writes — never overwrite a good prior row with 0; only persist a positive deposit-rate. Pre-existing — NOT caused by `ff9a64ce`. dev-mcp-server zone.

**FU-MON — DPI-3/DPI-4 Monday live-probe.** ⏳ TIME-CRITICAL Monday: re-probe Brent/Gold `change_pct` post-06:00Z + `get_foreign_flow(HPG)` post-open → flip DPI-3/DPI-4 DONE or REOPEN.
