---
task_id: FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR
type: FIX
title: Suppress BB/TA alerts on thin-liquidity tickers
priority: P3
severity: LOW
zone: apps/technical-analysis/ (code) + apps/mcp-server/ (config)
dev_agent: dev-technical-analysis
created_at: 2026-06-21T00:00:00Z
created_by: pm
status: TODO
blocked_by: []
blocks: []
---

## Summary

Add a positive minimum liquidity floor to BB and RSI alert scans to suppress noisy marginal breaks on illiquid tickers. The `bbAlertScanJob.ts` currently only rejects stub-bars (volume ≤ 0), so thinly-traded tickers (e.g., D2D with 6.4K daily vol) emit low-conviction alerts. Add a configurable volume floor (e.g., 100K shares/day) before emitting alerts.

## PM — Work Order

### Root Cause

`bbAlertScanJob.ts` (line 189) guards only against zero/stub-bars:
```typescript
if (lastCandle.volume <= 0) {
  return; // skip stub bar
}
```

A bar with positive but thin volume (e.g., 6.4K shares) passes this guard and can emit noisy band-break alerts on marginal movements. Example (2026-06-19): D2D 31100 below BB lower-band 31177 on only 6.4K volume (technically a break, but low conviction).

**Impact:** Evening digest carries meaningless alerts on illiquid tickers, diluting signal quality.

### Fix Spec

**Fix in:**
- `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts` (line ~189)
- `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts` (parallel TA scan, if it has similar gap)

**Change: Add minimum daily volume floor**

```typescript
// Config (domain/services/alertThresholds.ts or env var):
const MIN_DAILY_VOLUME_FOR_ALERTS = 100_000; // 100k shares; tunable

// In bbAlertScanJob.ts, before emitting alert:
if (lastCandle.volume <= 0 || lastCandle.volume < MIN_DAILY_VOLUME_FOR_ALERTS) {
  return; // skip stub-bar or thin liquidity
}

// Same check in taAlertScanJob.ts
```

**Alternative approach** (if volume is not representative):
- Use 20-day average volume floor instead of single-day: `if (avgVol20 < threshold)`
- Or use a volume percentile of the watchlist: `if (vol < 25th_percentile_volume)`

Recommend: start with single-day floor of 100K shares (tunable via config).

### Files to Edit
- `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts` (~5 lines)
- `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts` (~5 lines, if it has a parallel scan)
- `apps/mcp-server/src/domain/services/alertThresholds.ts` (add MIN_DAILY_VOLUME config, ~2 lines)
- `apps/mcp-server/src/__tests__/bbAlertScanJob.test.ts` (add test fixture for sub-floor ticker)

### Verification Gate

**LIVE alert-scan verification:**

1. **Thin stock suppressed:** Pick a known illiquid ticker (D2D, or a real sub-100K-volume ticker)
   - Manually insert/force a band-break condition on that ticker
   - Expected: bbAlertScanJob emits NO alert (suppressed by volume floor)
   - Verify: scan output empty or tagged "below floor"

2. **Liquid stock still alerts:** Pick a liquid ticker (NVL, VNM, MWG)
   - Trigger a band-break condition (can use fixture)
   - Expected: bbAlertScanJob emits alert as normal
   - Verify: alert present in output

3. **Edge case (exactly at floor):** Insert a 100K-volume bar with a band break
   - Expected: alert emitted (at threshold = pass)
   - Verify: boundary behavior correct

### Rebuild Required
**Yes.** Code change in bbAlertScanJob.ts + taAlertScanJob.ts + domain/services. Rebuild after merge.

### Risk Propagation
None identified. This is a signal quality gate (suppresses low-conviction noise). Conservative fix; no breaking changes.

### Handoff Notes
- Coordinate with dev-mcp-server if taAlertScanJob lives in a different repo/service; likely same zone
- The 100K threshold is tunable — no need to hardcode; use config or domain service constant
- If using 20-day average volume, need to ensure daily_ohlcv has sufficient history; may require additional DB query
- After fix: evening digest will carry fewer but higher-conviction BB/TA alerts

## NEXT Agent
**qa** — verify tsc+tests green, confirm handoff acceptance criteria, clear for ops rebuild.

## Developer

**Agent:** dev-technical-analysis
**Session:** 2026-06-21
**Status:** DONE → REVIEW

### Files changed

- `apps/mcp-server/src/domain/services/alertThresholds.ts` — NEW. Exports `MIN_DAILY_VOLUME_FOR_ALERTS = 100_000`. Single-day 100K share floor as tunable domain constant.
- `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts` — Added import of `MIN_DAILY_VOLUME_FOR_ALERTS`. Extended the stub-bar guard block (previously lines 181-192) into a two-tier gate: Tier 1 = existing stub-bar check (close<=0 || volume<=0), Tier 2 = new liquidity floor (volume < MIN_DAILY_VOLUME_FOR_ALERTS). Logs `thin-liquidity skip` at INFO level on suppression. No other logic changed.
- `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts` — Parallel floor check added. taAlertScanJob DOES have the same emit path (RSI overbought/oversold alerts → storeAlerts). Import added, two-tier gate extended at the latestCandle stub-bar check (previously lines 190-203). Same pattern as bbAlertScanJob. Floor applied identically.
- `apps/mcp-server/src/__tests__/FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR.test.ts` — NEW. 5 tests: LF-1 sub-floor ticker with band-break → no alert; LF-2 above-floor ticker with band-break → alert; LF-3 exactly at 100K floor → alert (boundary is inclusive pass); LF-4 mixed scan sub-floor+above-floor → only liquid one fires; LF-5 constant sanity check.

### taAlertScanJob assessment
Floor was NEEDED. taAlertScanJob has a direct parallel emit path: RSI extremes on the latest bar → storeAlerts. The latestCandle stub-bar check exists there already (lines 199-203); the liquidity floor was added immediately after it using the same `latestCandle` reference, consistent with the existing guard structure.

### Verification
- `bun tsc --noEmit`: exit 0
- `pnpm check`: exit 0
- New test file: 5/5 pass
- Existing BB regression tests (1309, 1391): 21/21 pass — no regression

### REBUILD REQUIRED
Yes (code change in two scheduler jobs + new domain service file). Ops batches after all mcp-server fixes land.

---

## Acceptance Criteria

- [ ] MIN_DAILY_VOLUME_FOR_ALERTS config added (e.g., 100K shares)
- [ ] bbAlertScanJob.ts: added volume floor check before emitting alert
- [ ] taAlertScanJob.ts: added volume floor check (if parallel scan exists)
- [ ] Test fixture: sub-floor ticker with band break → no alert emitted
- [ ] Test fixture: above-floor ticker with band break → alert emitted
- [ ] Test fixture: exactly-at-floor ticker with band break → alert emitted (boundary)
- [ ] LIVE evening cycle: no alerts from known thin-liquidity tickers (D2D, etc.)
- [ ] LIVE evening cycle: alerts still present for liquid tickers
- [ ] Rebuild successful + tests pass

---

## PM Checklist

- [x] Task decomposed from PO triage + architect brief
- [x] Files enumerated (2 scan jobs + domain config + tests)
- [x] Verification gate defined (LIVE scans, thin-stock suppression)
- [x] Rebuild required: Yes
- [x] **Conflict note:** bbAlertScanJob.ts in same zone as TASK-RSIFIX-1 → can run in parallel (different file)
- [x] Priority: P3 (lower urgency, after P1/P2 tasks complete)
- [x] Handoff created
- [x] WIP slot: Wave 2 or later (after WIP=2 constraint allows)

