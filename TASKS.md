# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 071 — Per-Ticker Intelligence Summary

Vision: `SPRINT_GOAL.md`
Spec: `docs/REQ_071.md` | Design: `docs/TECH_071.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| REQ-071 | BA: REQ_071.md | BA | — | — | — | Done |
| TECH-071 | Architect: TECH_071.md | Architect | — | REQ-071 | — | Done |
| PM-071 | PM: sprint planning | PM | — | TECH-071 | — | Done |
| 1178 | TDD: failing tests AC-1 to AC-8 | Developer | tests | TECH-071 ✓ | task/1178-ticker-intelligence | Done |
| 1179 | Implement `tickerIntelligenceTools.ts` (FR-1–FR-8) | Developer | interface | 1178 ✓ | task/1178-ticker-intelligence | Review |
| 1180 | Register in `registry.ts` + update toolCount=97 (FR-9) | Developer | interface | 1179 ✓ | task/1178-ticker-intelligence | Todo |
| 1181 | Sprint close: project-stats.json | Developer | docs/data | 1180 ✓ | task/1178-ticker-intelligence | Backlog |

**WIP:** 0 In Progress. Task 1179 in Review. Task 1180 unblocked.

---

## Task Details (active tasks only — Done tasks archived)

### Task 1179 — Implement tickerIntelligenceTools.ts (Review)

Branch: `task/1178-ticker-intelligence` | Spec: `docs/TECH_071.md`

### Task 1180 — Register tool in registry.ts

Branch: `task/1178-ticker-intelligence` | Spec: `docs/TECH_071.md`
- Add import + entry in `registry.ts`
- Update `087-server-wiring.test.ts` toolCount 96→97
- Update `docs/data/tool-registry.json` toolCount=97

### Task 1181 — Sprint close

Branch: `task/1178-ticker-intelligence`
- `docs/data/project-stats.json`: currentSprint=71, toolCount=97
