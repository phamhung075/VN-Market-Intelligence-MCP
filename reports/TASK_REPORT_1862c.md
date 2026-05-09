# TASK_REPORT_1862c — Cowork Scheduled Task MCP Access Investigation

**Date**: 2026-05-09
**Architect**: architect agent
**Status**: Investigation complete — root cause identified

---

## Executive Summary

Cowork scheduled tasks (market-watcher, unified-agent) lose MCP access intermittently because `mcp__claude_ai_gateway__call_tool` is a **Claude.ai platform-injected tool**, not a server-registered tool. Its presence in a session depends entirely on the Claude.ai Cowork platform maintaining an active MCP connection to `https://zenmidi.com/vn-market/sse`. When that SSE session drops or is never established for a scheduled invocation, the tool simply does not exist in the agent's function list.

This is fundamentally different from the CLI (`claude` binary) which reads `.mcp.json` and establishes its own SSE session on startup, giving it a guaranteed connection.

---

## Evidence Gathered

### Files read during investigation

| File | Key finding |
|------|-------------|
| `docs/agent-memory/sessions/2026-05-08-market-watcher.md` | 5 BLOCKED cycles (00:38, 09:38, 11:38, 03:38–06:38 cascade). Error: "No such tool available: mcp__claude_ai_gateway__call_tool" |
| `docs/agent-memory/sessions/2026-05-08-unified-agent-1601.md` | "MCP unavailable in Cowork context" — acknowledged as known issue |
| `docs/agent-memory/sessions/2026-05-08-unified-agent-1801.md` | Pattern confirmed: `MCP connectivity: UNAVAILABLE — Gateway tool not loaded in Cowork context` |
| `docs/agent-memory/sessions/2026-05-08-unified-agent-2101.md` | Blocked at bootstrap; `mcp__claude_ai_gateway__call_tool` NOT IN FUNCTION LIST |
| `.claude/agents/market-watcher.md` | `tools: Read, mcp__claude_ai_gateway__call_tool` — frontmatter declares the tool |
| `.claude/agents/unified-agent.md` | Same: `tools: Read, mcp__claude_ai_gateway__call_tool` |
| `.mcp.json` | `{ "mcpServers": { "vn-market": { "url": "https://zenmidi.com/vn-market/sse" } } }` |
| `~/.cloudflared/config.yml` | SSE route has `keepAliveTimeout: 30s` — Cloudflare will close idle SSE after 30s |
| `apps/mcp-server/src/interface/mcp/transport.ts` | Server sends heartbeat every 30s to keep SSE alive |
| `apps/mcp-server/src/interface/mcp/server.ts` | `/sse` route = SSE (stateful, long-lived); `/mcp` route = StreamableHTTP (stateless, per-request) |
| `docker-compose.yml` | `restart: unless-stopped` on all services; healthcheck `interval: 30s`, `retries: 3` |

### Failure timeline (2026-05-08 UTC)

```
00:38 — BLOCKED  (tool not found in session)
02:38 — SUCCESS  (market open, tool available)
03:38 — BLOCKED  (cascade: vn-market health != UP)
04:38 — BLOCKED  (cascade: all 9 microservices DOWN)
05:38 — BLOCKED  (cascade persistent)
06:38 — BLOCKED  (cascade persistent)
07:38 — SUCCESS  (recovery, market open)
08:38 — SUCCESS  (market open)
09:38 — BLOCKED  ("No such tool available: mcp__claude_ai_gateway__call_tool")
11:38 — BLOCKED  (same error)
12:31 — SUCCESS  (MCP gateway available)
13:30 onward — SUCCESS
16:01 — unified-agent "MCP unavailable in Cowork context"
18:01 — unified-agent "MCP unavailable in Cowork context"
21:01 — unified-agent BLOCKED at daily-review
```

---

## Root Cause Analysis

### Primary cause: Cowork session does not reliably get an MCP connection

The `mcp__claude_ai_gateway__call_tool` tool is injected by the Claude.ai Cowork platform when the platform has an active MCP gateway connection to the configured server. This injection is session-level — it only exists if the platform establishes the connection before the agent starts executing.

For CLI invocations (`claude` binary), the flow is:
1. CLI reads `.mcp.json`
2. CLI opens SSE to `https://zenmidi.com/vn-market/sse`
3. SSE handshake completes → `mcp__claude_ai_gateway__call_tool` is injected
4. Agent starts and tool is always available

For Cowork scheduled tasks, the flow is:
1. Cowork platform schedules the agent invocation
2. Platform attempts to connect to configured MCP servers (if any are configured for this task)
3. If the SSE connection is not established before the agent's first tool call → tool absent
4. Agent reports "No such tool available" and exits per error boundary

The key structural gap: **Cowork scheduled tasks may not have `.mcp.json` in scope**, or the platform does not re-establish a dropped SSE connection before each scheduled run.

### Secondary cause: SSE session lifetime mismatch

The Cloudflare tunnel config sets `keepAliveTimeout: 30s` on the SSE route. The server heartbeat fires every 30s. This is a race condition — if the heartbeat fires slightly after the 30s window closes, Cloudflare drops the connection. A dropped connection means the next Cowork scheduled invocation starts with no active MCP session.

Evidence: market-watcher at 09:38 succeeded at 08:38 (market was open, session likely warm) but failed at 09:38 (first cycle after market close, session may have been idle for a few minutes and dropped).

### Tertiary cause: Docker restart + healthcheck timing

When Docker restarts mcp-server (due to failed healthcheck), the SSE sessions map is cleared (it is in-memory in `SseSessionManager`). Any Cowork session that had a live SSE connection before the restart has an orphaned session. `handleMessage` returns 404 for unknown session IDs, which from the client's perspective looks like an MCP error — potentially causing the tool to appear unavailable.

The healthcheck interval is 30s with `retries: 3` and `timeout: 10s` — meaning the server can be unhealthy for up to 120s before restart. The 03:38–06:38 cascade (3+ hours) points to a more severe event: all 9 services down, not just a brief healthcheck failure. This is a separate infrastructure incident that happened to coincide with the same day.

---

## Hypotheses — Ranked by Confidence

### H1 (HIGH confidence): Cowork scheduled tasks have no guaranteed MCP session

The `tools:` frontmatter field in agent `.md` files declares which tools agents are *permitted* to use. It does NOT guarantee those tools are injected. For `mcp__claude_ai_gateway__call_tool` specifically, injection depends on the Claude.ai Cowork platform connecting to the MCP server at session start.

When a Cowork task fires at a scheduled time, the platform spawns a fresh Claude session. If that session does not inherit or re-establish the MCP connection, the tool is absent. This explains:
- Why the same agent succeeds at some cycle times and fails at others (sessions are independent)
- Why off-hours cycles fail more than market-hours cycles (during market hours more sessions are active, keeping connections warm)
- Why the 09:38 cycle failed immediately after the 08:38 success (different sessions, different connection state)

### H2 (MEDIUM confidence): Cloudflare 30s keepAliveTimeout drops idle SSE

The SSE route `keepAliveTimeout: 30s` means Cloudflare closes the origin connection after 30s of no activity. The server heartbeat is every 30s — exactly at the boundary. Any heartbeat that arrives 1ms late causes Cloudflare to close the connection. A closed SSE means no active session in `SseSessionManager.sessions`. Next Cowork invocation tries to call tool → session not found → tool unavailable.

This is a contributing factor, not the root cause, because if Cowork re-established the SSE session on each scheduled run, a dropped session between runs would not matter.

### H3 (LOW confidence): Docker restart clears in-memory session map

`SseSessionManager.sessions` is an in-memory `Map<string, SSEServerTransport>`. Docker restart (due to healthcheck failure or crash) clears it. Any live SSE client will get 404 on subsequent `POST /messages`. This is real but intermittent and would only explain failures that correlate with Docker restarts, which is a subset of observed failures.

---

## What is NOT the cause

- The MCP server itself being down: sessions at 12:31, 13:30, 14:38, 15:38, 22:38 all succeeded with "Bootstrap latency: 5-8ms" and "MCP gateway: Available" while market-hours cycles were blocked. The Docker containers were healthy during the off-hours BLOCKED cycles.
- Wrong `.mcp.json` URL: the URL `https://zenmidi.com/vn-market/sse` is correct and verified working.
- Incorrect tool name in frontmatter: `mcp__claude_ai_gateway__call_tool` is the correct name.

---

## Recommended Fix Approach

### Option A — Use `/mcp` endpoint instead of `/sse` for Cowork (RECOMMENDED)

The server already implements a stateless `StreamableHTTPServerTransport` at `/mcp` (line 224–242 of `server.ts`). This transport creates a fresh MCP server + transport per request and cleans up after. It does not require a persistent SSE session.

If the Cowork platform can be configured to use `https://zenmidi.com/vn-market/mcp` instead of `.../sse`, each tool call becomes stateless and independent of session lifetime. No dropped connections, no session map clearing on restart.

**Files to change**: 0 server files (endpoint already exists). Configuration change only.
- Add Cloudflare route for `/vn-market/mcp` in `~/.cloudflared/config.yml`
- Update Cowork agent MCP connector URL from `.../sse` to `.../mcp`

**Estimated size**: Config only — 0 code lines, ~5 config lines.

**Risk**: The `/mcp` route creates a new McpServer per request. This has higher per-call overhead (server instantiation) but is already in production for this path. Verify the Cowork platform supports StreamableHTTP (it should — this is the modern MCP transport).

### Option B — Increase Cloudflare keepAliveTimeout to match realistic idle periods

Change `keepAliveTimeout` from `30s` to `300s` (5 minutes) on the SSE route. This gives connections more time to survive between scheduled cycles without requiring heartbeats to be perfectly timed.

**Files to change**: `~/.cloudflared/config.yml`
- `keepAliveTimeout: 30s` → `keepAliveTimeout: 300s`

**Estimated size**: 1 line change.

**Limitation**: This only helps if H2 is the primary cause. If H1 (Cowork does not re-establish connections per-run) is the cause, this does not fix it. Good to apply alongside Option A.

### Option C — Migrate market-watcher to CLI cron (ARCHITECTURE CHANGE)

Market-watcher itself identified this in its 09:38 BLOCKED entry: "Market-watcher should be migrated from Cowork scheduler to Claude Code CLI (local cron) where MCP access is guaranteed."

The CLI cron (dev-team cron pattern in `docs/README.md Step 5`) reads `.mcp.json` and establishes its own SSE session before agent execution. This is the guaranteed-access path.

**Files to change**:
- Remove `schedule:` block from `.claude/agents/market-watcher.md`
- Add CLI cron entry to the existing cron schedule (pattern: `claude -p market-watcher ...`)
- Same for unified-agent

**Estimated size**: ~10 lines (cron config). Agent flow files unchanged.

**Risk**: Requires local machine to be running. If macOS sleeps, cron misses cycles. Acceptable since the user is in France (UTC+1, market opens at 09:00 local).

---

## Fix Type Assessment

| Option | Type | Files | Lines | Confidence |
|--------|------|-------|-------|------------|
| A: `/mcp` endpoint for Cowork | Config change | 1 config file | ~5 | HIGH — resolves H1+H3 |
| B: Cloudflare timeout increase | Config change | 1 config file | 1 | MEDIUM — resolves H2 |
| C: Migrate to CLI cron | Architecture | 2 agent .md files | ~10 | HIGH — resolves H1+H2+H3 |

**Recommendation**: Apply A + B immediately (config changes, zero risk). Evaluate C as a strategic migration for reliability.

---

## DDD Layer Impact

No domain, application, or infrastructure layer changes required. The issue is entirely in:
- **Interface layer**: MCP transport configuration (SSE vs StreamableHTTP)
- **Infrastructure layer**: Cloudflare tunnel config (timeout)
- **Agent definition layer**: `.claude/agents/*.md` scheduling config

---

## Risk Flags

1. **The `/mcp` route currently has no path in Cloudflare** — it will 404 externally until a route is added to `~/.cloudflared/config.yml`. Do not point Cowork at it before adding the route.

2. **`/mcp` is stateless but creates a new McpServer per request** — tool registry is re-instantiated each call. If any tool has module-level side effects on registration, those will fire on every call. Review `apps/mcp-server/src/interface/mcp/tools/registry.ts` before enabling.

3. **heartbeat race with Cloudflare**: `keepAliveTimeout: 30s` and `HEARTBEAT_INTERVAL = 30_000ms` are equal. The heartbeat needs to arrive strictly before the timeout, not at the same moment. Change timeout to 35s minimum if keeping SSE approach.

4. **Session map is not persisted**: On any Docker restart, all SSE sessions are lost. Cowork clients that hold a session ID from before the restart will get 404 permanently until they reconnect. There is no reconnect logic on the server side — the client must re-open `/sse`.

---

## Session Log Append

Appending to architect session log per protocol.
