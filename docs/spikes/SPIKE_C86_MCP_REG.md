# SPIKE_C86_MCP_REG — MCP Gateway Session Registration

**Status:** COMPLETE — root cause identified, recommendation provided
**Owner:** ops
**Timebox:** 120m (used ~85m)
**Branch:** `task/c86-spike-mcp-reg` (throwaway)
**Triggered by:** TNB c47 audit § MCP Gateway Status (`docs/handoffs/tnb-audit-latest.md`)

---

## Question

Why did the c47 audit Claude Code session (spawned for `tran-ngoc-bau` via Cowork Desktop) receive no MCP gateway tool registration?

All three call_tool patterns failed with "No such tool available":
- `mcp__claude_ai_gateway__*`
- `mcp__gateway__*`
- `mcp__zenmidi__*`

Distinct from c46 ("connection refused" — gateway registered, server down): c47 never registered the gateway at all.

---

## Findings

### Primary Finding — URL mismatch in cowork agent docs

All 9 cowork agent files declare a stale MCP URL:

```
cowork-workspace-team-claude-desktop/{01-news-scout, 02-financial-analyst, 03-report-analyzer,
04-market-watcher, 05-alert-commander, 06-digest-predict, 07-qa-responder, 08-tran-ngoc-bau,
unified-agent}.md
```

Each has header line `MCP: https://zenmidi.com/mcp` while project root `.mcp.json` declares:

```json
{ "mcpServers": { "vn-market": { "url": "https://zenmidi.com/vn-market/sse" } } }
```

### Secondary Finding — Cloudflare tunnel routing

Both URLs return 404 externally:
- `curl -sI https://zenmidi.com/mcp` → 404
- `curl -sI https://zenmidi.com/vn-market/sse` → 404

Local services work:
- `localhost:3000` → MCP server responds
- `localhost:4040` → gateway responds

→ Tunnel running in token-mode but not routing traffic. Separate infra ticket.

---

## Caveat — Interpretation Nuance

The `MCP:` header in cowork .md files is a **prompt-context label** read by the agent at spawn time — it tells the agent which MCP endpoint it's *expected* to use. The actual MCP server registration in Claude Desktop / Cowork comes from `claude_desktop_config.json` (or equivalent platform config), NOT from this header.

**Therefore:**
- Updating the 9 cowork .md headers will fix the **documentation** but may not fix the actual tool-registration gap.
- Root-cause investigation of the tool-registration failure should also inspect: Cowork Desktop's MCP config; whether the platform reads `.mcp.json` or its own config; whether the gateway proxy is registered separately from the vn-market MCP.
- The `mcp__claude_ai_gateway__*` tool family the audit tried is the **claude.ai gateway proxy** (different from vn-market MCP) — its availability depends on the platform binary's MCP gateway settings.

---

## Evidence Matrix

| Check | Result | Status |
|---|---|---|
| `.mcp.json` URL | `https://zenmidi.com/vn-market/sse` | Authoritative |
| Cowork docs MCP header (9 files) | `https://zenmidi.com/mcp` | STALE |
| `curl -sI https://zenmidi.com/mcp` | 404 | Broken |
| `curl -sI https://zenmidi.com/vn-market/sse` | 404 | Broken |
| `localhost:3000` MCP server | Responds | Working |
| `localhost:4040` gateway proxy | Responds | Working |
| Cloudflare tunnel routing | Not routing external traffic | Broken |
| c47 TNB session tool list | No MCP tools registered | Failed |

---

## c46 vs c47 Distinction

| Cycle | Symptom | Likely Cause | Fix domain |
|---|---|---|---|
| c46 | "connection refused" | Gateway registered, container DOWN | infra/ops (container restart) |
| c47 | "No such tool available" | Gateway NEVER registered in session | platform config / cowork bootstrap |

---

## Recommendations

### Immediate (low-cost doc fix)
1. Update 9 cowork .md headers `MCP: ...` to match `.mcp.json` (`https://zenmidi.com/vn-market/sse`) for consistency. **Will NOT alone fix registration** but eliminates documentation drift.

### Diagnostic (needed before fix)
2. Inspect Cowork Desktop's MCP server config (`claude_desktop_config.json` or equivalent) — does it know about `vn-market` and the gateway proxy?
3. Verify: when a Cowork agent spawns, which MCP servers actually appear in its `list_servers` output? Is `claude_ai_gateway` ever there for cowork-spawned agents?

### Infra (separate ticket)
4. Cloudflare tunnel: both `/mcp` and `/vn-market/sse` external paths return 404 despite local services working. Tunnel ingress config or route map needs review.

### Long-term (architect rethink)
5. Templated cowork config — single source of truth for MCP URL across all 9 agent docs.
6. Health probe at cowork spawn — if MCP tool list is empty after N seconds, log + retry before letting agent proceed.

---

## Next Step

Hand off to PO/architect:
- Doc-drift fix (9 files, 1 line each) is a quick win → standard CHORE task next cycle.
- Real registration root-cause needs Cowork Desktop config inspection — likely **outside this repo's scope** (platform config lives in user's Claude Desktop install).
- Cloudflare tunnel = separate ops ticket.

Branch `task/c86-spike-mcp-reg` is throwaway — this findings doc is the only deliverable. Branch deletes after merge of findings to main.
