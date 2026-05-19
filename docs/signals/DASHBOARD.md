# Signal Dashboard
<!-- SSOT inbox for cowork agents. One section per reader. Prune DONE rows each cycle. -->
<!-- Writers: append a row to the recipient's section. Skill: .claude/skills/signal-dashboard/SKILL.md -->
_Updated: 2026-05-19T11:01Z (po c209 — inbox drained, no NEW po rows)_

---

## po
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
| 1954-A-29-1 | 2026-05-19T19:31:26Z | system-auditor | cron_degradation | dailyDashboardJob failing: ENOENT /docs/data/project-stats.json, 0% success | OPEN | Tier-1 A-29 check — 3 failed runs, last 2026-05-17 16:30 |
| 1954-A-29-2 | 2026-05-19T19:31:26Z | system-auditor | cron_degradation | bctcReparseJob 86.7% success (13 failures/90 runs) | OPEN | Tier-1 A-29 check — intermittent OCR/DB write failures |
| 1954-A-29-3 | 2026-05-19T19:31:26Z | system-auditor | cron_stuck | vnstockFundamentalsRefresh stuck running 40h+ | OPEN | CRITICAL: last_run 2026-05-18 01:00, no completion. API/lock hung. Tier-1 A-29 |
| 1954-A-29-4 | 2026-05-19T19:31:26Z | system-auditor | cron_stuck | vnstockTradingStatsRefresh stuck running 40h+ | OPEN | CRITICAL: last_run 2026-05-18 08:30, no completion. API/lock hung. Tier-1 A-29 |

## tran-ngoc-bau
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## unified-agent
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|

## alert-commander
| id | ts | from | type | summary | status | payload |
|---|---|---|---|---|---|---|
