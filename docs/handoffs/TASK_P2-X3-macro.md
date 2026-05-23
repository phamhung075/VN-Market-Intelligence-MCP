---
task_id: P2-X3
title: "Snapshot Endpoint Implementation (Go Handler → Real Use Case)"
owner_agent: dev-macro-indicators
goal_linkage:
  - G3 (Microservice composition root clean + real handlers)
pre_conditions:
  - P2-X2 DONE (module wires all 6 primitives)
  - Anchor 1776df8e held as ancestor
  - Phase 2 active task: P2-X3
  - WIP=1 enforced
critical_path: true
estimate_hours: 1
ac_count: 5
---

# TASK P2-X3 — Snapshot Endpoint Implementation (Go Handler → Real Use Case)

**Goal advancement:** G3 (implement real handler using ComputeMacroUseCase.Execute(), replace 501 stubs with real primitives)

**Background:** P2-B1 created Go handler stubs for `/snapshot`, `/carry-trade-signal`, `/yield-spread-signal` returning fixture JSON or 501. P2-X1 extracted 5 new primitives. This task implements the real handlers using the module composition created in P2-X2, completing the microservice-tier composition root.

**DDD zone:** `apps/macro-indicators/pkg/interface/http/` + `pkg/application/` + `pkg/infrastructure/` (Go zone only)

---

## Files to Modify

- `apps/macro-indicators/pkg/interface/http/router.go` — replace 501 stub with real handler wiring
- `apps/macro-indicators/pkg/interface/http/handlers_carry.go` — replace stub with real primitive call
- `apps/macro-indicators/pkg/interface/http/handlers_yield.go` — replace stub with real primitive call
- `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` — may remain stub or implement if real calendar logic added
- `apps/macro-indicators/pkg/application/usecases.go` — implement Execute() body using module
- `apps/macro-indicators/pkg/infrastructure/repositories.go` — implement HTTPCommodityFetcher or fixture-mode (dev may choose fixture for sandbox determinism)

---

## Acceptance Criteria

**AC-1: /health unchanged**

`GET /health` returns HTTP 200 with JSON shape: `{"status":"ok","service":"macro-indicators","port":5004}`.

**Proof:** Paste curl output:
```bash
curl http://localhost:5004/health
```

**AC-2: /snapshot real handler (not 501)**

`POST /snapshot` returns HTTP 200 (not 501). Response JSON shape includes fields: `vnIndex`, `oilUsd`, `goldUsd`, `usdVnd`, `signals`, `fetchedAt`. The `signals` field contains all 6 primitive results (investment-clock, oil, gold, usdvnd, carry, yield).

**Proof:** Paste curl output (or HTTP client call):
```bash
curl -X POST http://localhost:5004/snapshot -H "Content-Type: application/json" -d '{}'
```
Must show HTTP 200 (not 501) and contain all 6 signal keys in response.

**AC-3: /carry-trade-signal real handler**

`GET /carry-trade-signal` returns HTTP 200 with JSON shape: `{"regime":"...","carrySpread":...,"vndDepositRate":...,"fedFundsRate":...,"computedAt":"..."}`.

**Proof:** Paste curl output showing HTTP 200 + correct JSON shape.

**AC-4: /yield-spread-signal real handler**

`GET /yield-spread-signal` returns HTTP 200 with JSON shape: `{"label":"...","spread":...,"earningYield":...,"depositRate":...,"computedAt":"..."}`.

**Proof:** Paste curl output showing HTTP 200 + correct JSON shape.

**AC-5: G12 DoD gate — all tiers sandbox green**

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all
```

Must exit 0. Pass count ≥20 (18 primitives + 2 module). Paste last 5 lines of output showing `total=20+ pass=20+ fail=0 status=OK exit 0`.

---

## Hard Gates (pre + post commit)

1. **Anchor held:** `git merge-base --is-ancestor 1776df8e HEAD && echo PASS`
   - Pre-commit: exit 0
   - Post-commit: exit 0

2. **R-1 determinism guard:** `grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/` and exit 1 || exit 0
   - Pre-commit: exit 0 (inherited from P2-X2)
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
- **NO** modification to `apps/mcp-server/src/` (interface layer stays as-is; MCP HTTP-routing complete from P2-B1)
- **NO** modification to `.github/workflows/ci.yml`, root `.golangci.yml`, or `apps/macro-indicators/.golangci.yml` (fence config frozen)
- **NO** modification to `docs/data/pilot-status-macro-indicators.json` (SSOT — PM owned only)

---

## Implementation Notes

**Fixture mode vs live data:** For sandbox determinism, implement HTTPCommodityFetcher to read from fixture JSON files in `docs/scenarios/` rather than making real HTTP calls to external commodity APIs. This keeps the sandbox deterministic (R-1 guard). Real live-data fetching can be added post-pilot if needed (P3 scope or post-pilot task).

**Handler sequencing:** Implement in order:
1. `/snapshot` (exercises the full module composition via ComputeMacroUseCase)
2. `/carry-trade-signal` and `/yield-spread-signal` (re-use the primitives called by module)
3. `/macro-calendar` (may stay fixture-based or invoke calendar logic)

**ComputeMacroUseCase signature:** Should accept input struct with indicator data (VN index price, oil price, gold price, USD/VND, Fed rate, VND deposit rate) and return MacroSignalsOutput (6 primitive results + fetchedAt). The router calls this use case and shapes the HTTP response.

**Fence-C note:** `pkg/application/usecases.go` and `pkg/infrastructure/repositories.go` are new packages (P2-X3 creation). They must import `pkg/module/` + `pkg/primitive/`, never reverse. Only `cmd/server/main.go` is allowed to import infrastructure layer (Fence-C rule).

---

## Handoff - Commit & Signal

**Commit subject (L84 explicit-file staging):**
```
feat(macro-indicators): P2-X3 — snapshot + carry + yield handlers implemented (G3 update, 501 resolved)
```

**Files to stage explicitly:**
- `apps/macro-indicators/pkg/interface/http/router.go`
- `apps/macro-indicators/pkg/interface/http/handlers_carry.go`
- `apps/macro-indicators/pkg/interface/http/handlers_yield.go`
- `apps/macro-indicators/pkg/interface/http/handlers_calendar.go`
- `apps/macro-indicators/pkg/application/usecases.go`
- `apps/macro-indicators/pkg/infrastructure/repositories.go`

**NO `git add -A`. NO `git add .`. NO `--force`. NO `--no-verify`. NO `--no-gpg-sign`. NO `git push`.**

**Signal output path:** `docs/signals/dev-macro-indicators-p2-x3-done-<UTC>.json`

---

## Acceptance Evidence to Record

In the completion signal, provide:

1. Output of `curl http://localhost:5004/health` (HTTP 200 + status json)
2. Output of `curl -X POST http://localhost:5004/snapshot` (HTTP 200 + all 6 signals)
3. Output of `curl http://localhost:5004/carry-trade-signal` (HTTP 200 + carry struct)
4. Output of `curl http://localhost:5004/yield-spread-signal` (HTTP 200 + yield struct)
5. Output of `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -scenario=all` (last 5 lines showing total≥20/pass≥20/fail=0/status=OK)
6. Output of `go build ./...` (exit 0)
7. Output of `go vet ./...` (exit 0)
8. Output of `golangci-lint run` (exit 0, 0 issues)

---

## Next Task (Unblocked by This)

**P2-G1:** Terminal verification of G1 + G2 + G3 (QA-owned, no code changes)
- Blocked by: P2-X3 DONE
- Owner: qa
- Estimate: 30m

---

## Reference Documents

- Charter: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md`
- Phase 2 task plan: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` §P2-X3
- SSOT: `docs/data/pilot-status-macro-indicators.json`
