# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-02 | **ctx at checkpoint:** ~22%

## Completed this session

| Sprint | Tasks | Result |
|--------|-------|--------|
| JANITOR-019d | 2 deferred sqlInClause sites replaced | grep clean |
| 1819a | Fix doc invariant: currentSprint numeric (1820) | failures resolved |
| JANITOR-020 | DRY: 4 symbols exported from domain, duplicates deleted in interface | -35 lines |
| 1821a | pollNews teChromiumNews cold-start retry | +5 tests |
| 1821b | smartCompactSpawner → smart_compact MCP tool #118 | +2 tests |
| 1821c | SPRINT_GOAL.md → Sprint 1821 active | doc update |
| 1822a | Safe browser.close() in Playwright finally + dead Reuters config removed | tsc clean |
| 1822b | VPS systemd StartLimitIntervalSec=0 on 3 services | no more StartLimitHit |
| 1822c | fetch-browser.py deleted from VPS, fetch_rss fallback for vneconomy | grep clean |
| 1822d-a | BCTC Playwright discovery → local mcp-server Docker (chromiumPageFetcher.ts) | +2 tests |
| 1822d-b | Remove all Playwright scripts from VPS (1,580 lines deleted) | grep clean |
| VPS deploy | Playwright removed from deploy script, StartLimitIntervalSec moved to [Unit] | all services healthy |
| Docker rebuild | python3 3.13.5 + vnstock 4.0.2 in mcp-server container | vnstock endpoints restored |

## Current baseline

- **8445 pass / 105 fail (pre-existing) / 0 new failures**
- totalTasksDone=455, toolCount=123
- currentSprint=1822, SPRINT_GOAL.md shows Sprint 1821 active (minor drift)
- Branch: main only, clean, pushed to origin

## Architecture state

- VPS (Vinahost): zero Playwright — curl-only services (prices, BCTC PDF download, VN news RSS, SBV, foreign flow, TE macro API, Reuters RSS)
- Main server (mcp-server Docker): all Playwright — teChromiumNews + BCTC URL discovery (chromiumPageFetcher.ts)
- Docker container: python3 3.13.5 + vnstock 4.0.2 installed

## Known state

- 105 pre-existing test failures: RAG/embeddings (OOM), morning/evening briefings, VPS deploy E2E, yield spread
- GSO macro fetch is now a no-op (fetch-browser.py removed, curl fallback returns empty payload) — needs a curl-based replacement if GSO data is required
- SPRINT_GOAL.md says Sprint 1821 active, project-stats.json says 1822 — minor doc drift, fix next sprint

## Next sprint intent

1. Fix 105 pre-existing test failures (RAG OOM, briefing flows) if prioritized
2. Replace GSO macro fetch with curl-based approach (fetch-gso.sh is now a stub)
3. Advance SPRINT_GOAL.md to Sprint 1822
4. Any new BUG/WORK channel signals
