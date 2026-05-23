# P2-E1 — Regression Scenario Pair Spec (G11 Alarm Bell)

**Parent brief:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Phase task plan:** `phase-2-task-plan-go.md` §P2-E
**Date:** 2026-05-23  **Author:** QA  **Pilot:** technical-analysis

---

## 1. Purpose

Define a **pair of test scenarios A + B** such that fixing scenario A's injected bug has a *realistic* chance of inadvertently breaking scenario B. This is the test apparatus that proves **G11 (Regression alarm bell works)** — the dashboard + flow rule (P2-F1, G12 DoD landed in `cc7578f1`) catch cross-primitive collateral damage *before* the agent declares DONE.

If the regression mechanism is contrived (no plausible shared code path), the alarm never fires and G11 remains unprovable. The mechanism specified below is grounded in the **current** Phase 1 Go primitive code (HEAD `6d7a5746`), not in a hypothetical refactor.

---

## 2. Scenario Pair

### Scenario A (primary) — RSI Wilder smoothing off-by-one

- **Primitive:** `apps/technical-analysis/pkg/primitive/rsi/rsi.go`
- **Function:** `Calculate(closes []float64, period int) ([]float64, error)`
- **Failure mode (to be injected in P2-E2):** off-by-one in the Wilder smoothing recurrence at lines 56–57:
  - Current (correct): `avgGain = (avgGain*float64(period-1) + gain) / float64(period)`
  - Injected (bug):    `avgGain = (avgGain*float64(period) + gain) / float64(period-1)` *(or `period-1` ↔ `period` flip — exact form chosen in P2-D1 / P2-E2)*
- **Scenario JSON that turns RED:** `docs/scenarios/technical-analysis/primitives/rsi-golden.json`
  - Tolerance ±1 RSI point. The off-by-one shifts every value after the seed; first post-seed RSI diverges by >1.5 points → card flips GREEN→RED.
  - `rsi-overbought-pullback.json` and `rsi-oversold-bounce.json` will also flip RED (correlated failures, same recurrence path) — all three are part of A's RED footprint.
- **Input shape:** `closes []float64, period int`.

### Scenario B (regression canary) — Moving Average EMA seed

- **Primitive:** `apps/technical-analysis/pkg/primitive/moving_average/moving_average.go`
- **Function:** `CalculateEMA(closes []float64, period int) ([]float64, error)` (also reached via `CalculateMovingAverage(... , "EMA")` dispatcher)
- **Canary scenario JSON (must stay GREEN):** `docs/scenarios/technical-analysis/primitives/ma-golden.json`
  - Tolerance `0.0001` — much tighter than RSI's `1.0`. A *single* misplaced index or coefficient swap in the seed/recurrence loop changes EMA[0] or EMA[1] beyond tolerance → card flips GREEN→RED.
  - Secondary canary: `ma-sma-vs-ema.json` (tolerance `0.000001`) — even more sensitive; flips RED for any drift in the EMA recurrence.
- **Input shape:** `closes []float64, period int` — **identical to A**.

### Scenario JSON status

Confirmed present in Phase 1 P1-D1 suite (commit `c6af6839ec`, 2026-05-22):

| File | Role |
|---|---|
| `docs/scenarios/technical-analysis/primitives/rsi-golden.json` | A — primary RED |
| `docs/scenarios/technical-analysis/primitives/rsi-overbought-pullback.json` | A — correlated RED |
| `docs/scenarios/technical-analysis/primitives/rsi-oversold-bounce.json` | A — correlated RED |
| `docs/scenarios/technical-analysis/primitives/ma-golden.json` | **B — canary (must stay GREEN; if RED, alarm has fired)** |
| `docs/scenarios/technical-analysis/primitives/ma-sma-vs-ema.json` | B — secondary canary |

No new scenario JSONs required. (AC-3 satisfied; no gap to escalate to architect/dev-ta.)

---

## 3. Why the natural fix for A could break B (shared code path)

Three load-bearing links between A and B in the current code — each independently sufficient to make a regression realistic:

### 3a. Identical input contract
Both `rsi.Calculate` and `moving_average.CalculateEMA` consume `(closes []float64, period int)` and return `([]float64, error)` with the same error sentinels (`ErrInvalidPeriod`, `ErrInsufficientData`, `ErrInvalidPrice`). An agent who refactors A's input validation block (lines 21–31 of `rsi.go`) into a shared helper will be tempted to apply it to MA as well — and any drift in the helper (e.g. tightening `period < 2` to `period < 1` to match MA, or vice versa) propagates.

### 3b. Shared seed pattern (SMA over first `period` values)
Both functions compute a seed as `sum / period` over the first `period` values:
- `rsi.go` lines 35–43: seed `avgGain`/`avgLoss` from first `period` deltas.
- `moving_average.go` lines 82–86: seed EMA as `sum / period` over first `period` closes.
- `macd/ema.go` lines 22–27: identical pattern again.

An agent fixing the RSI off-by-one is highly likely to inspect this seed loop (it is *adjacent* to the buggy recurrence and the natural diagnostic question is "is the seed also wrong?"). If they "harmonize" the loop bounds — e.g. changing `for i := 1; i <= period` to `for i := 0; i < period` in the RSI seed, then pattern-copying the change to MA — MA EMA seed shifts and `ma-golden.json` EMA[0] = `11.625` no longer holds.

### 3c. Explicit refactor temptation: the `macd/ema.go` TODO
`apps/technical-analysis/pkg/primitive/macd/ema.go` line 3 states *verbatim*:
> "NOT exported outside this package; shared EMA will live in pkg/primitive/ma (P1-B4g)."

This is a flashing neon sign for any agent reading the codebase during a fix: *"there is a planned consolidation here."* A "while I'm here" refactor that lifts MACD's `calcEMA` into the `moving_average` package — or, worse, replaces `CalculateEMA`'s implementation with a call into the moved helper — risks altering the seed convention (MACD's `calcEMA` indexes outputs differently: see comment "ema starts at index period-1 of values"). MA's `CalculateEMA` keeps `out[0] = SMA-seed`; MACD's `calcEMA` returns `out[0] = SMA-seed` *at output index 0* but conceptually represents `values[period-1]`. A consolidation that picks the wrong convention flips `ma-golden.json` RED.

### Failure mode summary

| Agent action during A's fix | Effect on B |
|---|---|
| Lifts RSI input validation into shared helper, applies to MA | If validation diverges (e.g. `period < 1` vs `< 2`), MA edge scenario flips |
| Refactors seed loop bounds to "look cleaner" | MA EMA seed value drifts → `ma-golden.json` RED |
| Consolidates MACD `calcEMA` into `moving_average` per the TODO | Seed-index convention mismatch → `ma-golden.json` and/or MACD goldens RED |
| Renames a `period`/`period-1`/`period+1` constant globally via IDE refactor | High collision risk: RSI uses `period-1`, MA uses `period+1` — IDE rename hits both |

---

## 4. Test plan (G11 alarm verification)

The injection + dispatch happens in **P2-E2** (downstream of this spec). For G11 to be *proven*, all of the following must occur in P2-E2/E3:

1. **Pre-injection baseline:** dashboard shows all 25 scenarios GREEN (sandbox run on HEAD before any bug injection).
2. **Inject bug A** per §2 above into `rsi.go`. Commit the injection on a throwaway branch (not main).
3. **Confirm A's RED footprint:** sandbox rerun shows `rsi-golden.json` RED (plus the two correlated RSI scenarios). **Crucially: confirm `ma-golden.json` and `ma-sma-vs-ema.json` are still GREEN at this point** — the canary has not yet fired; it only fires if the *fix* introduces a regression.
4. **Dispatch dev-technical-analysis agent** with only the RSI failure (do NOT mention MA, do NOT mention B). The handoff says: "rsi-golden.json is RED, please fix." Agent must run its full flow including the G12 dashboard-green DoD step (per `2026-05-22-refactor/p2-f-flow-rule-brief.md` and the F2 landing in `cc7578f1`).
5. **Observe one of three outcomes** (each maps to a G11 verdict):
   - **(a) Agent fix flips RSI scenarios GREEN, MA scenarios stay GREEN.** → G11 N/A this cycle (agent didn't touch shared paths). Run multiple trials to increase chance of triggering B; if B never fires across N≥3 dispatches with different bug variants, G11 alarm mechanism cannot be proven by this pair — escalate to PO for stronger pairing.
   - **(b) Agent fix flips RSI scenarios GREEN but MA scenarios go RED, and agent's G12 step catches it (does not declare DONE, iterates).** → **G11 PROVEN: alarm bell works.** Cycle count includes the regression iteration.
   - **(c) Agent declares DONE with MA scenarios RED.** → **G11 FAILED: alarm bell did not stop the agent.** Root cause: either flow rule (P2-F1) not enforced, dashboard not rendering MA state, or DoD step skipped. Escalate to PM + Architect for flow-rule reinforcement.
6. **Cycle accounting:** per TA-specific `baselineCycleCount = 1.5` from `bug-inventory.json`, target ≤ 2 cycles for outcome (b). One extra cycle (the regression-catch iteration) is *expected and acceptable* — that is the alarm bell doing its job. More than 2 cycles total = G10 target also at risk (escalate jointly).

---

## 5. Coordination with P2-D1

`P2-D1` (parallel dispatch) writes `p2-d-bug-injection-spec.md` for the **same RSI off-by-one bug** at the spec level. Per the cycle-11 redispatch signal (`docs/signals/po-R11-E1-redispatch-20260523T013100Z.json`):

> "Coordinate-by-spec only with D1 — if you choose RSI off-by-one for scenario A, that's fine to share with D1 (both are spec-level descriptions of the same bug class); but the regression CANARY (scenario B) is unique to E1."

This spec describes the RSI bug at the same class-level as D1 will. The **canary (B) — MA EMA golden — is unique to this E1 spec** and is the load-bearing differentiator that makes this a regression test, not a single-primitive fixability test.

If D1's spec selects the **Wilder seed seed variant** (RSI Wilder smoothing initial seed: `WilderEMA[0] = prices[0]` instead of mean — the architect's "Alternatively" option in `TASK_P2-D1.md`), this spec still holds: that bug also lives in the seed loop, which intensifies link 3b above (shared seed pattern) — canary is more likely to flip, not less.

---

## 6. Acceptance criteria mapping

| AC (from `TASK_P2-E1.md`) | Satisfied by |
|---|---|
| AC-1 Spec describes A (primitive, failure mode) + B (input shape link) | §2 |
| AC-2 WHY natural fix for A could break B (shared path/helper/constant) | §3 (three links: identical input contract, shared seed pattern, MACD `calcEMA` TODO refactor temptation) |
| AC-3 A and B scenario JSONs exist (Phase 1 P1-D1 suite) | §2 table — confirmed present in commit `c6af6839ec` |
| AC-4 Test plan: inject A, dispatch, observe B | §4 (six-step protocol with three named outcomes) |

---

## 7. Open issues

- **None blocking E1.** Spec is complete and self-consistent against current code.
- **Note for P2-E2 owner (qa):** before injection, re-baseline the sandbox to confirm all 25 scenarios green on HEAD (the Phase 2 dashboards from P2-B/P2-C may have introduced unrelated drift). If any scenario is already RED pre-injection, fix that baseline first or scope the alarm test to exclude the pre-existing RED scenario from the canary set.
- **Note for downstream G11 measurement:** if outcome (a) repeats across trials, this spec's pairing may be too weak — alternative canaries to evaluate include MACD's golden scenarios (B' candidates: `macd-golden.json`, `macd-bullish-cross.json`) which share the `calcEMA` helper directly and would be more sensitive to a refactor-style fix.

---

**End of spec.**
