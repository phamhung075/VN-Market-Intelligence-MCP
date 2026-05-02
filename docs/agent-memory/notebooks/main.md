# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-02 | **ctx at checkpoint:** ~43%

## Completed this session

| Sprint | Tasks | Result |
|--------|-------|--------|
| 1822e | VPS OOM test assertions aligned to StartLimitIntervalSec=0 | 9 pass |
| 1822f | maybe-deploy-vps.sh: set-empty FAKE_DIFF fix | 7 pass |
| 1822g | Stale branch + orphan file commits | clean |
| 1822h | project-stats.json + SPRINT_GOAL.md synced to Sprint 1823 | doc sync |
| 1823a | ops: vnIndex staleness false alarm; vn-news-fetch unhealthy diagnosed | no code |
| 1823b | vnstock circuit-breaker: exponential backoff 2h→4h→8h + WORK notification | 8 pass |
| 1823c | GSO macro: skip guard when GSO_VPS_ENDPOINT unset | 11 pass |
| 1823d | te-chromium crash-loop CB: 3-strike limit, WORK alert, auto-recovery | 5 pass |
| 1824a | verify-deploy-price-fetch.sh: market-hours guard (off-hours skip freshness) | shell only |
| 1824b | stale apps/mcp-server/docs/agent-memory/ tree deleted (13 files) | clean |
| 1824c | SPRINT_GOAL.md → Sprint 1824 active, project-stats.json synced | doc sync |
| 1824d | agent-memory manifests scaffold: ops.md + WAL-checkpoint.md fixtures | 5 pass |
| 1824e | GSO macro: GSO_VPS_ENDPOINT skip guard removed, native fetch + graceful fallback | 11 pass |
| 1824f | Stale remote branch pruned, orphan files confirmed clean | clean |

## Current baseline

- **8582 pass / 0 fail**
- totalTasksDone=468, toolCount=123
- currentSprint=1824, SPRINT_GOAL.md active = Sprint 1824
- Branch: main only, clean, pushed to origin

## Architecture state

- VPS (Vinahost): zero Playwright — curl-only (prices, BCTC PDF download, VN news RSS, SBV, foreign flow)
- Main server (mcp-server Docker): all Playwright — teChromiumNews + BCTC URL discovery (chromiumPageFetcher.ts)
- te-chromium: crash-loop CB active (3-strike → WORK alert → auto-recovery)
- vnstock: exponential backoff CB active (2h→4h→8h)
- GSO macro: fetches natively (no VPS proxy needed), fails gracefully via all-failed path

## Known state

- No pre-existing test failures on main (0 fail baseline)
- GSO macro will always hit all-failed path in prod until a real GSO parser is implemented — acceptable
- LanceDB/RAG tests: environment-pinned OOM (Bun 1.3.11), not fixable in code

## Next sprint intent (1825)

1. Any new BUG/WORK channel signals
2. GSO HTML parser (if GSO macro data becomes required)
3. vnstock rate-limit monitoring follow-up (observe 1823b backoff in production)
