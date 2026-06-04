# dev-mcp-server -- Notebook

## c364 · 2026-06-04T18:50Z (DSI-S1-SLA — country key SSOT fix) — COMMITTED pending

**Task:** DSI-S1-SLA (XS, P0) — macroIndicatorSla.ts key mismatch fix.

**Root cause:** `macroIndicatorSla.ts` queried `country='VN'` at both guard sites (lines 35, 73) while the active writer (`macroIndicatorRefreshJob.ts:242`) writes `country='vietnam'` since commit 7a0adfdc (2026-05-17). 18-day dead SLA guard.

**Files changed:**
- `apps/mcp-server/src/domain/services/macroIndicatorSla.ts` — added `MACRO_COUNTRY_KEY = "vietnam"` constant; replaced both `.get("VN")` with `.get(MACRO_COUNTRY_KEY)`
- `apps/mcp-server/src/interface/mcp/server.ts` — lines 1435+1520 push-gso/push-te defaults changed from `"VN"` to `"vietnam"` (with DSI-S1-SLA comment)
- `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts` — `@deprecated` comment added above line 266 (`country='VN'` dead-code write)
- `apps/mcp-server/src/__tests__/DSI-1-SLA-country-key.test.ts` — 6 tests (AC-SLA-1a/b/c, AC-SLA-2a/b, AC-SLA-3); 6 pass / 0 fail, tsc clean

**DEPLOY GATE (FR-SLA-4):** vps-scripts `fetch-gso.sh` and `fetch-tradingeconomics.sh` both set `COUNTRY="VN"` explicitly (line 11 each) — they will bypass the server.ts default fix and continue writing `country='VN'` rows. VPS scripts must also update `COUNTRY="vietnam"` before this deploy goes live. Do NOT deploy server.ts change without coordinating with ops on VPS script update.

**AC-SLA-3 verified:** zero `.get("VN")` in macroIndicatorSla.ts; `MACRO_COUNTRY_KEY` appears 3× (declaration + 2 query sites).

**Next:** DSI-S1-MACRO (P0, M) — per-field is_estimate on carry/yield; true-source fetched_at. Owner: dev-mcp-server.

---

## c363 · 2026-06-04T14:40Z (FIX-G AGM plan pull-ingest + get_agm_plan MCP tool) — COMMITTED ffa24c63

**Task:** RAPID-DATA-LAYER FIX-G — pull-based AGM plan ingest + MCP tool get_agm_plan (#162).

**What shipped:**
- New tables: agm_plan UNIQUE(stock_code, ptid, year) + agm_actuals UNIQUE(stock_code, year, report_term_id, report_norm_id). Both in schema.ts initDatabase via initAgmPlanTables.
- agmPlanFetcher.ts: VPS GET /proxy/agm-plan?batch=T1,..., X-API-Key auth, chunked (10/chunk to stay under 30-ticker VPS limit + within 120s timeout).
- agmPlanJob.ts: daily 20:30 UTC cron (CRON_AGM_PLAN_REFRESH). Reads watchlist from stock-classification.json (not hardcoded).
- agmPlanTools.ts: get_agm_plan(ticker, year?) → planned[] + actuals[] + plan_drift_pct per metric. Honest null for banks (no revenue plan).
- registry.ts: tool #162 registered.
- cronConfig.ts + startScheduler.ts: agmPlanRefresh cron wired.

**Live verify:**
- FPT 2025: revenue planned=75400 tỷ, actual=70207.7 tỷ, drift=-6.89% ✓
- FPT 2025: PBT planned=13395 tỷ, actual=13043.6 tỷ, drift=-2.62%
- ACB: revenue.planned_ty=null, plan_drift_pct=null (bank — honest ✓)
- DB direct COUNT: agm_plan=323 rows, agm_actuals=2084 rows (33/33 tickers, NOT echo) ✓

**Gate results:** 15 pass / 0 fail (FIX-G-agm-plan.test.ts), tsc clean, tools=160 (server, +1 from pre-task 159), sched=71 (+1 agmPlanRefresh).
**Commits:** 56c7e2ad (core impl), ffa24c63 (auth+chunking fix). Container rebuilt + healthy.
**Rebuild required:** done — container live at 14:36Z.

---

## c362 · 2026-06-04T11:55Z (FIX-B root-cause fix — market_cap_bn) — COMMITTED 21838d1b

**Task:** FIX-B cycle re-open — QA live-verify failure (cycle 190): get_market_cap(FPT) null, 0 of 2856 DB rows non-null.

**Root cause (definitif):** TRADING_STATS_SCRIPT in vnstockBridge.ts had 2 compounding failures:
1. vnstock schema change (silent, ~2025+): all column keys renamed. Old: foreign_room/foreign_volume/current_holding_ratio/max_holding_ratio/avg_match_volume_2w/high_price_1y/low_price_1y/pct_high_change_1y/pct_low_change_1y — ALL MISSING. New: free_float/foreigner_percentage/maximum_foreign_percentage/average_match_volume1_month/highest_price1_year/lowest_price1_year. Prices already in VND (no *1000 needed).
2. market_cap AVAILABLE in trading_stats() directly as raw VND — ratio() call was unnecessary AND broken (VCI Company API returns no 'data' key → KeyError). `except: pass` swallowed all failures silently = recurrence vector.
3. New fix: market_cap_bn = r.get('market_cap') / 1e9; all keys corrected; pct_from_high/low computed from current_price; stderr logging on null.

**Gate results:** 17 pass / 0 fail (RAPID-B1+B2 tests), tsc clean, tools=161 (probe)/159 (server unchanged), sched=70.
**Live verify:** FPT Python probe → marketCapBn=130318.29 Bn VND; DB updated; queryMarketCap(db, 'FPT') → market_cap_billion=130318.29, fetched_at non-null. Rate-limited during full watchlist re-sync; will auto-populate at next 08:30 UTC cron.
**Commit:** 21838d1b | Container rebuilt + healthy.
**Orch-state:** FIX-B-1 → REVIEW.

---

## c361 · 2026-06-04T13:30Z (FIX-A + FIX-D verify+handoff) — CONFIRMED LIVE

**Tasks:** FIX-A (get_company_profile) + FIX-D (get_bctc_full structured_data+receivables) — RAPID-DATA-LAYER Phase 1 P1

**Situation on cycle start:** Both FIX-A and FIX-D already shipped in prior Phase 2 session (commits 7a44a291 + 0e8c2be0, Phase 2 verdict cc48d319). PM re-dispatched as Phase 1 P1 in 95448e32. Work was complete — this cycle confirmed, verified live, updated handoffs, and updated orch-state head→review.

**FIX-A confirmation:**
- `companyProfileTools.ts` complete + registered as #150 in registry.ts
- 8 tests pass (RAPID-A-get-company-profile-tool.test.ts)
- Live: `get_company_profile(FPT)` → 10 shareholders, 17 officers, free_float=68.23% — raw confirmed
- Handoff [Developer] section appended

**FIX-D confirmation:**
- `bctcFullTools.ts` structured_data block at L1094+ complete
- FIX-D suite: 6 tests pass (240-bctc-full.test.ts --test-name-pattern FIX-D)
- Live: `get_bctc_full(FPT)` → 2 content items, structured_data.roe=6.17 (number), net_revenue=12479997 (number)
- receivables=null (honest — no period match in vnstock_balance_sheet for FPT Q1-2026)
- pe/pb null (expected — FIX-B data refresh pending FU-FIXB-COLUMNKEY-VERIFY)
- Handoff [Developer] section appended

**Gate results:** tsc clean, 8+6 pass / 0 fail, live server /health toolCount=159 (FIX-A #150 + FIX-D in get_bctc_full already deployed).

**Orch-state:** head.status=review, next_agent=qa

---

## c360 · 2026-06-04T10:30Z (FIX-C + FIX-E) — COMMITTED bf9b3105

**Tasks:** FIX-C (get_bctc_series, size M) + FIX-E (price-history 730d + JSON array, size S)

**FIX-C:** New `get_bctc_series{code, fields[], periods}` tool. DONE-only gate (refine_status='DONE'). Sparse-history honest (no padding). 10 allowed fields. Registered as tool #151.
- New file: bctcSeriesTools.ts; barrel + registry updated.
- 8 new tests: DONE gate excludes PENDING/PARTIAL, sparse honesty, shape, null/honest-absent, empty result, limit, JSON output, all fields round-trip.

**FIX-E:** Widened Zod `.max(730)` + `Math.min(...,730)` in priceHistoryTools.ts. Added `content[1]` JSON array `{code,date,close,volume}` (non-breaking). Fixed pre-existing 178 test bug: `actionCode` param renamed to `code` (tool param name).
- 6 new tests: text regression, days=365 accepted, JSON shape, honest-absent empty, days=730 max, numeric values.

**Gate results:** tsc clean (EXIT 0), 38 pass / 0 fail (4 files: FIX-C × 8, FIX-E × 6, 178 × 7, 240 × 17), tools=161 (+1 get_bctc_series), sched=69 (unchanged). Fence: bites exit 1 on deliberate domain→infra import, passes on new files (exit 0). commit-mutex: gateway unavailable → proceeded solo (single agent confirmed, no race).

**Honest-absent:** `pe`, `pb`, `roe`, `debt_to_equity` return null when DB null — not fabricated.

---

## Working Memory

### Baselines (c360)
- tool=161, sched=69 | ops_rebuild_required: true (rebuild to activate new tools)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
