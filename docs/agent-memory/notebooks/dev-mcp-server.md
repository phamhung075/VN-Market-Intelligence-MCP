# dev-mcp-server -- Notebook

## c348 · 2026-06-02 (BCTC-ANALYTICS-LAYER BAL-0) — COMMITTED 9093f385

**Task:** BAL-0 — structural publish-integrity gate PUB-5..8 in `bctcFullTools.ts`

**PUB-5:** `extraction_confidence < 0.5` → `publishable=false` (HPG parent-only at 44% blocked).
**PUB-6:** `|ROA|>100%` or `|ROE|>300%` or `|NetDebt/EBITDA|>200x` or `EPS∉[0,100000]` → offending ratio(s) null in `sanitizedRatios`; report served with N/A + trust note (does NOT block full report). DHG ROA=7891932% → N/A, not served as garbage.
**PUB-7:** `period_type=Q4` vs non-Q4 (or reverse) → `buildComparisonSection` returns mismatch message, no delta emitted. Kills false FPT YoY -82.2% from cumulative-vs-standalone.
**PUB-8:** `net_revenue=0 AND net_profit>0 AND conf<0.6` → `publishable=false` (parent-only heuristic).

**Signature change:** `checkPublishability(db, reportId, bankForm?, row?)` — 4th param is the `ReportRow` object to avoid a second DB query.
**`buildSummarySection` extended:** 4th param `sanitizedRatios` from PUB-6; ROA/ROE/NetDebt/EPS rendered as N/A when sanitized.

**DV tests:** 25 new tests in `BAL-0-pub5-8-gates.test.ts` RED→GREEN. 46 total pass (existing 21 + 25 new) / 0 fail. tsc EXIT 0. ops_rebuild_required: true.

**SHB/EIB diagnostic (read-only container census — disambiguates B-1 vs B-2):**
- EIB: `isBankFormFromDb=true`, rows in `balance_sheet` (18 non-summary, non-null) NOT in `general`. PUB-3 bank path (queries `statement_section='general'`) → 0 rows → blocked. Corporate path → 18 rows.
- SHB: same pattern — `isBankFormFromDb=true`, 19 non-summary `balance_sheet` rows, 0 in `general`.
- **Root cause CONFIRMED: Candidate B-1 variant** — NOT the expected discriminator failure. `isBankFormFromDb` correctly returns `true` (no 3-digit codes). But the bank PUB-3 path queries `statement_section='general'`, while the parser wrote rows to `statement_section='balance_sheet'`. The fix is in `checkPublishability` PUB-3 bank path: also accept `statement_section='balance_sheet'` for banks (or remove the section filter for the bank path). Tracked BAL-1b-DEV.

**Zone health:** tsc 0 errors | 46 pass / 0 fail | tools count unchanged | sched unchanged | HEALTHY

---

## c347 · 2026-06-02 (BCTC-EXTRACT-QUALITY Phase-2 BEQ-5..8b) — COMMITTED 5 SHAs

**Tasks:** BEQ-5 (1da34f8d) → BEQ-6 (a8cbe91d) → BEQ-7 (6b2f72b2) → BEQ-8 (1f726140) → BEQ-8b (8845e5d6)

**BEQ-5:** `bctcSectionCompleteness.ts` (NEW domain fn) — `checkSectionCompleteness(rows)→{hasBalanceSheet,hasIncomeStatement,hasCashFlow,isComplete}`. Treats `general` ≡ `balance_sheet` (legacy extractor tag). 4 DV tests.

**BEQ-6:** `backfillBctcScalarsTool.ts` — section completeness gate before `aggregateScalars`. Balance-sheet-only rows → `status=SKIPPED, refine_status=PARTIAL` (never DONE). Unconditional-DONE path structurally guarded. 3 DV tests.

**BEQ-7:** `finalizeBctcRefineTool.ts` — server-side safety net: after agentic refine parses markdown, overrides caller-supplied DONE to PARTIAL if sections incomplete. Empty finalRows also → PARTIAL. 3 DV tests.

**BEQ-8:** `bctcScalarAggregator.ts` line 578 — replaces `findByCode(rows,"10")===null` with `isBankFormFromRows(rows)`. Prevents false-bank classification of balance-sheet-only corporates (FPT/VNM/DHG). DRY: single SSOT discriminator. 3 DV tests.

**BEQ-8b:** `bctcInspectHandler.ts` LIST_SQL — extends `IN ('PENDING')` to `IN ('PENDING','PARTIAL')`. After BEQ-5/6/7 tickers transition PENDING→PARTIAL; legacy net_profit still garbage → withhold. 3 DV tests.

**Gates:** tsc EXIT 0 | 32/32 pass (BEQ-2..8b) | RED→GREEN proven all 5 tasks | **ops_rebuild_required: true** | Next: qa formal gate → ops rebuild mcp-server → BEQ-9 agentic refine

---

## c346 · 2026-05-31 (FU-TRUST-REFRESH FU-6f) — COMMITTED 9aa2b2eb

**Task:** FU-6f — fix B-1 bank eval anchors, B-2 income_stmt_json blob sync, B-3 PUB-3 balance section fix.

**B-1 (BLOCKING):** `computeBctcEval.ts` — reads `domain` from `financial_reports`. When domain matches /bank/i, goldenAnchors=["net_revenue","net_profit"] (excludes gross_profit). Corporate unchanged (3 anchors). Fixes ACB eval false-red: 2/3=0.667 < 0.9 → stage-6 red. bctc-eval-routes.test.ts schema updated with `domain TEXT` column (missing → 500 error).

**B-2 (BLOCKING):** `finalizeBctcRefineTool.ts` — after scalar null-clear (FU-6e), also syncs JSON blobs. Mapping: gross_profit→grossProfit in income_stmt_json; current_assets→currentAssets in balance_sheet_json. Non-fatal blob sync errors logged. ACB income_stmt_json.grossProfit: 6,989,162 → null.

**B-3 (scope-contained fix):** `bctcFullTools.ts` checkPublishability PUB-3 — OR clause: also accepts 'general' rows with CAST(code AS INTEGER) BETWEEN 100 AND 440. Fixes "balance sheet has no decomposition — forced-zero pass suspected" for FPT+ACB where parser lands balance rows in 'general'. Full section-label rework deferred to BCTC-LAYOUT-FIRST. B-3 does NOT need re-refine (no re-parse required; query change only).

**Tests:** 8 new DV-FU6F-* tests RED→GREEN. 134 pass / 0 fail across 11 files. tsc: 0 errors.

**ops_rebuild_required:** rebuild mcp-server → re-finalize ACB (fea19bae) + FPT (e8ea3df5) → recompute eval both → QA re-gate. B-3 does NOT require re-refine (no new parse step).

---

## c345 · 2026-05-31 (FU-TRUST-REFRESH FU-6e) — COMMITTED b63d7988

**Task:** FU-6e — not-applicable null-clear for bank scalars (last QA blocker)

**Root cause:** ACB gross_profit=6,989,162=net_revenue (100% margin) because old finalize null-skip (`if (agg.gross_profit !== null)`) never cleared stale legacy pdf-parse value when aggregator correctly returned null for bank (no code "20").

**3-case update logic (generalized):**
- Case 1 NOT-APPLICABLE: `notApplicable[]` from aggregator → SET NULL explicitly → clears stale legacy values (bank gross_profit, current_assets, gross_margin_pct).
- Case 2 EXPECTED-BUT-NULL: corporate gross_profit miss → SKIP → preserves prior value (FU-5 intent intact).
- Case 3 RESOLVED non-null: SET value (unchanged).

**notApplicable enum:**
- BANK (isBankPath = code "10" absent): gross_profit, current_assets, gross_margin_pct.
- CORPORATE: [] (symmetric audit — nothing bank-has-that-corps-lack at this time).
- isBankPath detection: same branch aggregator already uses for fallthrough to code "I" path — DRY, no second detector.

**Changes:** `bctcScalarAggregator.ts` (add `notApplicable: string[]` to `ScalarAggregateResult`, populate on bank path); `finalizeBctcRefineTool.ts` (3-case update, single combined UPDATE statement).

**Anti-false-green tests:** FU-6e-not-applicable-clear.test.ts — 6 pass / 45 expect() calls. Log confirms: ACB null_cleared_cols=["gross_profit","current_assets","gross_margin_pct"], FPT null_cleared_cols=[]. All prior 50 tests (FU-5/5b/6c/6d) still green. tsc --noEmit EXIT 0.

**ops_rebuild_required: true** — rebuild mcp-server + re-finalize ACB (fea19bae) [expected: gross_profit=NULL, gross_margin_pct=NULL] + re-finalize FPT (e8ea3df5) regression-confirm [gross must stay 4,244,890 NOT nulled] + recompute eval, QA final re-gate.

---

## c344 · 2026-05-31 (FU-TRUST-REFRESH FU-6d) — COMMITTED 88a07bb4

**Task:** FU-6d — generalize all 3 bank-path scalar resolution bugs (BLOCK-A/B/C from QA TASK_REPORT_FU-4-REGATE)

BLOCK-A: null-valued section header wins equity pick → `findByLabel`/`findByLabelExcluding` now prefer non-null candidates globally.
BLOCK-B: Roman code VIII/IX collision → `P_BANK_CODE_VIII_PBT_HINT` + `P_BANK_CODE_IX_NET_PROFIT_HINT` labelHints added; labelHint made STRICT (no match → null); P_PBT regex fixed for two-codepoint "ướ".
BLOCK-C: `enforceBalanceIdentity` fails open on null equity → now returns "REQUIRED SCALARS UNRESOLVED" when any of {total_assets, total_liabilities, equity_total} is null but not all.

**Gates:** tsc EXIT 0 | 27 pass / 0 fail | RED→GREEN proven | ops_rebuild_required: true (ACB+FPT re-finalize)

---

## c343 · 2026-05-31 (FU-TRUST-REFRESH FU-6c) — COMMITTED 736cac22

**Task:** FU-6c — bctcScalarAggregator root-cause fix: label-canonical + balance-identity invariant

Fixed: FPT code-280 total assets (not code-270), ACB equity exclusion, ACB code "I" collision. Introduced `balanceViolation` field in `ScalarAggregateResult`. 7 DV tests RED→GREEN. All FU-5/FU-5b still green.

**Gates:** tsc EXIT 0 | 38 pass / 0 fail | ops_rebuild_required: true

---

## c342 · 2026-05-31 (FU-TRUST-REFRESH FU-5b) — COMMITTED bfd25762

**Task:** FU-5b — parseVnNumber parens-negative fix + fail-loud one-pass audit

Fixed: parens-negative rows (COGS, some equity lines) silently dropped → retained with value_current=null + [UNPARSEABLE] log. 23 DV tests. ops_rebuild_required: true.

---

## c341 · 2026-05-31 (FU-TRUST-REFRESH FU-5) — COMMITTED 6cc75437

**Task:** FU-5 — BLOCK-1 scalar backfill + BLOCK-2 eval recompute in finalizeBctcRefineTool

New: bctcScalarAggregator.ts (domain pure). Modified finalizeBctcRefineTool.ts: dynamic SET UPDATE + computeBctcEval inline. 8 DV tests. ops_rebuild_required: true.

---

## c325–c340 (pruned) — see git log for details

Key sprints: MACRO-CMDTY-DELTA (c340), DYN-WF-FOUNDATION DWF-DEV-MCP-1 is_trading_day (c339), BCTC-TRUST-RED (c338 — DT-1/2/3/4 validators), BCTC-AI-INPUT-TAB (c335–c336), BCTC-HUMAN-CONFIRM HC-DEV-1→7 (c330–c335), BTB-PERSIST-FIX (c327), DPI-FU-A/B (c328), TOOL-SURFACE-HYGIENE TSH-2/3/4 (c341).

---

## Working Memory

### Active Sprint: FU-TRUST-REFRESH
- FU-6e DONE: committed b63d7988
- FU-6f DONE: committed 9aa2b2eb (B-1 bank anchors, B-2 income_stmt_json sync, B-3 PUB-3 fix)
- ops_rebuild_required: true (rebuild mcp-server → re-finalize ACB fea19bae + FPT e8ea3df5 → recompute eval both → QA re-gate)
- B-3 note: no re-refine needed for PUB-3 fix; query change only

### Baselines
- tool=157, sched=70 (from c339)
- Pre-existing: bctcRefineJob.ts 2 tsc errors + get_price_history test fail (cron_job_runs missing) — not caused by FU-TRUST-REFRESH changes

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
