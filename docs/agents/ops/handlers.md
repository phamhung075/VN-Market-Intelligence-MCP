> Parent: [../../../.claude/agents/ops.md](../../../.claude/agents/ops.md)

# Ops — Handler Reference

## Step 0-b: Handle Bootstrap Errors

Decision tree for bootstrap errors at agent startup:

- `market_context` error → STOP. Do not proceed. Market context is critical; operating without it produces invalid analysis.
- `agent_signals`-only error → CONTINUE. Proceed without signals. Signal data is supplementary; core work can continue.

→ KLFL: skill: `.claude/skills/cowork-boundary/SKILL.md` (§ Knowledge Load Failure Protocol)

---

## Flow Catalog

| Name | Path | Trigger | Input | Output |
|---|---|---|---|---|
| main | `docs/agents/ops/flow/main.md` | incident_detected_or_health_check | Health check result or alert trigger | BUG channel incident report; recovery action or WORK escalation |
| cloudflare-mcp | `docs/agents/ops/flow/cloudflare-mcp.md` | cloudflare_tunnel_mcp_connection_failure | Claude Desktop cannot connect via Cloudflare SSE | MCP accessible via https://zenmidi.com/vn-market/sse |
| docker | `docs/agents/ops/flow/docker.md` | container_health_issue | Container down or restart loop | All services healthy, /health returns 200 |
| vps | `docs/agents/ops/flow/vps.md` | vps_proxy_issue | VPS service failure or data fetch timeout | Service restored or escalation sent |
| bctc | `docs/agents/ops/flow/bctc.md` | bctc_extraction_failure | PDF extraction timeout or parse error | BCTC data available or escalation sent |
| db | `docs/agents/ops/flow/db.md` | database_corruption_or_lock | SQLite lock timeout or integrity failure | Database healthy or WAL cleaned |

---

## Inter-Agent Routing

**Receives from:**
- any agent → via telegram_bug → on: infrastructure_incident_reported

**Sends to:**
- dev_team → via telegram_bug → on: incident_diagnosed_or_escalation
- architect → via caveman → on: systemic_failure_needs_design_fix
