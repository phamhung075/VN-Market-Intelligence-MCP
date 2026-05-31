# Task Report: BANK-QA-2 — Formal QA Gate, Sprint BANK-AWARE-BCTC
date: 2026-05-31
sprint: BANK-AWARE-BCTC
outcome: CHANGES_REQUESTED

---

## Test Results

### BANK + HCM-DISAMBIG (scoped re-run)
- BANK-AWARE-1-consumer-audit.test.ts (DV-BANK-1..7): **26 pass / 0 fail**
- HCM-DISAMBIG-extraction.test.ts: **19 pass / 0 fail** (0-diff confirmed)
- 240-bctc-full.test.ts: **5 pass / 0 fail**

### Cross-file run (7 files: BANK-AWARE-1 + HCM-DISAMBIG + 240-bctc-full + FU-6 suite)
83 tests across 7 files: **82 pass / 1 fail**

### TypeScript
`bun tsc --noEmit` — **0 errors**

### Full suite
Bun crashed after 233s (OOM panic — pre-existing host memory constraint, 16GB Mac).
Scoped run used instead; full suite is not blocking this verdict given the known crash mode.

---

## DDD Compliance: PASS

`grep -r "from.*infrastructure" bctcFormType.ts computeBctcEval.ts` — returns nothing.

## Security: PASS

`grep -rn "process\.env"` on modified source files — returns nothing.

---

## DV-BANK-7 Genuineness Assessment: GENUINE RED-BEFORE / GREEN-AFTER

Test body (BANK-AWARE-1-consumer-audit.test.ts lines 232–303) directly asserts on
`isBankFormFromRows(rows)` with four structural seed sets:

| Seed | Codes | Expected | Signal |
|------|-------|----------|--------|
| 1 | ["100","200","300","400"] (3-digit) | false (corporate) | OLD code: domain string "technology"→false — same result, different mechanism |
| 2 | ["I","II","VIII","IX",null] (Roman/null) | true (bank) | OLD: domain string "banking"→true — same result, wrong reason |
| 3 | [] (empty) | false (fail-safe) | OLD: domain undefined→false — coincidentally same |
| 4 | ["01","02","I","B"] (2-digit + alphabetic) | true (bank) | OLD: domain "other"→false — WRONG (this is the live ACB pattern); NEW: structural→true — CORRECT |

Seed 4 is the definitive discriminator: domain="other" is the live DB value for ALL tickers. OLD
`isBankForm("other")` returned false (broke ACB). NEW `isBankFormFromRows` returns true for the
ACB 2-digit/Roman code pattern. This test is a genuine RED-before/GREEN-after discriminator.
Not a false-green.

---

## Corpus Regression Scan (live container DB, direct sqlite3 reads)

### FPT (corporate, 2026-Q1) — baseline
- gross_profit: 4,244,889.9 tỷ (34.0% margin) — PRESENT and correct
- net_profit: 2,476,789.8 tỷ
- net_revenue: 12,479,997.2 tỷ
- total_assets: 68,586,094.8 | total_liabilities: 28,464,058.2 | equity_total: 40,122,036.6
- balance_diff: 0.0 (perfectly reconciles)
- current_ratio: 1.00x
- gross_profit ≠ net_profit: CONFIRMED (4,244,889 ≠ 2,476,789)
- isBankFormFromDb: false (145 rows present, 3-digit codes 100/110/120/etc.)
- VERDICT: NO misclassification. Corporate path intact.

### ACB (bank, 2026-Q1, report fea19bae) — bank baseline
- gross_profit: NULL — CORRECT (cleared by FU-6e, bank not-applicable)
- net_revenue: 6,989,162 tỷ (NII mapped)
- net_profit: 4,320,388 tỷ
- total_assets: 1,030,900,741 | total_liabilities: 932,149,689 | equity_total: 98,751,052
- balance: 932,149,689 + 98,751,052 = 1,030,900,741 — reconciles exactly
- isBankFormFromDb: true (codes: 01,02,04,I,A,B,I.1,I.2 — zero 3-digit codes)
- VERDICT: Bank correctly classified. No regression.

### VCB (bank, 2025-Q4) — additional check
- gross_profit: 16,169,790 = net_revenue (100% margin) — pre-existing PENDING artifact
- refine_status: PENDING | bctc_table_rows: 0
- VERDICT: Not finalized through BANK-AWARE pipeline. gross_profit=net_revenue is a
  pre-finalization placeholder, not a regression from BANK-DEV-2. Out of scope for this sprint.

---

## Blocking Issues

### B-1 — FU-6f-eval-blob-blockers.test.ts:387 — DV-FU6F-B1-3 fails

**File:** `apps/mcp-server/src/__tests__/FU-6f-eval-blob-blockers.test.ts:374-395`

**Test:** DV-FU6F-B1-3 — [GREEN guard] Corporate with gross_profit=null → stage-6 still RED

**Failure:**
```
Expected: "red"
Received: "yellow"
```

**Root cause:** `computeBctcEval.ts:185` — `isBankDomain` computed via `isBankFormFromDb(db, reportId)`.
The DV-FU6F-B1-3 test seeds VNM (domain=consumer_goods) with only 2-digit income-statement codes
("10" for Doanh thu thuần, "60" for Lợi nhuận sau thuế). Neither "10" nor "60" matches the
`/^[0-9]{3}/` corporate signal. Therefore `isBankFormFromRows` returns `true` (no 3-digit codes
found = bank path), goldenAnchors drops gross_profit, and stage-6 scores 2/2=1.0 → not red → yellow.

**This is a real test failure.** The green guard correctly exposes a discriminator boundary condition:
a corporate report that has ONLY 2-digit income codes (common for income-statement-only extractions
without balance sheet codes) is silently promoted to bank path, bypassing the gross_profit anchor
requirement.

**Scope:** `computeBctcEval.ts` discriminator logic needs a tighter heuristic, or the bank-path
fallback scalar condition (`total_assets > 1e9`) must be required when structural rows are present
but lack 3-digit codes. Alternatively the test fixture for DV-FU6F-B1-3 must seed at least one
balance-sheet code (e.g. code "270" or "280") to demonstrate the corporate nature.

**Note:** This failure is in the FU-6f test file (sprint FU-TRUST-REFRESH), not in the BANK-DEV-2
BANK-AWARE-BCTC tests. The BANK-AWARE-BCTC tests (BANK-AWARE-1: DV-BANK-1..7) are all green.

---

## Non-Blocking Notes

1. VCB PENDING scalars (gross_profit = net_revenue): pre-existing, unrelated to BANK-AWARE-BCTC.
   Should be addressed in a separate sprint (bank re-finalization sweep).

2. Full-suite Bun crash after 233s: pre-existing host memory constraint (16GB Mac, Docker 8GB cap).
   Not attributable to BANK-AWARE-BCTC changes.

---

## Merge Status

CHANGES_REQUESTED — 1 blocking issue.

The BANK-AWARE-BCTC sprint code (BANK-DEV-1: 4e8b7317, BANK-DEV-2: a72322a2, BANK-OPS-2) is
structurally sound and functionally correct for ACB + FPT. The blocking failure is in a
cross-sprint green-guard test (FU-6f) that exposes a discriminator edge case when income-only rows
use 2-digit codes. Dev must resolve either in the discriminator or the test fixture.

Round: 1
Next: dev-mcp-server — fix DV-FU6F-B1-3 blocking (discriminator edge case, 2-digit-only corporate).
