## Sprint 1827 — Active

**Status:** TODO | **Opened:** 2026-05-02

## Goals

- Sync project-stats.json knowledgeFileCount (22→26) + tool-registry.json toolCount (122→123)
- Create missing agent notebooks (18 of 22 agents)

## Success Criteria

- project-stats.json knowledgeFileCount matches actual .claude/knowledge/*.md count
- tool-registry.json toolCount matches project-stats.json toolCount
- All 22 agent notebooks present in docs/agent-memory/notebooks/
- `bun tsc --noEmit` clean

---

## Closed Sprints

| Sprint | Result |
|--------|--------|
| 1826 — GSO HTML parser observability + regex variants 1 & 2 | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=472 |
| 1825 — GSO HTML parser + vnstock backoff | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=470 |
| 1824 — agent-memory manifests, GSO native fetch, deploy market-hours guard, orphan cleanup | DONE — 2026-05-02. 8582 pass / 0 fail. totalTasksDone=468 |
| 1823 — vnstock backoff + te-chromium circuit breaker + GSO skip guard | DONE — 2026-05-02. 1823b+1823c+1823d merged. 8582 pass / 0 fail. totalTasksDone=462 |
| 1822 — VPS Playwright removal + BCTC migration to Docker + test fixes | DONE — 2026-05-02. 1822a–1822g merged. 8565 pass / 0 fail. totalTasksDone=458 |
| 1821 — pollNews cold-start retry + smart_compact MCP tool | DONE — 2026-05-02. 1821a + 1821b + 1821c merged. 8565 pass / 0 fail. totalTasksDone=450 |
