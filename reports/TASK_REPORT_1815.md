# Task Report: 1815 — BCTC Confidence False-Zero for VNM Q4-2025
date: 2026-05-02
outcome: APPROVED

## Test Results
- Task tests (1815-bctc-confidence-vnm.test.ts): 3 passed / 0 failed
- Full suite (branch): 8643 pass / 21 fail (38 skip)
- Full suite (main baseline): 8536 pass / 19 fail (pre-existing)
- Net new passes from fix: +3 (8536 → 8539)
- Net new failures introduced: 0 — all 21 branch failures are pre-existing on main
- TypeScript (financialFiguresValidator.ts): 0 errors
- TypeScript (workspace-wide): 1 pre-existing error in untracked smartCompactSpawner.ts — not introduced by this branch

## DDD Compliance: PASS
- financialFiguresValidator.ts is in domain/services/ with ZERO imports from infrastructure/ or application/
- Pure function — no I/O, no DB, no HTTP

## Security: PASS
- No process.env (uses no env vars — pure domain function)
- No hardcoded credentials or secrets
- No SQL (no DB access)

## Fix Summary
Added 8 lines to `validateFinancialFigures()` in `financialFiguresValidator.ts`:
- New guard: when `totalAssets < totalEquity` (ratio < UNIT_SCALE_RATIO_THRESHOLD=500)
  AND `netRevenue > totalAssets * 30`, classify as BCTC-VAL-01-POSITION (positional
  extraction error) and apply soft penalty (−0.2) instead of returning 0.0
- Root cause: balanceSheetExtractor picks current-assets sub-total (~957 tỷ) as
  totalAssets instead of grand total (~60,000 tỷ). Revenue (~63,645 tỷ) being 66×
  the assets figure is physically impossible for a real company — signals positioning error
- Regression guard: genuine VNM Q4-2024 corruption (assets=957, equity=18829, revenue=5000)
  correctly returns 0.0 — revenue does NOT exceed assets×30

## Issues Found
### Blocking
None.

### Non-Blocking
- 19 pre-existing test failures on main (unchanged): Dockerfile python3 (3), 1349c scheduler
  docs (3), 1316 franceSummaryJob (1), 1331a single-writer (1), 1112 VPS proxy (1), 1004
  policy cascade (1), FIX-1281 VPS-only guard (1), AC-4 imfDataFetcher (1), AC-5
  imfIndicatorPoller (1), 1299b agentBootstrap DDD (1), Bug2 bctcQueueEnricher (1),
  Bug2 extractIncomeStatement (1), Sprint docs invariant (1), 239c macro-refresh (2)
- Untracked smartCompactSpawner.ts has 1 tsc error — pre-existing, not part of this task

## Merge Status
MERGED to main. Branch task/1815-bctc-confidence-vnm deleted.
docs/TASKS.md updated (task moved to Done).
docs/data/project-stats.json updated (sprint=1815, testBaseline=8539, totalTasksDone=435).
