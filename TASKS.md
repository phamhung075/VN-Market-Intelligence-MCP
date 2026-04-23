# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162 archived: `docs/archive/sprints-133-162.md`
> Sprints 163–176 archived: `docs/archive/sprints-163-176.md`
> Sprints 177–181 archived: `docs/archive/sprints-177-181.md`
> Sprints 182–189 archived: `docs/archive/sprints-182-189.md`
> Sprints 190–220 archived: `docs/archive/sprints-190-220.md`
> Sprints 221–230 archived: `docs/archive/sprints-221-230.md`
> Sprints 231–239 archived: `docs/archive/sprints-231-239.md`
> Sprints 240–240 archived: `docs/archive/sprints-240-240.md`
> Sprints 1269–1277 archived: `docs/archive/sprints-1269-1277.md`
> Sprints 1278–1282 archived: `docs/archive/sprints-1278-1282.md` (includes MSCI inclusion + agriculture weather cascades + data freshness monitoring tool, BCTC timeout fix, all merged)
> Sprints 1282–1289 archived: `docs/archive/sprints-1282-1289.md` (includes data freshness monitoring tool, foreign flow circuit breaker diagnostics, insider selling sentiment fix, BCTC async queue enrichment, foreign flow fallback fetcher, parse errors root-cause fix, all merged)
> Sprints 1290–1290 archived: `docs/archive/sprints-1290-1290.md` (includes foreign flow fallback fetcher integration into scheduler job, merged)

---

---

## Sprint 1294: Signal Payload Enrichment & BCTC Fallback Resilience

**Goal**: Restore signal chain completeness (IMF sentiment context) and improve BCTC extraction resilience (PDF timeout fallback to news context). Combines backlog items 1284 + 1267.

| ID | Title | Status | Priority |
|----|-------|--------|----------|
| 1294a | IMF context sentiment detection | Todo | MEDIUM |
| 1294b | BCTC PDF timeout fallback to news chain | Todo | MEDIUM |

### Task 1294a: IMF Context Sentiment Detection

context: docs/handoffs/TASK_1294a.md

**Branch**: task/1294a-imf-sentiment
**Effort**: 7h
**Depends on**: baseline ✓
**Status**: Review

### Task 1294b: BCTC PDF Timeout Fallback

context: docs/handoffs/TASK_1294b.md

**Branch**: task/1294b-bctc-fallback
**Effort**: 8–10h
**Depends on**: 1294a (IMF sentiment must populate signals.newsSentiment first)

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
