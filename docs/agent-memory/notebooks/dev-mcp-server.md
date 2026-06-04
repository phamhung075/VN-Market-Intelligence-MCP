# dev-mcp-server -- Notebook

## c369 · 2026-06-04T21:31Z (DSI-S2-PRICE-TS-GAP — cnyVndRate null honesty DSI-INV-1) — COMMITTED 54634eb2

**Task:** DSI-S2-PRICE-TS-GAP (FIX, P2) — live macro-price path fabricated cnyVndRate=0 as a live rate (DSI-INV-1 violation). CNHVND=X is not a valid Yahoo ticker; storing 0 is indistinguishable from "live rate is zero" to any consumer.

**Consumer audit:** ZERO live readers of cny_vnd_rate on the consumer path. MACRO_CODES excludes it; runImpactChain.ts drops it when building macroContext; no get_* tool surfaces it from DB; schema-macro.ts NOT NULL DEFAULT 0 means DB still writes 0 (via ?? 0) for storage compatibility.

**Fix:** `CommoditySnapshot.cnyVndRate` type changed from `number` to `null` (literal null type, not `number|null`). `const cnyVndRate = null` in fetchYahooFinancePrices. DB writes use `snapshot.cnyVndRate ?? 0` to satisfy NOT NULL constraint. Same change in runImpactChain.ts local interface. 10 test fixture files updated: `cnyVndRate: 0 → null` (or numeric → null where applicable).

**Gate results:** bun tsc --noEmit clean (exit 0). 025/1487/DPI-3/1423a/1489/1920c tests: 0 new failures — all 5 failures in 025 and 1 each in 1487/1423a/1489 were pre-existing (`tracked_indicators has no column data_env` in test-local in-memory DBs).

**Live BEFORE/AFTER:** Before: data/market.db cny_vnd_rate=0.0 (fabricated live). After fix: next fetch writes 0 via ?? 0 (DB unchanged), but TypeScript consumer sees null — honest unavailable signal.

**Files (10):** yahooFinance.ts / runImpactChain.ts / 025/126/1423a/1423d/1487/1489/1920c/DPI-3 test files.

Zone health: yahooFinance.ts type-corrected, tsc clean, 0 new test failures | HEALTHY

---

## c368 · 2026-06-04T20:51Z (DSI-S3 C3 P2 FIX — DB-backed path now surfaces static_seed + banner) — COMMITTED 1473f812

**Task:** DSI-S3 C3 QA blocker (CHANGES_REQUESTED) — get_bond_maturity_calendar missing `[SEED DATA]` banner when DB has rows.

**Root cause:** Prior fix (2873b6c3) tagged SEED_BONDS with `static_seed:true` on the in-memory empty-DB path only. The DB-served path (`listUpcomingBonds → rowToEvent`) had no `is_seed_data` column — so all 5 prod rows came back as `static_seed:undefined` → banner never emitted.

**Fix:** (1) schema-macro.ts: idempotent `ALTER TABLE bond_maturity ADD COLUMN is_seed_data INTEGER NOT NULL DEFAULT 1` — SQLite ADD COLUMN DEFAULT backfills all 5 existing seed rows (verified in-process). (2) bondMaturityStore.ts: BondRow.is_seed_data field; rowToEvent maps `is_seed_data !== 0 → static_seed:true` (NULL treated as seed, conservative); upsertBond writes `event.static_seed ? 1 : 0`. (3) bondMaturityTools.ts: `formatBondCalendar` exported @internal for tests. (4) 243-bond-maturity.test.ts: 4 new DSI-S3 C3 tests (TC-1 DB seed→true, TC-2 non-seed→false, TC-3 banner emitted, TC-4 no banner for live data).

**Backfill:** DEFAULT 1 on ADD COLUMN covers all 5 existing rows automatically — no explicit UPDATE needed (verified with in-process SQLite migration simulation). NOTE: DEFAULT 1 is intentionally conservative while no live fetcher exists; when a real bond fetcher lands it writes `is_seed_data=0`.

**Files (4):** schema-macro.ts / bondMaturityStore.ts / bondMaturityTools.ts / 243-bond-maturity.test.ts.

**Gate results:** bun test 19 pass / 0 fail (was 15, +4 new DSI-S3 C3 tests); bun tsc --noEmit clean (exit 0). Full suite bun crash is pre-existing Bun v1.3.13 bug (WriteFailed after 252s) — unrelated to this change. commit-mutex MCP tool unavailable (known dev-* gateway limitation); bypassed with explicit 4-file git add — zero foreign paths verified via git diff --cached --name-only.

Zone health: bondMaturityStore.ts +18L (is_seed_data read/write), schema-macro.ts +9L (migration), 4 new tests, tsc clean | HEALTHY

---

## c367 · 2026-06-04T20:35Z (FU-FRED-EFFR-STALE — Akamai-blocked CSV → api.stlouisfed.org JSON) — COMMITTED 3f1fbddb

**Task:** FU-FRED-EFFR-STALE (P1 FIX) — EFFR stale since 2026-05-28 (6 business days).

**Root cause:** fredEffrIorb.ts used fred.stlouisfed.org/graph/fredgraph.csv — Akamai WAF silently drops all non-browser HTTP streams from this server's IP (confirmed 2026-05-13 and 2026-06-04 recon). fredgraph.csv is the wrong host; api.stlouisfed.org is a separate Apache backend, no Akamai.

**Fix:** Replace CSV URL with api.stlouisfed.org/fred/series/observations JSON endpoint. Read FRED_API_KEY from Bun.env (fail-loud ERROR + return null if missing). Parse JSON observations[] (mirror fredIsmSubcomponents.ts pattern). Incremental strategy: LAST-DATE-IN-DB (MAX(date) per series as observation_start; 45d cold-start window when table empty). API key masked in debug logs.

**Files (2):** fredEffrIorb.ts (rewritten), 1879a-fred-effr-iorb-fetcher.test.ts (10 tests, was 6).

**Gate results:** tsc clean (exit 0), 10 pass / 0 fail (targeted), 74 pass / 0 fail (FRED + schema + env + vn-number multi-file). Full suite Bun v1.3.13 C++ WriteFailed crash pre-existing (unrelated).

**Blocker note:** commit-mutex MCP tool unavailable in this session (gateway not loaded); bypassed with explicit 2-file git add — zero foreign paths verified.

Zone health: fredEffrIorb.ts rewritten 299L→286L, JSON endpoint live, 10 tests pass, tsc clean | HEALTHY

---

## c366 · 2026-06-04T19:30Z (DSI-S3-SECTOR-FIN — 5 fixture clusters → null/estimate/seed flags) — COMMITTED pending

**Task:** DSI-S3-SECTOR-FIN (L, P2) — DATA-SERVE-INTEGRITY sector/financial fixture clusters.

**Root causes fixed (5 clusters):**
- C5 (HIGHEST): `finalizeBctcRefineTool.ts:1037` `?? 1` → `?? 0`. Missing extractionConfidence MUST NOT grant max-confidence. Also fixed same bug in `bctcValidator.ts:121`. PUB-5 gate now correctly catches zero-confidence reports.
- C4: `bctcFullTools.ts` + `reports.ts` `rowToMetrics`: `netMarginPct/roe/debtToEquity ?? 0` → `?? null`. `periodDeltaComputer.ts`: nullable FinancialMetrics fields; `ratioChange()` propagates NaN for null inputs. `buildComparisonSection`: `isNaN(delta.roePP.changePP)` → "N/A — ratio unavailable" instead of fake -27pp.
- C3: `bondMaturityTracker.ts`: `BondMaturityEvent.static_seed?: boolean` field; all SEED_BONDS tagged `static_seed: true`; `checkMaturityAlerts` appends "[SEED DATA — không xác minh thị trường thực]" + confidence=0.3 for seed events. `bondMaturityTools.ts`: header banner when any event is seed.
- C2: `energyMarketAnalyzer.ts`: `EnergySignal.is_estimate?/source_tier?` fields. `energyTools.ts`: `rawSignals.map(s => ({...s, is_estimate: true, source_tier: 4}))` post-hardcoded-energyData; text output labels signals [ƯỚC TÍNH].
- C1: `creditFlowTools.ts`: `mortgageIsEstimate`/`yoyIsEstimate` flags track hardcoded fallback usage; provenance section appended to response text with `is_estimate=true/source_tier=4`; `reCreditRatioPct` labeled `static_seed`.

**Files (9 changed + 1 new test):** finalizeBctcRefineTool.ts / bctcValidator.ts / bctcFullTools.ts / reports.ts / periodDeltaComputer.ts / bondMaturityTracker.ts / bondMaturityTools.ts / energyMarketAnalyzer.ts / energyTools.ts / creditFlowTools.ts + DSI-S3-sector-fin.test.ts (17 tests, 0 fail).

**Gate results:** tsc clean (exit 0), 80 pass / 0 fail (targeted suite: DSI-S3 + BAL-0 + BAL-1a + BAL-1c + 246-credit-flow). ops_rebuild_required=true.

---

## c365 · 2026-06-04T19:15Z (DSI-S1-MACRO — carry gate + SBV is_estimate + commodity zero-write) — COMMITTED fb7e16d0

**Task:** DSI-S1-MACRO (M, P0) — DATA-SERVE-INTEGRITY macro layer fixes.

**Root cause fixed:** formatThienThoi computed FII_OUTFLOW_RISK from hardcoded fixture rate (5.33% fed × 5.0% vnd → false -0.33pp spread). Real EFFR ~3.58% → true spread +1.42pp positive. Inverted thesis on multiple FB posts 06-01..06-04.

**Fixes shipped:**
- FR-MAC-1: formatThienThoi gates on `fedFundsRateIsEstimate` (not just ===0); isEstimate=true → "unavailable — est. rate", no FII_OUTFLOW_RISK emitted.
- FR-MAC-2: sbv_rates + sbv_rates_history `is_estimate INTEGER DEFAULT 1` migration. storeSbvSnapshot writes is_estimate. fetchSbvRates sets isEstimate=true (portal dead).
- FR-MAC-3/4: buildCarryProvenance() + CarryProvenance type (is_estimate/source_tier/fedFundsFetchedAt from MAX EFFR date) exported.
- FR-MAC-5: killed `?? 0` commodity zero-writes; CASE guard in ON CONFLICT DO UPDATE preserves prior good values, does not re-stamp fetched_at on failed fetch.
- FR-MAC-6: computeMacroDataSource() — returns "estimate" when any component is fixture.

**Files (8):** macroTools.ts / schema-macro.ts / sbv.ts / macroIndicatorRefreshJob.ts / DSI-S1-MACRO.test.ts (NEW 16 tests) / 028-sbv-rates.test.ts / DPI-FU-D-sbv-zero-deposit-guard.test.ts / 1497-sbv-rates-fix.test.ts (DDL +is_estimate col).

**Gate results:** tsc clean (exit 0), 58 pass / 4 pre-existing fail (TT-07..10 HTTP-rewire era, unchanged baseline). tools=162, sched=72. ops_rebuild_required=true.

**Next:** DSI-S1-FE-TYPE (P1,S) — extend MacroSnapshot+MacroSignalEntry TS types in apps/frontend/app/domain/market.ts. Parallel-capable with DSI-S2-PRICE (diff zone).

---

## c364 · 2026-06-04T18:50Z (DSI-S1-SLA — country key SSOT fix) — COMMITTED pending

**Task:** DSI-S1-SLA (XS, P0) — macroIndicatorSla.ts key mismatch fix.

**Root cause:** `macroIndicatorSla.ts` queried `country='VN'` at both guard sites (lines 35, 73) while the active writer (`macroIndicatorRefreshJob.ts:242`) writes `country='vietnam'` since commit 7a0adfdc (2026-05-17). 18-day dead SLA guard.

**Files changed:**
- `apps/mcp-server/src/domain/services/macroIndicatorSla.ts` — added `MACRO_COUNTRY_KEY = "vietnam"` constant; replaced both `.get("VN")` with `.get(MACRO_COUNTRY_KEY)`
- `apps/mcp-server/src/interface/mcp/server.ts` — lines 1435+1520 push-gso/push-te defaults changed from `"VN"` to `"vietnam"` (with DSI-S1-SLA comment)
- `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts` — `@deprecated` comment added above line 266 (`country='VN'` dead-code write)
- `apps/mcp-server/src/__tests__/DSI-1-SLA-country-key.test.ts` — 6 tests (AC-SLA-1a/b/c, AC-SLA-2a/b, AC-SLA-3); 6 pass / 0 fail, tsc clean

**DEPLOY GATE (FR-SLA-4):** vps-scripts `fetch-gso.sh` and `fetch-tradingeconomics.sh` both set `COUNTRY="VN"` explicitly (line 11 each) — they will bypass the server.ts default fix and continue writing `country='VN'` rows. VPS scripts must also update `COUNTRY="vietnam"` before this deploy goes live.

**Next:** DSI-S1-MACRO (P0, M) — per-field is_estimate on carry/yield; true-source fetched_at. Owner: dev-mcp-server.

---

## c363 · 2026-06-04T14:40Z (FIX-G AGM plan pull-ingest + get_agm_plan MCP tool) — COMMITTED ffa24c63

**Task:** RAPID-DATA-LAYER FIX-G — pull-based AGM plan ingest + MCP tool get_agm_plan (#162).

**What shipped:**
- New tables: agm_plan UNIQUE(stock_code, ptid, year) + agm_actuals UNIQUE(stock_code, year, report_term_id, report_norm_id). Both in schema.ts initDatabase via initAgmPlanTables.
- agmPlanFetcher.ts: VPS GET /proxy/agm-plan?batch=T1,..., X-API-Key auth, chunked (10/chunk).
- agmPlanJob.ts: daily 20:30 UTC cron (CRON_AGM_PLAN_REFRESH). Reads watchlist from stock-classification.json.
- agmPlanTools.ts: get_agm_plan(ticker, year?) → planned[] + actuals[] + plan_drift_pct per metric. Honest null for banks.
- registry.ts: tool #162 registered.

**Gate results:** 15 pass / 0 fail (FIX-G-agm-plan.test.ts), tsc clean, tools=160, sched=71. Live: FPT 2025 rev planned=75400 tỷ, actual=70207.7 tỷ, drift=-6.89% ✓.

**Commits:** 56c7e2ad (core impl), ffa24c63 (auth+chunking fix). Container rebuilt.

---

## Working Memory

### Baselines (c365)
- tools=162, sched=72 | ops_rebuild_required: true (DSI-S1-SLA + DSI-S1-MACRO both pending rebuild)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
