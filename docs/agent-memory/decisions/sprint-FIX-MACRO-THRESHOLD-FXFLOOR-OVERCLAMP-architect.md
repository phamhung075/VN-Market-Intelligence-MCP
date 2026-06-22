# Decision Journal — Sprint FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP · architect

**Sprint goal:** Fix CI-red Root A — classifyDeviation FX %-floor over-clamps high/extreme to elevated (1269/1270/1326/FIX-1270)
**Agent:** architect
**Started:** 2026-06-22T20:53:52Z

---

### STEP architect-S1 · architect · 2026-06-22T21:00:00Z
**task-id:** FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP
**what-done:** CONTRACT DECISION — chose Option A (0.5% floor is correct product behavior); updated 4 pre-floor test files to align with the new contract introduced by commit dfb4e268.

**what-considered:**

**Option A — 0.5% floor is the correct product contract**
Update the 4 pre-floor tests (1269/1270/1326/FIX-1270) to expect "elevated" for sub-0.5% FX moves, OR restructure their high/extreme test cases to use deviations that clear the 0.5% floor.

**Option B — floor is too aggressive; narrow Guard-2 to phantom-σ cases only**
Make Guard-2 subordinate to Guard-1: skip Guard-2 when `absDeviation >= minAbsDeviation (50 VND)`. Reasoning: if a VND move passes the economic significance gate (≥ 50 VND), it should not be further clamped by Guard-2.

Option B was prototyped and verified to fix the 4 failing files. However it then broke 5 tests in 1307a-macro-thresholds.test.ts — specifically the FX-SIGMA-PHANTOM-EXTREME boundary tests that were written by dfb4e268 to validate the new contract.

The 1307a tests encode specific production context: the 2026-06-19 live false-CRITICAL alert (mean=26269.17, stdDev=12.47, current=26335 — +66 VND / 0.25% / 5.28σ = EXTREME alert). stdDev=12 is a "normal" tight band on USD/VND (SBV keeps rate stable), and the test asserts +66 VND → "elevated" (not extreme) because 0.25% is micro-noise on a policy-driven FX rate.

Option B would re-enable "extreme" for 55/60/66/75/100 VND deviations with stdDev=12-20, causing those false-CRITICAL alerts to re-fire. That is the EXACT problem dfb4e268 was designed to prevent.

**Why Option A is economically correct:**
1. USD/VND at ~26000: even 100 VND = 0.38% — micro-noise for a policy-driven FX rate where the SBV daily fix band is ±0.3-0.4%
2. Genuine macro events (policy rate shock, devaluation, IMF-event) move the rate ≥ 150-500 VND in one session (> 0.5%)
3. The 0.5% floor maps directly to the SBV band boundary: below 0.5% = within normal fix-band oscillation; above 0.5% = outside normal band = newsworthy
4. Guard-2 fire criteria "just-over 0.5%": 135 VND (0.51%) fires as extreme (1307a confirmed) — correct behavior
5. 1307a was added by dfb4e268 to encode this contract with live production failure scenario. Its tests take priority over pre-floor tests (they encode the SAME scenario with the FIX applied)

**What the failing pre-floor tests were testing:**
- 1269/1326 TC-3/4/5/6: direction labels "cao bất thường"/"thấp bất thường"/"cực cao"/"cực thấp" — this is still valid functionality; the tests need to use deviations that clear Guard-2
- 1270 AC-3: "50 VND should trigger EXTREME regardless of stdDev" — written before Guard-2; now 50 VND / 0.19% is micro-noise
- FIX-1270 AC-2: "60 VND > 50 VND minimum → must be high or extreme" — Guard-1 was the only gate; Guard-2 was not yet introduced

**why-decision:** Option A preserves the production fix from dfb4e268, keeps 1307a green, and aligns the 4 test files with the correct economic contract. Tests were restructured (not just deleted): TC-3/4/5/6 in 1269/1326 now use deviations of 168 VND (0.64%, 2.80σ → "high") and 200 VND (0.76%, 3.33σ → "extreme") to still exercise the direction-label code path correctly.

**why-change:** No change to macroThresholds.ts production code needed. Only test corrections.

**files-changed:**
- `apps/mcp-server/src/__tests__/1269-macro-direction-label.test.ts` — TC-3/4/5/6 updated: use mean=26269, stdDev=60, deviations 168 VND (high) and 200 VND (extreme) to clear 0.5% floor
- `apps/mcp-server/src/__tests__/1270-usd-vnd-threshold-fix.test.ts` — AC-3 updated: "50 VND EXTREME" → "150 VND (0.57%) EXTREME"; documents why 50 VND is now "elevated"
- `apps/mcp-server/src/__tests__/1326-macro-deviation-direction.test.ts` — TC-3/4/5/6 updated same as 1269
- `apps/mcp-server/src/__tests__/FIX-1270-usdvnd-alert-quality.test.ts` — AC-2 "60 VND" case updated to "150 VND (0.57%)" to test floor-cleared path

**phantom-sigma preserved:** 1307a (all 5 FX-SIGMA-PHANTOM-EXTREME boundary tests) and FIX-1269 remain green. The phantom-σ cases (66 VND / 0.25%, 100 VND / 0.38%) correctly return "elevated" — no regression.

**CI result:** 13377 pass / 42 skip / 15 fail — the 15 failures are in 8 files (083, 102, 125, 1324, 1398, 1783, 1793, FIX-1267), NONE of which are Root A macro files. Root A (1269/1270/1326/FIX-1270) not in failed list = green.

**BUILD-STANDARD:** not-applicable (bug fix, no new primitives)
