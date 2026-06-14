---
agent: po
task-id: ARCH-CRON-SCHEDULER-RELIABILITY
sprint: ARCH-CRON-SCHEDULER-RELIABILITY
cycle: dev-team-dispatch-tick-20260614T1106Z
date: 2026-06-14
verdict: DISPATCH (A=pull-now / B=route-qa / C=keep-parked) + signal RESOLVED
---

## Decision Journal — PO triage @ 2026-06-14T11:06Z (Sunday, VN market CLOSED)

### context
apps/mcp-server zone FREE (FIX-MCP-500-SYMBOL-TO-STRING done_verified, e69b354f / ops 2e83ebd0).
WIP=0, one slot free. head idle. Off-market Sunday = SAFE window for mcp-server work.
/goal in force: "recheck last ship code, fix all problems, improve" — proactive hardening aligned.

### signal #1 RESOLVED (I own it, to=po)
cowork-team-20260614T0953-mcp500-recovered-rootcause-open NEW→RESOLVED (commit 39cbc648).
Recommended re-dispatch is MOOT: definitive fix already shipped + done_verified BEFORE the
signal was triaged. Signal hypothesised sdk/zod pin as root — WRONG. Actual root = Bun-1.3.13
JIT Symbol→string corruption via @hono/node-server in StreamableHTTPServerTransport; fixed by
swap to WebStandardStreamableHTTPServerTransport. Atomic temp→rename, only that row touched.

### A — ARCH-CRON-SCHEDULER-RELIABILITY → PULL NOW (SPRINT-S, architect-first)
what-considered:
- only path: pull now. Dependency FIX-MCP-CRASH-LOOP-WRITEWAL is done_verified (09e2586b) →
  the live "SEQUENCED behind crash-loop fix" gate is CLEARED.
- LIVE evidence is ACTIVE THIS TICK: get_pipeline_health 11:28Z shows "Aggregator last run:
  2026-06-12" — missed Fri 06-13 weekday. The silent-misfire bug is firing right now.
- recurring:true, recurrence_count:3, route:architect → recurring-bug escalation REQUIRES
  architect root-cause, NOT another per-job patch. architect+design stage has ZERO
  dev-mcp-server WIP impact (per its own sequencing note); only the IMPL stage consumes the
  zone slot — and that stage now lands on a STABLE server (crash-loop + 500 both fixed).
why-change: no change from groomed plan; the blocking dependency simply cleared.

### B — FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS → ROUTE TO QA (final gate)
what-considered:
- only path: route to qa → done_verified. zone_owner=cross-service/ (pure docs/agents/*.md
  tool-package edits) → NO same-zone contention with A's apps/mcp-server work; both can run.
- verified_stale_zero:true, completed_at:2026-06-14, status:review — work is DONE, stuck only
  because next_agent=null. Set next_agent=qa. Cheap high-leverage doc fix; no rebuild needed.

### C — ARCH-SHIP-WAVE-REAUDIT → KEEP PARKED
what-considered:
- only path: keep parked. zone:multi, no live evidence forcing it this tick. Pulling A already
  loads architect attention for this quiet Sunday window. No reason to unpark.

### host-load / false-green guard
mcp-server work this window touches a server LIVE-verified green (call_tool non-zero payload).
Any IMPL rebuild MUST run mcp-server bun tests BEFORE ops rebuild (RED-PREPUSH strands fleet),
targeted build --no-cache + up -d --no-deps --force-recreate (NEVER compose down), docker ps -a
after. Verification gate G1–G5 require LIVE auto-fire proof (pipeline-health + cron_job_runs),
never badges.
