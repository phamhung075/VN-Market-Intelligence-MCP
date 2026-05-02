# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-02 | **ctx at checkpoint:** ~25%

## Completed this session

| Sprint | Tasks | Result |
|--------|-------|--------|
| 1832a | CLEAN: orphans committed, Sprint 1831 closed, advance to 1832 | clean |
| 1832b | FIX: pollNews zero-check — activeSourceCount filter excludes CB-open/disabled sources; BUG 2727+2728 root cause resolved; AC-1..5 | 5 pass |

## Current baseline

- **8608 pass / 0 fail**
- totalTasksDone=485, toolCount=122, knowledgeFileCount=25
- currentSprint=1832, SPRINT_GOAL.md active = Sprint 1832
- Branch: main only, clean, pushed to origin

## Architecture state

- VPS (Vinahost): zero Playwright — curl-only (prices, BCTC PDF download, VN news RSS, SBV, foreign flow)
- Main server (mcp-server Docker): all Playwright — teChromiumNews + BCTC URL discovery
- te-chromium: crash-loop CB active (3-strike → WORK alert → auto-recovery). Counter file-persisted at `/app/data/te-chromium-cb-state.json` (Sprint 1829b)
- vnstock: exponential backoff CB active (2h→4h→8h)
- GSO macro: parseGsoHtml Variant A/1/2 regex + console.error on parse fail
- Reuters RSS: chronic consecutive errors — CB observability via 1828c
- tradingEconomics RSS: chronic consecutive errors — CB observability via 1828c
- agentConstants.ts: CLAUDE_BIN extracted (Sprint 1830a)
- pollNews zero-check: now skips alert when all active (non-CB, non-disabled) sources = 0 (Sprint 1832b)

## Known state

- No pre-existing test failures on main (0 fail baseline)
- GSO macro geo-blocked from France — console.error logs will reveal HTML in prod
- Reuters RSS / tradingEconomics RSS: chronic errors — observable, not actionable without source fix
- LanceDB/RAG OOM: environment-pinned (Bun 1.3.11 C++ crash)
- te-chromium crash loop: ongoing pre-existing
- BUG 2727 + BUG 2728 false-alarm pattern: RESOLVED via 1832b

## Next sprint intent (1833)

1. Any new BUG/WORK channel signals
2. Backlog empty — check channels for new signals
3. Reuters RSS / tradingEconomics: investigate source health if WORK alerts fire
