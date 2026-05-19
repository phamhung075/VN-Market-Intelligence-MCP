# Signal Dashboard
<!-- SSOT inbox for cowork agents. One section per reader. Prune DONE rows each cycle. -->
<!-- Writers: append a row to the recipient's section. Skill: .claude/skills/signal-dashboard/SKILL.md -->
_Updated: 2026-05-19T20:08Z (system-auditor — CRITICAL runtime outage detected, 10 new signals)_

---

## po
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
| 1954-A-runtime-1 | 2026-05-19T20:07:54Z | system-auditor | runtime_outage_critical | 8 of 10 microservices DOWN: pdf-extractor, rag-service, alert-engine, api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, news-fetch, frontend not running | OPEN | ops: restart docker-compose or investigate unintentional shutdown |
| 1954-A-mcp-1 | 2026-05-19T20:07:54Z | system-auditor | connectivity_critical | MCP gateway cannot reach vn-market server (mcp-server) via docker internal network — MCP tools unreachable | OPEN | ops: verify docker network and mcp-server container network binding |
| 1954-A-29-1 | 2026-05-19T19:31:26Z | system-auditor | cron_degradation | dailyDashboardJob failing: ENOENT /docs/data/project-stats.json, 0% success | READ | po c213 → task 1955a (FIX projectRoot() path) |
| 1954-A-29-2 | 2026-05-19T19:31:26Z | system-auditor | cron_degradation | bctcReparseJob 86.7% success (13 failures/90 runs) | READ | po c213 → no new task (OBSERVE-1953g gates, 1955b reaps zombie rows) |
| 1954-A-29-3 | 2026-05-19T19:31:26Z | system-auditor | cron_stuck | vnstockFundamentalsRefresh stuck running 40h+ | READ | po c213 → zombie row (FALSE POSITIVE); 1955b reaps + OBSERVE-1955c verifies 2026-05-25 fire |
| 1954-A-29-4 | 2026-05-19T19:31:26Z | system-auditor | cron_stuck | vnstockTradingStatsRefresh stuck running 40h+ | READ | po c213 → zombie row (FALSE POSITIVE); 1955b reaps + OBSERVE-1955d verifies 2026-05-20 fire |

## tran-ngoc-bau
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## unified-agent
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## alert-commander
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
