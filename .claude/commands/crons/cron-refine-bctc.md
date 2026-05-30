---
# Fleet cron skill dispatcher for BCTC refine orchestration (BCTC-AGENTIC-REFINE Option-Y)
# Schedule: '0 9,14,20 * * *' UTC (09:00, 14:00, 20:00 — all outside OFF-HOSE 02:00-08:59 Mon-Fri)
# This skill is a one-liner; the orchestrator logic lives in the refine_bctc_md flow.
---

run docs/agents/refine_bctc_md/flow/main.md

## Manage
`CronList` | `CronDelete <id>`
