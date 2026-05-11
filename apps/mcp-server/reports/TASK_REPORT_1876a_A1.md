# Task Report: 1876a-A1 — Precision Denominator Fix

**Date:** 2026-05-11
**File:** `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts` ~L340

## Bug

The top-level "Tổng" precision percentage used `hits / totalAlerts` as its denominator. This included UNKNOWN-outcome rows, understating real precision.

## Fix

Changed denominator from `totalAlerts` to `hits + misses` (scoreable rows only), matching the per-type breakdown formula at L369. Added divide-by-zero guard: if `scoreable === 0`, precision is 0%.

## Before / After Example

| Outcome | Count |
|---------|-------|
| HIT     | 1     |
| MISS    | 3     |
| UNKNOWN | 10    |
| Total   | 14    |

- **Before:** `Math.round(1 / 14 * 100)` = **7%** (wrong — UNKNOWN dilutes score)
- **After:**  `Math.round(1 / (1+3) * 100)` = **25%** (correct — only scored rows count)

## Test

`apps/mcp-server/src/__tests__/1876a-precision-denominator.test.ts` — 2 cases:
- (a) HIT=1, MISS=3, UNKNOWN=10 → 25%
- (b) HIT=0, MISS=0, UNKNOWN=5 → 0 (no divide-by-zero)
