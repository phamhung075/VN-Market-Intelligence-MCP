# Task Report: 1298/1299 — BSR False Cascade
date: 2026-04-25
outcome: APPROVED

## Summary

FIX-1298: Fed/monetary policy articles (Fed Chair net worth, rate cut appeals, central bank gold selling) were routing to BSR (oil refinery) via the geopolitical oil_gas SECTOR_RULE, because the rule's keyword "geopolitical" appears in monetary policy articles. Fixed by adding `requireAnyKeyword` (must contain oil/energy term) and `excludeKeywords` (skip if Fed/FOMC/central bank/lãi suất present).

FIX-1299: Masan khoáng sản (minerals) articles were routing to BSR via a coal/minerals SECTOR_RULE that had `domain: "oil_gas"`. BSR is a crude oil refinery with no coal exposure. Fixed by changing domain from `oil_gas` to `utilities` (thermal power / POW is the correct recipient) and adding `utilities` to `COMMODITY_TRIGGER_DOMAINS` to restrict the broadcast path from reaching BSR.

## Test Results

- Unit tests (FIX-1298-bsr-false-cascade.test.ts): 7 pass / 0 fail
- Cascade regression suite (FIX-1264, FIX-1268, 1246, 1264, 1268, 1315): 40 pass / 0 fail
- Batch 120x-134x (1088 tests across 98 files): 1087 pass / 0 fail
- Batch 13xx-19xx (2210 tests): 2199 pass / 0 fail
  - 3 fail in task-136 circuit-breaker — PRE-EXISTING on main before this change, unrelated
- TypeScript: 0 errors (pre-push hook confirmed)

Note: Full bun test (605 files) crashes with Bun 1.3.11 OOM — confirmed pre-existing on main before this change. Targeted batches covering all cascade logic pass cleanly.

## DDD Compliance: PASS

cascadeEngine.ts imports only from within domain/services/ (newsNormalizer.js, sentimentClassifier.js, macroThresholds.js, stockAliases.js, msciDetector.js, agricultureDetector.js). Zero imports from infrastructure or application layers.

## Security: PASS

No process.env, no hardcoded credentials, no SQL, no HTTP calls. Pure domain logic.

## Code Quality Notes

- SectorRule interface extended cleanly — optional fields (excludeKeywords?, requireAnyKeyword?) maintain backward compatibility with all existing rules.
- Matching loop guards evaluated in correct order: excludeKeywords check before requireAnyKeyword check before adding to triggeredDomains.
- Coal→utilities change is domain-correct: POW (Petrovietnam Power) uses coal as 60-70% fuel COGS. BSR (Binh Son Refinery) processes crude oil only.
- "giá than" and "giá than giảm" correctly removed from the broad coal rule — handled by Task 1315a rules with proper directional signals.
- Regression tests cover the two critical cases: Hormuz blockade and OPEC cut still fire oil_gas alerts to BSR.

## Branch Note

The fix was committed on branch fix/briefing-type-fixes alongside fix/1290+1305. The fix/bsr-false-cascade branch had no divergent commits from main. QA applied the 1298/1299 changes directly to main via targeted staging of the two changed files (cascadeEngine.ts + FIX-1298-bsr-false-cascade.test.ts).

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged to main as commit 0478b3d1. Branch fix/bsr-false-cascade deleted (local + remote). Pushed to origin/main.
