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

## Sprint 227 — fix(watchdog): MARKET "pipeline restored" alert on VPS recovery

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1557_a | TDD RED: `1557-watchdog-recovery.test.ts` — 3 failing assertions: recovery fires after stale, silent if never stale, reset clears flag | Review | Dev |
| 1557_b | GREEN: add `lastWasStale` flag + `_resetWatchdogStaleFlag()` export; "ok" branch sends recovery MARKET msg + returns "restored" when flag set; set flag on alert-sent | Todo | Dev |

---

## Sprint 226 — refactor(cowork): agent merge + composite bootstrap tool + direct MCP access — HOT SPRINT

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1560 | [BA] Write REQ_226.md: tool contract, agent merge file list, MCP access mechanism, migration safety, test plan | Done | BA |
| 1561 | [Arch] Write TECH_226.md: `get_cycle_bootstrap` implementation, Cowork .md merge diffs, access grant design | Done | Architect |
| 1562 | [Dev] Track A: create 02-financial-analyst.md + 06-digest-predict.md; delete old 02/03/08 agent files; update agent-roster.md + mcp-tools.md | Todo | Dev |
| 1563 | [Dev] Track B: `getCycleBootstrap` use case + `registerCycleBootstrapTool` + registry.ts + tool-registry.json | Todo | Dev |
| 1564 | [Dev] Track C: update all 7 agent .md files — Step 0 bootstrap + validation step + unified-agent role change (ships after 1563) | Todo | Dev |
| 1565 | [QA] Verify: bootstrap tool shape, agent count 9→7, signal latency ≤3s, no hallucinated prices reach MARKET | Backlog | QA |

---

## Backlog

| ID | Title | Priority | Notes |
|----|-------|----------|-------|

---
