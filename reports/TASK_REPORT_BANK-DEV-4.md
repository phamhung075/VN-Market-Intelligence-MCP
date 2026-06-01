# Task Report: BANK-DEV-4

**Sprint:** BANK-AWARE-BCTC
**Task:** BANK-DEV-4 — Hybrid discriminator (anchored Roman + 3-digit veto)
**Date:** 2026-05-31
**Commit:** `941bf552`
**Branch:** main

---

## Summary

Applied BANK-ARCH-4 FINAL hybrid discriminator to `bctcFormType.ts`.
This is the 4th and intended-final iteration of `isBankFormFromRows`.

---

## Root Cause of BANK-DEV-3 Regression

BANK-ARCH-3 (any-letter signal) assumed: "corporate Mẫu B01-DN codes are entirely
numeric." This was empirically false. Live FPT DB read confirmed VAS sub-codes with
letter suffixes: `411a`, `420a`, `420b`, `26b`. These are standard Vietnamese
Accounting Standards sub-item codes — not OCR artifacts.

`isBankFormFromRows(FPT_ROWS)` under BANK-DEV-3 → `true` (BANK). REGRESSION.

---

## Signal History

| Iteration  | Signal                       | ACB   | FPT   | Income-only `["10","60"]` |
|------------|------------------------------|-------|-------|---------------------------|
| BANK-DEV-1 | `domain="banking"`           | FAIL  | OK    | OK                        |
| BANK-DEV-2 | `!rows.some(/^[0-9]{3}/)`    | OK    | OK    | FAIL (bank false-positive)|
| BANK-DEV-3 | `rows.some(/[A-Za-z]/)`      | OK    | FAIL  | OK                        |
| BANK-DEV-4 | Hybrid (this)                | OK    | OK    | OK                        |

---

## The Fix — Exact Function Body Applied

File: `apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts`

```typescript
export function isBankFormFromRows(rows: BctcCodeRow[]): boolean {
  if (rows.length === 0) return false; // fail-safe: no rows → assume corporate
  const ROMAN_SECTION = /^(XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X|V)(\.\d+)?$|^[AB]$/;
  const CORP_BALANCE  = /^[0-9]{3}/;
  const hasRomanOrSection = rows.some(r => ROMAN_SECTION.test(r.code ?? ""));
  const hasCorpBalance    = rows.some(r => CORP_BALANCE.test(r.code ?? ""));
  return hasRomanOrSection && !hasCorpBalance;
}
```

`isBankFormFromDb` body is unchanged — it queries and delegates.

---

## Truth Table Assertions

| Case | Representative codes | hasRomanOrSection | hasCorpBalance | Result |
|------|----------------------|-------------------|----------------|--------|
| (a) ACB — BANK | `A, B, I, I.1, XIII, 01, null` | YES (A,B,I,I.1,XIII) | NO | TRUE (BANK) |
| (b) FPT — CORPORATE | `100, 270, 411a, 420a, 420b` | NO | YES (100,270,411) | FALSE (CORPORATE) |
| (c) Income-only — CORPORATE | `10, 60` | NO | NO | FALSE (CORPORATE — hasRomanOrSection gate) |

Edge cases:
- `["99"]` → NO Roman, NO 3-digit → `false` (CORPORATE — no positive evidence)
- `["1000"]` → NO Roman, YES 3-digit (prefix "100") → `false` (CORPORATE)
- `["I","II","100",null]` → YES Roman, YES 3-digit → `false` (CORPORATE — veto fires)
- `["01","02","I","B"]` → YES Roman (I, B match), NO 3-digit → `true` (BANK)
- `[]` → `false` (fail-safe)

---

## RED-before-GREEN Evidence

Before applying the hybrid fix (BANK-DEV-3 any-letter code running), after adding
Seeds 6/7 and updating Mixed expectation:

```
27 pass
2 fail

FAIL: DV-BANK-7 > Seed 6: FPT real VAS sub-codes [100, 270, 411a, 420a, 420b] → false (CORPORATE)
      received: true  expected: false
      (any-letter: "411a" contains "a" → true. WRONG.)

FAIL: DV-BANK-7 > Mixed: Roman codes with one 3-digit code [I,II,100,null] → false (corporate veto fires)
      received: true  expected: false
      (any-letter: "I"/"II" contain letters → true per BANK-ARCH-3. WRONG under BANK-ARCH-4.)
```

After applying hybrid fix:

```
29 pass
0 fail
```

---

## Gate Results

| Gate | Result |
|------|--------|
| `bun tsc --noEmit` | 0 errors |
| `BANK-AWARE-1-consumer-audit.test.ts` BEFORE (27 seeds) | 27 pass, 2 fail (RED: Seed 6 + Mixed) |
| `BANK-AWARE-1-consumer-audit.test.ts` AFTER (29 seeds) | 29 pass, 0 fail |
| `FU-6f-eval-blob-blockers.test.ts` (DV-FU6F-B1-3) | 8 pass, 0 fail |
| `HCM-DISAMBIG-extraction.test.ts` | 0-diff (untouched) |
| Combined (3 files) | 56 pass, 0 fail |

---

## Files Changed

1. `apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts`
   - Module-level JSDoc updated: sprint BANK-DEV-4, signal description "hybrid positive-bank + corporate-veto"
   - `isBankFormFromRows` JSDoc: full history block, three mandatory cases, pattern explanations per BANK-ARCH-4 spec
   - `isBankFormFromRows` body: replaced any-letter with hybrid (ROMAN_SECTION + CORP_BALANCE constants, 3-line logic)
   - `isBankFormFromDb`: unchanged

2. `apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts`
   - DV-BANK-7 section header: updated to reference BANK-ARCH-4/BANK-DEV-4
   - Seed 1 comment: updated to mention CORP_BALANCE
   - Mixed `["I","II","100",null]`: expected changed `true` → `false` (BANK-ARCH-4 veto wins over ARCH-3 letter-wins ruling)
   - Seed 5 comment: updated reason to match hybrid
   - Seed 6 added: FPT real VAS sub-codes → `false` (THE BANK-DEV-3 regression guard)
   - Seed 7 added: ACB real Roman codes → `true` (bank path intact)

---

## Zero Consumer Call-Site Changes

All 7 consumers (C-1 through C-7) call `isBankFormFromDb` or `isBankFormFromRows`
with unchanged signatures. The discriminator change is isolated to the function body.
`computeBctcEval.ts` scalar belt-and-suspenders unchanged.

---

## Next Step

BANK-OPS-4 (separate): rebuild mcp-server container so the new discriminator runs
against live ACB data. BANK-QA verification follows.
