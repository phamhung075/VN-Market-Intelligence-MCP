# Signal Dashboard
<!-- SSOT inbox for cowork agents. One section per reader. Prune DONE rows each cycle. -->
<!-- Writers: append a row to the recipient's section. Skill: .claude/skills/signal-dashboard/SKILL.md -->
_Updated: 2026-05-20T08:30Z (po c216 — drained 11 signals to processed/, pruned 3 DONE rows: 1957a, 1957b, 1957c; pipeline-state reset to idle)_

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
| 1956-B-10 | 2026-05-20T04:18Z | system-auditor | data_stale | **CRITICAL** BCTC SLA breached: 329 min age vs 120 min SLA (2.74x over). Last update >5.5h ago. Trust score erosion in Q1/Q2 earnings window. | READ | po c215 → OBSERVE (Tier-3 reclassified to B-06 WARN; same root as B-05a/B-06; earnings-window-quiet; OBSERVE-1957d tracks 72h cadence; OBSERVE-1953g covers Q1-2026 coverage 2026-05-21T02:30Z) |
| 1956-B-05a | 2026-05-20T04:18Z | system-auditor | data_stale | BCTC VPS proxy stale 21h (marked STALE). Only 1 push in 24h. Possible VPS unavailability or network degradation. | READ | po c215 → OBSERVE (same root as B-10/B-06; VPS push cadence normal for late-May earnings-quiet window; tracked by OBSERVE-1957d) |
| 1956-B-08 | 2026-05-20T04:18Z | system-auditor | data_stale | vn-news-fetch VPS service UNHEALTHY (uptime 1h 1m). News fetch may be degraded despite recent push timestamp. | READ | po c215 → OBSERVE (transient container restart; Tier-3 C-06 confirms news write-path fresh at 42s; auto-close on next clean Tier-1) |
| 1957-B-06 | 2026-05-20T04:20Z | system-auditor | data_stale | BCTC VPS data stale: last push 2026-05-19 07:05:07Z (>24h age). Within 168h SLA threshold but no discovery activity in 24h. Normal for late Q2 off-season. Monitor for 72h. | READ | po c215 → OBSERVE (Tier-3 self-classified within 168h SLA; canonical row for B-10/B-05a; tracked by OBSERVE-1957d) |

## agent-father
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
