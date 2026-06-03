# Architecture Brief: BCTC Debt Decomposition Gap — FU-DE-DECOMP-MAPPING

**Date:** 2026-06-03
**Author:** agents-architect
**Sprint:** BCTC-ANALYTICS-LAYER (follow-up)
**Task:** FU-DE-DECOMP-MAPPING SPIKE
**Status:** FINDINGS COMPLETE — ready for dev-team triage
**Timebox:** 120min (completed)

---

## 0. VERDICT: MAPPING GAP (not an extraction gap)

**The interest-bearing debt decomposition failure is a pure scalar-mapping gap. The rows ARE present in `bctc_table_rows` with correct values; they are never read by `bctcScalarAggregator.ts`.**

This verdict is supported by direct DB evidence from the live container (readonly queries via `docker exec … bun -e`). No ambiguity — see Section 2 for the full evidence chain.

The owning zone is exclusively **`dev-mcp-server`** — no `dev-pdf-extractor` changes are needed.

---

## 1. Problem Statement

On balance-COMPLETE DONE reports, `short_term_debt` and `long_term_debt` columns in `financial_reports` are zero (or near-zero garbage from the original OCR parse path), and `balance_sheet_json.currentLiabilities.shortTermDebt` / `.longTermDebt` are also zero. This makes `debt_to_equity` and `net_debt_to_ebitda` compute as NULL or near-zero, and the D/E ratio is served as N/A even though Total Liabilities is populated and the balance identity holds exactly.

Affected corpus (DONE reports):
- FPT 2026-Q1 (conf 81%): total_liab 28,464 tỷ present; short_term_debt=0, long_term_debt=0
- VNM 2025-Q4 (conf 94%): total_liab 18,829 tỷ present; short_term_debt=0, long_term_debt=0
- DHG 2026-Q1 (conf 44%): total_liab 802 tỷ; short_term_debt=0
- EIB 2026-Q1 (conf 31%): total_liab 243,524 tỷ; short_term_debt=0
- SHB 2025-Q4 (conf 44%): total_liab 824,575 tỷ; short_term_debt=0
- BSR 2025-Q4 (conf 13%): zero (low confidence — low priority)
- FPT 2025-Q4 (conf 81%): short_term_debt=0.000009 (OCR garbage from original parse)
- HPG 2025-Q4 (conf 44%): short_term_debt=38,729 — this is NOT interest-bearing debt (see §3)

**6/8 DONE reports have no usable debt decomposition.** HPG's non-zero value is a mapping error in the OCR path, not a correctly-decomposed debt figure.

---

## 2. Evidence Chain — Why MAPPING, Not EXTRACTION

### 2.1 Rows ARE present in bctc_table_rows

**FPT 2026-Q1** (report_id `e8ea3df5-3f32-413d-a3eb-c71634c0438d`):

| code | label | value_current | section |
|------|-------|---------------|---------|
| 321 | 10. Vay và nợ thuê tài chính ngắn hạn | 14,491,358,043,012 | general |
| 339 | 3. Vay và nợ thuê tài chính dài hạn | 1,605,069,048,520 | general |
| 300 | C. NỢ PHẢI TRẢ | 28,464,058,214,856 | general |
| 330 | II. Nợ dài hạn | 2,767,906,224,333 | general |

Both interest-bearing debt rows are present with correct values. The aggregator never reads them.

**VNM 2025-Q4** (report_id `4316f6d1-51ba-4912-a48c-dab5a64a2c81`):

| code | label | value_current | section |
|------|-------|---------------|---------|
| 319 | Vay ngắn hạn | 102,362,732,591 | balance_sheet |
| 330 | Nợ dài hạn | 309,069,411,399 | balance_sheet |

VNM uses code 319 (not 321) for short-term borrowings. No code 321 in VNM's corpus.
VNM has no long-term debt line at the borrowings level — the only "dài hạn" row is the section total (code 330, 309 tỷ which is mostly non-borrowing obligations).

### 2.2 The aggregator has NO short_term_debt / long_term_debt fields

`bctcScalarAggregator.ts` — `ScalarAggregate` interface (line 105-138):

The interface defines 20 fields. `short_term_debt` and `long_term_debt` are **not among them**. They were not added during BEQ-3 (the full-column-audit sprint that added operating_profit, ebitda, cash, operating_cf, investing_cf, financing_cf, capex, free_cash_flow). The BEQ-3 audit comment in the file explicitly notes "Previously unmapped fields" — debt decomposition was missed.

`finalizeBctcRefineTool.ts` BLOCK-1 (line 469-492): builds the UPDATE from `agg.*` fields. Since `agg.short_term_debt` and `agg.long_term_debt` do not exist on `ScalarAggregate`, they are never written in BLOCK-1.

BLOCK-3 (line 730-896) reads `short_term_debt` and `long_term_debt` from the DB to recompute `debt_to_equity` and `net_debt_to_ebitda` — but it reads the values that BLOCK-1 failed to write. Since BLOCK-1 left them at the original OCR-parse values (0 for most tickers), BLOCK-3 correctly resolves them as `null` (because `equity_total > 0` guard fires but debt is 0 → result is 0, not null — see next sub-section).

### 2.3 The HPG false-positive: OCR path uses wrong VAS codes

HPG 2025-Q4 has `short_term_debt = 38,729.57` tỷ in the DB. This is NOT from the refined path — it is a value written at original OCR parse time by `parseBctcReport.ts` → `balanceSheetExtractor.ts`.

`balanceSheetExtractor.ts` line 729:
```
shortTermDebt: fv(P_SHORT_TERM_DEBT, "311", 311)
```
where `P_SHORT_TERM_DEBT = /vay\s+và\s+nợ\s+thuê\s+tài\s+chính\s+ngắn\s+hạn/i`

HPG's code 311 row is labeled "Phải trả người bán ngắn hạn" (accounts payable, 38,729 tỷ). The label-pattern match FAILED (no "vay" label match), so the code-311 fallback was used — and HPG's code 311 is accounts payable, not short-term borrowings. This is a spurious match in the OCR extractor path.

HPG's actual short-term borrowings (code 319: "Vay và nợ thuê tài chính ngắn hạn", 38,532 tỷ) were never read because the OCR path was looking at code 311.

**HPG's `short_term_debt=38,729` is accounts payable, not debt.** The refined path would correctly map code 319 if the aggregator had a `short_term_debt` field — but it does not.

### 2.4 The VAS code landscape for interest-bearing debt

The Vietnamese VAS Circular 200 defines these codes for interest-bearing borrowings in the corporate balance sheet:

| Standard code | Label | Maps to |
|---|---|---|
| 321 (current) | Vay và nợ thuê tài chính ngắn hạn | `short_term_debt` |
| 319 (older layout, still in use) | Vay ngắn hạn | `short_term_debt` |
| 338 (current) | Phải trả dài hạn khác | NOT debt (other payables) |
| 339 (current) | Vay và nợ thuê tài chính dài hạn | `long_term_debt` |
| 334 (older layout) | Vay dài hạn | `long_term_debt` |

The OCR extractor (`balanceSheetExtractor.ts`) was built with code 311 for `shortTermDebt` and code 334 for `longTermDebt` — both wrong in the current corpus. This is why the OCR-parse path systematically produces garbage for `short_term_debt`.

The refined path (`bctcScalarAggregator.ts`) would produce correct values IF it had the fields and mappings — the rows are present. This is the fix target.

---

## 3. DDD Layer Assignment

| Component | Layer | Path |
|---|---|---|
| `ScalarAggregate` interface + `aggregateScalars` function | domain | `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` |
| `finalizeBctcRefineTool` BLOCK-1 (scalar UPDATE) | interface | `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` |
| `balanceSheetExtractor.ts` (OCR parse path) | domain | `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` |
| `bctcFullTools.ts` BLOCK-3 (ratio recompute-on-read) | interface | `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` |

---

## 4. Risk Flags

**R-1 (HIGH) — Multi-code VAS variance:** VNM uses code 319 for short-term borrowings; FPT uses 321. Both must be mapped. A single-code mapping will miss half the corpus. The mapping must try codes in priority order: 321 first (current standard), then 319 (older layout / still in use by some companies).

**R-2 (HIGH) — `balance_sheet_json` blob is stale:** `balance_sheet_json.currentLiabilities.shortTermDebt` and `.longTermLiabilities.longTermDebt` are also zeros (confirmed for VNM). The blob was written at OCR-parse time and never updated by the refined path. A correct BLOCK-1 fix must also sync the blob (following the existing FU-6f B-2 pattern in `finalizeBctcRefineTool.ts` line 514-537).

**R-3 (MEDIUM) — Idempotency on re-finalize:** Reports that were already finalized (DONE) will not re-run BLOCK-1 automatically. The fix only populates debt decomposition on NEW finalizations. A one-shot corpus re-finalize is needed for the 5 affected DONE reports — or a backfill migration script. Recommend a targeted `re_finalize_bctc_report` call on each affected report_id post-deploy.

**R-4 (MEDIUM) — Label-pattern requirement for code 319:** VNM code 319 is labeled "Vay ngắn hạn" (simple, short). The aggregator must not confuse it with code 319 rows in other sections. A section-filter to `balance_sheet` or `general` is mandatory (same pattern as BEQ-3 operating_profit / cash).

**R-5 (LOW) — HPG wrong value persists until re-finalize:** HPG's `short_term_debt=38,729` is accounts payable from the OCR path. After the fix, re-finalizing HPG will write the correct value from code 319/321. Until then, HPG D/E is wrong but at least not D/E=N/A.

**R-6 (LOW) — No `long_term_debt` code in VNM corpus:** VNM's liabilities have code 330 (section total "Nợ dài hạn", 309 tỷ) but no sub-code for long-term borrowings specifically. For VNM, `long_term_debt` will correctly resolve to null because there is no code 339/334/338 borrowings sub-line. That is honest — VNM has minimal long-term debt in Q4-2025.

---

## 5. Fix Fanout — Per-Cluster Tasks

### FIX-DE-1 — Add `short_term_debt` / `long_term_debt` to `ScalarAggregate` + aggregateScalars

**Owner zone:** `dev-mcp-server`
**File:** `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
**Layer:** domain
**Size:** S (< 50 lines)

**Specification:**

1. Add two new fields to `ScalarAggregate` interface (after `free_cash_flow`):
   ```typescript
   /** VAS code 321 (or 319 fallback) — Vay và nợ thuê tài chính ngắn hạn. Million VND. */
   short_term_debt: number | null;
   /** VAS code 339 (or 334 fallback) — Vay và nợ thuê tài chính dài hạn. Million VND. */
   long_term_debt: number | null;
   ```

2. Add to the `emptyScalars` initializer: `short_term_debt: null, long_term_debt: null`

3. Add mappings in the `aggregateScalars` function body (inside the balance-sheet scalars section, after `current_assets`):
   ```typescript
   // short_term_debt: VAS code 321 (current standard) or 319 (older layout).
   // Section filter: try 'general' first (FPT layout), then 'balance_sheet' (VNM layout).
   // Label hint for 321: /vay.*nợ.*thuê.*tài.*chính.*ngắn|vay.*ngắn.*hạn/i
   // Code 319 is used by some issuers as "Vay ngắn hạn" (plain borrowings, no financial lease).
   let short_term_debt =
     scale(findByCode(rows, "321", undefined, "general")) ??
     scale(findByCode(rows, "321", undefined, "balance_sheet")) ??
     scale(findByCode(rows, "321")); // broad last-resort
   if (short_term_debt === null) {
     // 319 fallback — older VAS layout; must check label to avoid "Phải trả ngắn hạn khác" collisions
     short_term_debt =
       scale(findByCode(rows, "319", /vay/i, "balance_sheet")) ??
       scale(findByCode(rows, "319", /vay/i, "general"));
   }

   // long_term_debt: VAS code 339 (current) or 334 (older layout).
   let long_term_debt =
     scale(findByCode(rows, "339", undefined, "general")) ??
     scale(findByCode(rows, "339", undefined, "balance_sheet")) ??
     scale(findByCode(rows, "339"));
   if (long_term_debt === null) {
     long_term_debt =
       scale(findByCode(rows, "334", /vay/i, "balance_sheet")) ??
       scale(findByCode(rows, "334", /vay/i, "general"));
   }
   ```

4. Add `short_term_debt` and `long_term_debt` to the returned `scalars` object.

**Note on `findByCode` labelHint for code 319:** Code 319 in some issuers is "Phải trả ngắn hạn khác" (other short-term payables) — NOT short-term borrowings. The `/vay/i` labelHint filters to rows whose label contains "vay" (loan/borrow), excluding the payables row. This is mandatory to avoid a wrong pick on those issuers.

**Note on bank path:** Banks (isBankPath=true) do not use VAS code 321/339 for borrowings — they report in the B02-TCTD form. Add `short_term_debt` and `long_term_debt` to `notApplicable` for the bank path: `["gross_profit", "current_assets", "gross_margin_pct", "short_term_debt", "long_term_debt"]`. This ensures stale OCR-parse values are cleared on re-finalize for bank reports.

**DoD:**
- `ScalarAggregate` has `short_term_debt` and `long_term_debt` fields
- `aggregateScalars` returns correct values for FPT 2026-Q1 (short=14,491 tỷ, long=1,605 tỷ) when passed the live rows
- Unit test in `apps/mcp-server/src/__tests__/` covering: FPT-pattern (code 321), VNM-pattern (code 319 with label hint), empty corpus (both null), bank corpus (both null in notApplicable)

---

### FIX-DE-2 — Wire debt scalars through BLOCK-1 UPDATE and blob sync

**Owner zone:** `dev-mcp-server`
**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`
**Layer:** interface
**Size:** S (< 30 lines)
**Depends on:** FIX-DE-1 (ScalarAggregate must have the fields first)

**Specification:**

1. In BLOCK-1 (line ~469-492), add two entries to the `updates` array after `free_cash_flow`:
   ```typescript
   if (agg.short_term_debt !== null) updates.push({ col: "short_term_debt", val: agg.short_term_debt });
   if (agg.long_term_debt  !== null) updates.push({ col: "long_term_debt",  val: agg.long_term_debt });
   ```

2. In the NOT-APPLICABLE handling (bank path), ensure `short_term_debt` and `long_term_debt` are in `nullClearCols` when the aggregator puts them in `notApplicable`. No change needed here since `nullClearCols = [...naSet]` is already generic — the fix is in FIX-DE-1 (add them to notApplicable for bank).

3. **Blob sync (R-2 fix):** In the FU-6f B-2 blob-sync section (line ~531-607), add mappings for `balance_sheet_json`:
   ```typescript
   const balanceSheetFieldMap: Record<string, string> = {
     current_assets: "currentAssets",  // existing
     short_term_debt: "currentLiabilities.shortTermDebt",  // NEW — nested path
     long_term_debt:  "longTermLiabilities.longTermDebt",  // NEW — nested path
   };
   ```
   The blob-sync code must handle nested paths (the existing code handles top-level keys only). Use a helper: `setNestedKey(blob, "currentLiabilities.shortTermDebt", value)` that splits on `.` and descends. If the intermediate key (`currentLiabilities`) is null or absent, skip silently (non-fatal).

**DoD:**
- After re-finalize on FPT 2026-Q1, `financial_reports.short_term_debt` = ~14,491,358 (million VND), `long_term_debt` = ~1,605,069
- `balance_sheet_json.currentLiabilities.shortTermDebt` updated to correct value
- `debt_to_equity` populated by BLOCK-3 (it already reads `short_term_debt`/`long_term_debt` from DB — will auto-compute correctly once BLOCK-1 writes them)

---

### FIX-DE-3 — Corpus re-finalize for 5 affected DONE reports

**Owner zone:** `dev-mcp-server` (ops-light — container exec)
**Layer:** infrastructure (data repair)
**Size:** XS (1 MCP tool call per report)
**Depends on:** FIX-DE-2 deployed + container rebuilt

**Specification:**

Call `finalize_bctc_refine` (or the equivalent re-finalize tool) for each of the 5 affected report IDs after the container is rebuilt with FIX-DE-1 + FIX-DE-2. Order: FPT 2026-Q1, VNM 2025-Q4, HPG 2025-Q4, DHG 2026-Q1, SHB 2025-Q4. (BSR and EIB have additional issues — low confidence, bank form — handled separately.)

Verify after each: `docker exec … bun -e "SELECT short_term_debt, long_term_debt, debt_to_equity FROM financial_reports WHERE action_code='FPT' …"` shows non-zero values.

**DoD:**
- All 5 DONE reports have non-null `short_term_debt` and/or `long_term_debt` (or explicitly null for companies with no borrowings)
- `debt_to_equity` not null for FPT (confirmed: 14,491+1,605 / equity ~40,122 ≈ 0.40 D/E)
- `get_bctc_full(code="FPT")` no longer shows D/E = N/A; shows approximately 0.40

---

### FIX-DE-4 — Fix OCR path: balanceSheetExtractor wrong VAS code for shortTermDebt

**Owner zone:** `dev-mcp-server`
**File:** `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`
**Layer:** domain
**Size:** XS (2-line change + test)
**Note:** This is a SEPARATE bug in the legacy OCR parse path, not the refined path. The refined path fix is FIX-DE-1/2. This fix prevents future OCR-parse ingests from writing wrong shortTermDebt values.

**Specification:**

Line 729: change `shortTermDebt` mapping from code "311" to code "321" (with code "319" as fallback):
```typescript
shortTermDebt: fv(P_SHORT_TERM_DEBT, "321", 321) || fv(P_SHORT_TERM_DEBT_ALT, "319", 319),
```
where:
```typescript
const P_SHORT_TERM_DEBT = /vay\s+v[àa]\s+n[ợo]\s+thu[êe]\s+t[àa]i\s+ch[ía]nh\s+ng[ắa]n\s+h[ạa]n/i;
const P_SHORT_TERM_DEBT_ALT = /vay\s+ng[ắa]n\s+h[ạa]n/i;
```

Line 740: change `longTermDebt` mapping from code "334" to code "339" (with "334" as fallback):
```typescript
longTermDebt: fv(P_LONG_TERM_DEBT, "339", 339) || fv(P_LONG_TERM_DEBT, "334", 334),
```

**DoD:**
- HPG re-parse produces correct `shortTermDebt` from code 319, not accounts payable from code 311
- Existing unit tests for `balanceSheetExtractor` pass

---

### FIX-DE-5 — recompute-on-read guard in bctcFullTools (BAL-1a complement)

**Owner zone:** `dev-mcp-server`
**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
**Layer:** interface
**Size:** XS (2-line addition)
**Depends on:** FIX-DE-2 deployed

**Specification:**

The BAL-1a decision (recompute-on-read for ratios) in `get_bctc_full` currently re-derives `debt_to_equity` from `latestRow.short_term_debt + latestRow.long_term_debt`. Once FIX-DE-1/2/3 populate those columns correctly, the recompute-on-read will auto-produce the correct D/E value. No change is required to `bctcFullTools.ts` for the ratio recompute itself.

However, the `buildSummarySection` output for D/E should display in a more informative way when debt decomposition is available. Current output: `D/E: N/A`. After fix: `D/E: 0.40x` (or similar). Verify the existing format string handles non-null debt_to_equity correctly — no code change needed if it does.

**DoD:**
- `get_bctc_full(code="FPT")` output shows `D/E: 0.40x` (approximately)
- `get_bctc_full(code="VNM")` shows correct D/E (VNM has ~102 tỷ short-term borrowings / 34,483 tỷ equity ≈ 0.003x — near-zero but not N/A)
- `balance_sheet_json` blob shows non-zero `shortTermDebt` / `longTermDebt` fields

---

## 6. Task Fanout Summary

| Task ID | Description | File | Zone | Size | Priority | Depends on |
|---|---|---|---|---|---|---|
| FIX-DE-1 | Add short/long_term_debt to ScalarAggregate + aggregateScalars mapping (codes 321/319, 339/334) | `bctcScalarAggregator.ts` | dev-mcp-server | S | HIGH | None |
| FIX-DE-2 | Wire debt scalars through BLOCK-1 UPDATE + blob sync (balance_sheet_json nested keys) | `finalizeBctcRefineTool.ts` | dev-mcp-server | S | HIGH | FIX-DE-1 |
| FIX-DE-3 | Corpus re-finalize for 5 DONE reports (FPT, VNM, HPG, DHG, SHB) | container exec | dev-mcp-server | XS | HIGH | FIX-DE-2 deployed |
| FIX-DE-4 | Fix OCR path: balanceSheetExtractor codes 321/319, 339/334 (prevent future garbage ingests) | `balanceSheetExtractor.ts` | dev-mcp-server | XS | MEDIUM | None (independent) |
| FIX-DE-5 | Verify recompute-on-read produces correct D/E in get_bctc_full post-FIX-DE-3 | `bctcFullTools.ts` | dev-mcp-server | XS | HIGH | FIX-DE-3 |

**Rebuild required after FIX-DE-1 + FIX-DE-2** (per ops policy). FIX-DE-3 runs post-rebuild. FIX-DE-4 can be batched with FIX-DE-1/2 in the same PR.

---

## 7. Relationship to BAL-1 Brief (2026-06-02)

The BAL-1 brief assumed "base scalars correct" for FPT/VNM. That assumption was correct for the core P&L and balance totals — but was implicitly FALSE for the debt decomposition sub-scalars (`short_term_debt`, `long_term_debt`). BAL-1 BLOCK-3 ratio recompute already reads `short_term_debt`/`long_term_debt` from the DB to compute `debt_to_equity` and `net_debt_to_ebitda` — meaning BLOCK-3 is correctly designed, but is receiving 0 as input because BLOCK-1 never wrote the values. FIX-DE-1+2 unblocks BLOCK-3 automatically; no change to BLOCK-3 is needed.

The `balance_sheet_json` blob-sync (R-2 / FIX-DE-2 item 3) is an extension of the FU-6f B-2 pattern already present in `finalizeBctcRefineTool.ts`. The existing blob-sync code handles top-level keys; the new fields require nested-key handling (`currentLiabilities.shortTermDebt`). This is the only structural new code in FIX-DE-2.

---

## 8. What Was NOT Investigated (Out of Scope)

- EIB / SHB bank-form classification (separate BAL-1b cluster, Candidates B-1/B-2 in the BAL-1 brief — distinct failure mode from this mapping gap)
- DHG extraction quality (confidence 44% — separate BEQ-6 cluster)
- `balance_sheet_json` structure for bank reports (B02-TCTD layout uses different blob keys)

---

*Brief authored by agents-architect 2026-06-03 per SPIKE FU-DE-DECOMP-MAPPING. All DB evidence verified by direct readonly queries on the live container. All file paths absolute to repo root.*
