# Task Report: FU-4 RE-GATE — FU-TRUST-REFRESH
date: 2026-05-31
sprint: FU-TRUST-REFRESH
task: FU-4 RE-GATE (final trust gate after FU-6c aggregator fix + FU-6-redo-2 re-finalize)
outcome: CHANGES_REQUESTED

## Raw Scalar Rows (direct in-container bun:sqlite read)

### FPT — e8ea3df5-3f32-413d-a3eb-c71634c0438d
```
total_assets:       68,586,094.785217  (M VND = 68,586,095M)
total_liabilities:  28,464,058.214856
equity_total:       40,122,036.570361
net_revenue:        12,479,997.206775
gross_profit:        4,244,889.890688
net_profit:          2,476,789.833481
profit_before_tax:   2,803,844.281676
gross_margin_pct:   34.01%
net_margin_pct:     19.85%
refine_status:      DONE
confirm_status:     PENDING
```

### ACB — fea19bae-2b7a-4954-b3e0-e09d7bfc7390
```
total_assets:       1,030,900,741  (M VND)
total_liabilities:    932,149,689
equity_total:       1,030,900,741   ← WRONG (= total_assets; stale pre-FU-6c value)
net_revenue:            6,989,162
gross_profit:           6,989,162   ← WRONG (= net_revenue; stale pre-FU-6c value)
net_profit:                74,311   ← WRONG (wrong row pick: "Góp vốn, đầu tư dài hạn")
profit_before_tax:     147,029,433  ← WRONG (wrong row pick: "Chứng khoán đầu tư")
gross_margin_pct:    100.00%        ← WRONG (derived from gross_profit = net_revenue)
net_margin_pct:          1.06%
refine_status:      DONE
confirm_status:     PENDING
```

## RED FLAG 1 — ACB equity_total

**Finding: equity_total is WRONG, not missing.**

Stored value: 1,030,900,741 = total_assets. This is NOT 98,751,052 (correct VỐN CHỦ SỞ HỮU).

The aggregator returns equity_total=NULL for ACB (confirmed by running aggregateScalars directly
against live bctc_table_rows). The finalize tool's null-guard skips writing null values,
so the stale value from before FU-6c remains in the column.

**Root cause:** The ACB balance sheet row "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (code B, value=null)
appears before "VỐN CHỦ SỞ HỮU" (code VIII, value=98,751,052) in row_order, both in section=general.
Both rows pass the include filter (P_BANK_EQUITY matches "vốn chủ sở hữu"). The exclude filter
(P_BANK_EQUITY_EXCLUDE = /tổng nợ phải trả|nguồn vốn/) correctly rejects "TỔNG NỢ PHẢI TRẢ VÀ
VỐN CHỦ SỞ HỮU" but does NOT reject "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (lacks the "TỔNG" prefix).
Since findByLabelExcluding returns candidates[0] (no is_summary_row=1 among non-excluded), and
candidates[0] is the null-valued header row, equity_total resolves to null.

**Result of null equity_total:** finalize does NOT write equity_total → stale 1,030,900,741 persists.

## RED FLAG 2 — enforceBalanceIdentity fails open on null equity

**Finding: FAIL-OPEN. This is a GAP.**

Code at `bctcScalarAggregator.ts:294`:
```typescript
if (total_assets === null || total_liabilities === null || equity_total === null) {
  return null; // Cannot enforce when any component is absent
}
```

When equity_total=null (as happens for ACB), enforceBalanceIdentity returns null (no violation).
The caller in finalizeBctcRefineTool.ts sees `aggResult.balanceViolation === null` → proceeds
to write other non-null scalars → does NOT log an error → does NOT raise any alert.
The stale equity_total=1,030,900,741 remains silently in financial_reports.

**This is exactly the fail-open scenario:** a required scalar that cannot be resolved causes
the balance check to be silently skipped, rather than flagging the report as incomplete.
The ops "no violation logged" signal was technically accurate but misleading — no violation
means the invariant was skipped, not that balance holds.

## Additional ACB Wrong Picks

The aggregator also mis-picks via code VIII and IX (no label-hint filtering):

- **profit_before_tax**: code "VIII" → candidates[0] = "Chứng khoán đầu tư" (id 22393,
  value=147,029,433). Correct value = "Lợi nhuận trước thuế" ≈ 5,368,138M. WRONG.
- **net_profit**: code "IX" → candidates[0] = "Góp vốn, đầu tư dài hạn" (id 22397,
  value=74,311). Correct value ≈ 4,320,388M. WRONG.

These wrong picks occur because ACB's BCTC uses Roman numeral codes for both balance sheet
assets (section headers) and income statement line items, and the aggregator does not apply
label-hint filtering for codes VIII and IX (unlike code "I" which has P_BANK_CODE_I_HINT).

## Verification Checklist

### FPT
- total_assets ≈ 68,586,094M (NOT 3,399,067): PASS (68,586,094.785217)
- gross_profit ≈ 4,244,890 ≠ net_revenue 12,479,997 (~34% margin): PASS (gross=4,244,889.9)
- equity_total ≈ 40,122,037 ≠ 0: PASS (40,122,036.570361)
- Balance identity: 28,464,058.215 + 40,122,036.570 = 68,586,094.785 = total_assets → deviation=0.000000% PASS
- DT-1 digit-run: 0 hits (net_revenue=12,479,997 — no sequential pattern)
- DT-2 gross ≠ net: PASS (diff = 8,235,107.32)
- confirm_status = PENDING: PASS
- bctc_table_rows: 145 rows (FU-5b retain behavior — not duplication)
- refined_units: 15/15 DONE, latest_refined_at=2026-05-31 11:19:09: PASS
- bctc_eval stage 4 (TABLE_RECONSTRUCT): green, computed_at=2026-05-31 12:58:48 (today): PASS
- bctc_eval stages 1-3/5-6: yellow (pre-existing image/layout/OCR limitations): NON-BLOCKING
- get_bctc_full: reads from financial_reports — FPT scalars are correct: PASS

### ACB
- equity_total ≈ 98,751,052M: FAIL (stored: 1,030,900,741 = total_assets)
- equity_total ≠ total_assets: FAIL (equity_diff = 0 — identical values)
- gross_profit ≠ net_revenue: FAIL (both = 6,989,162, gross_margin_pct = 100%)
- profit_before_tax: FAIL (stored 147,029,433 is "Chứng khoán đầu tư" not actual PBT)
- net_profit: FAIL (stored 74,311 is "Góp vốn, đầu tư dài hạn" not actual net profit)
- Balance identity: 932,149,689 + 1,030,900,741 = 1,963,050,430 ≠ 1,030,900,741 → deviation=90.4% FAIL
  (but enforceBalanceIdentity returns null because equity from aggregator = null → FAIL-OPEN)
- net_revenue = 6,989,162M: PASS (correct)
- confirm_status = PENDING: PASS
- bctc_table_rows: 106 rows: PASS (FU-5b retain behavior)
- refined_units: 27/27 DONE, latest_refined_at=2026-05-31 11:21:12: PASS
- bctc_eval stage 4 (TABLE_RECONSTRUCT): green (no longer red), computed_at=2026-05-31 12:58:51: PASS

## Aggregator Direct Results

```
FPT aggregator output:  equity_total=40,122,036.57, balanceViolation=null (CORRECT)
ACB aggregator output:  equity_total=null, balanceViolation=null (FAIL-OPEN on null equity)
```

## get_bctc_full Spot-Check

The tool reads directly from financial_reports columns. For ACB:
- equity_total served = 1,030,900,741 (stale wrong value)
- gross_margin_pct served = 100% (wrong)
- profit_before_tax served = 147,029,433 (wrong)
- net_profit served = 74,311 (wrong)
get_bctc_full is NOT analysis-grade for ACB.

## Issues Found

### Blocking — 3 issues

**BLOCK-A: ACB equity_total persists stale wrong value (1,030,900,741 = total_assets)**

File: `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
Line: 470-480 (equity_total resolution, bank label fallback)

Root cause: `findByLabelExcluding` returns candidates[0] which is "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ
HỮU" (value=null) before "VỐN CHỦ SỞ HỮU" (value=98,751,052). The null-valued section header
wins by row order. P_BANK_EQUITY_EXCLUDE must be extended to also reject labels containing
"nợ phải trả" without the "tổng" prefix, OR findByLabelExcluding must skip null-valued
rows and continue to the next candidate, OR the pick must prefer non-null candidates.

Fix: In `findByLabelExcluding`, after exclude filter, sort candidates by value_current IS NOT NULL
DESC (prefer rows with real values over null-valued section headers). Or: extend P_BANK_EQUITY_EXCLUDE
to `/t?[oổ]ng?\s*n[oợ]\s+ph[aả]i\s+tr[aả]|ngu[oồ]n\s+v[oố]n/i` (optional TỔNG prefix).

---

**BLOCK-B: ACB profit_before_tax and net_profit wrong picks via Roman numeral code collision**

File: `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
Lines: 415-437 (profit_before_tax and net_profit, bank code VIII/IX paths)

ACB uses code "VIII" for both balance sheet ("Chứng khoán đầu tư") and income statement
("Chi phí hoạt động"). Code "IX" used for both "Góp vốn, đầu tư dài hạn" and
"Lợi nhuận thuần từ hoạt động KD trước DPRRTD". The aggregator picks candidates[0] (row order)
without label filtering — it picks the wrong item first.

Fix: Add labelHint to findByCode calls for codes "VIII" and "IX" on the bank path, similar
to the existing P_BANK_CODE_I_HINT pattern for code "I":
- Code "VIII" profit_before_tax: hint = /l[oợ]i\s+nhu[aậ]n\s+tr[uướ]c\s+thu[eế]/i
- Code "IX" net_profit: hint = /l[oợ]i\s+nhu[aậ]n\s+sau\s+thu[eế]/i
If hint finds no match, fall through to label-based lookup (P_PBT / P_NET_PROFIT).

---

**BLOCK-C: enforceBalanceIdentity fails open on null equity — must treat unresolved REQUIRED scalar as violation**

File: `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
Lines: 289-310 (enforceBalanceIdentity)

Current behavior: any null component → return null (no violation). This is fail-open.
When equity_total is null (failed to resolve), the balance check is silently skipped.
The finalize tool sees no violation, does not log an error, and silently leaves stale wrong
values in financial_reports. The invariant's purpose is to catch wrong picks — null equity
means equity was not successfully resolved, which IS a detectable failure state.

Fix: Add a REQUIRED scalar check before the null-skip:
```typescript
// If any required balance component is null, treat as a resolution failure (not a skip)
if (total_assets === null || total_liabilities === null || equity_total === null) {
  // At least one required component unresolved — cannot verify balance identity.
  // Return a descriptive violation so caller can log + skip scalar write for consistency.
  const missing = [
    total_assets === null ? "total_assets" : null,
    total_liabilities === null ? "total_liabilities" : null,
    equity_total === null ? "equity_total" : null,
  ].filter(Boolean).join(", ");
  return `REQUIRED SCALARS UNRESOLVED: ${missing} — balance identity cannot be verified`;
}
```
The caller already handles balanceViolation != null by logging error + skipping scalar UPDATE.
This converts fail-open-on-null into fail-loud-on-null, which is the correct behavior.

Note: This ALSO requires that when balanceViolation is present due to null scalars,
the caller does NOT write ANY scalars (including the non-null ones), because writing
partial scalars with wrong equity context is misleading. The current caller already
does `if (aggResult.balanceViolation !== null) skip UPDATE` — this is correct.

### Non-Blocking

- FPT gross_profit stored as float (4,244,889.890688) — correct value, sub-VND rounding
  from raw VND scale division (68.6 trillion ÷ 1,000,000). Non-blocking (correct order of magnitude).
- bctc_eval stages 1-3/5-6 still yellow for both reports — pre-existing image/OCR limitation,
  not introduced by FU-6c. Non-blocking per QA-checklist.

## Verdict: CHANGES_REQUESTED

FPT passes all checks. FPT scalars are real, balanced, correctly mapped.
get_bctc_full serves correct FPT numbers.

ACB has 4 wrong scalars in financial_reports (equity_total, gross_profit, profit_before_tax,
net_profit), a 90.4% balance deviation, and the balance invariant fails open on null equity.
The aggregator FU-6c fix is partially correct (equity exclude pattern works for "TỔNG NỢ PHẢI TRẢ..."
but not for the un-prefixed section header "NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU"). Additional
label-hint fixes needed for codes VIII and IX.

## RETURN
DONE: QA re-gate complete — 3 blocking issues found (see above)
NEXT: dev-mcp-server | apply BLOCK-A (equity null-value skip), BLOCK-B (VIII/IX labelHint),
      BLOCK-C (enforceBalanceIdentity fail-loud on null); then re-finalize ACB; then re-gate
HANDOFF: docs/handoffs/HCM-QA-handoff.md (or new FU-4 handoff)
PIPELINE: continue
