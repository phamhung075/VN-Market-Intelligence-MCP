# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`
> Sprints 190–220 archived: `docs/archive/sprints-190-220.md`
> Sprints 221–225 archived: `docs/archive/sprints-221-225.md`
> Sprints 226–230 archived: `docs/archive/sprints-226-230.md` (pending archive after git push)

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

## Sprint 229 — fix(data-crisis): market_prices stale 24 days — implement 6h price-staleness watchdog + fallback assessment (2026-04-20) — COMPLETE

| ID | Title | Status | Role |
|----|-------|--------|------|
| 229_a | [Dev] TDD RED — `229-price-staleness-watchdog.test.ts` with 5–7 failing assertions (AC-1 to AC-7) | Done | Dev |
| 229_b | [Dev] GREEN — watchdog implementation (priceUpdateWatchdogJob.ts + jobs.ts + eveningSummaryJob.ts + marketContextBuilder verify) | Done | Dev |
| 229_c | [Dev] Investigation — VPS pipeline diagnostics + fallback assessment (FALLBACK_INVESTIGATION.md + ARCHITECTURE.md update) | Done | Dev |

---

## Sprint 230 — verify(bootstrap): latency SLA validation + signal quality hardening + fail-loud protocol hardening — COMPLETE (2026-04-21)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 230a | [Dev] TDD RED — `230-bootstrap-verify.test.ts` with 12+ failing assertions (AC-1 to AC-4) | Done | Dev |
| 230b | [Dev] GREEN — timing instrumentation + signalValidator service + schema extension + MCP tool registration | Done | Dev |
| 230c | [Dev] Integration — agent .md fail-loud blocks (Step 0-b, 7 files) + QA AC-6 validation step + tool registry update | Done | Dev |

---

## Sprint 232 — feat(cowork-resilience): multi-source fallback chains + exponential backoff + escalation callbacks — COMPLETE (2026-04-21)

**Goal:** Prevent 25-day VPS outages via intelligent fallback chains (primary → cache → Yahoo/domestic/Công Báo), exponential backoff orchestration, per-service health monitoring, and fail-loud escalation.

**Blockers:** None.

| ID | Title | Status | Role |
|----|-------|--------|------|
| 232a | [Dev] TDD RED — `232-cowork-resilience.test.ts` with 12 acceptance criteria | Done | Dev |
| 232b | [Dev] GREEN — resilientFetcher domain service (243 lines, exponential backoff, 180s timeout) | Done | Dev |
| 232c | [Dev] Implementation — three source routers (news/price/BCTC) + mcp.config.json fallbacks config | Done | Dev |
| 232d | [Dev] Integration — Agent Step 0c (VPS health check) + config loading + bootstrap validation | Done | Dev |
| 232e | [QA] Verification — end-to-end test suite (20 tests, 49 assertions), DDD compliance, security hardening | Done | QA |

---

## Sprint 233 — verify(cowork-resilience): end-to-end fallback chain validation + signal quality audit

**Goal:** Validate Sprint 232 fallback chains work correctly in production. Spot-check fallback signals labeled with source_fallback=true, confidence penalty 0.8075 applied, alert escalation fires when all sources exhausted. Market-hours smoke tests during Vietnam trading (09:00–15:00 +07:00).

**Ref:** REQ-233, TECH-233

**Blockers:** None (Sprint 232 complete).

| ID | Title | Status | Role |
|----|-------|--------|------|
| 233a | [Dev] TDD RED — `233-cowork-resilience-e2e.test.ts` with 27 failing assertions (AC-1 to AC-15) | In Progress | Dev |
| 233b | [Dev] GREEN — signalValidator extension (confidence penalty + temporal decay) + audit logging + schema table | Todo | Dev |
| 233c | [QA] Manual Smoke Test — market-hours execution (5 phases, 09:00–15:00 UTC+7) + observation log | Todo | QA |

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
