# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-02 | **ctx at checkpoint:** ~20%

## Completed this session

| Sprint | Tasks | Result |
|--------|-------|--------|
| 1830-clean | CLEAN: orphan files + sprint advance to 1830 | clean |
| 1830a | JANITOR-023: extract CLAUDE_BIN to agentConstants.ts, import in smartCompactSpawner + qaResponderSpawner | tsc clean |

## Current baseline

- **8602 pass / 0 fail**
- totalTasksDone=482, toolCount=122, knowledgeFileCount=25
- currentSprint=1830, SPRINT_GOAL.md active = Sprint 1830
- Branch: main only, clean, pushed to origin

## Architecture state

- VPS (Vinahost): zero Playwright — curl-only (prices, BCTC PDF download, VN news RSS, SBV, foreign flow)
- Main server (mcp-server Docker): all Playwright — teChromiumNews + BCTC URL discovery
- te-chromium: crash-loop CB active (3-strike → WORK alert → auto-recovery). Counter file-persisted at `/app/data/te-chromium-cb-state.json` — survives Docker restarts (Sprint 1829b)
- vnstock: exponential backoff CB active (2h→4h→8h)
- GSO macro: parseGsoHtml with Variant A/1/2 regex + console.error on parse fail (graceful fallback)
- Reuters RSS: consecutive-error CB active (≥10 → one-shot WORK alert → reset on success)
- tradingEconomics RSS: consecutive-error CB active (same pattern)
- agentConstants.ts: CLAUDE_BIN extracted to infrastructure/agents/agentConstants.ts (Sprint 1830a)

## Known state

- No pre-existing test failures on main (0 fail baseline)
- GSO macro will hit all-failed path until real GSO HTML structure confirmed (geo-blocked from France)
- Reuters RSS: chronic consecutive errors in prod — observable via 1828c
- tradingEconomics RSS: chronic consecutive errors in prod — observable via 1828c
- LanceDB/RAG OOM: environment-pinned (Bun 1.3.11 C++ crash), not fixable in code
- te-chromium crash loop: ongoing pre-existing; CB persists across restarts (1829b)

## Next sprint intent (1831)

1. Any new BUG/WORK channel signals
2. Reuters RSS / tradingEconomics: if WORK alerts fire in production, investigate source health
3. Backlog is empty — PO should check MARKET/WORK/BUG for new signals
