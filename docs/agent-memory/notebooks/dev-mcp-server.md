# dev-mcp-server -- Notebook

## c358 · 2026-06-03T19:30Z (VPT-1) — COMMITTED d67448ad

**Task:** VPT-1 — Add GET /api/vps-proxy-health HTTP endpoint so /dashboard/vps renders UP/STALE/DOWN truthfully.

**Root cause (operator-confirmed):** /dashboard/vps checked api-gateway microservice /health/{news,stock} (NOT deployed). Real VPS health lives in vpsPushLogStore.getVpsProxyHealth() (MCP tool plane). Dashboard cannot call MCP tools — needs HTTP endpoint.

**Changes:**
1. `apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts` (NEW) — handler calling getVpsProxyHealth() directly; computeStale() mirrors EXPECTED_INTERVALS from vpsProxyTools.ts; coerces SQLite SUM null→0 for errors_24h.
2. `apps/mcp-server/src/interface/mcp/server.ts` — import + route `GET /api/vps-proxy-health` registered before FE-REROUTE block.
3. `apps/mcp-server/src/__tests__/VPT-1-vps-proxy-health-endpoint.test.ts` (NEW) — 7 tests: shape, fresh/stale/error/recent_pushes/fetchedAt/25h-stale.

**Key fix:** `new Date(lastPushAt + "Z")` → `new Date(lastPushAt)` — ISO timestamps already end with Z; appending a second Z gives NaN.

**Gate results:** tsc clean, tools=158 (unchanged), sched=70 (unchanged), 7 new pass / 0 fail. Pre-existing suite failures all pre-date this task.

**Ops required:** rebuild mcp-server container to go live.

---

## c357 · 2026-06-03T17:13Z (FU-DE-321-VAY-GUARD) — COMMITTED bc1d7e55

**Task:** FU-DE-321-VAY-GUARD — Add /vay/i label guard to VAS code 321 primary in aggregateScalars.

**Root cause:** Code 321 period-flips: FPT 2025Q4 code 321 = "Dự phòng phải trả ngắn hạn" (1,014 tỷ, NOT vay); code 319 = "Vay và nợ thuê tài chính ngắn hạn" (19,169 tỷ, correct). Aggregator wrote 1,014 instead of 19,169. Report_id=e71f845d.

**Changes (bctcScalarAggregator.ts only):**
1. All three code-321 lookups (general/balance_sheet/broad) now pass `/vay/i` labelHint (strict). Non-vay 321 → null → 319-vay fallback fires.
2. Symmetric `/vay/i` guard on all three code-339 long_term_debt lookups.
3. JSDoc updated (VAS-CODE-TABLE, ScalarAggregate field comments).

**Tests (FU-DE-321-vay-guard.test.ts):** 8 tests: DV-VAY-1 (period-flip FPT-2025Q4 pattern RED→GREEN), DV-VAY-2..3 (321-vay stays, 321-non-vay+no-319=null), DV-VAY-4..5 (339 symmetry), DV-VAY-6..8 (regression FIX-DE-1 FPT/VNM/bank). All 8 pass. FIX-DE-1+FU-6+FU-6d+BEQ-3 regression: 31/31. tsc clean.

**IS-NOT-live yet:** ops must rebuild + run `backfill_bctc_scalars(force_reflow, report_id=e71f845d)` to flow fix into FPT 2025Q4.

---

## c356 · 2026-06-03T16:18Z (FU-BACKFILL-DE-SYNC) — COMMITTED 98c47103

**Task:** FU-BACKFILL-DE-SYNC — Add short_term_debt + long_term_debt to backfillBctcScalarsTool updates array + mirror FIX-DE-2 B-2 blob-sync.

**Root cause:** FIX-DE-2 (b5286dba) patched finalizeBctcRefineTool BLOCK-1 for debt scalars but NOT backfillBctcScalarsTool. force_reflow on DONE reports could never re-derive debt → FIX-DE-3 required a hand-rolled docker-exec one-shot workaround.

**Changes (backfillBctcScalarsTool.ts only):**
1. `agg.short_term_debt` + `agg.long_term_debt` added to updates array with null-guard (bank path: in notApplicable → null-cleared via existing nullClearCols path, not double-written).
2. FU-BACKFILL-DE-SYNC B-2: blob-sync block after scalar UPDATE — writes balance_sheet_json.currentLiabilities.shortTermDebt + .longTermLiabilities.longTermDebt (non-fatal, mirrors finalize FIX-DE-2 B-2 exactly).

**Tests (FU-BACKFILL-DE-SYNC.test.ts):** 5 RED→GREEN: BDS-1 corp debt populated + D/E ~0.40x, BDS-2 blob nested paths updated, BDS-3 bank null-cleared, BDS-4 missing blob non-fatal, BDS-5 dry_run safe. 32 pass / 0 fail across 5 backfill files. tsc exit 0.

**IS/IS-NOT-live:** backfill CODE corrected; live DB values change only after ops rebuild + actual force_reflow run (dispatcher will rebuild + run force_reflow to replace FIX-DE-3 hand-script proof).

---

## c355 · 2026-06-03T~15:09Z (FIX-DE-3) — DATA REFLOW (no code commit)

**Task:** FIX-DE-3 — Re-derive debt scalars for 5 DONE corpus reports (FPT/VNM/HPG/DHG/SHB) so FIX-DE-1+2 code changes actually flow into persisted DB columns.

**Tool used:** NOT backfill_bctc_scalars (missing FIX-DE-2 debt columns — gap identified). Used direct docker exec Bun script invoking aggregateScalars on existing bctc_table_rows, then writing short_term_debt/long_term_debt (BLOCK-1) + recomputing debt_to_equity (BLOCK-3) per finalizeBctcRefineTool logic. No code edits. No commits.

**Results (5 reports):**
- FPT 2026-Q1 [e8ea3df5]: short_term_debt=14,491,358M, long_term_debt=1,605,069M → D/E=0.4012x PUBLISHED (conf=81%)
- VNM 2025-Q4 [4316f6d1]: short_term_debt=102,363M, long_term_debt=0 → D/E=0.0030x PUBLISHED (conf=94%)
- HPG 2025-Q4 [d6f1885f]: short_term_debt=38,533M (code 319 correct), long_term_debt=0 (no code 339/334 in data) → D/E=0.0004x DB-written but PUB-5 GATED (conf=44%)
- DHG 2026-Q1 [620a9d00]: no debt codes → short_term_debt=0, long_term_debt=0, D/E=0 → PUB-5 GATED (conf=44%)
- SHB 2025-Q4 [59212e0d]: bank path → short_term_debt=NULL, long_term_debt=NULL, D/E=NULL (correct) → PUB-5 GATED (conf=44%)

**Discovery (backfill_bctc_scalars gap):** Tool missing short_term_debt/long_term_debt in its UPDATE list (added in finalizeBctcRefineTool FIX-DE-2 but NOT mirrored to backfill tool). Track FU-BACKFILL-DE-SYNC.

**DoD check:** FPT D/E=0.4012x matches brief anchor ~0.40x. HPG uses code 319=38,532 tỷ (correct, not spurious 311=38,729). SHB=NULL (correct for bank). VNM/DHG serve real corporate values.

---

## c354 · 2026-06-03T15:25Z (FIX-DE-1) — COMMITTED fdd2363a

**Task:** FIX-DE-1 — Add short_term_debt/long_term_debt to ScalarAggregate + aggregateScalars (BCTC-ANALYTICS-LAYER, HIGH)

**Root cause (architect DB-proven):** bctc_table_rows has code 321 (short_term_debt=14,491B) and 339 (long_term_debt=1,605B) for FPT 2026-Q1, but ScalarAggregate had no fields for them — missed in BEQ-3 audit. finalizeBctcRefineTool never wrote them → DB zeros corpus-wide → D/E=N/A.

**Changes:** bctcScalarAggregator.ts — ScalarAggregate interface +2 fields (short_term_debt/long_term_debt); emptyScalars +2 nulls; aggregateScalars: code 321 primary → 319+/vay/i fallback for short_term_debt; code 339 primary → 334+/vay/i fallback for long_term_debt; isBankPath guard (both fields null, added to notApplicable); VAS-CODE-TABLE doc updated.

**Tests (FIX-DE-1-debt-decomposition.test.ts):** 7 new RED→GREEN: FPT-pattern (321+339 values), VNM-pattern (319+/vay/), 319 non-borrowing exclusion, bank notApplicable, corporate not-in-na, empty corpus, 22-field regression. Total suite: 39 pass / 0 fail across 5 scalar test files.

**Boundary (honest):** Live D/E UNCHANGED — aggregator returns correct scalars but finalizeBctcRefineTool (FIX-DE-2) not yet wired to write them.

**Gate:** tsc clean | tools=158 (unchanged) | sched=70 (unchanged)

---

## c353 · 2026-06-03 (BAL-1f) — COMMITTED 3b210204

**Task:** BAL-1f — current_ratio micro-residual guard + operating_margin recompute (BCTC-ANALYTICS-LAYER, HIGH)

**Defects fixed:**
- DEFECT-1: FPT current_ratio=4.15e13x — clTotal=1e-6 (parse artifact) passed `clTotal>0` guard. Fix: clTotal must be ≥ 0.1% of current_assets AND ≥ 1.0 million VND absolute floor. Result band: >1000x → null. FPT → N/A.
- DEFECT-2: FPT operating_margin_pct=0.0% (stale persisted column, recompute block omitted it). Fix: recompute gross/operating/net margin in recompute-on-read block; income-broken guard mirrors ratioComputer.ts L71-72. FPT → 22.0%.
- DEFECT-3: PUB-6 defense-in-depth: current_ratio>1000x band added to sanitizedRatios; buildSummarySection uses effectiveCurrentRatio.

**Files:** bctcFullTools.ts (+60L recompute guard + margin recompute + PUB-6 band + sanitizedRatios.current_ratio); 240-bctc-full.test.ts (+4 BAL-1f tests TC-1..4); BAL-0-pub5-8-gates.test.ts (type fix: sanitizedRatios.current_ratio added to literal).

**Tests:** 11 pass / 0 fail (240-bctc-full); 25 pass / 0 fail (BAL-0-pub5-8-gates); tsc EXIT 0. RED→GREEN: TC-1 (4.15e13→N/A), TC-2 (0%→22%), TC-3 (VNM N/A no regression), TC-4 (healthy 2.00x not suppressed).

**ops_rebuild_required: true** (live verify: get_bctc_full(FPT) → Current Ratio=N/A, Operating Profit margin≈22.0%)

---

## c352 · 2026-06-03 (LF-OVERLAY) — COMMITTED 2326ebb6 + b3c80e69 (orch-state flip)

**Task:** LF-OVERLAY — Sprint BCTC-LAYOUT-FIRST Phase 0, persistence + viewer-overlay half

**Changes:** DDL (bctc_layout_units + bctc_page_zones) already in schema-financial-reports.ts; POST /api/push-bctc-layout handler (pushBctcLayoutHandler.ts) with DELETE-before-INSERT idempotency; GET /api/bctc-inspect/zones/ pure-DB-read handler (bctcInspectHandler.ts); zone-overlay toggle + SVG renderer in bctc-inspector.html. Routes registered in server.ts.

**Tests:** 34 pass / 0 fail (1272-push-bctc-layout: 25 tests, 1273-bctc-inspect-overlay: 9 tests). BCTC regression: 128 pass / 0 fail. tsc clean.

**Zone health:** all frozen surfaces 0-diff (pushBctcMdTablesHandler/bctcInspectMdHandler); 158 tools, 70 cron.schedule — both unchanged. AC-LFO-0..6 MET; AC-LFO-7 OPEN (requires LF-EXTRACT corpus re-run after image rebuild). | HEALTHY

---

## c351 · 2026-06-02 (FU-BCTC-HISTORY-COVERAGE SPIKE) — COMMITTED f3bf4b61

**Task:** FU-BCTC-HISTORY-COVERAGE — root-cause why get_cash_flow(FPT, quarters=8) returns only 2 quarters (SPIKE mode, no prod changes)

**Census (live container queries):**
- 13 tickers in financial_reports; max depth = 2 quarters; avg = 1.15; 11 tickers have only 1 quarter
- FPT: 2025-Q4 + 2026-Q1 (DONE), CF sections present (33+34 rows). MWG: 0 rows in DB.
- VCB: 2 rows (2025-Q1 + Q4) both PENDING — OCF scalars are OCR garbage (15-digit integers).

**Root-cause verdict:**
- (A) PRIMARY: Queue seeding is forward-only. `detectTargetQuarter()` + `backfillBctcQ4/Q1_2026` only ever seed 1 quarter at a time. No historical backfill seeder exists for Q2/Q3-2025 or 2024. bctc_vps_queue has NEVER contained any row for 2025-Q1, Q2, Q3 or 2024.
- (B) SECONDARY: VCB 2 PENDING rows need re-refine (OCR garbage CF scalars).
- (C) NOT a factor: CF section extraction is complete for all ingested reports.
- (D) REFUTED: hsx.vn API live probe confirms 50+ PDFs for FPT going back to Q1-2022.

**Remediation tasks proposed:** Task 1 `backfillBctcHistorical()` (S, dev-mcp-server), Task 2 VPS confirmation (XS, ops), Task 3 VCB re-refine (XS), Task 4 analyst ESC-3 gate.

**Brief:** `docs/architecture-briefs/2026-06-02-bctc-history-coverage-spike.md`

---

## Working Memory

### Baselines (c352)
- tool=158, sched=70 | ops_rebuild_required: true (LF-OVERLAY live routes need image rebuild)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
