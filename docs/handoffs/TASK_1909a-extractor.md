---
sprint: 1909
branch: task/1909a-cashflow-extractor-expansion
size: M
zone: apps/mcp-server/src/domain/services/financial-reports/
depends_on: []
blocks: [1909c-reparse-validation]
---

## TLDR

Expand `cashFlowExtractor.ts` from simple line-scanner to multi-layout `extractSplitBlockAll` pattern with positional-drift override guards, matching 1908c precedent. Add fixtures (VNM/DIG/VCB Q4-2025) to verify drift detection + correction. Enables end-to-end OCF validation for Layer 7 G-step.

---

## [PM] Planning Context

**Zone:** `apps/mcp-server/src/domain/services/financial-reports/`

**Acceptance Criteria:**
- [ ] `extractCashFlow()` refactored to use `extractSplitBlockAll` for all 3 OCF sections (operating/investing/financing)
- [ ] Positional-drift override guard on grand totals: if `sum(sub-items) / stated_total > 5` AND both > 0, override with sub-item sum + emit console.warn
- [ ] Unit-multiplier detection via `detectUnitMultiplier` helper (shared with JANITOR-014 pattern)
- [ ] Confidence scoring aligned to `BCTC-1345b`: `confidence < 0.2` → `low_confidence` flag; `confidence = 0` → skip insert
- [ ] Test file `1909a-cashflow-extractor-expansion.test.ts` with inline OCR mock fixtures (VNM/DIG/VCB Q4-2025)
- [ ] 38 baseline BCTC tests PASS + ≥3 new OCF fixture tests GREEN
- [ ] `tsc 0` errors

**Files to read first:**
- `docs/architecture-briefs/2026-05-14-bctc-val07-extractor-rethink.md` (authority pattern: Option B)
- `docs/handoffs/REQ_1909.md` § 1909a (FR-1 through FR-5, edge cases)
- `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts:716-725` (drift guard pattern to mirror)
- `apps/mcp-server/src/__tests__/1908c-bctc-val07-totalassets-plausibility-override.test.ts` (fixture reference)

**Files to create:**
- `apps/mcp-server/src/__tests__/1909a-cashflow-extractor-expansion.test.ts` — inline OCR mock fixtures (no PDF binary in repo)

**Files to modify:**
- `apps/mcp-server/src/domain/services/financial-reports/cashFlowExtractor.ts:extractCashFlow()` — refactor to `extractSplitBlockAll`, add drift guard (FR-1/2)
- `apps/mcp-server/src/domain/services/financial-reports/extractorHelpers.ts` — verify `detectUnitMultiplier` / `extractNumber` are exportable (FR-3)

**Dependencies:**
- `extractSplitBlockAll` helper (already in extractorHelpers.ts from 1908c)
- `BCTC-1345b` confidence schema (already deployed)
- `balanceSheetExtractor.ts` 1908c drift guard as reference pattern

**Knowledge needed:**
- `docs/policies/dev-standards.md` § DDD: domain layer must have zero I/O
- `docs/standards/tnb-methodology-layers.md` § Layer 7 G-step acceptance gate (OCF vs NI ratio)
- `reference_low_confidence_handling.md` (confidence threshold logic)

**Edge cases to handle:**
- E-1: 3 OCF sections page-split across PDF pages — `extractSplitBlockAll` must merge text stream correctly
- E-2: Bank BCTC layout with alternate VN labels (`lưu chuyển tiền từ hoạt động kinh doanh` vs `hoạt động ngân hàng`) — regex patterns accommodate both
- E-3: Negative cash outflows as parenthesised `(800.000)` — verify `parseVnNumber` handles correctly post-refactor
- E-4: `operatingCF = 0` legitimately — guard condition requires both `stated_total > 0 AND sub_item_sum > 0` to avoid false override

---

## Architect rubber-stamp (SD-1 resolved)

**SD-1 (CONFIRMED):** VN BCTC cash flow PDFs consistently carry numeric line codes (e.g. "20" operating, "30" investing, "40" financing totals). Same dual strategy as `balanceSheetExtractor.ts` (code-based primary + keyword secondary fallback) is correct. No fallback-strategy gap.

---

## Test fixtures

Inline OCR mock data required (no PDF binary in repo):

1. **VNM Q4-2025 OCF block** — multi-layout, page-spanning, must trigger drift override (analogous to VNM Q4-2025 balance sheet drift in 1908c)
2. **DIG Q4-2025 OCF block** — same drift pattern (different scale)
3. **VCB Q4-2025 OCF block** (bank layout, operating/investing/financing sections distinct) — regression guard, override must NOT fire

Baseline: 38 existing BCTC tests must still PASS (044-bctc-cashflow.test.ts + 1878a-ocf-column-migration.test.ts + 1890a-get-cash-flow.test.ts).

---

## Implementation notes

- Threshold ratio = 5 (same as 1908c balanceSheetExtractor guard)
- console.warn format: `"[cashFlowExtractor] BCTC-1909a: <section> positional drift detected; overriding."`
- No new I/O dependencies — `extractCashFlow()` remains pure domain function (zero I/O)
- Post-merge: container will be rebuilt by ops; 1909c reparse validation blocked until 1909a + 1909b both deployed
