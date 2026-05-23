---
title: "P2-D Bug-Injection Spec — RSI Wilder Smoothing Off-By-One"
date: "2026-05-23"
author: "qa"
status: "READY-FOR-P2-D2"
pilot: "technical-analysis"
charter_goal: "G10"
task_id: "P2-D1"
target_file: "apps/technical-analysis/pkg/primitive/rsi/rsi.go"
detection_scenario: "docs/scenarios/technical-analysis/primitives/rsi-golden.json"
baseline_cycles: 1.5
target_cycles: 2
---

# P2-D Bug-Injection Spec — G10 AI-Fixability Proof

**Audience:** P2-D2 (qa, performs the injection), dev-technical-analysis (the agent under test in P2-D3), qa (counts cycles in P2-D4).
**Authority:** architect via `phase-2-task-plan-go.md §P2-D1` (lines 524–566); baseline from `docs/data/bug-inventory.json` (TA-specific average of resolved bugs).
**Boundary:** Exact code snippets are deliberately omitted per architect rule; this doc references file + line only so dev-technical-analysis cannot "cheat" by reverse-reading the spec to locate the change.

---

## Selected Variant — Option A (Wilder Smoothing Period Off-By-One)

Two architect candidates were on the table:

- **Option A — Wilder smoothing period off-by-one** in the recursive `avgGain` / `avgLoss` update inside `Calculate()`. (Primary architect recommendation.)
- **Option B — Wilder seed selection** swap: replace the SMA-of-first-`period`-moves seed with a first-price seed.

**Selected: Option A.**

**Why A over B:**

1. **Smaller, more realistic mutation.** A single token change in a single arithmetic expression — the canonical "off-by-one in a smoothing constant" mistake an engineer (or a model) would plausibly produce. B is a multi-line restructure of the seed loop, which is closer to a deliberate algorithm swap than a slip.
2. **Cleaner RED signal.** A propagates through every output of the recursive series after the seed window. B only affects values once the recursion overtakes the seed and is harder to attribute on its own.
3. **Cycle-counting clarity.** A's single-line fix gives a clean "agent flips one constant → all RSI scenarios green again" success criterion. With B the agent could partially restore correctness while still leaving an off-by-one tail.
4. **Same blast radius as production realism.** Off-by-one in a smoothing window divisor is the bug archetype the charter wants tested (G10: "fixes a primitive bug without looping").

---

## Bug Location & Mutation Sketch (REDACTED)

| Field | Value |
|---|---|
| Repo file | `apps/technical-analysis/pkg/primitive/rsi/rsi.go` |
| Function | `Calculate(closes []float64, period int) ([]float64, error)` |
| Mutation site | Wilder recursive update of `avgGain` and `avgLoss` (the recursive lines that consume `period` as a smoothing constant — exactly 2 adjacent statements inside the `for i := period + 1; i < len(closes); i++` loop). |
| Approximate line band | rsi.go:55–58 (both recursive statements live in this band; only the smoothing-constant subexpression is mutated). |
| Mutation type | Off-by-one in the period smoothing constant — i.e., shift the Wilder weighting by one unit. P2-D2 performs the exact token edit. |
| Untouched | Function signature, error sentinels, seed loop (`i = 1..period`), `wilderRSI` helper, RSI range clamp, test file. |

**Architect-boundary statement:** This spec deliberately does NOT contain the before/after Go expressions. P2-D2 (qa, performing the injection) reads the function once at injection time and applies the off-by-one to the smoothing constant. dev-technical-analysis in P2-D3 must rediscover the change purely from sandbox dashboard RED signal — that is the G10 measurement.

---

## Expected Failure Signature

| Surface | Pre-injection | Post-injection |
|---|---|---|
| `docs/scenarios/technical-analysis/primitives/rsi-golden.json` (14-period RSI on 20 closes, tolerance ±1 RSI point) | GREEN — all 6 output values within ±1 of expected `[62.5557, 64.7021, 60.4775, 58.4697, 54.5677, 59.3031]` | **RED** — recursive drift accumulates per step; even the first post-seed value is shifted by more than 1 RSI point relative to expected, so the scenario card flips RED on output[0]. |
| `rsi-overbought-pullback.json`, `rsi-oversold-bounce.json`, `rsi-mid-range.json` | GREEN | RED for each (same recursion, same drift). |
| `rsi-insufficient-data.json` | GREEN (error path unaffected) | GREEN (input-validation path is upstream of the mutated line — this scenario is the canary that proves the mutation is scoped, not catastrophic). |
| `rsi_test.go` unit assertions | PASS | FAIL on the value-comparison test. |
| Cross-primitive scenarios (`bb-*`, `macd-*`, `ma-*`, `cross-*`) | GREEN | GREEN (isolated to RSI primitive — no shared helper is mutated). |

**Detectability claim (AC-3):** The mutation produces a numerically wrong output, not a silently-passing one. The golden scenario's ±1-point tolerance is tighter than the per-step recursive drift introduced by an off-by-one smoothing constant, so the first post-seed RSI value already exceeds tolerance. The `rsi-golden.json` card on the sandbox dashboard MUST flip from GREEN to RED. Confirmation gate for P2-D2: if it does NOT flip RED, the injection did not land — re-inject or abort.

---

## Cycle-Counting Protocol (AC-4)

This is the contract that P2-D4 (qa, measuring) will apply when scoring dev-technical-analysis's performance against the G10 target.

1. **Cycle definition.** One *cycle* = one dispatch of dev-technical-analysis (or its fixer/architect escalation chain) that ends with a commit + a sandbox dashboard read.
2. **GREEN exit.** A cycle is counted as the *successful* cycle if and only if every RSI scenario card on the sandbox dashboard is GREEN immediately after the commit. Cross-primitive cards (BB/MACD/MA/cross) must also remain GREEN — regressions cost cycles.
3. **Cycle increment rule.** Any cycle that ends with one or more RSI cards still RED counts as +1 cycle and dev-technical-analysis is re-dispatched (per existing dev-team flow). The cycle-counter increments BEFORE re-dispatch.
4. **No partial credit.** A fix that turns N of M RSI cards GREEN but leaves any RED counts the same as a fix that turns 0 cards GREEN — still +1 cycle, still re-dispatched. This is deliberate: the dashboard contract is binary per card.
5. **Fixer/architect escalation.** Each escalation hop (fixer round 1, fixer round 2, architect) inside a single dispatch counts as part of that dispatch's cycle, not as a new cycle. The cycle boundary is the dev-technical-analysis dispatch boundary, not the internal fix-round boundary.
6. **Reset / no-cheat clause.** If dev-technical-analysis identifies the mutation by reading this spec file (rather than by running the sandbox), the run is voided. The spec file path is in the gitignored-from-agent-context list maintained in P2-F1 brief; qa double-checks the agent's bash history at P2-D4 review.
7. **Recording.** Cycles are recorded in `docs/handoffs/TASK_P2-D3.md` `§Cycle Log` and rolled up into `pilot-status.json` G10 evidence by P2-D4.

---

## Baseline & Target (AC-5)

| Metric | Value | Source |
|---|---|---|
| `baselineCycleCount` (TA-specific) | **1.5 cycles** | `docs/data/bug-inventory.json#baselineCycleCount` — average of resolved technical-analysis bugs (1970-TA-OHLCV-MISSING: 1 cycle; 1968d-wave1-anchor-format: 2 cycles → mean 1.5). |
| Charter system-wide reference | 4–6 cycles | `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` (system-wide, used only as a sanity ceiling). |
| **G10 target (this proof)** | **≤ 2 cycles** | Pilot charter G10. The TA baseline of 1.5 is *below* target, so a successful agent run is expected to finish in 1 or 2 cycles. Anything > 2 fails G10. |
| Failure definition | > 2 cycles to all-GREEN | Counted per the protocol above. |
| Edge tie-break | Exactly 2 cycles = PASS (target is `≤ 2`, inclusive). | — |

**Why the baseline is recorded, not just the target:** G10's evidence must show that the dashboard-only fix loop is at least as good as the historical TA fix loop. With baseline = 1.5 and target ≤ 2, the proof shows the loop does not *worsen* the existing TA average (and the headroom of 0.5 cycle absorbs one false start without failing the goal).

---

## Acceptance Criteria Self-Check

| AC | Statement | Location in this doc |
|---|---|---|
| AC-1 | Spec file `p2-d-bug-injection-spec.md` created at the correct path. | This file. |
| AC-2 | Specifies file, line(s), redacted before/after, expected scenario failure. | §Bug Location & Mutation Sketch + §Expected Failure Signature (rsi-golden.json card → RED). |
| AC-3 | Confirms bug is detectable by dashboard scenario RED (not silently passing). | §Expected Failure Signature, detectability claim paragraph. |
| AC-4 | Cycle-counting protocol documented. | §Cycle-Counting Protocol (7 numbered rules). |
| AC-5 | Baseline 1.5 (TA-specific from bug-inventory.json), target ≤ 2 cycles documented. | §Baseline & Target table. |

---

## Downstream Hand-Off

- **P2-D2 (next):** qa reads `apps/technical-analysis/pkg/primitive/rsi/rsi.go` lines 55–58, performs the off-by-one mutation in the smoothing constant, atomic commit `test(technical-analysis): P2-D2-inject — RSI Wilder smoothing off-by-one bug for G10 AI-fix proof`. Verifies sandbox `rsi-golden.json` card is RED before handing off.
- **P2-D3:** PO dispatches dev-technical-analysis with ONLY the sandbox dashboard URL as input (no spec link, no rsi.go reference). Agent must rediscover via dashboard RED.
- **P2-D4:** qa applies §Cycle-Counting Protocol above; records evidence in `pilot-status.json` G10.

---

## References

- `docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md` §P2-D1 (lines 524–566)
- `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G10
- `docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md` (Dashboard-Green DoD — the rule that turns RED into a blocker)
- `docs/data/bug-inventory.json` (baseline source of truth)
- `docs/handoffs/TASK_P2-D0.md` (preflight verification, satisfied 2026-05-23)
- `docs/handoffs/TASK_P2-D1.md` (this task)
