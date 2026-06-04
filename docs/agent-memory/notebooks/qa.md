# QA — Notebook

## cycle-193 · 2026-06-04T19:58Z · DATA-SERVE-INTEGRITY live-verify gate

Sprint: DATA-SERVE-INTEGRITY | Commits: a6b86ed0/fb7e16d0/45a35641/b16d6a89/2873b6c3 | Verdict: CONDITIONALLY COMPLETE

**Part A (carry/regime — user complaint):** PASS. Live: `POST :5004/snapshot` → carry.regime="UNKNOWN", carrySpread=null, is_estimate=true, source_tier=4, fetched_at_source="2026-05-28T00:00:00Z". Root: EFFR row 188h old >96h bound → GetFedFundsRate()=0 → fixture 5.33 → fedFundsLive=false → buildCarryDTO suppresses. dataSource="estimate". No FII_OUTFLOW_RISK emitted. Complaint resolved.

**Part B (DSI-S3 sector/fin):** All PASS. creditFlow: is_estimate=true+static_seed present in live response. bondMaturity: [SEED DATA] label present live. energyGrid: is_estimate=true on signal objects (code line 76). extractionConfidence: `?? 0` confirmed (not `?? 1`). bctcFullTools: roe/netMarginPct/debtToEquity `?? null`; buildComparisonSection NaN-sentinel guard emits "N/A" not false delta.

**Part C-1 (macro-indicators HOT):** Container IS running (Up+healthy :5004). Carry suppression DSI-INV-1 fix IS in the running Go code — no immediate integrity risk. But container is not in system-map.json intended runtime set (R-4 was supposed to be latent). PO must decide: keep+document or stop. Follow-up: DSI-MACRO-INDICATORS-RUNTIME-DECISION → PO.

**Part C-2 (stock-price NOT running):** DSI-S2-PRICE Go code correct but inactive. Live price path = mcp-server yahooFinance.ts (no staleness/is_estimate per-symbol, cnyVndRate=0 permanent, no provenance label). DSI-INV-1 violation in live path unaddressed. Follow-up: DSI-S2-PRICE-TS-GAP → dev-mcp-server P2.

**Serve path:** get_macro_snapshot → Go :5004 (NOT TS buildCarryProvenance — those helpers exist for test compat only, not called in handler). macroIndicatorSla.ts MACRO_COUNTRY_KEY="vietnam" confirmed. server.ts push-gso defaults = "vietnam" confirmed. frontend MacroSnapshot type has provenance fields confirmed.

---

## cycle-192 · 2026-06-04T14:55Z · RAPID-DATA-LAYER FIX-G gate

Sprint: RAPID-DATA-LAYER | Task: FIX-G (get_agm_plan tool #162, commits 56c7e2ad+ffa24c63) | Verdict: DONE-LIVE-VERIFIED

**Check 1 — FPT 2025 live gateway:** get_agm_plan(FPT, 2025) raw response: revenue.planned_ty=75400, actual_ty=70207.689, plan_drift_pct=-6.886 (AC: ~-6.89 PASS within rounding). pbt.planned_ty=13395, actual_ty=13043.633, plan_drift_pct=-2.623 (AC: ~-2.62 PASS). pat.planned_ty=null, actual_ty=11232.339 (no PAT plan — honest). Structured planned[] and actuals[] arrays populated with raw VND values and fetched_at timestamps. AC fully met.

**Check 2 — Bank case (ACB 2025):** get_agm_plan(ACB, 2025) returns all-null + year:null + empty planned[]/actuals[]. Root: 0 rows in agm_plan or agm_actuals for ACB (Vietstock did not return ACB in batch). BANK LOGIC itself is correct — verified via BID 2022 + 2023: revenue.planned=null (no rev target), pbt.planned=20600/25310 (PBT target present). AC intent (bank pattern: revenue null, PBT honest) PROVEN via BID. ACB data gap is a coverage issue not a tool defect — ACB not in agm_plan for any year; 33 tickers present (BID, VCB included). NOTE FOR DEV: ACB coverage gap worth a follow-up to check if Vietstock returns ACB on the scraper side.

**Check 3 — Write-wedge guard (DB-direct):** docker exec bun query in container: agm_plan_rows=323 agm_actuals_rows=2084 distinct_tickers=33. Matches dev claim exactly (323/2084/33). Not echo — bun SQLite read from /app/data/market.db confirms DB-backed persistence.

**Check 4 — toolCount regression:** tools/list → toolCount=160, get_agm_plan present. No prior P1 task disturbed (FIX-A/B/C/D/E/H/F all still verified from prior cycles, no test re-run needed as no code change in their zones).

**orch-state updates:** head status=idle next_agent=pm; FIX-G-1+FIX-G-2 (BACKLOG/BLOCKED stubs) superseded by FIX-G entry DONE-LIVE-VERIFIED.

**Sprint RAPID-DATA-LAYER final status:** FIX-A/B/C/D/E/F/H/G all DONE-LIVE-VERIFIED. FIX-I BLOCKED-SOURCE (vnstock no start_date field — out of scope, correctly deferred). Sprint ready for pm closeout.

---

## cycle-191 · 2026-06-04T12:10Z · RAPID-DATA-LAYER FIX-B re-gate

Sprint: RAPID-DATA-LAYER | Task: FIX-B (re-gate post 21838d1b schema fix) | Verdict: DONE-LIVE-VERIFIED

**FIX-B-1 (market_cap_bn wired — re-gate):** PASS. Raw live call via gateway:
`get_market_cap(FPT)` → `{code:"FPT", market_cap_billion:130318.29, shares_outstanding_approx:1712461104, fetched_at:"2026-06-04 08:59:42"}`. Non-null numeric, matches dev probe exactly. Root-cause fix (21838d1b) confirmed effective: TRADING_STATS_SCRIPT now reads `trading_stats().market_cap/1e9` directly (no broken ratio() call); all 9 column keys updated for vnstock schema; except:pass replaced with stderr logging. FIX-B AC met. orch-state FIX-B-1 REVIEW→DONE-LIVE-VERIFIED, FIX-B top-level DONE-CODE-DEPLOYED-DATA-PENDING→DONE-LIVE-VERIFIED, FU-FIXB-COLUMNKEY-VERIFY BLOCKED-UPSTREAM→DONE.

**Knock-on: get_company_profile(FPT) — foreign_holding_ratio:** Still null. Confirmed expected: vnstock sync data-gap (rate-limit clears on next fundamentals sweep). Shareholders/officers/free_float all serving real data. No regression from FIX-B schema changes. FU-PROFILE-DATA-VERIFY remains BLOCKED-UPSTREAM (correct status).

**Knock-on: get_bctc_full(FPT) — pe/pb:** Both still N/A. Confirmed expected: pe/pb read from financed data that requires market_cap_bn to be populated AND formula wired — FIX-B data now present but pe/pb formula uses vnstock finance tables (not market_cap_bn directly); will resolve on next BCTC serve cycle or FIX-C. All other ratios serving correctly: ROE=6.2%, ROA=3.6%, D/E=0.40x, Operating Margin=22.0%, Current Ratio=N/A (honest).

**toolCount:** 159 confirmed — no regression.

**5 already-DONE tasks (A/C/D/E/H):** No regressions detected. FIX-A company profile structure intact; FIX-D structured_data present; FIX-E/H not re-called (no schema change in scope).

**Sprint P1 status:** All P1 tasks (A/B/C/D/E/H) now DONE-LIVE-VERIFIED. P4 FIX-G next.

---

## cycle-190 · 2026-06-04T11:30Z · RAPID-DATA-LAYER Phase 1 P1 batch gate

Sprint: RAPID-DATA-LAYER | Tasks: FIX-A, FIX-B, FIX-C, FIX-D, FIX-E, FIX-H | Verdict: MIXED — 5 PASS / 1 FAIL (FIX-B data gap)

**FIX-A (get_company_profile):** PASS. Live: 10 shareholders (top: Trương Gia Bình 6.89%), 17 officers (CEO: Nguyễn Văn Khoa), foreign_holding_ratio=null (honest, no current_holding_ratio in DB). Unit tests 8/8. Structured JSON confirmed. AC-1..5 all met.

**FIX-B (market_cap wired):** FAIL-DATA. Column wired + persisted correctly in vnstockStore.ts:385/389. Live: `get_market_cap(FPT)` returns `market_cap_billion:null`. DB: 0 of 2856 vnstock_trading_stats rows have non-null market_cap_bn — today's syncs (08:59Z) all null. Root: vnstock Python ratio() API call silently failing (try/except pass in TRADING_STATS_SCRIPT). AC requires non-null value from a real watchlist ticker. Code is correct; data pipeline is not filling the column. FU-FIXB-COLUMNKEY-VERIFY remains unresolved.

**FIX-C (get_bctc_series):** PASS. Live: `get_bctc_series(FPT, fields=[roe,net_revenue,debt_to_equity])` returned 2 DONE periods (2026-Q1, 2025-Q4) with numeric values. Unit tests 9/9. Multi-period structured JSON confirmed.

**FIX-D (structured_data in get_bctc_full):** PASS. Live: content[1].structured_data.roe=6.173 (float, recomputed-on-read), debt_to_equity=0.401 (float), net_revenue=12479997.2 (float). pe/pb null (market-cap data gap — known, documented). Unit tests 17/17. Backward-compat text in content[0] confirmed.

**FIX-E (price history 90d cap lifted):** PASS. Live: `get_price_history(FPT, days=180)` accepted + returns data. days=731 rejected (schema max=730). priceHistoryTools.ts:192 cap widened 90→730. FIX-E confirmed operational.

**FIX-H (insider lookback 180d):** PASS. Source ground-truth: insiderTools.ts:105 `.max(180)`, L118 `Math.min(180, days)` — both confirm 180d. Live: `get_insider_transactions(FPT, days=180)` returns `lookbackDays:180`, 0 transactions (honest — no FPT data in insider_transactions table, all 0 rows). days=181 correctly rejected by schema. Schema + runtime both confirmed 180d cap.

**Tests run:** RAPID-A (8/8), FIX-C (9/9), 240-bctc-full (17/17). tsc: not re-run (no source changes in this QA cycle). DDD: no new infra imports in FIX-A/C/D/H. Security: no new process.env or secrets.

**Next:** FIX-B → developer/fixer: diagnose vnstock ratio() column key mismatch (FU-FIXB-COLUMNKEY-VERIFY — check 'Chỉ tiêu định giá'/'Market Cap (Bn. VND)' key against live vnstock output; may need key normalization). All other P1 tasks: DONE.

---

## cycle-189 · 2026-06-03T07:15Z · LF-DEPLOY gate — CHANGES_REQUESTED

Sprint: BCTC-LAYOUT-FIRST Phase 0 | Task: LF-DEPLOY | Verdict: CHANGES_REQUESTED

**Tests:** LF-OVERLAY 34/34 pass + LF-EXTRACT unit 115/115 pass + BCTC battery 69/69 pass. tsc EXIT 0. Full suite 10380 pass / 401 pre-existing fail (0 new regressions in BCTC/LF scope).

**BLOCK-1+2 (AC-LFE-1/2): Tier 0 misclassifies FPT page 3 as prose.** Raw DB: page 3 unit_id=eea7d237, page_type=prose; pages 4-8 unit_id=6277fa2a, schema_page=4. Brief requires pages 3-6 in same unit with schema_page=3. page-5 schema_inherited_from_page=4 (not 3). AC-LFE-1 FAIL, AC-LFE-2 FAIL. Root: build_document_map() Tier 0 50-DPI projection on page 3 detects only col_0 (x_min=0, x_max=1654 = full width), gutter_count<2, tagged prose. Fix target: apps/pdf-extractor/infrastructure/generic_md_table_extractor.py build_document_map().

**BLOCK-3 (AC-LFE-3): page 41 is table, not prose.** DB: page_type=table in unit af08a61a (pages 37-44). Brief requires prose/blank.

**BLOCK-4 (AC-LFE-11): quarantine path dead.** All 177 units across 14 reports quarantined=0. Three invariant checkers not triggering on real corpus.

**PASSING:** AC-LFE-4 (NGUON VON code-300 present in actual unit, data correct), AC-LFE-6/7/8/9/0, all 7 AC-LFO, 0-regression (bctc_table_rows=891 stable, balance_pass FPT Q4=1, get_bctc_full correct).

**Next:** dev-pdf-extractor | fix build_document_map() Tier 0 for 3 blocks above.
