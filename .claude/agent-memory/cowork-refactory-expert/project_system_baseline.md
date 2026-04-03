---
name: System baseline
description: Current system state — 58 tools, 19 crons, Sprint 039 complete as of 2026-04-03
type: project
---

System baseline as of 2026-04-03:
- 58 MCP tools registered (verified via /health endpoint)
- 19 cron jobs (including weatherCheck, franceSummary, devTeamHeartbeat, userRequestCheck, predictionOutcome)
- Sprint 039 complete: France wake-up summary, signal outcome tracking, Dev Team heartbeat, /ask fast-track, cascade metrics, prediction validation
- New since Sprint 035: supply chain tools (task 256), weather/climate tools (task 261)
- Agent signal bus live with 4 signal types: urgent_news, price_anomaly, cross_validate, suppress

**Why:** This is the reference point for detecting drift. Before every rewrite, run Discovery Protocol and compare against this baseline.
**How to apply:** If tool count differs from this baseline, investigate what changed before rewriting.
