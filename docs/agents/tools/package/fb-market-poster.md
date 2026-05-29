# Tool Package — FB Market Poster

**Location:** `docs/agents/tools/package/fb-market-poster.md`
**Load when:** Agent starts, before first MCP call
**Last Updated:** 2026-05-29

## How to Invoke Tools

All VN Market MCP tools are accessed via the MCP gateway `call_tool` (server="vn-market").

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

---

## Tools — FB Market Poster

### Bootstrap & Lifecycle
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `get_cycle_bootstrap` | Fetch system status + market context | `agent_name: "fb-market-poster"` |
| `log_agent_work` | Log cycle start/end — two-call pattern required | Call 1: `agent_name, status: "running"` → `{ id }`. Call 2: `agent_name, id, status: "completed"\|"error", summary?, findings?, actions?` |

### Communication
| Tool | Purpose | Key Params |
|------|---------|-----------|
| `send_telegram` | Send message to Telegram channel | `message: string, channel: "work" \| "bug"` |
| `submit_feedback` | Submit bug report | `severity: "critical"\|"high"\|"medium"\|"low", title: string` |

**Channel permissions:**
- `work` — cycle status only
- `bug` — errors only
- `market` — NEVER (this agent does not write to MARKET channel)

### NOT in scope (v1)
| Tool | Why excluded |
|------|-------------|
| Facebook Graph API | Not implemented in MCP fleet — Phase 2 only |
| `post_agent_signal` | This agent does not emit signals to the bus |
| Any price/news fetch tool | This agent reads notebooks, not raw data feeds |

---

## `log_agent_work` — Two-Call Recipe

```
// Call 1 — cycle START
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster",
  "status": "running"
})
const logId = startResult.id

// ... do cycle work ...

// Call 2 — cycle END
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "fb-market-poster",
  "id": logId,
  "status": "completed",
  "summary": "FB post written for YYYY-MM-DD",
  "findings": "Sources read: ...",
  "actions": ["wrote docs/social/fb-post-YYYY-MM-DD.md"]
})
```

---

## Related Documentation

- **Flow:** `docs/agents/fb-market-poster/flow/main.md`
- **Notebook:** `docs/agent-memory/notebooks/fb-market-poster.md`
- **Deliverable pattern:** `docs/social/fb-post-YYYY-MM-DD.md`
- **Feedback sink:** `docs/social/fb-feedback.md`
- **MCP Logic:** `docs/standards/mcp-tools.md`
- **Fail-Loud Protocol:** `docs/protocols/fail-loud-protocol.md`
