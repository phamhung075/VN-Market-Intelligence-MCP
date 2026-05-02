# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-02 | **ctx at checkpoint:** ~15%

## Completed this session

| Sprint | Tasks | Result |
|--------|-------|--------|
| 1831a | CLEAN: orphans committed, Sprint 1830 closed, advance to 1831, remote branches pruned | clean |

## Current baseline

- **8602 pass / 0 fail**
- totalTasksDone=483, toolCount=122, knowledgeFileCount=25
- currentSprint=1831, SPRINT_GOAL.md active = Sprint 1831
- Branch: main only, clean, pushed to origin

## Architecture state

- VPS (Vinahost): zero Playwright — curl-only (prices, BCTC PDF download, VN news RSS, SBV, foreign flow)
- Main server (mcp-server Docker): all Playwright — teChromiumNews + BCTC URL discovery
- te-chromium: crash-loop CB active (3-strike → WORK alert → auto-recovery). Counter file-persisted at `/app/data/te-chromium-cb-state.json` (Sprint 1829b)
- vnstock: exponential backoff CB active (2h→4h→8h)
- GSO macro: parseGsoHtml Variant A/1/2 regex + console.error on parse fail
- Reuters RSS: consecutive-error CB active (≥10 → one-shot WORK alert)
- tradingEconomics RSS: consecutive-error CB active (same pattern)
- agentConstants.ts: CLAUDE_BIN extracted (Sprint 1830a)

## Known state

- No pre-existing test failures on main (0 fail baseline)
- GSO macro geo-blocked from France — console.error logs will reveal HTML structure in prod
- Reuters RSS / tradingEconomics RSS: chronic errors — observable via 1828c
- LanceDB/RAG OOM: environment-pinned (Bun 1.3.11 C++ crash)
- te-chromium crash loop: ongoing pre-existing

## Next sprint intent (1832)

1. Any new BUG/WORK channel signals
2. Backlog empty — PO should check channels for new signals
3. If Reuters/TE WORK alerts fire in production, investigate source health
