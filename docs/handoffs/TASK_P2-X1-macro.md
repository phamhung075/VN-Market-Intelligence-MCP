---
task_id: P2-X1
title: "Remaining 5 Primitives Extraction (oil/gold/usdvnd/carry/yield)"
owner_agent: dev-macro-indicators
goal_linkage:
  - G1 (primitives ship with scenarios — partial: 5 remaining primitives)
pre_conditions:
  - P2-B3 DONE (QA GREEN: G5 terminal verification)
  - Anchor 1776df8e held as ancestor
  - Phase 2 active task: P2-X1
  - WIP=1 enforced
critical_path: true
estimate_hours: 3
ac_count: 7
---

# TASK P2-X1 — Remaining 5 Primitives Extraction

**Goal advancement:** G1 partial (5 remaining primitives, total 6 by P2-X1 DONE; G1 terminal verification via P2-G1 QA task)

**Background:** Phase 1 extracted the first primitive (`macro-investment-clock`). Phase 2 now extracts the remaining 5 from the 6-primitive plan. Each primitive is a standalone Go package with scenarios (golden + edge + failure).

**DDD zone:** `apps/macro-indicators/pkg/primitive/` (Go zone only)

---

## Primitives to Extract

| # | Primitive | Go package | Source logic | Scenario files |
|---|---|---|---|---|
| 2 | macro-oil-impact-classifier | `pkg/primitive/macro_oil_impact_classifier/` | `MacroScoreService.oilDirection()` — BEARISH/BULLISH/NEUTRAL threshold | 3 (golden + edge + failure) |
| 3 | macro-gold-direction-classifier | `pkg/primitive/macro_gold_direction_classifier/` | `MacroScoreService.goldDirection()` | 3 |
| 4 | macro-usdvnd-direction-classifier | `pkg/primitive/macro_usdvnd_direction_classifier/` | `MacroScoreService.usdVndDirection()` | 3 |
| 5 | macro-carry-trade-signal | `pkg/primitive/macro_carry_trade_signal/` | `computeCarryTradeSignal(vndRate, fedRate)` from mcp-server domain | 3 |
| 6 | macro-yield-spread-signal | `pkg/primitive/macro_yield_spread_signal/` | `computeYieldSpreadSignal(earningYield, depositRate)` from mcp-server domain | 3 |

**Total scenario files:** 15 new (3 per primitive × 5)

---

## Per-Primitive Structure

Each primitive package MUST have:

- `<package>/<package>.go` — exported `Classify()` or `Compute()` function + input/output structs
- `<package>/<package>_test.go` — table-driven tests (≥5 rows per primitive)
- `docs/scenarios/macro-indicators/primitives/<primitive-name>-{golden,edge,failure}.json` — frozen fixture data

Example file tree:
```
apps/macro-indicators/pkg/primitive/macro_oil_impact_classifier/
  macro_oil_impact_classifier.go
  macro_oil_impact_classifier_test.go

docs/scenarios/macro-indicators/primitives/
  macro-oil-impact-classifier-golden.json
  macro-oil-impact-classifier-edge.json
  macro-oil-impact-classifier-failure.json
```

---

## Carry-Trade + Yield-Spread Handler Stub Extraction

**Note:** P2-B1 created Go handler stubs for `/carry-trade-signal` and `/yield-spread-signal` that return fixture JSON. P2-X1 extracts the real `macro-carry-trade-signal` and `macro-yield-spread-signal` primitives and updates the P2-B1 handler stubs to call the primitive packages.

Steps:
1. Create `pkg/primitive/macro_carry_trade_signal/` with Compute logic
2. Create `pkg/primitive/macro_yield_spread_signal/` with Compute logic
3. Update `pkg/interface/http/handlers_carry.go` to call `macro_carry_trade_signal.Compute()`
4. Update `pkg/interface/http/handlers_yield.go` to call `macro_yield_spread_signal.Compute()`
5. Both handlers must pass real data (from HTTP context) to the primitives

---

## Acceptance Criteria

**AC-1:** Primitive packages enumeration
```
find apps/macro-indicators/pkg/primitive -type d | wc -l
```
Must return ≥ 6 (1 existing from P1-B1 macro-investment-clock + 5 new in this task).

**AC-2:** Table-driven tests per primitive
```
go test ./pkg/primitive/macro_oil_impact_classifier/...
go test ./pkg/primitive/macro_gold_direction_classifier/...
go test ./pkg/primitive/macro_usdvnd_direction_classifier/...
go test ./pkg/primitive/macro_carry_trade_signal/...
go test ./pkg/primitive/macro_yield_spread_signal/...
```
Each must exit 0. Each test file must contain ≥5 test rows in the table-driven pattern.

**AC-3:** Scenario JSON valid
```
find docs/scenarios/macro-indicators/primitives -name '*.json' -exec jq . {} \; > /dev/null
```
Must exit 0. Total count: 18 scenario files (3 existing from P1 + 15 new = 18 total).

**AC-4:** Fence-A clean (primitives must NOT import application, interface, or infrastructure)
```
grep -rn "application\|interface\|infrastructure" apps/macro-indicators/pkg/primitive/
```
Must exit 1 (zero matches). All primitive packages must depend only on stdlib and other primitives.

**AC-5:** golangci-lint clean (depguard fence)
```
cd apps/macro-indicators && golangci-lint run
```
Must exit 0. Fence-A/B/C must pass.

**AC-6:** G12 DoD gate (sandbox green on primitive tier)
```
cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
```
Must exit 0 with total ≥ 18 scenarios pass. Paste full output.

**AC-7:** R-1 determinism guard (no math/rand, no nondeterministic time)
```
grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/primitive/
```
Must exit 1 (zero matches).

---

## Blocked By

P2-B3 DONE (QA GREEN: G5 terminal verification).

---

## Unblocks

P2-X2 (module expansion — macro-signals wires all 6 primitives).

---

## Hard Gates (pre + post commit)

1. **Anchor held:** `git merge-base --is-ancestor 1776df8e HEAD && echo PASS`
   - Pre-commit: exit 0
   - Post-commit: exit 0

2. **R-1 determinism:** `grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/primitive/ && exit 1 || exit 0`
   - Pre-commit: exit 0 (inherited from P2-A2)
   - Post-commit: exit 0

3. **Sandbox all-tier:** `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all`
   - Pre-commit: total=5 pass=5 fail=0 (P2-B3 verified)
   - Post-commit: total ≥ 20 pass (18 primitives + ≥2 module from P1)

4. **Go build:** `cd apps/macro-indicators && go build ./...`
   - Pre-commit: success
   - Post-commit: success

5. **Go vet:** `cd apps/macro-indicators && go vet ./...`
   - Pre-commit: success
   - Post-commit: success

---

## Out-of-Scope

- **NO** modification to `apps/technical-analysis/` (FROZEN TA pilot zone)
- **NO** modification to `apps/mcp-server/src/` (interface layer stays as-is; MCP tools already HTTP-routed in P2-B1)
- **NO** modification to `.github/workflows/ci.yml`, root `.golangci.yml`, or `apps/macro-indicators/.golangci.yml`
- **NO** modification to `docs/data/pilot-status-macro-indicators.json` (PM/QA owned SSOT)

---

## Handoff - Commit & Signal

**Commit subject (L84 explicit-file staging):**
```
feat(macro-indicators): P2-X1 — 5 primitives extracted (oil/gold/usdvnd/carry/yield + 15 scenarios)
```

**Files to stage explicitly:**
- All new Go files under `apps/macro-indicators/pkg/primitive/macro_oil_impact_classifier/`
- All new Go files under `apps/macro-indicators/pkg/primitive/macro_gold_direction_classifier/`
- All new Go files under `apps/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier/`
- All new Go files under `apps/macro-indicators/pkg/primitive/macro_carry_trade_signal/`
- All new Go files under `apps/macro-indicators/pkg/primitive/macro_yield_spread_signal/`
- Updated `apps/macro-indicators/pkg/interface/http/handlers_carry.go` (if modified to call primitive)
- Updated `apps/macro-indicators/pkg/interface/http/handlers_yield.go` (if modified to call primitive)
- All 15 new scenario JSON files under `docs/scenarios/macro-indicators/primitives/`

**NO `git add -A`. NO `git add .`. NO `--force`. NO `--no-verify`. NO `--no-gpg-sign`. NO `git push`.**

**Signal output path:** `docs/signals/dev-macro-indicators-p2-x1-done-<UTC>.json`

---

## Acceptance Evidence to Record

In the completion signal or handoff doc:

1. Output of `find apps/macro-indicators/pkg/primitive -type d | wc -l` → should be ≥ 6
2. Output of `find docs/scenarios/macro-indicators/primitives -name '*.json' | wc -l` → should be 18
3. Output of `cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all` (last 10 lines showing total pass/fail)
4. Output of `cd apps/macro-indicators && golangci-lint run` (should show "0 issues")
5. Output of `grep -rn "application\|interface\|infrastructure" apps/macro-indicators/pkg/primitive/ | wc -l` → should be 0
6. Output of `grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/primitive/ | wc -l` → should be 0

---

## Next Task (Unblocked by This)

**P2-X2:** Module expansion (macro-signals wires all 6 primitives)
- Blocked by: P2-X1 DONE
- Owner: dev-macro-indicators
- Estimate: 1h

---

## Reference Documents

- Charter: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md`
- Phase 2 task plan: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` §P2-X1
- Brownfield inventory: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md`
- SSOT: `docs/data/pilot-status-macro-indicators.json`
