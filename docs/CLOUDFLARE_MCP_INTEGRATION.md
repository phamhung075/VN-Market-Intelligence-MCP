# Cloudflare Tunnel + MCP SSE Integration — Lessons Learned

## Problem

Claude Desktop connects to MCP server via **Server-Sent Events (SSE)** protocol. When exposing the MCP server through a Cloudflare Tunnel with a path prefix (`/vn-market`), the SSE connection fails:

```
GET https://zenmidi.com/vn-market/sse  → 200 OK (SSE stream opens)
  But client POSTs to:
POST https://zenmidi.com/messages     ← 404 (dropped /vn-market prefix)
```

**Root cause:** SSEServerTransport (MCP SDK) returns endpoint `/messages` in the SSE response, but when accessed through Cloudflare with path prefix, the endpoint must include the prefix: `/vn-market/messages`.

---

## Solution: Path Prefix Configuration

### 1. Environment Variable (docker-compose.yml)

```yaml
mcp-server:
  environment:
    CLOUDFLARE_PATH_PREFIX: /vn-market
    HOST: 0.0.0.0  # Critical: bind to all interfaces for external tunnel access
```

**Why:**
- `CLOUDFLARE_PATH_PREFIX` makes the path configurable (different for each deployment)
- `HOST: 0.0.0.0` allows Cloudflare tunnel on macOS to reach the Docker container
- Default: empty string (for localhost development, no prefix needed)

### 2. Server Initialization (apps/mcp-server/src/interface/mcp/server.ts)

Read the environment variable and pass to SSE session manager:

```typescript
const pathPrefix = process.env.CLOUDFLARE_PATH_PREFIX || "";
const sessions = new SseSessionManager(createMcpServerInstance, log, pathPrefix);
```

### 3. SSE Transport (apps/mcp-server/src/interface/mcp/transport.ts)

Accept path prefix in constructor and include it in the endpoint:

```typescript
export class SseSessionManager {
  constructor(
    private readonly createServer: McpServerFactory,
    private readonly log: Logger,
    private readonly pathPrefix: string = "",  // ← Path prefix parameter
  ) {}

  async handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const endpoint = `${this.pathPrefix}/messages`;  // ← Include prefix in endpoint
    const transport = new SSEServerTransport(endpoint, res);
    // ... rest of handler
  }
}
```

**Why:** When the SSE stream sends `endpoint: "/vn-market/messages"` to the client, the client will POST to the correct URL through Cloudflare.

---

## Cloudflare Tunnel Configuration (example: ~/.cloudflared/config.yml)

### Critical: Streaming Timeouts

```yaml
ingress:
  # Rule 1a: SSE endpoint with keep-alive timeouts
  - hostname: zenmidi.com
    path: ^/vn-market/sse
    service: http://localhost:3000
    originRequest:
      keepAliveTimeout: 30s
      connectTimeout: 30s

  # Rule 1b: Other /vn-market routes
  - hostname: zenmidi.com
    path: ^/vn-market/*
    service: http://localhost:3000

  # Rule 2: Gateway API
  - hostname: zenmidi.com
    path: ^/gateway/*
    service: http://localhost:4000

  # Default route
  - service: http://localhost:4000
```

**Why:**
- `keepAliveTimeout: 30s` prevents proxy from closing long-lived SSE connections
- `connectTimeout: 30s` gives SSE enough time to establish
- Specific `/vn-market/sse` rule placed BEFORE generic `/vn-market/*` (order matters)

---

## Claude Desktop Configuration (.mcp.json)

```json
{
  "mcpServers": {
    "vn-market": {
      "url": "https://zenmidi.com/vn-market/sse"
    }
  }
}
```

**Why:** Point to the external Cloudflare tunnel endpoint (not `http://localhost:3000/sse`).

---

## Validation

### 1. Check SSE Connection with curl

```bash
curl -v https://zenmidi.com/vn-market/sse
```

Look for:
- ✅ `200 OK` with `text/event-stream`
- ✅ Event data includes `"endpoint": "/vn-market/messages"`

Example event:
```
data: {"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"claude-desktop","version":"x.y.z"}},"id":1}
```

### 2. Health Check with Tools Count

```bash
curl https://zenmidi.com/vn-market/health | jq .
```

Expected:
```json
{
  "status": "ok",
  "tools": 112,
  "jobs": 50
}
```

### 3. Protocol-Level Testing (MCP Inspector Client)

The only way to validate the full MCP handshake:
```bash
npx @modelcontextprotocol/inspector https://zenmidi.com/vn-market/sse
```

This confirms:
- SSE connection successful
- POST /messages routing works
- MCP initialization completes
- All tools available to client

**Note:** Simple curl tests prove connectivity but NOT protocol correctness. Always use MCP Inspector for final validation.

---

## Debugging Checklist

| Symptom | Cause | Fix |
|---------|-------|-----|
| `localhost:3000/sse` works, but Cloudflare fails | Path prefix mismatch | Verify `CLOUDFLARE_PATH_PREFIX` in docker-compose.yml + Server reads it |
| SSE opens but POST to /messages gets 404 | Endpoint missing prefix | Check transport.ts builds endpoint with `${pathPrefix}` |
| Cloudflare tunnel can't reach container | Host binding wrong | Change `HOST: 0.0.0.0` in docker-compose.yml |
| SSE connection times out (hangs 30s) | Proxy timeout too short | Add `keepAliveTimeout: 30s` in Cloudflare config |
| Multiple active sessions but new connections fail | Session manager leak | Check heartbeat intervals are cleared on disconnect (transport.ts lines 78-84) |

---

## Key Learnings

1. **SSE ≠ HTTP REST** — Cloudflare proxies treat SSE specially. Streaming timeouts must be explicitly configured.

2. **Path prefix is NOT transparent** — The MCP SDK (SSEServerTransport) must know about the prefix to include it in responses. It doesn't auto-detect from HTTP headers.

3. **Environment configuration is best** — Instead of hardcoding `/vn-market` in code, use `CLOUDFLARE_PATH_PREFIX` env var for portability (dev=empty, prod=/vn-market).

4. **Host binding matters for external proxies** — Docker's `127.0.0.1` binding is invisible to external proxies. Must use `0.0.0.0`.

5. **Validation order** — Test in layers:
   - Layer 1: curl to SSE endpoint (network connectivity)
   - Layer 2: curl to /health (server responding)
   - Layer 3: MCP Inspector Client (full protocol validation)

---

## Summary

To expose an MCP server through Cloudflare Tunnel with path prefix:

1. **Code:** Modify SSEServerTransport to accept and use path prefix
2. **Config:** Set `CLOUDFLARE_PATH_PREFIX` env var and `HOST: 0.0.0.0`
3. **Tunnel:** Configure streaming timeouts for the `/sse` endpoint
4. **Client:** Point `.mcp.json` to the Cloudflare URL
5. **Test:** Use MCP Inspector Client to validate protocol (not just curl)

The core insight: **SSE responses must include the path prefix so clients POST to the correct URL through the proxy.**
