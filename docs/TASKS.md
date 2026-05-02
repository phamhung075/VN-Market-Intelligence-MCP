# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Historical sprint details: see [docs/TASKS_ARCHIVE.md](docs/TASKS_ARCHIVE.md)

---

## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| JANITOR-023 | DRY: extract CLAUDE_BIN shared constant — smartCompactSpawner.ts + qaResponderSpawner.ts each define identical `const CLAUDE_BIN = "/Users/admin/.local/bin/claude"`. Extract to infrastructure/agents/agentConstants.ts and import in both spawners. | low | refactor | developer | — | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|

---

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|
| 1829b | NEXT: TBD — Sprint 1829 first task | medium | chore | developer | — | 2026-05-02 |

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

---

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| 1829a | CLEAN: close Sprint 1828, advance to Sprint 1829, update project-stats.json (currentSprint=1829, totalTasksDone=479). | 2026-05-02 | — |
| 1828c | SPRINT-S: Reuters RSS + tradingEconomics consecutive-error observability; WORK alert at ≥10 failures; AC-R-1..6 + AC-TE-1..6. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1828c.md |
| 1828d | DOCS: trim docs/SPRINT_GOAL.md to ≤30 lines (keep last 5 closed sprints). | 2026-05-02 | — |
| 1828b | FIX: sync project-stats.json knowledgeFileCount to actual count. | 2026-05-02 | — |
| 1828a | CLEAN: commit orphans, close Sprint 1827, advance to Sprint 1828. | 2026-05-02 | — |
| 1827c | DOCS: scaffold 19 missing agent notebooks in docs/agent-memory/notebooks/. | 2026-05-02 | — |
| 1827b | FIX: sync project-stats.json knowledgeFileCount + tool-registry.json toolCount. | 2026-05-02 | — |
| 1827a | CLEAN: commit orphan files, close Sprint 1826, advance SPRINT_GOAL.md to Sprint 1827. | 2026-05-02 | — |
| 1826b | FIX: GSO HTML parser observability — Variant 1/2 regex + console.error on parse fail; AC-12a/b/c. 15 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1826b.md |
| 1826a | CLEAN: commit orphan files, close Sprint 1825, advance SPRINT_GOAL.md to Sprint 1826. | 2026-05-02 | — |
| 1825b | FIX: GSO HTML parser — parseGsoHtml regex extractor replaces JSON.parse(HTML); AC-11a/11b. 12 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1825b.md |
| 1825a | CLEAN: commit orphan files (agent-memory fixtures, briefing output, notebook, flows). Advance sprint to 1825. totalTasksDone=469. | 2026-05-02 | — |
| 1824f | CLEAN: commit orphan untracked files + delete stale remote branch task/1824a-deploy-market-hours-guard. tsc clean. | 2026-05-02 | — |
| 1824e | FIX: GSO macro — remove VPS_ENDPOINT skip guard, Source 3 fetch attempted natively with graceful fallback. 11 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1824e.md |
| 1823d | FIX: te-chromium crash-loop circuit breaker — 3-strike limit on "Target closed", WORK alert fires once at threshold, auto-recovery on success. 5 new AC tests. 8582 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1823d.md |
| 1822g | CLEAN: delete stale task/1822a-news-fetcher-fixes branch; commit orphan session/handoff/report files. | 2026-05-02 | — |
| 1821b | Wire smartCompactSpawner as MCP tool `smart_compact` (tool #118). tsc clean, 8565 pass / 0 fail. | 2026-05-02 | reports/TASK_REPORT_1821b.md |
| 1815d | FIX: docker-compose.yml mcp-server healthcheck — replace curl with bun fetch. 8647 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815d.md |
| 1815c | FIX: tradingEconomicsChromium.ts — retry-on-Target-closed Playwright crash. 8646 pass / 19 fail (all pre-existing). | 2026-05-02 | reports/TASK_REPORT_1815c.md |
| 1810a | FIX: BCTC income statement — sci-notation guard in vnNumberParser, GUARD_MAX 500T→2T, multi-field magnitude sentinel. 33 tests pass. | 2026-05-01 | reports/TASK_REPORT_1810a.md |
| 1777–1824 | Sprints 1777–1824 archived — see docs/TASKS_ARCHIVE.md | 2026-05-02 | — |

---
