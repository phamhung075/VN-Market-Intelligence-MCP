# Task Report: 1270 — USD/VND False Positive CRITICAL Threshold Fix

**date:** 2026-04-22
**outcome:** APPROVED

---

## Summary

Task 1270 implements a **minimum absolute deviation guard** for USD/VND-based macro indicators to prevent economically meaningless micro-fluctuations (±2-3 VND daily noise) from triggering false CRITICAL alerts. The fix applies only to VND-denominated indicators and leaves oil/gold unaffected.

**Files modified:** 2 (1 implementation, 1 test)
**Tests added:** 6 new acceptance criteria
**Key metrics:** 6143 total pass, 0 fail, 0 type errors

---

## Test Results

| Category | Result |
|----------|--------|
| Unit tests (Task 1270) | 6/6 pass ✓ |
| Macro regression suite | 96/96 pass ✓ |
| Full suite | 6143/6143 pass ✓ |
| TypeScript check | 0 errors ✓ |
| Failed tests | 0 ✓ |

**Related test files verified:**
- `1326-macro-deviation-direction.test.ts` — direction-aware labels: all pass ✓
- `1294-macro-spam-fix.test.ts` — spam suppression: all pass ✓
- `126-macro-cascade.test.ts` — cascade integration: all pass ✓
- `089-tool-macro.test.ts` — macro tool integration: all pass ✓

---

## Implementation Verification

### Core Logic (lines 133–150 of macroThresholds.ts)

**Guard calculation:**
```
absDeviation = |current - mean|
minAbsDeviation = 10 if name.includes("vnd"), else 0
```

**Downgrade rule:**
- If `minAbsDeviation > 0` AND `absDeviation < 10`:
  - If `level === "extreme"` or `level === "high"` → cap to `"elevated"`
  - Else → leave unchanged

**Result:** Prevents CRITICAL alerts while preserving normal/elevated gradation.

### Acceptance Criteria Coverage

| AC | Scenario | Input | Expected | Actual | Status |
|-----|----------|-------|----------|--------|--------|
| AC-1 | False positive guard | 2.8 VND diff, -3.68σ z-score | NOT extreme/high | elevated ✓ | PASS |
| AC-2 | Boundary activation | 10 VND diff | HIGH or EXTREME | high ✓ | PASS |
| AC-3 | Large moves still work | 50 VND diff | EXTREME | extreme ✓ | PASS |
| AC-4 | Below-threshold downgrade | 5 VND diff, -2.5σ | normal/elevated | elevated ✓ | PASS |
| AC-5 | Oil unaffected | brentCrudeUSD, 1.0σ | elevated | elevated ✓ | PASS |
| AC-6 | Gold unaffected | goldUSDPerOz, 2.0σ | high | high ✓ | PASS |

---

## DDD Compliance: **PASS**

- ✓ Domain service (`src/domain/services/macroThresholds.ts`) contains ZERO imports from `infrastructure/` or `application/`
- ✓ Pure business logic, no external dependencies
- ✓ Test file properly isolated in `src/__tests__/`

---

## TypeScript Compliance: **PASS**

- ✓ `bun tsc --noEmit` → 0 errors
- ✓ No unguarded non-null assertions (`!`)
- ✓ No `any` types introduced
- ✓ Import paths use `.js` extension (ESM)

---

## Security: **PASS**

- ✓ No hardcoded credentials or API keys
- ✓ No SQL queries (pure math logic)
- ✓ No `process.env` usage (N/A for domain service)
- ✓ No HTTP calls (N/A for domain service)

---

## Real-World Validation

**False positive scenario from SBV data:**
- Mean USD/VND: 26334 (rolling)
- Current value: 26331.2 (2.8 VND below mean)
- Standard deviation: 0.76 (tight historical band)
- Z-score: -3.68σ → **would have fired CRITICAL alert pre-fix**

**Post-fix result:**
- `absDeviation = 2.8 < 10` → guard triggers
- Level downgraded: **extreme → elevated**
- Alert suppressed: **false positive prevented** ✓
- Message: "USD/VND: 26331.2 — thấp hơn TB (-3.68σ dưới TB 26334)"

**10+ VND moves still trigger alerts:**
- Scenario: current=26324 (10 VND below mean 26334)
- Z-score: -13.16σ
- Guard: `absDeviation = 10 >= 10` → no downgrade
- Result: **HIGH alert triggered correctly** ✓

---

## Integration Impact

**Affected downstream systems:**
- `deviationToDelta()` — receives post-guard level, applies correct delta multiplier
- Cascade engine — receives downgraded levels, avoids spurious confidence boosts
- Alert Commander — no more false CRITICAL for micro-moves

**Unaffected indicators:**
- Oil (brentCrudeUSD) — no "vnd" in name → minAbsDeviation = 0 → full z-score logic applies
- Gold (goldUSDPerOz) — no "vnd" in name → unaffected
- Interest rates — no "vnd" in name → unaffected

---

## Files Changed

| File | Lines | Type | Changes |
|------|-------|------|---------|
| `src/domain/services/macroThresholds.ts` | 133–150 | Modified | Added absDeviation calc + minAbsDeviation guard + downgrade logic |
| `src/__tests__/1270-usd-vnd-threshold-fix.test.ts` | 1–114 | NEW | 6 test cases covering all AC + regression vectors |

---

## Merge Readiness: **APPROVED**

✓ All tests pass (6143/6143)
✓ TypeScript check: 0 errors
✓ DDD compliance verified
✓ Security scan: pass
✓ Regression suite: 96 macro tests pass
✓ Edge cases covered (2.8, 5, 10, 50 VND scenarios)
✓ Non-VND indicators verified unaffected
✓ Real-world false positive scenario traced and fixed

**Ready for merge to main.**

---

## Merge Procedure

```bash
git checkout main
git merge --no-ff task/1270-usd-vnd-threshold-fix \
  -m "merge(1270): USD/VND false positive CRITICAL threshold fix"
git branch -d task/1270-usd-vnd-threshold-fix
git push origin --delete task/1270-usd-vnd-threshold-fix
```

After merge:
```bash
bun test && bun tsc --noEmit  # final validation
```
