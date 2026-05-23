---
title: "Phase Skeleton — macro-indicators factory v2"
date: "2026-05-23"
author: "po (cycle-29)"
status: "SKELETON — architect expands at Phase 0 dispatch"
pilot: "macro-indicators"
parent_pattern: "docs/architecture-briefs/2026-05-22-refactor/07-phases.md (TA pilot — phase pattern)"
parent_close: "2026-05-23T09:19:10Z verdict=scale"
---

# Phase Skeleton — macro-indicators factory v2

PO authors the skeleton (this file). Architect expands into a full phase task plan at Phase 0 dispatch (analogous to TA's `phase-1-task-plan-go.md` + `phase-2-task-plan-go.md`).

---

## Hard Deadline

**6 sprints from kickoff 2026-05-23 = 2026-07-04.** Per charter §Hard Deadline.

---

## Phase 0 — Setup (sprint 1, ~2-3 days)

**Goal:** Lock the starting point. No production code. All artefacts in place for Phase 1 dispatch.

**Owners:** architect + system-auditor + agent-father (parallel; no dev-team WIP yet).

**Deliverables:**

1. **`docs/data/pilot-status-macro-indicators.json`** — PO authors at charter creation (already exists; see this brief). Architect verifies schema + initial state at Phase 0 close.

2. **`apps/macro-indicators/` brownfield scan** — architect or system-auditor produces `docs/architecture-briefs/2026-05-23-macro-indicators-factory/p0-brownfield-inventory.md`. Lists:
   - Current TS files + LOC + DDD layer mapping
   - External scrapers (8 currently) + status (live/wontfix/disabled)
   - Existing MCP tool callers (`get_macro_snapshot`, `get_macro_calendar`, `get_carry_trade_signal`, `get_yield_spread_signal`, `get_imf_signals`, `get_fed_liquidity_signal`, `get_credit_flow_signal`) — confirm count + caller paths
   - Tests inventory (`__tests__/unit/*` + `__tests__/integration/*`)
   - Identify which primitives to extract first (architect picks 5-7 from charter §G1 candidate list)

3. **`docs/data/bug-inventory.json` macro entry** — system-auditor extends existing bug-inventory (TA's c282 baselineCycleCount=1.5) with macro-specific bugs from last 60 days. If none exist, falls back to system-wide 4-6 per parent charter §Baseline Metric Capture. Records `baselineCycleCount` for G10.

4. **`.claude/agents/dev-macro-indicators.md`** + **`.claude/flows/dev-macro-indicators/main.md`** — agent-father clones the dev-technical-analysis pattern (commit `cc7578f1` G12 DoD Gate verbatim) into a new agent + flow scoped to `apps/macro-indicators/`. G12 DoD Gate is included from Day 0 (no separate flow-edit task — L6 carry-over from TA cycle-7 P2-F2).

5. **`docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md`** — architect expands Phase 1 work into atomic tasks (clone TA's phase-1-task-plan-go.md structure; adjust to macro primitives + module + composition root).

**Phase 0 exit gate:**
- All 5 deliverables landed (signal trail)
- `pilot-status-macro-indicators.json` Phase 0 fields populated (brownfield link, bug-inventory ref, flow file refs)
- No code in `apps/macro-indicators/pkg/` yet (Go directory not yet created — that's Phase 1's first commit)

---

## Phase 1 — Pilot Go Scaffold (sprints 2-3, ~3-5 days)

**Goal:** Stand up the Go scaffold and ship the first primitive end-to-end.

**Owner:** dev-macro-indicators (NEW agent, Phase 0 deliverable)

**Deliverables (architect refines into atomic tasks at Phase 1 dispatch):**

1. **`apps/macro-indicators/go.mod`** — Go module scaffold (target Go version: same as TA pilot per architect Phase 1 task plan)
2. **`apps/macro-indicators/cmd/server/main.go`** — composition root (port 5004 default, /health endpoint, OpenAPI YAML reference)
3. **`apps/macro-indicators/cmd/sandbox/main.go`** — sandbox runner (clone TA's `cmd/sandbox/main.go` shape, scoped to macro scenarios)
4. **`apps/macro-indicators/pkg/primitive/macro_investment_clock/`** — FIRST primitive extracted (per L1 dogfood ordering analog: the simplest, most isolated primitive first)
5. **`docs/scenarios/macro-indicators/primitives/macro-investment-clock-{golden,edge,failure}.json`** — ≥3 scenarios (1 happy + 1 edge + 1 failure)
6. **`apps/macro-indicators/dashboard/index.html` — STUB** (Phase 1 ships dashboard skeleton with 1 primitive card; Phase 2 populates remaining cards)
7. **First sandbox green** — `cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all` exits 0 with N/N green

**Phase 1 exit gate (PO go/no-go per parent charter §Phase 1→2 gate pattern):**
- Time-to-extract first primitive ≤ 4 agent-hours (validates 7-primitive scope realism)
- Dashboard render rate ≥ 90% on the 1 Phase-1 card (validates trust layer)
- Sandbox self-test: macro-investment-clock primitive at L3+ (own scenarios pass)
- PO + architect approve Phase 1 dashboard before Phase 2 starts

**GO** = all 4 met → proceed to Phase 2 at planned scope.
**CONDITIONAL GO** = 3 of 4 met → proceed but cap at 1 primitive per sprint for next 2 sprints.
**NO-GO** = 2 or fewer met → architect re-plans Phase 2 scope before any further extraction.

---

## Phase 2 — Remaining Primitives + Module + Closure Chain (sprints 4-5, ~5-7 days)

**Goal:** Extract remaining 4-6 primitives + build module + complete G1-G12 chain.

**Owner:** dev-macro-indicators + qa + po

**Task buckets (modeled on TA Phase 2):**

- **P2-A (G4)**: Architecture fence in CI (Go linter) — `.golangci.yml` Fence-A/B/C + go-lint CI job + deliberate-violation evidence. **Pre-revert tag:** `macro-pre-ci` before P2-A2 lands.
- **P2-B (G5)**: Old TS macro-indicators code → `_deprecated/` + HTTP rewire of MCP tool callers. **Pre-revert tag:** `macro-pre-delete` before P2-B2 `git mv` lands.
- **P2-C (G9)**: PO Playwright short-circuit verification (Path B default per L6) → produces `docs/po-decisions/<date>-g9-macro-user-confirmation.md`
- **P2-D (G10)**: QA injects 1 deliberate bug → dev-macro-indicators fixes in ≤2 cycles. **Pre-revert tag:** `macro-pre-inject` before P2-D2 commit.
- **P2-E (G11)**: QA designs scenario pair A+B (shared input shape, regression canary) → dev-macro-indicators fixes A, observes B coupling
- **P2-F (G12)**: 3-task streak verification (uses Phase 1 first-primitive task + 2 Phase 2 dev tasks as the streak)

**Phase 2 exit gate:** 12/12 G-goals reach terminal grade (YES / NO / PARTIAL / DEFER); architect closure-checklist-audit reviews before PO atomic close.

---

## Phase 3 — Closure (atomic)

**Goal:** PO atomic close. Single commit. Brief CLOSES.

**Owner:** po

**Sequence:**

1. Verify 12/12 goals terminal
2. Mechanically apply charter §Decision Matrix YES criteria to finalized grades:
   - Speed = G10 + G11
   - Trust = G9 + G8
   - Scale = all 12 + sprintCount ≤ 6
3. Populate `decisionMatrix.{speed,trust,scale}` + `verdict` in single atomic commit (Charter §4.5 binding — PO-only, atomic with last G-goal flip)
4. Flip `pilot-status-macro-indicators.json.status` ACTIVE → DONE (or FAILED per outcome)
5. Flip `phase2.status` OPEN → CLOSED
6. Add closure block + closure_summary block
7. Write closure signal `docs/signals/po-macro-brief-closed-<ISO>.json`
8. Update brief master doc (this brief's master entry in `docs/architecture-briefs/`) status line
9. Overwrite PO notebook to closure-cycle final state
10. Append decisionsThisCycle entry with full rationale

**Constraints throughout Phase 3:** L84 explicit-file staging (4 files max per single-commit fallback per TA cycle-28 pattern); no `--force`, no `--no-verify`, no push.

---

## Time estimate summary

| Phase | Owner | Agent time | Calendar |
|---|---|---|---|
| Phase 0 | architect + system-auditor + agent-father | 2-3 days | 1 sprint |
| Phase 1 | dev-macro-indicators | 3-5 days | 1-2 sprints |
| Phase 2 | dev-macro-indicators + qa + po | 5-7 days | 2-3 sprints |
| Phase 3 | po | atomic (1 commit) | 1 cycle within last Phase 2 sprint |
| **Total** | **mixed** | **~10-15 agent-days** | **~5-6 sprints** |

Buffer of 0-1 sprint within charter hard deadline (2026-07-04).

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Macro primitives have higher external-data dependency than TA (8 scrapers) | HIGH | Scope pilot to primitives that don't need live data — use scenario JSON fixtures for all primitives (FRED, IMF, ADB data freeze-captured as fixtures Day 0) |
| Existing TS scrapers stay in TS; Go service can't call them directly | MEDIUM | Phase 1 task plan decides: either (a) port scrapers to Go in Phase 2; or (b) keep TS scrapers running side-by-side; or (c) deprecate TS scrapers entirely (architect call at brownfield scan) |
| Module split (`macro-core` + `macro-signals`) doubles pilot scope | MEDIUM | Pilot ONE module only (`macro-signals` recommended for G2). Defer `macro-core` to post-pilot (charter §G2 calibration paragraph) |
| `dev-macro-indicators` agent is brand new — no prior task history | LOW | agent-father clones dev-technical-analysis flow verbatim including G12 DoD Gate (L6 carry-over) — new agent inherits proven flow Day 0 |
| Hard deadline 2026-07-04 leaves little buffer | LOW | Phase 0 starts immediately (cycle-29 dispatch); 6-sprint window has 1-sprint buffer baked in |
