# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---

## Phase 0 Backlog (Stock-Price Fleet Pilot 3)

**Status:** Opened 2026-05-23 (PO dispatch signal po-pilot3-stock-price-chartered-20260523T220944Z.json). Phase 0 scope: 6 deliverables (brownfield inventory, R-CGO confirmation, bug-inventory entry, agent-flow + G12 DoD baking, anchor commit, phase-1 task plan). WIP limit enforced: max 2 In Progress. Sprint deadline: 1 sprint (2026-05-24 delivery expected). Exit gate: all 6 deliverables + architect verification signal before PO approval of Phase 0→Phase 1 transition.

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| P0-SP-1 | Brownfield inventory of apps/stock-price (architecture audit + R-CGO feasibility) | HIGH | TASK | architect + system-auditor | docs/handoffs/TASK_P0-SP-1-brownfield-inventory.md | READY | — |
| P0-SP-2 | Bug-inventory entry: stock_price_baseline (G10 metric) | HIGH | TASK | system-auditor | docs/handoffs/TASK_P0-SP-2-bug-inventory-entry.md | READY | — |
| P0-SP-3 | Agent-father: confirm dev-stock-price.md + bake dev-stock-price flow with G12 DoD Gate + CGO/Fence rules | HIGH | TASK | agent-father | docs/handoffs/TASK_P0-SP-3-agent-flow-baking.md | READY | — |
| P0-SP-4 | Set anchor commit + update pilot-status SSOT | MEDIUM | TASK | pm | docs/handoffs/TASK_P0-SP-4-anchor-commit.md | READY | P0-SP-1, P0-SP-2, P0-SP-3 (all deliverables before anchor) |
| P0-SP-5 | R-CGO Confirmation: verify primitives + module + sandbox build CGO_ENABLED=0 (binding risk gate) | CRITICAL | TASK | dev-stock-price | docs/handoffs/TASK_P0-SP-5-r-cgo-confirmation.md | READY | P0-SP-1 (brownfield R-CGO feasibility) |
| P0-SP-6 | Phase-1 task plan authoring (architect) | HIGH | TASK | architect | docs/handoffs/TASK_P0-SP-6-phase1-task-plan.md | READY | P0-SP-1, P0-SP-2 (brownfield + bug-inventory inputs) |
| P0-EXIT-GATE | Phase 0 exit gate verification (architect signal) | CRITICAL | GATE | architect | — | READY | P0-SP-1..6 all DONE |

**Notes:**
- **WIP=2 cap (fleet pilot):** max 2 READY→IN-PROGRESS at once; stock-price + kinh-dich (pilot-4) capped together at WIP=2
- **Parallel dispatch eligible:** P0-SP-1 + P0-SP-2 + P0-SP-3 + P0-SP-5 + P0-SP-6 are independent; P0-SP-4 depends on all others (sequential last)
- **R-CGO critical:** P0-SP-5 is a BINDING risk gate (HIGH severity); if BLOCKED, Phase 1 cannot proceed without architect re-cut
- **Architect sign-off required:** P0-EXIT-GATE requires architect verification signal before PO approves Phase 0→Phase 1
- **Charter reference:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Phase 0 + §CGO Boundary Clause

---

## Phase 2 Backlog (Technical-Analysis Pilot)

**Status:** Expanded 2026-05-23 by architect. WIP limit enforced: max 2 In Progress. Sprint deadline: 2026-07-03 (6 sprints from kickoff 2026-05-23).

| Task ID | Title | Priority | Type | Owner | Handoff | Status | Blocked by |
|---------|-------|----------|------|-------|---------|--------|-----------|
| P2-F2 | agent-father inserts dashboard-green DoD step in dev-technical-analysis flow | HIGH | TASK | agent-father | docs/handoffs/TASK_P2-F2.md | IN-PROGRESS (dispatch signal pm-P2-F2-dispatch-20260523T222530Z.json) | — |
| P2-A1 | Author `.golangci.yml` with Fence-A/B/C depguard rules | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-A1.md | IN-PROGRESS (dev-technical-analysis dispatched) | — |
| P2-B0 | Brownfield inventory scan: all TS TA callers in mcp-server | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B0.md | DONE 2026-05-23 (c175f745) | — |
| P2-B1 | Rewire TA callers to HTTP (assembleBriefing + tool handler + type fixes) — SCOPE EXPANDED per B0 audit | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B1.md | READY (P2-B0 done — next-up after A1/F2 land per WIP=2 rule) | P2-B0 (done) |
| P2-A2 | Add `go-lint` CI job to `.github/workflows/ci.yml` | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-A2.md | PENDING | P2-A1 |
| P2-A3 | Verify CI green on clean codebase (no violations) | HIGH | TASK | qa | docs/handoffs/TASK_P2-A3.md | PENDING | P2-A2 |
| P2-B2 | Move `technicalIndicators.ts` domain service to `_deprecated/` | HIGH | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B2.md | PENDING | P2-B1 |
| P2-D0 | Preflight: verify bug-inventory.json has ≥1 TA candidate | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-D0.md | PENDING | — |
| P2-A4 | Deliberate-violation artifact: prove CI red/green cycle | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-A4.md | PENDING | P2-A3 |
| P2-B3 | Remove all "TODO: migrate" comments from mcp-server + technical-analysis | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-B3.md | PENDING | P2-B2 |
| P2-D1 | Design and document bug-injection spec | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-D1.md | PENDING | P2-D0, P2-F1 |
| P2-B4 | Integration test: TA MCP tool end-to-end via Go service | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-B4.md | PENDING | P2-B3 |
| P2-D2 | QA injects bug; dispatches dev-technical-analysis with dashboard scenario only | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-D2.md | PENDING | P2-D1 |
| P2-E1 | QA designs scenario pair A + B (shared input shape, regression canary) | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-E1.md | PENDING | P2-F1 |
| P2-D3 | dev-technical-analysis fixes bug (≤2 cycles); dashboard GREEN | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-D3.md | PENDING | P2-D2 |
| P2-E2 | QA injects bug A; dispatches dev-technical-analysis | MEDIUM | TASK | qa | docs/handoffs/TASK_P2-E2.md | PENDING | P2-E1 |
| P2-C | G9 async user verification gate (PO-owned) | LOW | TASK | po | docs/handoffs/TASK_P2-C.md | PENDING | — |
| P2-E3 | dev-technical-analysis fixes A (triggers B red); fixes B in same cycle; both GREEN | MEDIUM | TASK | dev-technical-analysis | docs/handoffs/TASK_P2-E3.md | PENDING | P2-E2 |
| P2-F3 | QA reads flow file, confirms DoD step, counts 3-streak tasks | LOW | TASK | qa | docs/handoffs/TASK_P2-F3.md | PENDING | P2-D3, P2-E3 |

**Notes:**
- P2-F1 (architect brief) completed 2026-05-23 — not included in dispatch queue (architect-owned, non-delegable)
- P2-F2 (agent-father flow edit) IN-PROGRESS — critical path; must complete before P2-D2 + P2-E2 dispatch so streak tasks accrue under the rule
- P2-A1 IN-PROGRESS (dev-technical-analysis); P2-B0 DONE
- **PO next-dispatch gates (updated 2026-05-23 cycle 2):**
  - After P2-F2 lands → dispatch P2-D1 + P2-E1 to qa
  - After P2-A1 lands → dispatch P2-A2 to dev-technical-analysis (sequential)
  - After P2-A3 green → dispatch P2-B2 chain (deletion can proceed once fence proven)
  - **P2-B1 is READY now (P2-B0 done) but PO is holding it back** to keep dev-technical-analysis WIP ≤ 2; will dispatch when P2-A1 lands
  - **P2-B1 SCOPE EXPANDED (PM 2026-05-23T22:35Z):** Based on P2-B0 audit finding (signal file main-router-P2-B0-finding-20260523T223500Z.json), B1 now includes assembleBriefing.ts rewire (SEV-2 gap) + DailyCandle type fixes (SEV-3). Handoff updated: docs/handoffs/TASK_P2-B1.md. AC count 6→10, estimate 45min→1h. Pre-step: git tag p2-b-pre-delete before P2-B2 deletion commit.
  - After P2-D3 lands → dispatch P2-E1/E2 (regression pair needs G10 fix pattern visible)
  - After P2-D3 + P2-E3 → dispatch P2-F3 to qa (streak verification)
- G4 (fence): P2-A1 → P2-A2 → P2-A3 → P2-A4 (sequential, same owner, ~45 min)
- G5 (deletion): P2-B0 ✓ → P2-B1 → P2-B2 → P2-B3 → P2-B4 (sequential, same owner + QA, ~2.5 hours)
- G10 (AI-fix): P2-D0 → P2-D1 → P2-D2 → P2-D3 (sequential, ~2 hours + 1h agent fix)
- G11 (regression): P2-E1 → P2-E2 → P2-E3 (sequential, ~2 hours + 1h agent fix)
- G12 (flow rule): P2-F2 → (gates P2-D2/E2) → P2-F3 after P2-D3+E3 complete
- G9 (async): P2-C independent, no blocker on dev work — send DEFERRED-CYCLE-2 (ops blocker; signal po-20260522T225100Z.json)
- **Graphify decision (this cycle):** full graphify DEFERRED until Phase 2 closure. Per-task incremental `/graphify docs --update --no-viz` already enforced by `flows/developer/main.md`. Decision doc: `docs/po-decisions/2026-05-23-graphify-scope.md`.
