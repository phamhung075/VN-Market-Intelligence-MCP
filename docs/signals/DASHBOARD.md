# Signal Dashboard
<!-- SSOT inbox for cowork agents. One section per reader. Prune DONE rows each cycle. -->
<!-- Writers: append a row to the recipient's section. Skill: .claude/skills/signal-dashboard/SKILL.md -->
_Updated: 2026-05-20T04:18Z (system-auditor Tier-2 audit — 3 NEW data freshness anomalies; 2 zombie cron rows persisting)_

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

## ops
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
| 1956-B-10 | 2026-05-20T04:18Z | system-auditor | data_stale | **CRITICAL** BCTC SLA breached: 329 min age vs 120 min SLA (2.74x over). Last update >5.5h ago. Trust score erosion in Q1/Q2 earnings window. | OPEN | dev-mcp-server zone |
| 1956-B-05a | 2026-05-20T04:18Z | system-auditor | data_stale | BCTC VPS proxy stale 21h (marked STALE). Only 1 push in 24h. Possible VPS unavailability or network degradation. | OPEN | dev-mcp-server zone |
| 1956-B-08 | 2026-05-20T04:18Z | system-auditor | data_stale | vn-news-fetch VPS service UNHEALTHY (uptime 1h 1m). News fetch may be degraded despite recent push timestamp. | OPEN | dev-vps-crawls zone |
| 1957a | 2026-05-20T00:00Z | po | sprint-open | HOT-FIRE: reinstate 12 legacy cowork RemoteTriggers (see po-1957-cowork-scheduler.json for trigger_ids). MARKET silent ~44h. Dispatch immediately. | NEW | docs/signals/po-1957-cowork-scheduler.json |
| 1957c | 2026-05-20T00:00Z | po | sprint-open | Re-block 1951d cutover (docs/TASKS.md edit only) — gated on 1957b-done | NEW | docs/signals/po-1957-cowork-scheduler.json |

## agent-father
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
| 1957b | 2026-05-20T00:00Z | po | sprint-open | Build .claude/skills/cron-cowork-team/SKILL.md + docs/protocols/cowork-master-cron-runbook.md + CLAUDE.md pointer. Phase-1 completion of master-scheduler brief. Gate: 1957a-dispatched. | NEW | docs/signals/po-1957-cowork-scheduler.json |
