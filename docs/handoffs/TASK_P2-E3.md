---
task_id: P2-E3
title: "Fix failing primitive scenarios (technical-analysis pilot)"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G11", "G12"]
status: "pending"
gate: "P2-E3"
anchor: "62edbf3d"
estimate_hours: 1.0
ac_count: 5
---

# P2-E3 — Fix failing primitive scenarios (technical-analysis pilot)

**Goals:** G11 (Regression alarm bell works), G12 (Dashboard-green DoD enforced)

**Description:** The sandbox dashboard reports regressions in the `technical-analysis` pilot. Several MACD primitive scenarios have flipped RED while independent primitives remain GREEN. Diagnose from the dashboard signal alone. Apply a minimal surgical fix. Mark DONE only when all dashboard tiers are GREEN.

---

## Forbidden Inputs

Reading any path below voids the G11 streak counter for this task:

1. `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md`
2. `docs/architecture-briefs/2026-05-22-refactor/p2-e-regression-scenario-spec.md`
3. `docs/handoffs/TASK_P2-D0.md` / `TASK_P2-D1.md` / `TASK_P2-D2.md` / `TASK_P2-D3.md` / `TASK_P2-D4.md`
4. `docs/handoffs/TASK_P2-E1.md` / `docs/handoffs/TASK_P2-E2.md` (only the current `TASK_P2-E3.md` may be read)
5. Any `docs/signals/qa-*` or `docs/signals/dev-ta-*` file from earlier in the pilot
6. `docs/data/pilot-status.json`
7. `docs/data/bug-inventory.json`
8. `git log` filtered to prior commits on any primitive source file

---

## Dashboard Signal

```
Primitive tier: technical-analysis
  Failing scenarios (3):
    - macd-golden               RED   | first diff: firstTriple.macdLine got 1.147178, want 1.263097 (tol 0.001)
    - macd-bullish-cross        RED   | first diff: firstTriple.macdLine got -1.147178, want -1.263100 (tol 0.001)
    - macd-bearish-cross        RED   | first diff: firstTriple.macdLine got 1.147178, want 1.263100 (tol 0.001)
  Passing MACD (2):
    - macd-flat-zero            GREEN
    - macd-insufficient-data    GREEN
  Cross-primitive (20):
    - rsi-*, bb-*, ma-*, cross-*  ALL GREEN
```

That is the entire signal. No further hint is provided.

---

## Allowed Inputs

- Sandbox runner: `apps/technical-analysis/cmd/sandbox/`
- Production source (Go): `apps/technical-analysis/pkg/primitive/` (all packages)
- Scenario fixture files: `docs/scenarios/technical-analysis/`
- Public references: Wikipedia, standard finance references
- This handoff: `docs/handoffs/TASK_P2-E3.md`

---

## Sandbox Command

NOTE: `-scenario=all` is NOT implemented (POLICY DEBT-1 Option B) — iterate per file explicitly.

```bash
cd apps/technical-analysis

# Primitive tier — run each file individually:
go run ./cmd/sandbox -tier=primitive -scenario=macd-golden
go run ./cmd/sandbox -tier=primitive -scenario=macd-bullish-cross
go run ./cmd/sandbox -tier=primitive -scenario=macd-bearish-cross
go run ./cmd/sandbox -tier=primitive -scenario=macd-flat-zero
go run ./cmd/sandbox -tier=primitive -scenario=macd-insufficient-data
go run ./cmd/sandbox -tier=primitive -scenario=rsi-golden
go run ./cmd/sandbox -tier=primitive -scenario=rsi-mid-range
go run ./cmd/sandbox -tier=primitive -scenario=rsi-overbought-pullback
go run ./cmd/sandbox -tier=primitive -scenario=rsi-oversold-bounce
go run ./cmd/sandbox -tier=primitive -scenario=rsi-insufficient-data
go run ./cmd/sandbox -tier=primitive -scenario=bb-golden
go run ./cmd/sandbox -tier=primitive -scenario=bb-expansion
go run ./cmd/sandbox -tier=primitive -scenario=bb-squeeze
go run ./cmd/sandbox -tier=primitive -scenario=bb-insufficient-data
go run ./cmd/sandbox -tier=primitive -scenario=bb-period-equals-length
go run ./cmd/sandbox -tier=primitive -scenario=cross-golden
go run ./cmd/sandbox -tier=primitive -scenario=cross-edge
go run ./cmd/sandbox -tier=primitive -scenario=cross-failure
go run ./cmd/sandbox -tier=primitive -scenario=cross-multi-alternating
go run ./cmd/sandbox -tier=primitive -scenario=cross-parallel-no-cross
go run ./cmd/sandbox -tier=primitive -scenario=ma-golden
go run ./cmd/sandbox -tier=primitive -scenario=ma-sma-vs-ema
go run ./cmd/sandbox -tier=primitive -scenario=ma-edge
go run ./cmd/sandbox -tier=primitive -scenario=ma-failure
go run ./cmd/sandbox -tier=primitive -scenario=ma-dispatcher-unknown

# Module tier — run each file individually:
go run ./cmd/sandbox -tier=module -scenario=bb-ma-compression
go run ./cmd/sandbox -tier=module -scenario=edge-insufficient-candles
go run ./cmd/sandbox -tier=module -scenario=ema-crossover-detect-cross
go run ./cmd/sandbox -tier=module -scenario=multi-primitive-bullish-cross
go run ./cmd/sandbox -tier=module -scenario=rsi-macd-crossover

# Unit tests and vet:
go test -count=1 ./...
go vet ./...
```

Scenario files live in `docs/scenarios/technical-analysis/primitives/` and `docs/scenarios/technical-analysis/module/`.

---

## Acceptance Criteria

1. **AC-1** — Dashboard-only starting point. You receive only the failing scenario names and the first numeric divergence. No file pointer, no prior-task hint, no bug-class label.
2. **AC-2** — Read failing scenario JSON fixtures and production source under `apps/technical-analysis/pkg/primitive/...` to form a root-cause hypothesis explaining why exactly the listed MACD scenarios flip RED while their error-path canaries and every other primitive remain GREEN.
3. **AC-3** — All 30 scenarios GREEN (25 primitive + 5 module) before declaring DONE. ≤2 cycles budget.
4. **AC-4** — Append `§Verification` with verbatim per-scenario sandbox output to this handoff BEFORE your RETURN block. G12 DoD gate.
5. **AC-5** — Single atomic commit per cycle: `fix(technical-analysis): P2-E3 — <description> — G11/G12 cycle <N> of ≤2`. Anchor `62edbf3d` in body. Explicit file staging — L84 policy. Forbidden-reads compliance self-reported in commit body.

---

## What Done Looks Like

All 25 primitive-tier scenarios GREEN + all 5 module-tier scenarios GREEN + `go test ./...` pass + `go vet` clean + `§Verification` pasted verbatim in handoff + single atomic commit per cycle ≤2 cycles + G12 DoD honored (no DONE declared while any scenario is RED).

---

## Cycle Log

Cycle 1: commit= result= notes=
Cycle 2: commit= result= notes=
<!-- L84 explicit staging — git add apps/technical-analysis/pkg/primitive/macd/<helper>.go docs/handoffs/TASK_P2-E3.md — Closure-Anchor: 62edbf3d -->
