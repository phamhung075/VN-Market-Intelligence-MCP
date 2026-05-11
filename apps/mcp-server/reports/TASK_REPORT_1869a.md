# TASK_REPORT_1869a — Raise price_drop threshold -5% → -7%

**Date:** 2026-05-11
**Sprint:** 1869
**Task:** 1869a
**Status:** DONE
**SHA:** d884be66

---

## Summary

Changed `DEFAULT_DROP_PCT` from `-5` to `-7` in `signalDetector.ts`. Aligns threshold with VN circuit breaker significance at ±7% (HOSE). Eliminates FP Pattern A: borderline -5% to -6.9% drops that mean-revert intraday.

---

## AC Verification

| # | Criterion | Result |
|---|-----------|--------|
| AC1 | `DEFAULT_DROP_PCT === -7` in signalDetector.ts | PASS |
| AC2 | Test suite: affected fixtures updated, all pass | PASS — 124/124 in 4 signal files |
| AC3 | ≤5 files touched | PASS — exactly 5 |
| AC4 | Baseline test count unchanged | PASS — 9132 pass / 17 fail (all pre-existing) |

---

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/domain/services/signalDetector.ts` | `DEFAULT_DROP_PCT: -5 → -7`, JSDoc updated |
| `apps/mcp-server/src/__tests__/063-signal-detector.test.ts` | TC-1: -5% → -7% fixture |
| `apps/mcp-server/src/__tests__/122-domain-services.test.ts` | SD-03 boundary -5→-7, SD-04 boundary -4.99→-6.99, SD-14 via watchlistThreshold |
| `apps/mcp-server/src/__tests__/133-adaptive-thresholds.test.ts` | TC-17 + TC-22 comment updates |
| `apps/mcp-server/src/__tests__/1076-market-scan-noise-retirement.test.ts` | FIVE_PCT_DROP fixture → -7% |

---

## Test Results

- Targeted tests (4 files): 124 pass / 0 fail
- Full suite: 9132 pass / 17 fail (all pre-existing infrastructure failures — RSS, VPS, chromium, network)
- No signalDetector-related failures

---

## Deviations from AC

None. All 4 AC criteria satisfied. Note: test baseline was 9132 (not 8804 in handoff) due to test suite growth since handoff was authored. Pre-existing failure count stable.

---

## Notes

SD-14 required a `watchlistThresholds` override to test the `medium` severity branch (5–6.9%) — with default -7% threshold, 5-6.9% drops no longer fire at default. The severity ladder `priceSeverity()` is unchanged; branch is still reachable via explicit lower threshold.
