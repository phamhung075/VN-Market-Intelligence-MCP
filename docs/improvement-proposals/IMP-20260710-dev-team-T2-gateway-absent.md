# Improvement Proposal IMP-20260710-dev-team-T2-gateway-absent

**Created:** 2026-07-09T17:45Z
**Created by:** dev-team
**Status:** DRAFT

## Weakness
The `mcp__gateway__call_tool` Claude-tool — the sole sanctioned path per CLAUDE.md for every
vn-market MCP tool call (`task_claim`, `task_heartbeat`, `send_telegram`, etc.) — was entirely
absent from the session's toolset for at least two consecutive dev-team cron ticks
(2026-07-09T16:37Z and the start of 17:07Z), not merely erroring transiently. This blocked Step 3
Execution's mandatory heartbeats and the dispatcher-wrap `task_claim`, stalling the 16:37Z tick
for a full 30-minute cycle with board state parked but unexecuted.

## Evidence
- Source: dev-team session 5a45feda-431e-46c8-941d-a6539a0eca77, ticks 2026-07-09T16:37Z + 17:07Z
- Data: 6+ failed `mcp__gateway__call_tool` invocation attempts across the two ticks, all
  returning `Error: No such tool available: mcp__gateway__call_tool` (a load-time absence, not a
  runtime/transport error class)
- Reproducibility: occurred twice in immediate succession within the same session; not yet
  confirmed whether it is session-scoped, host-scoped, or tied to a specific MCP client
  reconnect event
- Trigger: T2 (flow step improvised due to missing capability — the `mcp_call` bash/curl bridge
  in `scripts/agents-flow/mcp-call.sh` was used as a workaround, documented separately via
  doc-self-heal in `docs/agents/dev-team/flow/main.md`)
- Secondary signal (T5, subsumed under T2 per SC-0 tie-break): the 17:07Z tick's total step count
  and elapsed time substantially exceeded a normal single-task tier tick, driven by the
  workaround discovery + verification overhead

## Proposed Change
Investigate why the `mcp__gateway__call_tool` Claude-tool can be absent from a cron-fired dev-team
session's toolset for consecutive ticks, and whether this is a client-side MCP server connection
lifecycle issue (e.g., the `gateway` MCP server failing to reconnect on a fresh headless session)
versus a tool-loading/registration timing issue. If the root cause is a reconnect gap, consider
whether `dev-team-tick-preflight.sh`'s existing `mcp_call()` bash bridge should be promoted from
an undocumented improvised fallback to the documented primary path for lock-only operations
(heartbeats, claims, releases) in cron-fired ticks specifically — reserving the Claude-tool path
for interactive sessions where richer MCP surface (e.g., `list_server_tools`/`search_tools`) is
actually needed. No specific file changes proposed here — this is a diagnosis request, not an
implementation.

## Lane
LANE-A

### Lane Rationale
Does not touch gate/audit logic, loop success criteria, or user-facing comprehensibility (C-3
check: NO on all four). Does not perform an irreversible action. This is an infrastructure
diagnosis + doc/architecture question for `agents-architect` to evaluate, consistent with default
Lane-A handling (auto-propose, PO/architect reviews and decides whether to route to a FIX).

## Success Signal
A future dev-team tick's preflight completes Step 3 using `mcp__gateway__call_tool` successfully
with no fallback needed, OR — if the root cause is structural — `agents-architect` produces a
decision on whether to formalize the `mcp_call` bridge as the primary cron-tick lock path,
tracked via a FIX/SPIKE row on the board.

## Rollback
No code changed by this proposal itself — nothing to roll back. If a future FIX implementing the
architect's recommendation regresses lock behavior, revert that FIX's commit.

---
