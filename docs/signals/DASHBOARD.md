# Signal Dashboard
<!-- SSOT inbox for cowork agents. One section per reader. Prune DONE rows each cycle. -->
<!-- Writers: append a row to the recipient's section. Skill: .claude/skills/signal-dashboard/SKILL.md -->
_Updated: 2026-05-19T21:02Z (system-auditor Tier-1 — 2026-05-19 21:02 UTC: HEALTHY; 9/9 core services UP; 1 CRON persistent error)_

---

## po
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
| 1954-A-RECOVERY | 2026-05-19T20:50:39Z | system-auditor | runtime_recovery | CRITICAL outage RESOLVED: 8 containers down at 20:07 UTC → all 11 UP at 20:50 UTC. Likely automated recovery or ops action. | RESOLVED | Containers restarted cleanly; health endpoints responding; MCP connectivity restored; all services operational |
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
