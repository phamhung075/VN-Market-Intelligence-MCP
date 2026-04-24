# TASK 1309a — Cascade Rule Escalation: 4 Missing Sector Rules

## TLDR

Add 4 missing cascade rules to SECTOR_RULES in cascadeEngine.ts.
Gaps identified from reports 1264/1268/1286 + Taiwan regression.

**Branch**: main (direct — no feature branch, small patch)
**Baseline**: 6659 tests (after 1310a) → 6673 after this task

---

## Gap Summary

| # | Report | Trigger | Expected | Status |
|---|--------|---------|----------|--------|
| 1 | 1264 | Hormuz blockade | oil_gas BULLISH (BSR) + aviation BEARISH (VJC) | Pre-existing rules (Task 1246) verified |
| 2 | 1268 | Govt stock market support | securities BULLISH (SSI/VCI) + banking BULLISH (BID/VCB) | Added EN keyword variant |
| 3 | 1286 | Coffee/rice export decline | agriculture domain fires; NO broadcast to real_estate | Added agriculture to COMMODITY_TRIGGER_DOMAINS + new export rule |
| 4 | Taiwan | Taiwan geo from 1303i | tech+securities cascade | Regression guard tests added |

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/cascadeEngine.ts
  - Added `"government stock market support"` keyword to securities stabilization rule (line ~549)
  - Added agriculture export decline SECTOR_RULE with coffee/rice/seafood keywords (after line 1147)
  - Added `"agriculture"` to `COMMODITY_TRIGGER_DOMAINS` set (line ~2804)

tests_written:
- src/__tests__/1309a-cascade-gaps.test.ts — 15 assertions, all GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true  # 6673 pass, 14 fail (all pre-existing)
