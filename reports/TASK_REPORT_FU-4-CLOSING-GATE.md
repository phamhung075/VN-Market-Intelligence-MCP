## Task Report — FU-4 CLOSING GATE (cycle-171)
date: 2026-05-31
sprint: FU-TRUST-REFRESH
reports: FPT e8ea3df5-3f32-413d-a3eb-c71634c0438d / ACB fea19bae-2b7a-4954-b3e0-e09d7bfc7390
outcome: CHANGES_REQUESTED

---

## Raw Scalars — In-Container bun:sqlite Read

### FPT (e8ea3df5)
```
gross_profit:      4244889.890688     (4,244,890)
gross_margin_pct:  34.01%
net_profit:        2476789.833481     (2,476,790)
profit_before_tax: 2803844.281676     (2,803,844)
total_assets:      68586094.785217    (68,586,095)
total_liabilities: 28464058.214856    (28,464,058)
equity_total:      40122036.570361    (40,122,037)
net_revenue:       12479997.206775    (12,479,997)
refine_status:     DONE
confirm_status:    PENDING
bctc_table_rows:   145
balance |L+E−A|/A: 0.0000%           PASS
```

### ACB (fea19bae)
```
gross_profit:      null               CLEARED (FU-6e)
gross_margin_pct:  null               CLEARED (FU-6e)
net_profit:        4320388            (4,320,388)
profit_before_tax: 5368138            (5,368,138)
total_assets:      1030900741         (1,030,900,741)
total_liabilities: 932149689          (932,149,689)
equity_total:      98751052           (98,751,052)
net_revenue:       6989162            (6,989,162)
refine_status:     DONE
confirm_status:    PENDING
bctc_table_rows:   106
balance |L+E−A|/A: |932,149,689+98,751,052−1,030,900,741|/1,030,900,741 = 0.0000% PASS
```

---

## Scalar Verification Checks

### Expected-value checks (all PASS)
- ACB gross_profit = NULL (was 6,989,162 = net_revenue; FU-6e cleared)
- ACB gross_margin_pct = NULL (cleared)
- ACB equity_total = 98,751,052 (≠ assets 1,030,900,741)
- ACB PBT = 5,368,138; net_profit = 4,320,388; net_revenue = 6,989,162
- FPT gross_profit = 4,244,890 (NOT null — no regression)
- FPT gross_margin_pct ≈ 34%
- FPT total_assets = 68,586,095; equity = 40,122,037; net_profit = 2,476,790

### DT-1 — Digit-Run Scan (PASS — 0 hits)
14 checks across all key scalars (net_revenue, gross_profit, net_profit, profit_before_tax,
total_assets, equity_total, total_liabilities) for both reports.
No 5+ consecutive identical digits (mock-data pattern). Clean.

### DT-2 — gross ≠ net (PASS)
- FPT: gross_profit (4,244,890) ≠ net_profit (2,476,790) — PASS
- ACB: gross_profit = NULL (not-applicable, bank) ≠ net_revenue (6,989,162) — PASS

---

## Test Results
- FU-6e test suite: 6 pass / 0 fail
- FU-6 + FU-5 + bctcScalarAggregator: 56 pass / 0 fail
- bun tsc --noEmit: 0 errors
- DDD: PASS (no domain→infrastructure imports in modified files)
- Security: PASS
- mock-guard: PASS

---

## BCTC Eval Results

### FPT bctc-eval: overall_status = yellow
- Stage 4 TABLE_RECONSTRUCT: GREEN (145 rows, label_coverage=1, code_coverage=1, 0 dups)
- Stage 6 STRUCTURED_EXTRACT: yellow (balance_pass=false is signal-only; golden_row_match=1.0)
- Stages 1-3: yellow (backfill placeholders — awaiting pdf-extractor push; not a data quality gate)
- VERDICT: yellow does not block merge per QA policy.

### ACB bctc-eval: overall_status = RED
- Stage 4 TABLE_RECONSTRUCT: GREEN (106 rows, label_coverage=1, code_coverage=0.943)
- Stage 6 STRUCTURED_EXTRACT: RED
  - gate_failures: golden_row_match_ratio=0.667 < threshold 0.9
  - golden_diff: missing_rows=["gross_profit"]
  - Root cause: computeBctcEval.ts:171 hardcodes goldenAnchors=["net_revenue","net_profit","gross_profit"]
    for all domains. Bank reports have no gross_profit concept — it is intentionally NULL.
    FU-6e correctly cleared it; the eval anchor set is domain-unaware.
- Per QA policy: overall_status=red → HARD FAIL. QA MUST refuse DONE.

---

## get_bctc_full Verification

get_bctc_full reads from financial_reports scalar columns (bctcFullTools.ts:125 — row.gross_profit).
- FPT: serves gross_profit=4,244,890 — PASS
- ACB: serves gross_profit=null — CORRECTLY serves NULL (no stale 100% margin)

---

## Tree Cleanliness

- HCM-DISAMBIG: 0-diff on apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts
- PDF-Extract-Kit: 0-diff on apps/pdf-extractor/
- FU-6 source files: all committed (b63d7988 FU-6e, 88a07bb4 FU-6d, 736cac22 FU-6c)
- Working tree modified tracked files: agent notebooks + cowork data only (not in scope)

---

## Issues Found

### BLOCKING (2)

**B-1 — computeBctcEval.ts:171 — bank-unaware goldenAnchors causes ACB eval RED**

File: `apps/mcp-server/src/application/usecases/computeBctcEval.ts:171`
Issue: `goldenAnchors = ["net_revenue", "net_profit", "gross_profit"]` is hardcoded for all domains.
For bank reports (ACB domain=banking), gross_profit is not-applicable and correctly NULL.
This scores 2/3=0.667 < threshold 0.9 → stage-6 RED → overall_status=red.
The eval is wrong, not the data. But QA policy requires hard fail on overall_status=red.

Fix: read domain from financial_reports; exclude gross_profit from goldenAnchors when domain is
banking/bank (or when isBankPath is true — same detection bctcScalarAggregator uses).
Minimal: if (domain === 'banking') goldenAnchors = ["net_revenue", "net_profit"];
After fix: re-run bctcEvalRecompute for ACB → should produce green/yellow (not red).

**B-2 — income_stmt_json blob desync for ACB**

File: `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`
Issue: When FU-6e nulled gross_profit scalar, the income_stmt_json blob was not updated.
ACB income_stmt_json.grossProfit still = 6,989,162 (= netRevenue stale value).
The scalar (gross_profit=null) correctly drives get_bctc_full but the blob is served by
/api/bctc-inspect and other routes — it will show 100% gross margin in JSON raw view.
Fix: in the NOT-APPLICABLE path in finalize, also update income_stmt_json to set
grossProfit=null in the parsed blob before re-serializing.

---

## Merge Status: CHANGES_REQUESTED

All scalar values are correct (BLOCK-A/B/C from prior gate fully resolved). The two new
blocking issues are narrow eval-system gaps exposed by the correct FU-6e fix:
- B-1 is ~10 lines in computeBctcEval.ts (domain branch on goldenAnchors)
- B-2 is ~5 lines in finalizeBctcRefineTool.ts (blob update alongside scalar null-clear)

After dev applies fixes + ops re-runs eval for ACB + verifies ACB eval no longer RED,
re-gate should be a fast verification pass.

NEXT: dev-mcp-server | fix B-1 (domain-aware goldenAnchors) + B-2 (income_stmt_json sync);
      ops | re-run bctcEvalRecompute for fea19bae; re-gate FU-4
