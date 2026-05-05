# Scheduled Task Failure — unified-agent

**Run timestamp:** 2026-05-04 ~21:04 UTC (CEST evening for user in France)
**Task:** vn-unified-agent
**Outcome:** ABORTED — cannot execute cycle

## Root cause

VN Market Intelligence MCP toolset not connected to scheduled-task session.

- Tools expected (per SKILL.md): `get_system_status`, `get_market_context`, `get_portfolio_positions`, `get_alerts`, `read_telegram_reports`, `submit_feedback`, `send_telegram`, `get_recent_fixes`, `get_watchlist`, `get_unreviewed_market_messages`, `batch_review_market_messages`, `get_pending_ask_questions`, `answer_ask_question`, etc.
- Tools available in session: workspace bash + web_fetch, file ops, Agent, ToolSearch, computer-use, cowork artifacts, mcp-registry. NONE of the VN MCP tools.
- ToolSearch with queries `submit_feedback send_telegram`, `get_system_status get_market_context`, `get_watchlist get_alerts get_portfolio` → all returned `No matching deferred tools found`.

## MCP server health

`https://zenmidi.com/mcp` is reachable. Plain HTTPS GET returned:
```
HTTP 406
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Not Acceptable: Client must accept text/event-stream"},"id":null}
```
This is the expected response from an MCP streamable-HTTP endpoint when called without the proper `Accept: text/event-stream` header. The server itself is up — the problem is purely client-side (this Cowork session is not configured to attach the server).

## What was checked

- `docs/pipeline-state.json` — status: `idle`, last update 2026-05-03 12:00 UTC, last completed: Sprint 1846b. Nothing to resume.
- `.mcp.json` — `{"mcpServers": {}}` (irrelevant for Cowork runtime, but noted).
- `CYCLE_STATUS.txt` — last unified-agent cycle 2026-04-28. No recent successful run.
- `docs/TASKS.md` — Backlog/Todo/In Progress all empty (Sprint 1846 closed).

## Protocol violations forced by the failure

- Cannot end cycle with `submit_feedback` (BUG channel) — tool unavailable.
- Cannot end cycle with `send_telegram(channel="work")` heartbeat — tool unavailable.
- Cannot run last-mile review (Step 4c) — no `get_alerts`, `get_analysis_history`.
- Cannot run message quality audit (Step 4d) — no `get_unreviewed_market_messages`.
- Cannot run /ASK queue fallback if `07-qa-responder` is down — no `get_pending_ask_questions`.

## What admin must do

The scheduled-task harness must be configured to attach the VN Market Intelligence MCP server (`https://zenmidi.com/mcp`) to this scheduled task's Cowork session. Once attached, the deferred tool list at session start should include the `get_*`, `submit_feedback`, and `send_telegram` tools.

This is a Cowork session-config issue, not a code change. The project `.mcp.json` is for Claude Code dev sessions and does not affect the Cowork scheduled-task runtime.

## Cascade impact

If this scheduled task has been failing silently across recent runs, the following protocol guarantees have been broken:
- 8x daily heartbeat to WORK channel (Mon-Fri schedule per SKILL.md) — WORK channel will be silent on `unified-agent` cycles.
- Last-mile review of Alert Commander output — no cross-check between drafted alerts and backend truth. Hallucinated prices/tickers in MARKET-channel alerts would not be caught.
- Stale-bug-report escalation (S1) and inferred dev-team-cron-failure detection (S3) — bugs filed by other agents could sit unclaimed indefinitely without escalation.
- Daily two-team resume (22:30 VN) and weekly deep review (Sunday 20:00 VN) — neither will fire.

Recommend admin checks: (1) when the harness was last reconfigured, (2) whether other scheduled tasks (Alert Commander, Digest Writer, etc.) are also missing their MCP attachment, (3) recent WORK/BUG channel activity to confirm whether unified-agent heartbeats stopped suddenly.
