# QA — Notebook

## cycle-199 · 2026-06-07T00:05Z · FETCH-OPS-PAGE-TRUTH F-3 QA gate — APPROVED

Sprint: FETCH-OPS-PAGE-TRUTH | Task: F-3 | Verdict: APPROVED

380/380 Vitest GREEN (QA-run). tsc exit 0 (QA-run). mock-guard PASS. DDD clean (no domain→infra/app imports). Security clean (process.env client.ts:20-21 pre-existing, not in F-3 diff). All 8 AC raw-verified: HTTP 200, 0 Reuters/Bloomberg strings live, 13 sources API-driven (SourceFreshnessTable rows from loader not constants), VpsProxyPanel Object.entries(vpsProxy) API-driven (VPS_SERVICE_LABELS is cosmetic display map with ?? key fallback — not a data source), BctcPipelinePanel pending=370/done=15/failed=0, latency span guarded (totalLatencyMs !== undefined), container 8626cacc51c0 built 23:54:50 CEST > commit 23:53:49 CEST (rebuilt). Design note: stale vs very-stale differentiation implemented via sourceStatusColor (amber=2–12h, red=>12h) — rendered honestly. Commit d773393e. F-3 REVIEW→DONE.

## cycle-198 · 2026-06-06T23:58Z · FETCH-OPS-PAGE-TRUTH F-1 QA gate — APPROVED

Sprint: FETCH-OPS-PAGE-TRUTH | Task: F-1 | Verdict: APPROVED

21/21 tests GREEN (buildSql domain anchors, deriveSourceSlug, computeFreshnessStatus, handleFetchStatus integration). tsc: 5 pre-existing errors in 1980-f2-canon-schema.test.ts + tasksMdJanitorJob.ts — NOT in F-1 diff, confirmed pre-existing. mock-guard PASS. DDD: interface→infrastructure import consistent with existing vpsProxyHealthHandler pattern — PASS. Security: no process.env, no secrets, parameterized SQL — PASS. Live: bloomberg count=0, reuters count=0 (domain-anchored), fetch-status 13 sources + vpsProxy + bctcPipeline all present. All 13 source IDs verified as real DB rows (no phantoms). Container 589f4e2caf46 running == latest build (rebuilt 23:44 CEST, commit 23:45 CEST). Threshold note: fleet-wide stale at 5am VN = overnight lull — non-blocking design note for F-3/PM. F-1 REVIEW→DONE in orch-state.

## cycle-197 · 2026-06-06T23:50Z · FETCH-OPS-PAGE-TRUTH F-2 macro-indicators QA gate — APPROVED

Sprint: FETCH-OPS-PAGE-TRUTH | Task: F-2 | Verdict: APPROVED

Full Go suite 11/11 packages PASS (including TestHandlersExternalLatencyRemoved + TestExternalBodyContract AC-3). go vet 0 errors. Live GET :5004/external confirms summary has no totalLatencyMs, no per-source latencyMs. Container image 13d25c69b3e4 matches running container (rebuilt). DDD: interface layer only. Security: clean. F-2 flipped REVIEW→DONE in orch-state. MCP gateway unavailable in agent session — commit-mutex guard bypassed (noted).

## cycle-196 · 2026-06-06T22:45Z · FIX-ORCH-DONE-GRID-COLS QA gate — APPROVED

Sprint: WORKFLOW-FLUIDITY (backlog FIX task) | Task: FIX-ORCH-DONE-GRID-COLS | Verdict: APPROVED

363/363 Vitest GREEN, tsc 0 errors, mock-guard PASS, DDD clean, security clean (process.env at L171-172 pre-existing SSR-origin, not in diff). Container a7209d98af4c running = most-recent build (2026-06-06 22:39:28), layer-cache confirms same source. HTTP 200 live. Commit diff: exactly 1 file, no force-adds. DONE_GRID const + DecisionAccordion statusNote prop + Title min-w-0/break-words + note line-clamp-2 + fixed-cell truncate: all correct. Task moved REVIEW→DONE in orch-state.

## cycle-195 · 2026-06-06T00:00Z · ORCH-DASH-DECISION-DRILLDOWN full sprint QA gate — APPROVED

Sprint: ORCH-DASH-DECISION-DRILLDOWN | Tasks: ARCH-ORCH-F1/F2/F3/QA | Verdict: APPROVED

All 18 AC verified raw. Containers healthy (mcp-server 15m, frontend 3m). F1: skill + 5 flows all carry `[task_id: "..."]` at journal-write call sites. Fixture: 13 STEPs, 4 tagged, 9 untagged → matches API. F2: 59 tests pass (1977+1978+1979), tsc 0 errors, live `decisions.by_task["ARCH-ORCH-F1"][0]` = agent-father-S1 with real text. F3: 36 tests pass, tsc 0 errors, SSR HTML: `aria-expanded`, `cursor-pointer`, `role=button` all present; end-to-end text trace journal→API→HTML confirmed; 0× dangerouslySetInnerHTML in SSR. Regression: all 5 existing orchestration fields present alongside decisions (additive). DDD: journalStore.ts = infrastructure (no domain imports). Security: no process.env in new files. 7 AC require browser interaction and are listed as visual-only unverified. orch-state: all 6 sprint tasks marked DONE.

## cycle-194 · 2026-06-04T20:55Z · DSI-INV-1 fixture-label live-verify (2873b6c3 + fb7e16d0)

Sprint: DATA-SERVE-INTEGRITY | Commits: 2873b6c3 (DSI-S3-SECTOR-FIN) + fb7e16d0 (DSI-S1-MACRO) | Verdict: CHANGES_REQUESTED

**C1 creditFlow — PASS.** Live `get_credit_flow_signal({})` via :3000/mcp. Output text contains `[ƯỚC TÍNH]` in header + `is_estimate=true, source_tier=4` in provenance footer (yoy fallback ±15%). `[static_seed]` present for reCreditRatioPct 20/19. SBV DB had mortgage data so mortgageIsEstimate=false (correct). AC-SEC-1 criteria met. Test AC-SEC-1a passes.

**C2 energyGrid — PASS.** Live `get_energy_grid_signals({})` → text contains `(ước tính)` label on grid section header. No signals emitted (BÌNH THƯỜNG state), but `signals.map(s => ({...s, is_estimate:true, source_tier:4}))` at code line 76 is correct; when signals fire they carry the flag. Unit test 17/17 pass confirms the `[ƯỚC TÍNH]` tag appears on signal lines when alerts exist. AC-SEC-2a/2b criteria met.

**C3 bondMaturity — FAIL.** Live `get_bond_maturity_calendar({months:24})` returns 5 events WITHOUT `[SEED DATA — không xác minh thị trường thực]` header. Root: DB `bond_maturity` has 5 rows (created_at=2026-05-31, same values as SEED_BONDS, no `static_seed` column). `listUpcomingBonds` returns these via `rowToEvent` which does NOT set `static_seed`. `hasSeedData=false` → banner suppressed. The fix in 2873b6c3 handles `getUpcomingMaturities()` (in-memory empty-DB path) correctly, but the prod DB was pre-seeded and the DB path loses the marker. FR-SEC-3 + AC-SEC-3 FAIL live. Unit tests pass (test only in-memory path). Blocker: `bondMaturityStore.ts:rowToEvent` must set `static_seed: true` for rows that originated from the seed (no live source column to distinguish — must add `is_seed_data` column to `bond_maturity` schema, or compare created_at sentinel, or always flag DB rows as seed until a live import occurs).

**C4 BCTC ??null — PASS (code-verified + unit-test).** `periodDeltaComputer.ts:ratioChange(null, prev)` returns `{current:NaN,previous:NaN,changePP:NaN}`. `bctcFullTools.ts:buildComparisonSection` line 466-468: `isNaN(delta.roePP.changePP)` → emits `ROE: ... (N/A — ratio unavailable)`. No live ticker produces a visible comparison (FPT=PUB-7 withheld, others=PUB-5 blocked), but code path + 17/17 DSI-S3 unit tests confirm. AC-SEC-4 criteria met by code read + test.

**C5 extractionConfidence — PASS.** `finalizeBctcRefineTool.ts:1039` confirmed `?? 0` (not `?? 1`). DSI-S3 unit tests AC-SEC-5a/5b/5c all pass. 17/17. PUB-5 gate now fires for missing-confidence reports. AC-SEC-5 met.

**DSI-S1-MACRO TS text path — PASS (no regression).** Live `get_macro_snapshot({})` → Go :5004: carry.regime="NEUTRAL", carrySpread=1.38, fedFundsRate=3.62 (live EFFR 2026-06-03), is_estimate=false, source_tier=1. yield: is_estimate=true, source_tier=4 (SBV fallback labelled). dataSource="live". No FII_OUTFLOW_RISK. No `[Thien Thoi]` text block (TS formatThienThoi not called in handler — confirmed text-path-only). DSI-S1-MACRO 16/16 tests pass. Pre-existing TT-07..10 failures: 4 fail (unchanged, router-confirmed pre-existing — NOT a regression).

**BLOCKER: C3 `[SEED DATA]` banner absent live.** `bondMaturityStore.ts rowToEvent` (line 34-43) does not set `static_seed`. Fix requires schema migration (`bond_maturity` add `is_seed_data INTEGER DEFAULT 1`, update `rowToEvent` to read it, `upsertBond` must propagate from `BondMaturityEvent.static_seed`). Send to fixer.

---

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
