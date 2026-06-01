# TASK REPORT: BANK-DEV-3

**Task:** BANK-DEV-3 — Positive bank evidence discriminator  
**Sprint:** BANK-AWARE-BCTC  
**Date:** 2026-05-31  
**Agent:** dev-mcp-server  
**Commit:** `0e47bcda`  
**Status:** DONE

---

## What Was Done

Applied architect ruling BANK-ARCH-3 (Option C — positive bank evidence) to `isBankFormFromRows`
in `bctcFormType.ts`. Changed the discriminator body from:

```typescript
// BEFORE (BANK-DEV-2 — absence signal):
return !rows.some((r) => /^[0-9]{3}/.test(r.code ?? ""));
```

to:

```typescript
// AFTER (BANK-DEV-3 — positive evidence):
return rows.some((r) => /[A-Za-z]/.test(r.code ?? ""));
```

Updated the JSDoc to describe the positive-evidence rationale (full BANK-ARCH-3 specification
verbatim). Updated DV-BANK-7 in the consumer audit test. No consumer call-site changes.

---

## RED-before-GREEN Evidence

### Before the one-line change:

**FU-6f-eval-blob-blockers.test.ts:**
```
7 pass
1 fail
(fail) DV-FU6F-B1-3 — [GREEN guard] Corporate with gross_profit=null → stage-6 still RED
       > [GREEN guard] corporate domain + gross_profit=null → stage-6 red (not a bank, anchor still required)
       
       expect(received).toBe(expected)
       received: "yellow"
       expected: "red"
```

Root cause: VNM fixture seeds codes `["10","60"]` (income-only corporate). No 3-digit code
present → BANK-DEV-2 absence signal returns `true` (bank) → `goldenAnchors = ["net_revenue","net_profit"]`
→ gross_profit anchor dropped → 2/2 = 1.0 → stage-6 `"yellow"` instead of `"red"`.

**BANK-AWARE-1-consumer-audit.test.ts (before test updates, after code fix):**
```
24 pass
2 fail
(fail) DV-BANK-7 > Edge: row with code '99' (2-digit) → true (not a 3-digit code)
(fail) DV-BANK-7 > Mixed: one 3-digit code among many Roman codes → false (any corporate code = corporate)
```

These 2 tests had expected values that reflected the old absence-signal behaviour. Per
architect spec BANK-ARCH-3, their expected values change under the positive-evidence signal.

### After the one-line change + test updates:

**FU-6f-eval-blob-blockers.test.ts:**
```
8 pass
0 fail
```
DV-FU6F-B1-3: `["10","60"]` → no letters → `isBankFormFromRows = false` → corporate path
→ `goldenAnchors` includes `gross_profit` → 2/3 = 0.667 < 0.90 → stage-6 `"red"`. GREEN.

**BANK-AWARE-1-consumer-audit.test.ts:**
```
27 pass   (was 26 — Seed 5 added)
0 fail
```
- DV-BANK-7 Seed 1 (`["100","200","300","400"]`): no letters → `false` (corporate). GREEN.
- DV-BANK-7 Seed 2 (`["I","II","VIII","IX",null]`): "I","II","VIII","IX" have letters → `true` (bank). GREEN.
- DV-BANK-7 Seed 3 (`[]`): empty → `false` (fail-safe). GREEN.
- DV-BANK-7 Seed 4 (`["01","02","I","B"]`): "I","B" have letters → `true` (bank, contains letter codes I, B). GREEN.
- DV-BANK-7 Edge `["99"]`: no letter → `false` (was `true` under absence-signal; now correct). GREEN.
- DV-BANK-7 Edge `["1000"]`: no letter → `false`. GREEN (unchanged).
- DV-BANK-7 Mixed `["I","II","100",null]`: "I","II" have letters → `true` (was `false`; letter evidence wins). GREEN.
- DV-BANK-7 Seed 5 `["10","60"]`: no letter → `false` (DV-FU6F-B1-3 regression guard). GREEN (new).

---

## Type Check

```
bun tsc --noEmit → exit 0 (0 errors)
```

---

## Full Test Suite Results (batched — Bun 1.3.13 crashes on full suite due to C++ exception in bun itself)

All batches across all 42 test files:

| Batch | Files | pass | fail |
|-------|-------|------|------|
| Key BCTC + HCM-DISAMBIG | 7 | 89 | 0 |
| DB schema + orchestrator + hotfixes | 8 | 120 | 0 |
| Push/lock/signal/security | 7 | 102 | 0 |
| News/cascade/signal/VCB/system | 8 | 128 | 0 |
| TNB/chain/pek/rag | 7 | 116 | 0 |
| VNstock/sbv/contracts | 7 | 94 | 0 |
| Docker/fetch/embedding | 5 | 38 | 0 |

Total across batches: 649 pass, 0 fail. No regressions.

Note: `bun test` (all files at once) crashes with a C++ exception in Bun v1.3.13 — this is
a known Bun runtime bug unrelated to this change. Individual file/batch runs are all green.

---

## Files Changed

Only 2 files (scoped `git add` per C2 protocol):

1. `apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts`
   - JSDoc updated for `isBankFormFromRows` (BANK-ARCH-3 positive-evidence rationale)
   - Line 50: `!rows.some(r => /^[0-9]{3}/.test(...))` → `rows.some(r => /[A-Za-z]/.test(...))`
   - `isBankFormFromDb` unchanged (delegates to `isBankFormFromRows`, signature unchanged)

2. `apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts`
   - DV-BANK-7 block header comment updated (BANK-ARCH-2/DEV-2 → BANK-ARCH-3/DEV-3)
   - Seed 4 comment updated: reason now "contains letter codes I, B" (not "no 3-digit code")
   - Edge `["99"]`: expected `true` → `false` + description updated
   - Mixed `["I","II","100",null]`: expected `false` → `true` + description updated (letter evidence wins)
   - Seed 5 added: `["10","60"]` → `false` (DV-FU6F-B1-3 regression guard)

**HCM-DISAMBIG-extraction.test.ts: 0-diff (confirmed).**

---

## Zero-Touch Verification

The following files were NOT touched (per constraint):
- `apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts` — 0-diff
- `apps/mcp-server/src/application/usecases/computeBctcEval.ts` — 0-diff
- `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` — 0-diff
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` — 0-diff
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — 0-diff
- All other consumer files (C-1 through C-7 call sites) — 0-diff

---

## Next Step

BANK-OPS-3: rebuild mcp-server container, then BANK-QA-3: live verify `get_bctc_full(ACB)`
still serves bank path (ACB codes contain letters → `isBankFormFromRows = true` → bank path intact).
