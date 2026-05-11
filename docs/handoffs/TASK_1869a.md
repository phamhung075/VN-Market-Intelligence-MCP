# TASK_1869a — Raise price_drop threshold -5% → -7%

**Handoff Date:** 2026-05-11
**Sprint:** 1869
**Type:** FIX
**Priority:** HIGH
**Owner:** developer
**Size:** ~45 min (1 const change, 3 test fixture updates)

---

## Context

Telegram report 2844 — price_drop alert precision at 50% (8 HIT / 8 MISS). Quality gate requires ≥60%. Root cause: `DEFAULT_DROP_PCT = -5` in `signalDetector.ts` too low for volatility profile of current 30-stock watchlist. VN circuit breaker at ±7% makes -7% threshold market-significant.

**Architect brief:** `docs/architecture-briefs/2026-05-11-price-drop-precision-tuning.md` (Option A, priority 1)

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | `DEFAULT_DROP_PCT` constant changed from `-5` to `-7` in `signalDetector.ts` | grep `DEFAULT_DROP_PCT` → verify `-7` |
| AC2 | All test fixtures using -5% threshold updated to -7% | run test suite `test signalDetector` → all pass |
| AC3 | No new files created; only const + fixture updates | verify <5 files modified |
| AC4 | Baseline test count unchanged (8804 pass) | `npm test 2>&1 \| grep -i "test.*pass"` → 8804 |

---

## Files in Scope

| Path | Type | Change |
|------|------|--------|
| `apps/mcp-server/src/domain/services/signalDetector.ts` | const | `DEFAULT_DROP_PCT: -5` → `-7` |
| `apps/mcp-server/src/**/__tests__/**` | fixtures | Update -5% refs to -7% in 2–3 test files |

**Estimated files touched:** 3–4

---

## Dependencies

- **Blocks:** None. Task 1869b and 1869b-seed depend on this but can be wired in parallel (recommend sequential for clarity).
- **Blocked by:** None.

---

## Handoff Instructions

1. Search codebase for `DEFAULT_DROP_PCT` usage in `signalDetector.ts` and dependent test fixtures.
2. Change const `-5` to `-7`.
3. Update test fixtures (search for `-5%` and `changePct: -5` in test files).
4. Run full test suite; verify baseline unchanged.
5. Create commit with type `fix` and message:
   ```
   fix(1869a): raise price_drop threshold -5% → -7%

   Addresses precision gate (50% → target 60%) by raising DEFAULT_DROP_PCT
   from -5 to -7 in signalDetector. Circuit breaker event significance.
   Eliminates FP Pattern A (borderline 5–6.9% drops).

   Telegram report: 2844
   ```

---

## Testing

- Unit test: `test('signalDetector detects drop at -7%')` should pass.
- Fixture test: `-5%` threshold removals should compile cleanly.
- Regression: baseline (8804) unchanged.

---

## Measurement (Post-Ship)

After 7 calendar days (≥5 trading days), verify:
- `get_alert_accuracy(days=30)` for `signal_type=price_drop` shows precision ≥60% on ≥10 scored alerts.
- Expected alert volume reduction ~30%.

---

## Risk

- **Recall loss >30%:** Medium likelihood. Mitigated by sector-wide decline signal (Step 5a) still catching -0.5%+ coordinated moves.
- **Early-stage breakdown miss:** Low. Mitigation in place.

---

## Rollback

If precision does not improve or recall drops >40%, revert to `-6` (compromise threshold) or `-5` (full rollback).

---

**Ship After:** Immediately (no dependencies).  
**Ship Before:** 1869b (wiring task, logically sequenced after).
