---
task_id: FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME
type: FIX
title: USD/VND false-CRITICAL phantom extreme
priority: P1
severity: HIGH
zone: apps/mcp-server/
dev_agent: dev-macro-indicators
created_at: 2026-06-21T00:00:00Z
created_by: pm
status: TODO
blocked_by: []
blocks: []
---

## Summary

Fix false CRITICAL severity escalation on FX indicators. USD/VND rolling stdDev window is pathologically tight (~12.5 VND), so a trivial 0.25% drift (66 VND) reads as 5.28σ CRITICAL. Add an absolute %-move floor (~0.5%) before severity escalates beyond HIGH; generic across all FX slow-moving indicators (usdVndRate, usdVndOfficial, rates).

## PM — Work Order

### Root Cause

The `classifyDeviation()` function in `domain/services/macroThresholds.ts` computes:
```
zScore = (current - mean) / stdDev
level = "CRITICAL" if absZ >= 3.0
```

For USD/VND on 2026-06-19:
- Current = 26335, Mean = 26269.17, Implied StdDev ≈ 12.47 VND
- zScore = 65.83 / 12.47 ≈ 5.28 → CRITICAL
- Actual move = 0.25% (trivial for SBV-fixed rate)

**Problem:** The rolling stdDev window is too tight or too short for a slow-moving SBV-fixed rate. A normal daily SBV move (±50 VND) = ~4σ already. The `minAbsDeviation` guard (line 139) is 50 VND but **only caps LEVEL to elevated, never bounds the σ NUMBER itself**, and it only fires when absDeviation < 50, so a 65-VND move passes the guard and displays as CRITICAL.

### Fix Spec

**Fix in:** `apps/mcp-server/src/domain/services/macroThresholds.ts`

**Change:** Strengthen `classifyDeviation()` to require BOTH σ-test AND an absolute %-move floor before escalating to HIGH/CRITICAL severity.

**Specific changes:**

1. **Add %-move floor for FX indicators:**
   ```typescript
   // For slow-moving FX (usdVndRate, usdVndOfficial, rates):
   const absPercentMove = Math.abs((current - mean) / mean) * 100; // in %
   const percentFloor = 0.5; // 0.5% minimum for CRITICAL/HIGH on FX
   
   if (isFxIndicator && absPercentMove < percentFloor) {
     // Reject escalation; cap at INFO/WARN
     return {
       level: "INFO", // or "WARN" if absZ >= 2
       sigma: zScore,
       absDeviation,
       percentChange: absPercentMove
     };
   }
   ```

2. **Keep minAbsDeviation as a secondary guard for non-FX indicators:**
   - For stock prices / other macro: keep existing 50-VND check
   - For FX: use %-floor instead (or in addition)

3. **Ensure σ NUMBER is never inflated in output:**
   - The `sigma` field in the response reflects the real zScore
   - But the `level` (severity) gate respects both σ AND %-floor

**Suggested thresholds** (tunable via config):
- %-floor for FX: 0.5% (typical SBV daily move range)
- Keep σ-floor at 3.0 for CRITICAL (zScore >= 3.0)
- Keep σ-floor at 2.0 for HIGH (zScore >= 2.0)

### Files to Edit
- `apps/mcp-server/src/domain/services/macroThresholds.ts` (classifyDeviation function, ~50 lines changed)

### Verification Gate

**LIVE macro digest verification:**

1. **False-CRITICAL fix:** Trigger a 0.25–0.4% USD/VND move (within normal SBV daily range)
   - Expected: evening digest shows this as INFO or WARN, **not CRITICAL**
   - Expected: sigma field still shows the real computed value (e.g., 5.28) but level ≠ CRITICAL
   - Verify: read JSON raw sigma + level

2. **Real HIGH still escalates:** Trigger a >0.5% move (genuine macro event)
   - Expected: CRITICAL or HIGH severity (zScore + %-floor both pass)
   - Verify: both alert-block and digest report same severity

3. **Non-FX indicators unaffected:** Check a stock-price deviation (e.g., a 3.5% single-day move)
   - Expected: still escalates to CRITICAL via σ-test alone (non-FX path)
   - Verify: no false negatives

### Rebuild Required
**Yes.** Code change in domain/services. Rebuild after merge.

### Risk Propagation
None identified. This is a severity gate tightening (reduces false positives); conservative fix. Existing REAL macro moves still escalate correctly.

### Handoff Notes
- The %-floor is domain logic, not tuning (belongs in domain/services not config)
- Test on live macro series: USD/VND, CNY/VND, SBV rates (all slow-moving FX)
- Consider: should minAbsDeviation be a second gate (keep it) or replace it? Recommend: keep both for defense-in-depth
- The sigma field in responses will still show the raw computed value (for transparency); the severity gate is separate

## NEXT Agent
**dev-macro-indicators** — edit classifyDeviation() to add %-move floor for FX indicators, test live on USD/VND.

---

## Acceptance Criteria

- [ ] classifyDeviation() in macroThresholds.ts updated
- [ ] FX indicator check: if absPercentMove < 0.5%, cap level at WARN/INFO (not CRITICAL/HIGH)
- [ ] sigma field still reflects real zScore (unchanged)
- [ ] Non-FX indicators bypass %-floor (existing σ-gate only)
- [ ] Test: 0.25% USD/VND move → INFO/WARN, not CRITICAL
- [ ] Test: 0.6% USD/VND move → CRITICAL/HIGH
- [ ] Test: 3.5% stock move → CRITICAL (non-FX, σ-gate fires)
- [ ] LIVE evening digest: USD/VND no longer falsely CRITICAL on normal SBV drift
- [ ] Rebuild successful + tests pass

---

## PM Checklist

- [x] Task decomposed from PO triage + architect brief
- [x] Files enumerated (1 domain service file)
- [x] Verification gate defined (LIVE macro series false-positive fix)
- [x] Rebuild required: Yes
- [x] No blockers; independent of RSI/foreign-flow/BB tasks
- [x] Handoff created
- [x] WIP slot: 1 of 2 (concurrent with TASK-RSIFIX-2 as Wave 1)

