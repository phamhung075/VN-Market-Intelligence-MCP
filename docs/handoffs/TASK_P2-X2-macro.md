---
task_id: P2-X2
title: "Module Expansion: macro-signals Wires All 6 Primitives"
owner_agent: dev-macro-indicators
goal_linkage:
  - G2 (Module composes primitives via ports — update from 1-primitive to 6-primitive)
pre_conditions:
  - P2-X1 DONE (5 new primitives extracted + scenarios landed)
  - Anchor 1776df8e held as ancestor
  - Phase 2 active task: P2-X2
  - WIP=1 enforced
critical_path: true
estimate_hours: 1
ac_count: 5
---

# TASK P2-X2 — Module Expansion: macro-signals Wires All 6 Primitives

**Goal advancement:** G2 partial→full (expand macro-signals module from 1-primitive composition to 6-primitive composition; proves module pattern scales)

**Background:** Phase 1 (P1-C1) created `macro-signals` module stub with only `macro-investment-clock`. Phase 2 expands it to compose all 6 primitives (1 existing + 5 new from P2-X1). This task wires the module to invoke all 6 primitives and updates the module-level scenario JSON with 6-primitive signals.

**DDD zone:** `apps/macro-indicators/pkg/module/macro_signals/` (Go zone only)

---

## Files to Modify

- `apps/macro-indicators/pkg/module/macro_signals/macro_signals.go` — add composition of 5 new primitives (oil, gold, usdvnd, carry, yield)
- `apps/macro-indicators/pkg/module/macro_signals/macro_signals_test.go` — expand tests to verify all 6 primitives called in single `BuildMacroSignals()` call
- `docs/scenarios/macro-indicators/module/macro-signals-golden.json` — update to include signals for all 6 primitives
- `docs/scenarios/macro-indicators/module/macro-signals-edge.json` — edge scenario with partial/edge-case data for all 6

---

## Acceptance Criteria

**AC-1: Module imports all 6 primitives**

`pkg/module/macro_signals/macro_signals.go` includes import statements for all 6 primitive packages:
- `apps/macro-indicators/pkg/primitive/macro_investment_clock`
- `apps/macro-indicators/pkg/primitive/macro_oil_impact_classifier`
- `apps/macro-indicators/pkg/primitive/macro_gold_direction_classifier`
- `apps/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier`
- `apps/macro-indicators/pkg/primitive/macro_carry_trade_signal`
- `apps/macro-indicators/pkg/primitive/macro_yield_spread_signal`

**Proof:** Paste output of:
```bash
grep -n "^import" apps/macro-indicators/pkg/module/macro_signals/macro_signals.go
```
Must show all 6 imports (or grouped import block containing all 6).

**AC-2: Fence-B compliance (module must not import app/infra/interface)**

```bash
grep -rn "application\|infrastructure\|interface" apps/macro-indicators/pkg/module/macro_signals/
```
Must exit 1 (zero matches). Only imports allowed: stdlib + primitives + other modules.

**AC-3: Multi-primitive test case passes**

```bash
go test ./apps/macro-indicators/pkg/module/macro_signals/... -v
```
Must exit 0. Test file must include ≥1 test case that calls `BuildMacroSignals()` (or equivalent) with all 6 primitives and verifies all 6 signal fields are populated in the result.

**Proof:** Paste `go test -v` output showing test name + PASS for multi-primitive test.

**AC-4: Module-tier sandbox green**

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/macro-indicators && go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
```
Must exit 0 with ≥2 module scenarios PASS (golden + edge).

**Proof:** Paste full output showing `total=2 pass=2 fail=0` or similar (at least 2 module scenarios).

**AC-5: G12 DoD gate — all tiers sandbox green**

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
```
Must exit 0. Total pass count ≥20 (18 primitives + ≥2 module).

**Proof:** Paste last 5 lines of output showing `total=20+ pass=20+ fail=0 status=OK exit 0`.

---

## Hard Gates (pre + post commit)

1. **Anchor held:** `git merge-base --is-ancestor 1776df8e HEAD && echo PASS`
   - Pre-commit: exit 0
   - Post-commit: exit 0

2. **R-1 determinism guard:** `grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/module/` and exit 1 || exit 0
   - Pre-commit: exit 0 (inherited from P2-X1)
   - Post-commit: exit 0 (no new randomization added)

3. **Go build:** `cd apps/macro-indicators && go build ./...`
   - Pre-commit: success
   - Post-commit: success

4. **Go vet:** `cd apps/macro-indicators && go vet ./...`
   - Pre-commit: success
   - Post-commit: success

5. **golangci-lint (Fence-B/C held):** `cd apps/macro-indicators && golangci-lint run`
   - Pre-commit: success (exit 0, 0 issues)
   - Post-commit: success (exit 0, 0 issues)

---

## Out-of-Scope

- **NO** modification to `apps/technical-analysis/` (FROZEN TA pilot zone)
- **NO** modification to `apps/mcp-server/src/` (interface layer stays as-is; MCP HTTP-routing already complete from P2-B1)
- **NO** modification to `.github/workflows/ci.yml`, root `.golangci.yml`, or `apps/macro-indicators/.golangci.yml` (fence config frozen)
- **NO** modification to `docs/data/pilot-status-macro-indicators.json` (SSOT — PM owned only)
- **NO** implementation of handlers or composition-root wiring (that is P2-X3 scope)

---

## Handoff - Commit & Signal

**Commit subject (L84 explicit-file staging):**
```
feat(macro-indicators): P2-X2 — macro-signals module wires all 6 primitives (G2 update)
```

**Files to stage explicitly:**
- `apps/macro-indicators/pkg/module/macro_signals/macro_signals.go`
- `apps/macro-indicators/pkg/module/macro_signals/macro_signals_test.go`
- `docs/scenarios/macro-indicators/module/macro-signals-golden.json`
- `docs/scenarios/macro-indicators/module/macro-signals-edge.json`

**NO `git add -A`. NO `git add .`. NO `--force`. NO `--no-verify`. NO `--no-gpg-sign`. NO `git push`.**

**Signal output path:** `docs/signals/dev-macro-indicators-p2-x2-done-<UTC>.json`

---

## Acceptance Evidence to Record

In the completion signal or handoff doc, provide:

1. Output of `grep -n "^import" apps/macro-indicators/pkg/module/macro_signals/macro_signals.go` (all 6 primitives imported)
2. Exit code of `grep -rn "application\|infrastructure\|interface" apps/macro-indicators/pkg/module/macro_signals/` (must be 1)
3. Output of `go test ./apps/macro-indicators/pkg/module/macro_signals/... -v` showing multi-primitive test PASS
4. Output of `cd apps/macro-indicators && go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all` (last 3 lines showing total/pass/fail/status)
5. Output of `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` (last 3 lines showing total≥20/pass≥20/fail=0/status=OK)
6. Output of `go build ./...` (exit 0)
7. Output of `go vet ./...` (exit 0)
8. Output of `golangci-lint run` (exit 0, 0 issues)

---

## Next Task (Unblocked by This)

**P2-X3:** Snapshot endpoint implementation (GoHandler → real use case, calls composition root)
- Blocked by: P2-X2 DONE
- Owner: dev-macro-indicators
- Estimate: 1h

---

## Reference Documents

- Charter: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md`
- Phase 2 task plan: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` §P2-X2
- SSOT: `docs/data/pilot-status-macro-indicators.json`
