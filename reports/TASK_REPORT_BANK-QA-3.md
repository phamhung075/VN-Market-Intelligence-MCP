# Task Report: BANK-QA-3 — BANK-AWARE-BCTC Closing Verification Gate

date: 2026-05-31
sprint: BANK-AWARE-BCTC
task: BANK-QA-3
outcome: APPROVED
round: 3 (re-gate after BANK-DEV-4 fix chain)

## Context

BANK-QA-2 issued CHANGES_REQUESTED — 1 blocking: DV-FU6F-B1-3 RED.
Root: BANK-DEV-3 (any-letter signal `/[A-Za-z]/`) mis-classified corporate income-only seeds
as bank because `isBankFormFromDb` lacked a positive-bank evidence requirement.
BANK-ARCH-4 → BANK-DEV-4 replaced it with the HYBRID discriminator.

This gate re-verifies after BANK-DEV-4 (commit 941bf552, container 7f413304).

---

## 1. TypeScript

```
bun tsc --noEmit → exit 0 (0 errors)
```

## 2. Test Results

### Targeted BANK-AWARE-BCTC tests

| File | Pass | Fail | Status |
|------|------|------|--------|
| BANK-AWARE-1-consumer-audit.test.ts | 29 | 0 | GREEN |
| FU-6f-eval-blob-blockers.test.ts | 8 | 0 | GREEN |
| FU-6e-not-applicable-clear.test.ts | 6 | 0 | GREEN |
| 240-bctc-full.test.ts | 5 | 0 | GREEN |
| **Sprint total** | **48** | **0** | **GREEN** |

### Full suite (954 runnable files; 3 LanceDB files excluded — known Bun crash, pre-existing)

```
TOTAL PASS: 10662 / FAIL: 135
```

Failures are all pre-existing and unrelated to BANK-AWARE-BCTC:
- 089-tool-macro: get_macro_snapshot (15 failures — stale signal labels)
- 1414/1416-diacritics: kinhDich handler diacritics (16 failures — wave 4/5)
- 1423-carry/macro: carry trade injection tests (14+14 failures — rate injection)
- 1570b/c yield-spread, 159-health-audit, others

Zero BANK-AWARE-BCTC regressions in the non-targeted suite.

---

## 3. Truth-Table Seed Assertions (DV-BANK-7)

All three mandatory seeds verified GREEN under BANK-DEV-4 hybrid:

| Seed | Input | Expected | Result |
|------|-------|----------|--------|
| ACB Roman seed (Seed 7) | `["A","B","I","I.1","XIII","01",null]` | `true` (BANK) | PASS |
| FPT real codes (Seed 6) | `["100","270","411a","420a","420b","440"]` | `false` (CORPORATE) | PASS |
| Income-only (Seed 5) | `["10","60"]` | `false` (CORPORATE) | PASS |

Anti-false-green check — Seed 6 under BANK-DEV-3 (any-letter):
- `"411a".match(/[A-Za-z]/)` → truthy → `isBankFormFromRows = true` → test expected `false` → **RED under old code**.
- Under BANK-DEV-4: `CORP_BALANCE = /^[0-9]{3}/` fires on `"100"` → `hasCorpBalance = true` → returns `false` → **GREEN**.
- Genuine discriminator — not a trivial assertion.

## 4. DV-FU6F-B1-3 Status

**GREEN** (was RED in BANK-QA-2).

Test: `FU-6f-eval-blob-blockers.test.ts:374` — "corporate domain + gross_profit=null → stage-6 red"

Seed: codes `["10","60"]`, domain `"consumer_goods"`, `gross_profit = null`.

Under BANK-DEV-3:
- `isBankFormFromRows(["10","60"])` → `"10"/"60"` contain no letters → `false`.
- However `computeBctcEval` used domain check `/bank/i.test("consumer_goods")` = `false` at that point.
- The actual RED was caused by a different path: the BANK-DEV-2→3 transition left `computeBctcEval`
  calling `isBankFormFromDb` which with BANK-DEV-3 `any-letter` signal on codes `"10"/"60"` 
  returned `false` — but the fallback scalar heuristic `(gross_profit=null + total_assets>1T)`
  did NOT fire (VNM total_assets seed was not >1T) — so corporate anchors applied correctly
  but the test was probing whether the domain guard bled through. Per QA-2 findings:
  the ACTUAL root of RED was that codes `"10","60"` under BANK-DEV-2 (3-digit absence)
  had no 3-digit codes → `isBankFormFromDb = true` → bank anchors → 2/2=1.0 → not red.
- Under BANK-DEV-4: `ROMAN_SECTION.test("10")` = false, `ROMAN_SECTION.test("60")` = false →
  `hasRomanOrSection = false` → `isBankFormFromRows = false` → corporate anchors →
  `gross_profit=null` → 2/3 = 0.667 < 0.90 → **stage-6 RED** = test assertion satisfied.

## 5. Consumer Integrity

BANK-DEV-4 commit `941bf552` changed exactly **2 files**:
- `src/__tests__/BANK-AWARE-1-consumer-audit.test.ts` — test seeds updated (body only)
- `src/domain/services/financial-reports/bctcFormType.ts` — discriminator body only

**No consumer call-site (C-1..C-7) signature changed.** Function signatures:
- `isBankFormFromRows(rows: BctcCodeRow[]): boolean` — unchanged
- `isBankFormFromDb(db, reportId): boolean` — unchanged

Consumer C-6 (computeBctcEval) stage-6 verification:
- Corporate with all 3 anchors present → stage-6 NOT red (DV-BANK-5 + DV-FU6F-B1-2 GREEN)
- Corporate with gross_profit=null → stage-6 RED (DV-BANK-5 "CORPORATE" test + DV-FU6F-B1-3 GREEN)
- Bank with gross_profit=null → stage-6 NOT red (DV-FU6F-B1-1 GREEN)

This confirms: `gross_profit` remains in `goldenAnchors` for corporate — the golden-anchor
behavior is unchanged for non-bank reports.

## 6. DDD Compliance

`src/domain/services/financial-reports/bctcFormType.ts` — zero imports from infrastructure or
application layers. Domain-layer purity: PASS.

`computeBctcEval.ts` is application layer — infrastructure import (`bctcEvalStore.js`) is
permitted by DDD rules. PASS.

## 7. Security

`grep process.env` on modified files: 0 results. PASS.
No hardcoded credentials, secrets, or tokens in changed files. PASS.

## 8. Out-of-Scope Note (BCTC-CODE-COLUMN-HYGIENE)

Vietnamese label text leaks into the `code` column of `bctc_table_rows` (observed during
prior corpus reads). The hybrid discriminator is immune — anchored regex
`/^(XIII|...)(\.\d+)?$|^[AB]$/` requires exact structural match; Vietnamese prose strings
will never match. Flagged for future task BCTC-CODE-COLUMN-HYGIENE. Not blocking.

VCB remains `refine_status=PENDING` / 0 rows — pre-existing, not this sprint.

---

## Verdict

**APPROVED**

- tsc: 0 errors
- DV-BANK-7 all 3 mandatory seeds GREEN
- DV-FU6F-B1-3 GREEN (was the sole blocker in BANK-QA-2)
- Full suite: 10662 pass / 135 fail (all failures pre-existing, unrelated to sprint)
- Consumer call-sites unchanged — body-only fix confirmed
- Anti-false-green: FPT real codes seed proven genuinely RED under BANK-DEV-3
- DDD: PASS | Security: PASS

SSOT discriminator `isBankFormFromRows` (BANK-DEV-4 hybrid) is correct and production-ready.
