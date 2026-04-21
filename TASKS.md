# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`
> Sprints 190–220 archived: `docs/archive/sprints-190-220.md`
> Sprints 221–225 archived: `docs/archive/sprints-221-225.md`

---

## Sprint 226 — refactor(cowork): agent merge + composite bootstrap tool + direct MCP access — COMPLETE (2026-04-21)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1560 | [BA] Write REQ_226.md: tool contract, agent merge file list, MCP access mechanism, migration safety, test plan | Done | BA |
| 1561 | [Arch] Write TECH_226.md: `get_cycle_bootstrap` implementation, Cowork .md merge diffs, access grant design | Done | Architect |
| 1562 | [Dev] Track A: create 02-financial-analyst.md + 06-digest-predict.md; delete old 02/03/08 agent files; update agent-roster.md + mcp-tools.md | Done | Dev |
| 1563 | [Dev] Track B: `getCycleBootstrap` use case + `registerCycleBootstrapTool` + registry.ts + tool-registry.json | Done | Dev |
| 1564 | [Dev] Track C: update all 7 agent .md files — Step 0 bootstrap + validation step + unified-agent role change (ships after 1563) | Done | Dev |
| 1565 | [QA] Verify: bootstrap tool shape, agent count 9→7, signal latency ≤3s, no hallucinated prices reach MARKET | Done | QA |

---

## Sprint 229 — fix(data-crisis): market_prices stale 24 days — implement 6h price-staleness watchdog + fallback assessment

| ID | Title | Status | Role |
|----|-------|--------|------|
| 229_a | [Dev] TDD RED — `229-price-staleness-watchdog.test.ts` with 5–7 failing assertions (AC-1 to AC-7) | Done | Dev |
| 229_b | [Dev] GREEN — watchdog implementation (priceUpdateWatchdogJob.ts + jobs.ts + eveningSummaryJob.ts + marketContextBuilder verify) | Done | Dev |
| 229_c | [Dev] Investigation — VPS pipeline diagnostics + fallback assessment (FALLBACK_INVESTIGATION.md + ARCHITECTURE.md update) | Done | Dev |

### Task Details

#### 229_a — TDD RED test suite
context: docs/handoffs/TASK_229a.md

#### 229_b — GREEN + FR-2 + FR-3 implementation
context: docs/handoffs/TASK_229b.md

#### 229_c — Investigation + ARCHITECTURE.md update
context: docs/handoffs/TASK_229c.md

---

## Sprint 230 — verify(bootstrap): latency SLA validation + signal quality hardening + fail-loud protocol hardening

**Goal:** Guarantee zero hallucinated prices reach MARKET channel; prove bootstrap meets ≤3s p95 latency; harden fail-loud protocol across all 7 Cowork agents.

**Blockers:** None.

| ID | Title | Status | Role |
|----|-------|--------|------|
| 230a | [Dev] TDD RED — `230-bootstrap-verify.test.ts` with 12+ failing assertions (AC-1 to AC-4) | Todo | Dev |
| 230b | [Dev] GREEN — timing instrumentation + signalValidator service + schema extension + MCP tool registration | Todo | Dev |
| 230c | [Dev] Integration — agent .md fail-loud blocks (Step 0-b, 7 files) + QA AC-6 validation step + tool registry update | Todo | Dev |

### Task Details

#### 230a — TDD RED test suite
context: docs/handoffs/TASK_230a.md

#### 230b — GREEN implementation
context: docs/handoffs/TASK_230b.md

#### 230c — Integration + QA validation
context: docs/handoffs/TASK_230c.md

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
