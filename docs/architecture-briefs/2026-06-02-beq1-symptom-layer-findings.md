# Architecture Brief — BEQ-1 Spike: Symptom-to-Layer Findings

**Task:** BEQ-1-SPIKE | **Sprint:** BCTC-EXTRACT-QUALITY
**Zone:** apps/mcp-server/ (all three symptoms)
**Date:** 2026-06-02 | **Author:** agents-architect
**Mode:** PLAN-ONLY — no production code written, no DB mutations

---

## Method

Each leg probed independently per the project_bctc_hnx_ssl_outage lesson:
discovery → transport → fetch → OCR → refine → persist → serve.

Raw values pulled from:
- `GET /api/bctc-inspect/docs` (live mcp-server, 2026-06-02)
- Direct `bun` DB queries against `/app/data/market.db` via docker exec
- Source code read: `bctcFullTools.ts`, `finalizeBctcRefineTool.ts`,
  `bctcScalarAggregator.ts`, `bctcInspectHandler.ts`

---

## Symptom (a): Empty refine despite OCR present — CTG and VCB

### Raw evidence

**Live DB read (financial_reports):**

```
CTG 2026-Q1:
  refine_status = PENDING
  net_profit    = 5          (OCR-parse garbage — cover-letter regex hit)
  net_revenue   = 0
  refined_units = 0          (bctc_refined_units count = 0)
  table_rows    = 0          (bctc_table_rows count = 0)
  ocr_confidence = 0.0625    (lowest in corpus)
  extraction_method = pdf-parse

VCB 2025-Q4:
  refine_status = PENDING
  net_profit    = 8,633,783  (pdf-parse OCR value)
  refined_units = 0
  table_rows    = 0
  ocr_confidence = 0.625

VCB 2025-Q1:
  refine_status = PENDING
  net_profit    = 8,701,726  (pdf-parse OCR value)
  refined_units = 0
  table_rows    = 0
  ocr_confidence = 0.625
```

**OCR layer (pdf_extracted_text):**

```
CTG:  filename='CTG_2026_Q1.pdf'  → 2 pages, text_len=[1671, 751], confidence=0.8
                                    (OCR IS PRESENT — 2 pages extracted)
VCB 2025-Q4: filename='20260130-VCB-CBTT-&-BCTC-Hop-nhat-Q4.2025.pdf'
             → 72 pages with text, confidence=0.8 (OCR IS PRESENT — 72 pages)
VCB 2025-Q1: filename='VCB_2025_Q1.pdf' + '20250429-…signed.pdf'
             → 54 pages with text (OCR IS PRESENT)
```

**PUB-1 gate (bctcFullTools.ts lines 399-411):**

```typescript
if (!report || !["DONE", "PARTIAL"].includes(report.refine_status)) {
  return { publishable: false, reason: "Chưa có dữ liệu BCTC" };
}
```

This fires for all CTG/VCB records because `refine_status = PENDING`.
The served output is the string `"Chưa có dữ liệu BCTC"` — no financial data reaches the caller.

**Refine trigger (bctcRefineJob.ts):**

The production cron path (`runBctcRefineJob`) has been deleted (Option-Y ruling, §0.7.2).
Orchestration was delegated to the host-level fleet cron via `get_bctc_pending_refine` /
`push_bctc_refined_unit` / `finalize_bctc_refine` MCP tools. Both CTG and VCB have
`refined_units=0`, confirming the fleet cron has never processed these reports.

**Additional CTG blocker:**

CTG's PDF contains only 2 pages (cover letter + "Công bố thông tin" header). OCR page 1
contains the HĐQT letter text, not financial tables. Even if refine ran, there are no
tables to parse. The real BCTC attachment must be fetched separately (pre-existing
backlog item BCTC-CTG-ATTACHMENT-FETCH).

### Layer pinned: REFINE-TRIGGER

OCR is present (confirmed: pdf_extracted_text has rows for both tickers). The parser was
never invoked. `refined_units=0` and `refine_status=PENDING` for all three reports. The
symptom is not a parser failure, not an OCR failure, not a transport failure, not a DB
wedge. The fleet cron that drives the refine pipeline has never been dispatched for these
tickers. The PUB-1 gate then correctly rejects any serve attempt.

### Proposed fix task: BEQ-2

**Label:** Audit + trigger refine pipeline for PENDING corpus  
**Zone:** apps/mcp-server/  
**Agent:** dev-mcp-server  
**Size:** S  
**Scope:**
- Audit why CTG/VCB (and VNM, EIB, DIG, SHB) are not being picked up by the
  `get_bctc_pending_refine` tool — check its eligibility query against the
  `financial_reports` table to see if it is too narrow.
- If the tool is correct but the fleet cron was never re-armed after Option-Y deletion,
  document the manual trigger path and add a cron entry.
- **CTG exclusion**: do not trigger refine for CTG until after BCTC-CTG-ATTACHMENT-FETCH
  delivers a real multi-page BCTC PDF. A page-count / file-size sanity gate must block
  cover letters from entering the refine queue.

---

## Symptom (b): Zeroed secondary lines — FPT + ACB (OperatingProfit / EBITDA / Cash = 0, EPS wrong)

### Raw evidence

**Live DB read (financial_reports secondary scalars):**

```
FPT 2026-Q1 (refine_status=DONE, refined_units=15, table_rows=145):
  operating_profit = 0         ← WRONG (table has code-30 = 2,747,763,827,050 VND)
  ebitda           = 0         ← WRONG
  cash             = 0.000001  ← WRONG (table has code-110 = 7,993,577,611,642 VND)
  eps              = 1         ← WRONG (garbage from initial OCR parse)
  operating_cf     = -2,847,813.717 million VND  (correct — was populated)
  investing_cf     = -2,254,895.190 million VND  (correct — was populated)
  financing_cf     = ~0        ← WRONG

ACB 2026-Q1 (refine_status=DONE, refined_units=27, table_rows=106):
  operating_profit = 0   ← WRONG
  ebitda           = 0   ← WRONG
  cash             = 0   ← WRONG
  eps              = 0   ← WRONG
  operating_cf     = 0   ← WRONG
  investing_cf     = -336,492 million VND  (present)
  financing_cf     = -21,775,306 million VND  (present)
```

**bctc_table_rows for FPT 2026-Q1 (key codes present in DB):**

```
code=10  label="Doanh thu thuần…"              value_current=12,479,997,206,775  (income_statement)
code=20  label="Lợi nhuận gộp…"                value_current=4,244,889,890,688   (income_statement)
code=30  label="Lợi nhuận thuần từ hoạt động…" value_current=2,747,763,827,050   (income_statement)
code=50  label="Tổng lợi nhuận kế toán trước…" value_current=2,803,844,281,676   (income_statement)
code=60  label="Lợi nhuận sau thuế…"            value_current=2,476,789,833,481   (income_statement)
code=110 label="I. Tiền và các khoản tương đương tiền" value_current=7,993,577,611,642 (general)
```

Code-30 (`operating_profit`) and code-110 (`cash`) are **present in bctc_table_rows
with correct non-zero values**. They are simply never read by the aggregator.

**bctcScalarAggregator.ts — ScalarAggregate definition (lines 76-87):**

```typescript
export interface ScalarAggregate {
  net_revenue:       number | null;
  gross_profit:      number | null;
  profit_before_tax: number | null;
  net_profit:        number | null;
  total_assets:      number | null;
  current_assets:    number | null;
  total_liabilities: number | null;
  equity_total:      number | null;
  gross_margin_pct:  number | null;
  net_margin_pct:    number | null;
}
```

`operating_profit`, `ebitda`, `cash`, `eps`, `diluted_eps`, `operating_cf`,
`investing_cf`, `financing_cf`, `capex`, `free_cash_flow` are **absent from
ScalarAggregate**.

**finalizeBctcRefineTool.ts — columns written (lines 446-456):**

```typescript
if (agg.net_revenue       !== null) updates.push({ col: "net_revenue",       ... });
if (agg.gross_profit      !== null) updates.push({ col: "gross_profit",       ... });
if (agg.profit_before_tax !== null) updates.push({ col: "profit_before_tax",  ... });
if (agg.net_profit        !== null) updates.push({ col: "net_profit",         ... });
if (agg.total_assets      !== null) updates.push({ col: "total_assets",       ... });
if (agg.current_assets    !== null) updates.push({ col: "current_assets",     ... });
if (agg.total_liabilities !== null) updates.push({ col: "total_liabilities",  ... });
if (agg.equity_total      !== null) updates.push({ col: "equity_total",       ... });
if (agg.gross_margin_pct  !== null) updates.push({ col: "gross_margin_pct",   ... });
if (agg.net_margin_pct    !== null) updates.push({ col: "net_margin_pct",     ... });
```

Only these 10 columns are ever SET by the refine path. The remaining ~10 columns
(`operating_profit`, `ebitda`, `cash`, `eps`, etc.) retain whatever `parseBctcReport/
storeReport` wrote during the initial pdf-parse ingest — which for these columns is
almost always 0 or a garbage regex hit (eps=1 for FPT, eps=0 for ACB).

**Note on `operating_cf` / `investing_cf`:** FPT shows these as non-zero, meaning the
legacy storeReport regex did manage to populate them for FPT Q1-2026. But for ACB,
`operating_cf=0` confirms the regex also failed there. Neither is guaranteed by the
refine pipeline.

### Layer pinned: SCALAR-MAPPING (refine pipeline, projection layer)

The OCR extraction is present. The refine job ran and completed (DONE, 15/27 units).
The `bctc_table_rows` contain the correct values. The data is correct at the persist
layer for the 10 mapped columns. The gap is that `bctcScalarAggregator.ts` was scoped
to 10 columns at inception and has never been extended to cover the remaining ~10
columns in `financial_reports`. The 0/garbage values for secondary lines are from the
initial OCR-parse write that the refine pipeline never overwrites, not a failure of
extraction or storage.

**Recurring-bug escalation:** `bctcScalarAggregator.ts` has had ≥5 fix commits
(FU-5, FU-6c, FU-6d, FU-6e, FU-6f). Per the recurring-bug-escalation policy (≥2 fix
commits on same module), this module is flagged for a full-scope pass, not another
incremental patch.

### Proposed fix task: BEQ-3

**Label:** Full column audit — extend ScalarAggregate to cover all financial_reports scalar columns  
**Zone:** apps/mcp-server/  
**Agent:** dev-mcp-server  
**Size:** M  
**Scope:**
- `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`:
  Add to ScalarAggregate:
  - `operating_profit` — code "30" income_statement section
  - `cash` — code "110" balance-sheet (Tiền và các khoản tương đương tiền)
  - `eps` — derive from net_profit / shares_outstanding if available, or map from
    BCTC footnote label; currently garbage from regex
  - `ebitda` — derived metric (operating_profit + depreciation_amortization);
    compute if both components resolved, else null
  - `operating_cf`, `investing_cf`, `financing_cf` — cash flow codes "20", "30", "40"
    (noting code collision: income_statement also uses 20/30 — filter by
    `statement_section='cash_flow'`)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`:
  Add the corresponding `updates.push` clauses for each new column.
- This should be treated as a **complete column-audit pass** covering all 20+ columns
  in `financial_reports` that `parseBctcReport/storeReport` writes — not another
  incremental addition. Prevents a 6th, 7th, 8th fix commit on the same file.

---

## Symptom (c): Garbage `/docs` net_profit scalars

### Raw evidence

**Live /docs endpoint (GET /api/bctc-inspect/docs, 2026-06-02):**

```
CTG 2026-Q1:  net_profit = 5             net_profit_api_bridge = null   anomaly = false
EIB 2026-Q1:  net_profit = 1             net_profit_api_bridge = null   anomaly = false
VNM 2025-Q4:  net_profit = 0.000051      net_profit_api_bridge = 2,840,370  anomaly = true
FPT 2025-Q4:  net_profit = 20,225        net_profit_api_bridge = 2,509,520  anomaly = true
DIG 2025-Q4:  net_profit = 18            net_profit_api_bridge = 421,810    anomaly = true
HPG 2025-Q4:  net_profit = 5,597         net_profit_api_bridge = 3,864,080  anomaly = true
```

All garbage rows have `refine_status=PENDING` (confirmed by direct DB read above and
prior cycle).

**Source code — LIST_SQL (bctcInspectHandler.ts lines 119-131):**

```sql
SELECT
  id, action_code, company_name, period_type, period_year, period_quarter, sort_key,
  pdf_path,
  net_revenue, gross_profit, net_profit, net_profit_api_bridge,
  net_margin_pct, ocr_confidence, confidence_financial, extraction_confidence,
  parsed_at
FROM financial_reports
WHERE action_code NOT LIKE '%example%'
  AND action_code NOT LIKE '%error%'
  AND action_code NOT LIKE '%missing%'
ORDER BY parsed_at DESC
```

No `refine_status` filter. All rows are returned regardless of refine quality.
The `net_profit` column is read directly from `financial_reports.net_profit`.

**Write path (parseBctcReport/storeReport):**

For PENDING tickers, `net_profit` was written by the initial `storeReport` call via
`extractIncomeStatement`. This regex extractor produces garbage when:
- The PDF is a cover letter (CTG: ocr_confidence=0.0625, produced net_profit=5)
- The PDF format uses non-standard encoding (EIB: ocr_confidence=0.3125, net_profit=1)
- The unit scale detection misidentifies the scale (VNM: net_profit=5.1e-05 million VND
  = 51 VND absolute — likely a raw-VND value that bypassed the divide-by-1e6 step)
- The legacy OCR path parsed net_profit as revenue/1000 (FPT Q4-2025: net_profit=20,225
  = net_revenue(20,225,450 million)/1000)

**Divergence check — `/docs` vs `get_bctc_full`:**

Both surfaces read `financial_reports.net_profit` from the same DB column. There is NO
divergence between the two consumers. For DONE tickers (FPT 2026-Q1, ACB 2026-Q1), the
refine pipeline has already overwritten the correct value. For PENDING tickers, both
surfaces serve the broken OCR-parse value.

**`isDecimalShiftAnomaly` flag:** The handler already calls this function (lines 55-79)
and sets `anomaly_decimal_shift=true` when `|net_profit / net_profit_api_bridge| > 10`.
VNM/FPT Q4/DIG/HPG are correctly flagged. CTG and EIB are NOT flagged because
`net_profit_api_bridge=null` for these — the anomaly detector cannot fire without a
reference value.

### Layer pinned: SCALAR-PROJECTION + OCR-EXTRACTOR (initial ingest, then serve)

The `/docs` listing faithfully reflects `financial_reports.net_profit` — there is no
serve-layer bug. The garbage originates in `storeReport` (legacy OCR extractor) during
the initial pdf-parse ingest. The `/docs` handler has no refine_status guard, so it
exposes the garbage values directly. The fix has two separable parts:
1. Fix the upstream source (trigger refine, same as BEQ-2 → once DONE, the correct value
   overwrites the garbage).
2. Add a display-layer guard to prevent garbage from being shown before refine completes.

### Proposed fix task: BEQ-4

**Label:** Add refine_status display guard in /docs listing and get_bctc_full comparison  
**Zone:** apps/mcp-server/  
**Agent:** dev-mcp-server  
**Size:** XS  
**Scope (two independent sub-fixes, both in one XS task):**

Sub-fix 4a — `/docs` listing guard:
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`:
  In `handleBctcInspectDocs` (line 162), after fetching rows, add a `refine_status`
  column to `LIST_SQL` (add `refine_status` to the SELECT). In the response mapping,
  expose `refine_status` in `DocListItem`. Callers can then suppress or flag PENDING
  net_profit values. Alternatively, set `net_profit: null` in the response for rows
  where `refine_status='PENDING'` — this is a safe surface change (the viewer already
  handles null net_profit).

Sub-fix 4b — `buildComparisonSection` guard in get_bctc_full:
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`:
  In `buildComparisonSection` (lines 229-300), after the prior row query, add:
  ```typescript
  if (priorRow.refine_status === "PENDING") {
    return `=== QoQ/YoY COMPARISON ===\nPeriod prior (${priorRow.sort_key}) data not yet refined — comparison withheld.`;
  }
  ```
  This closes the contamination path where a PENDING prior row produces a nonsense YoY
  delta (e.g. FPT Q4-2025 net_profit=20,225 vs Q1-2026 net_profit=2,476,790 → +12146%).

**Note:** Sub-fix 4a and 4b are fully separable. Sub-fix 4b (YoY guard) is zero-risk
and should be shipped first; it is independent of BEQ-2 and BEQ-3.

---

## Summary: Layer-Pin Table

| Symptom | Tickers | Layer Pinned | Root Cause One-Line |
|---|---|---|---|
| (a) Empty refine | CTG, VCB | **Refine-trigger** | refine pipeline never dispatched; OCR present but `refined_units=0`, `refine_status=PENDING` |
| (b) Zeroed secondary lines | FPT, ACB | **Scalar-mapping** | `bctcScalarAggregator` maps only 10/20 columns; operating_profit/cash/eps never written by refine path |
| (c) Garbage /docs scalars | CTG, EIB, VNM, DIG | **OCR-extractor + no serve guard** | `storeReport` legacy regex writes garbage on initial ingest; `/docs` LIST_SQL has no refine_status filter |

---

## Fix Task Sequence for PM

Ordered by impact and risk:

| Task | Fix | Zone | Size | Blocks |
|---|---|---|---|---|
| BEQ-4b | refine_status guard in buildComparisonSection | dev-mcp-server | XS | nothing |
| BEQ-4a | /docs net_profit null-on-PENDING guard | dev-mcp-server | XS | nothing |
| BEQ-2 | audit + trigger refine for PENDING corpus (excl CTG) | dev-mcp-server | S | unblocks (a) and (c) |
| BEQ-3 | full ScalarAggregate column audit (20 cols) | dev-mcp-server | M | closes (b) |
| BEQ-5 | BCTC-CTG-ATTACHMENT-FETCH (real PDF) | dev-vps-crawls | TBD | prerequisite for CTG refine |

BEQ-4b and BEQ-4a can ship immediately in parallel.
BEQ-2 and BEQ-3 can run in parallel after BEQ-4.
BEQ-5 is a separate backlog item (BCTC-CTG-ATTACHMENT-FETCH already exists).

---

## Constraints and Scope Boundaries

- All four fix tasks are in `apps/mcp-server/` only. No pdf-extractor changes required.
- None of the four fixes have overlap with the BCTC-LAYOUT-FIRST re-architecture sprint.
  LAYOUT-FIRST changes the extraction INPUT layer; these fixes are in the projection
  and refine-trigger layers. BEQ-3 (ScalarAggregate extension) will require a trivial
  migration when LAYOUT-FIRST ships — acceptable.
- Zero DB schema changes required for BEQ-2, BEQ-3, BEQ-4. Schema already has all
  20+ columns in `financial_reports`.

---

## Confidence

All three symptoms are pinned with high confidence — raw DB values confirmed at each
layer, source code read for the relevant paths, no unresolved uncertainty.

No symptom is left unpinned.
