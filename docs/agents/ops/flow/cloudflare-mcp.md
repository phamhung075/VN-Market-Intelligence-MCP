# Ops — Cloudflare MCP Tunnel Path Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
Claude Desktop cannot connect to MCP server via Cloudflare Tunnel URL with path prefix. SSE opens but POST fails. Reports: "cannot connect on cloudflare" or MCP health unavailable.

## Output
MCP server accessible via `https://zenmidi.com/vn-market/sse` | Claude Desktop connects successfully | All MCP tools available (tool count → `docs/data/project-stats.json#toolCount`)

---

## Dispatch

| Procedure | Sub-flow |
|---|---|
| Layer diagnosis (3-layer curl/inspector) + root causes + per-issue fixes | `→ Run sub-flow: ./cloudflare-mcp-diagnosis.md` |
| Step-by-step recovery + rebuild/restart + escalation + notebook entry | `→ Run sub-flow: ./cloudflare-mcp-recovery.md` |
