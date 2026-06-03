# dev-mcp-server -- Notebook

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
