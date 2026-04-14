# Task Report: 1206 — Cascade Keyword Precision Fix
date: 2026-04-13
outcome: APPROVED

## Summary

Two keyword precision bugs in `src/domain/services/cascadeEngine.ts` SECTOR_RULES:

- (A) Bare "cầu" in the CAPEX keyword list matched unrelated phrases such as
  "toàn cầu" (global) and "nhu cầu" (demand), spuriously triggering
  `construction` signals.
- (B) No rule existed for the Vietnamese real-estate term "đất vàng" (prime
  urban land), so it fell through unhandled.

## Test Results

- Unit tests (1206): 4 passed / 0 failed (7 expect() calls)
- Full regression: 4351 passed / 0 failed across 298 files
- TypeScript strict check: 0 errors

## Acceptance Criteria Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-7 | "nhu cầu thép toàn cầu tăng mạnh" does NOT trigger construction | PASS |
| AC-8 | "đất vàng trung tâm TP.HCM" triggers real_estate bullish, not gold_mining | PASS |
| AC-9 | "xây cầu vượt cao tốc Bắc-Nam" still triggers construction | PASS |
| extra | "toàn cầu hóa" does NOT trigger construction | PASS |

## Manual Spot Checks

1. Bare `"cầu"` — confirmed absent from SECTOR_RULES keyword lists in
   `cascadeEngine.ts`. CAPEX rule now uses specific phrases: "xây cầu",
   "cầu đường bộ", "cầu vượt", "cầu cao tốc".

2. "đất vàng" rule — confirmed at line 775, mapped to `real_estate`,
   direction `up`, confidence 0.75, with three keyword variants:
   `["đất vàng", "quỹ đất vàng", "vị trí đất vàng"]`.

3. gold_mining collision — no bare `"vàng"` token exists in gold_mining
   keyword lists. "đất vàng" cannot cross-fire. Confirmed by grep; comment
   at line 773 documents this invariant.

## DDD Compliance: PASS

`cascadeEngine.ts` is a pure domain service. Zero imports from
`infrastructure/` or `application/`. DDD scan returned no violations.

## Security: PASS

No `process.env` in production src (test-only usages are acceptable test
isolation patterns). No hardcoded credentials. No SQL changes.

## Issues Found

### Blocking
None.

### Non-Blocking
- `process.env["DB_PATH"]` appears in `src/infrastructure/db/schema.ts`
  (lines 64, 550) as a fallback alongside `Bun.env`. This pre-dates task
  1206 and is tracked separately; not a regression introduced here.

## Merge Status

Merged: `task/1206-keyword-fix` → `main` via `--no-ff`.
Branch deleted locally and from remote.
Post-merge TypeScript check: PASS (enforced by pre-push hook).
