> Parent: [./cloudflare-mcp.md](./cloudflare-mcp.md)

# Ops — Cloudflare MCP: Diagnosis + Root Causes

## Quick Diagnosis

**Layer 1: Network connectivity**
```bash
curl -v https://zenmidi.com/vn-market/sse
```
Expected: `200 OK` with `text/event-stream`

**Layer 2: Server responding**
```bash
curl https://zenmidi.com/vn-market/health | jq .
```
Expected: `{"status":"ok","tools":<current_count>,"jobs":<current_count>}`

**Layer 3: Protocol-level (REQUIRED for MCP)**
```bash
npx @modelcontextprotocol/inspector https://zenmidi.com/vn-market/sse
```
This validates the full MCP handshake. Curl alone is insufficient.

---

## Root Causes & Fixes

### Issue 1: SSE Endpoint Missing Path Prefix

**Symptom:**
```
GET https://zenmidi.com/vn-market/sse → 200 OK
POST https://zenmidi.com/messages       ← 404 Not Found (missing /vn-market)
```

**Cause:** `SSEServerTransport` returns endpoint `/messages` but should return `/vn-market/messages`

**Fix:**
1. Check `docker-compose.yml` has `CLOUDFLARE_PATH_PREFIX: /vn-market`
2. Check `apps/mcp-server/src/interface/mcp/server.ts`: `const pathPrefix = process.env.CLOUDFLARE_PATH_PREFIX || ""; const sessions = new SseSessionManager(createMcpServerInstance, log, pathPrefix);`
3. Check `apps/mcp-server/src/interface/mcp/transport.ts`: `const endpoint = \`\${this.pathPrefix}/messages\`;`
4. Restart: `docker compose up -d --no-deps mcp-server && sleep 5` (forbidden patterns → `docs/agents/ops/flow/docker.md` § FORBIDDEN)

### Issue 2: Docker Container Unreachable from Cloudflare

**Symptom:** Tunnel works locally but external access fails

**Cause:** Server binding to `127.0.0.1` instead of `0.0.0.0`

**Fix:**
1. Check `docker-compose.yml`: `HOST: 0.0.0.0`
2. Check `apps/mcp-server/src/interface/mcp/server.ts`: `const host = process.env.HOST || "0.0.0.0"; app.listen(port, host, ...)`
3. Restart: `docker compose up -d --no-deps mcp-server && sleep 5`

### Issue 3: Cloudflare Tunnel Streaming Timeout

**Symptom:** SSE connection opens but closes after 30-60s

**Cause:** Cloudflare proxy closes long-lived SSE connections without timeout config

**Fix:** Check `~/.cloudflared/config.yml`:
```yaml
ingress:
  - hostname: zenmidi.com
    path: ^/vn-market/sse
    service: http://localhost:3000
    originRequest:
      keepAliveTimeout: 30s
      connectTimeout: 30s
```
**Critical:** This rule must come BEFORE generic `/vn-market/*` rules (order matters).

### Issue 4: Wrong MCP Connector URL in Claude Desktop

**Symptom:** Claude Desktop configured but cannot reach server

**Check:** `.mcp.json` should use `"url": "https://zenmidi.com/vn-market/sse"`. Do NOT use `http://localhost:3000/sse` when accessing through Cloudflare.
