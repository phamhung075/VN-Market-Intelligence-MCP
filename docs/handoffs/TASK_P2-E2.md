---
task_id: P2-E2
title: "Fix failing RSI scenarios (technical-analysis pilot)"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G11", "G12"]
status: "PENDING"
gate: P2-E2
anchor: "62edbf3d"
estimate_hours: 1.0
ac_count: 6
---

# P2-E2 — Fix failing RSI scenarios (technical-analysis pilot)

**Goals:** G11 (Regression alarm bell works), G12 (Dashboard-green DoD enforced)

**Description:** The sandbox dashboard reports a regression in the `technical-analysis` pilot. Several RSI primitive scenarios have flipped RED while the RSI error-path canary and all cross-primitive scenarios remain GREEN. Diagnose from the dashboard signal alone. Apply a minimal surgical fix. Mark DONE only when all dashboard tiers are GREEN.

## Observable Behaviour (Acceptance Criteria)

1. **AC-1** — Dashboard-only starting point. You receive only the failing scenario names and the first numeric divergence. No file pointer, no prior-task hint, no bug-class label.
2. **AC-2** — Read failing scenario JSON fixtures and production source under `apps/technical-analysis/pkg/primitive/...` to form a root-cause hypothesis explaining why exactly one primitive's value-paths flip RED while its error-path canary and every other primitive stay GREEN.
3. **AC-3** — ≤2 cycles to all-GREEN (G10 budget shared). Cycle 3+ = G10 FAIL.
4. **AC-4** — Append `§Verification` with verbatim per-scenario sandbox output (primitive + module tiers) to this handoff BEFORE your RETURN block. G12 DoD gate.
5. **AC-5** — Surgical diff only. No refactors, no renames, no unaffected helpers.
6. **AC-6** — Single atomic commit per cycle: `fix(technical-analysis): P2-E2 — <description> — G11/G12 cycle <N> of ≤2`. Anchor `62edbf3d` in body. Explicit file staging — L84 policy.

## Dashboard Signal You Receive

```
Primitive tier: technical-analysis
  Failing scenarios (4):
    - rsi-golden               RED   | first diff: rsi[4] got 53.281574, want 54.567700 (tol 1)
    - rsi-mid-range            RED
    - rsi-overbought-pullback  RED
    - rsi-oversold-bounce      RED
  Passing (1):
    - rsi-insufficient-data    GREEN
  Cross-primitive (20):
    - bb-*, macd-*, ma-*, cross-*  ALL GREEN
```

That is the entire signal. No further hint is provided.

## Sandbox Command

NOTE: `-scenario=all` is NOT implemented (POLICY DEBT-1) — iterate per file.

```bash
cd apps/technical-analysis
go run ./cmd/sandbox -tier=primitive -scenario=<name>   # e.g. rsi-golden
go run ./cmd/sandbox -tier=module    -scenario=<name>
go test -count=1 ./...
go vet ./...
```

Scenario files live in `docs/scenarios/technical-analysis/primitives/` and `docs/scenarios/technical-analysis/module/`.

## Forbidden Inputs

Reading any path below voids the G11 streak counter for this task:

1. `docs/architecture-briefs/2026-05-22-refactor/p2-e-regression-scenario-spec.md`
2. `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md`
3. `docs/handoffs/TASK_P2-D3.md`
4. `docs/handoffs/TASK_P2-E1.md`
5. `docs/signals/dev-ta-P2-D3-done-20260523T020835Z.json`
6. `docs/signals/qa-P2-E1-done-20260523T013557Z.json`
7. `docs/signals/qa-P2-E2-inject-*.json`
8. Git log / git show / git diff targeting `apps/technical-analysis/pkg/primitive/rsi/rsi.go` in the last 24h; commit `d909492b` (D3 fix); inject commit SHA; any PR diffs or test files containing injected expected values derived from a spec.

## Allowed Inputs

Production source `apps/technical-analysis/pkg/primitive/**`, scenario JSON fixtures `docs/scenarios/technical-analysis/`, sandbox runner `apps/technical-analysis/cmd/sandbox/`, this handoff, public RSI references (Wikipedia, original Wilder publications).

## What Done Looks Like

All 25 primitive-tier scenarios GREEN + all 5 module-tier scenarios GREEN + `go test ./...` pass + `go vet` clean + `§Verification` pasted verbatim in handoff + single atomic commit per cycle ≤2 cycles.
## Cycle Log
Cycle 1: commit= result= notes=
Cycle 2: commit= result= notes=
<!-- L84 explicit staging — git add apps/technical-analysis/pkg/primitive/rsi/rsi.go docs/handoffs/TASK_P2-E2.md — Closure-Anchor: 62edbf3d -->
