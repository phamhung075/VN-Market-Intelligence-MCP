# Incident Recovery: Gateway Microservices Down (2026-07-11T21:11Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Task:** intent:ops:gateway-microservices-down  
**Session UUID:** 5a45feda-431e-46c8-941d-a6539a0eca77  
**Status:** ✓ RECOVERED

**Context:** After Docker Desktop VM wedge + Mac reboot (13:44Z incident), mcp-server was restarted via `docker compose up -d mcp-server` at 19:05:35Z and verified healthy. However, router reported "Error: No such tool available: mcp__gateway__call_tool" — the gateway's tool surface was not reachable, despite all containers reporting healthy in `docker ps`.

**Root Cause:** Gateway and headroom-proxy containers had stale connection state from pre-reboot mcp-server process. When mcp-server restarted at 19:05:35Z, the gateway was still holding old SSE connections. Subsequent tool calls were timing out with "dial timeout (30s exceeded)" when attempting to connect via `http://host.docker.internal:3000/sse`.

**Diagnosis Steps:**

| Step | Finding | Evidence |
|------|---------|----------|
| Container status | Only mcp-server in compose; gateway/headroom-proxy running standalone | `docker compose ps` vs `docker ps -a` |
| Gateway logs | Dial timeouts after 19:10Z (post-reboot) | `docker logs mcp-gateway --tail 200` showed repeated "CallTool error: dial timeout (30s exceeded)" |
| MCP-Server health | Healthy at 127.0.0.1:3000/health | Uptime=397s (6min after restart), status=ok, toolCount=183 |
| Gateway health | Responding but stale state | `curl http://localhost:4040/health` returned OK, but internal dial was broken |
| Direct connectivity | MCP-Server accessible but gateway couldn't reach it | `curl http://127.0.0.1:3000/health` → 200; gateway logs → dial timeout |

**Recovery Applied:**

```bash
docker restart mcp-gateway headroom-proxy && sleep 5
# Both containers restarted successfully
```

**Post-Recovery Verification:**

| Check | Result |
|-------|--------|
| Container status | All 3 up (mcp-server up 6min, gateway up 0.5s, headroom-proxy up 0.5s) |
| MCP-Server health | `curl localhost:3000/health` → {"status":"ok","toolCount":183,"uptime":430s} |
| Gateway health | `curl localhost:4040/health` → init OK, SSE ready |
| Gateway startup logs | Fresh log at 19:12:21Z (post-restart), config loaded, SSE started |
| No new errors | Gateway logs post-restart contain only startup messages, no dial failures |

**Evidence (RAW output):**

```
$ docker restart mcp-gateway headroom-proxy
mcp-gateway
headroom-proxy

$ docker ps | grep -E 'mcp-gateway|headroom-proxy|mcp-server'
4089016507ef   vn-market-intelligence-mcp-mcp-server   …   Up 6 minutes (healthy)
e4af4bf0ed76   headroom-proxy:local                    …   Up 5 seconds
8ffa5137c2ae   mcpservergatway-gateway                 …   Up 6 seconds (healthy)

$ curl -s http://localhost:3000/health
{"status":"ok","name":"vn-market","version":"1.0.0","toolCount":183,"sessions":0,"uptime":430.340317972}

$ docker logs mcp-gateway --since 1m | grep -E 'config loaded|starting on SSE'
time=2026-07-11T19:12:21.995Z level=INFO msg="config loaded" path=config.yaml defined_servers=1 package="" exposed_servers=1 minimal=false
time=2026-07-11T19:12:21.996Z level=INFO msg="starting on SSE (Server-Sent Events)" addr=0.0.0.0:4040
```

**Classification:** Stale connection artifact post-VM-wedge/reboot cycle. Resolved via standard container restart (no code change, no rebuild).

**Next:** Router should now be able to call `mcp__gateway__call_tool` successfully. Gateway will re-establish fresh SSE connection to mcp-server on next tool invocation.

---
