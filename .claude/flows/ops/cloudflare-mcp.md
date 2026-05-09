# Ops — Cloudflare MCP Tunnel Path Flow

**Tools:** `.claude/tools/package/ops.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via the MCP gateway `call_tool`.

## Error Boundary

Recovery fails after standard steps → `send_telegram(channel="bug", message="[ops] Cloudflare tunnel unrecoverable: {error}")` → EXIT. Do NOT loop or create speculative docs.

---

## Input
Claude Desktop cannot connect to MCP server via Cloudflare Tunnel URL with path prefix. SSE opens but POST fails. Reports: "cannot connect on cloudflare" or MCP health unavailable.

## Output
MCP server accessible via `https://zenmidi.com/vn-market/sse` | Claude Desktop connects successfully | Full 112 tools available

---

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
Expected: `{"status":"ok","tools":112,"jobs":50}`

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
1. Check `docker-compose.yml` has environment variable:
   ```yaml
   environment:
     CLOUDFLARE_PATH_PREFIX: /vn-market
   ```

2. Check `apps/mcp-server/src/interface/mcp/server.ts`:
   ```typescript
   const pathPrefix = process.env.CLOUDFLARE_PATH_PREFIX || "";
   const sessions = new SseSessionManager(createMcpServerInstance, log, pathPrefix);
   ```

3. Check `apps/mcp-server/src/interface/mcp/transport.ts`:
   ```typescript
   async handleSse(...) {
     const endpoint = `${this.pathPrefix}/messages`;  // ← Must include prefix
     const transport = new SSEServerTransport(endpoint, res);
   }
   ```

4. Restart: `docker-compose down && docker-compose up -d && sleep 5`

### Issue 2: Docker Container Unreachable from Cloudflare

**Symptom:** Tunnel works locally but external access fails

**Cause:** Server binding to `127.0.0.1` instead of `0.0.0.0`

**Fix:**
1. Check `docker-compose.yml`:
   ```yaml
   environment:
     HOST: 0.0.0.0  # ← Critical for external proxy access
   ```

2. Check `apps/mcp-server/src/interface/mcp/server.ts`:
   ```typescript
   const host = process.env.HOST || "0.0.0.0";
   app.listen(port, host, () => {...});
   ```

3. Restart services: `docker-compose down && docker-compose up -d && sleep 5`

### Issue 3: Cloudflare Tunnel Streaming Timeout

**Symptom:** SSE connection opens but closes after 30-60s

**Cause:** Cloudflare proxy closes long-lived SSE connections without timeout config

**Fix:** Check `~/.cloudflared/config.yml`:
```yaml
ingress:
  # SSE endpoint MUST have streaming timeouts
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

**Check:** `.mcp.json` should point to external Cloudflare endpoint:
```json
{
  "mcpServers": {
    "vn-market": {
      "url": "https://zenmidi.com/vn-market/sse"
    }
  }
}
```

Do NOT use `http://localhost:3000/sse` when accessing through Cloudflare.

---

## Step-by-Step Recovery

**Step 1: Diagnose which layer fails**
- Run all 3 curl/inspector commands above
- Identify: network? server health? protocol?

**Step 2: Fix configuration**
- If Layer 1 (curl) fails → network/tunnel issue (may require ops/sys admin intervention)
- If Layer 2 (health) fails → server may be down → restart Docker
- If Layer 3 (MCP Inspector) fails → likely path prefix or endpoint issue → apply "Issue 1" fix

**Step 3: Verify code has all fixes applied**
- `grep "CLOUDFLARE_PATH_PREFIX" docker-compose.yml`
- `grep "pathPrefix" apps/mcp-server/src/interface/mcp/server.ts`
- `grep "this.pathPrefix" apps/mcp-server/src/interface/mcp/transport.ts`

**Step 4: Rebuild & restart**
```bash
cd $PROJECT_ROOT
docker-compose down
docker-compose up -d
sleep 5
curl https://zenmidi.com/vn-market/health | jq .
```

**Step 5: Validate with MCP Inspector**
```bash
npx @modelcontextprotocol/inspector https://zenmidi.com/vn-market/sse
```

---

## Reference Documentation

- **Full integration guide:** `docs/CLOUDFLARE_MCP_INTEGRATION.md`
- **Transport code:** `apps/mcp-server/src/interface/mcp/transport.ts`
- **Server setup:** `apps/mcp-server/src/interface/mcp/server.ts`
- **Docker config:** `docker-compose.yml` (CLOUDFLARE_PATH_PREFIX + HOST)

---

## Escalation Criteria

Do NOT attempt to fix if:
- Cloudflare Tunnel service itself is down (check `cloudflared` systemd service)
- Network partition to Cloudflare (DNS failures, firewall)
- Multiple services crashing (suggests deeper issue)

In these cases:
```
🚨 ESCALATION REQUIRED
Issue: [describe] | Root cause: [diagnosis from layers 1-3]
Attempted recovery: [what was tried] | Blocker: [human action needed]
```

---

## Notebook Entry

After successful recovery, append to `docs/agent-memory/notebooks/ops.md`:
```
## Cloudflare MCP Tunnel Path — Fixed <date>
- Layer that failed: [1/2/3]
- Root cause: [Issue 1/2/3/4]
- Fix applied: [configuration change]
- Validation: MCP Inspector ✅
- Time to resolution: [minutes]
```

**Notebook write** → `docs/agent-memory/notebooks/ops.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
