---
name: System baseline
description: ~86 tools, ~31 crons, Sprint 059 state as of 2026-04-12
type: project
---

System baseline as of 2026-04-12 (Sprint 059 in progress):
- ~86 MCP tools (84 pre-sprint + 2 new: get_evidence_summary, create_prediction_claim)
- ~31 cron jobs (29 pre-sprint + 2 new: baseRateComputation Sun 19:00 UTC, predictionResolution 16:30 UTC nightly)
- Analysis Team: 9 agents (0-8) + Unified Coordinator
- Sprint 059: Prediction Engine Phase B+C (base rates + prediction claims)
- Agent 08 (Prediction Synthesizer) added 2026-04-12 — Monday 07:30 VN, max 5 claims/run

**Why:** This is the reference point for detecting drift. Before every rewrite, run Discovery Protocol and compare against this baseline.
**How to apply:** If tool count differs from this baseline, investigate what changed before rewriting.
