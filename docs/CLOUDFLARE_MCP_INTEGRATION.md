# Cloudflare Tunnel + MCP SSE Integration — Lessons Learned

**Status:** ✅ COMPLETE (2026-05-05)
**URL:** https://zenmidi.com/vn-market/sse
**Tools Available:** 130 MCP tools via Cloudflare Tunnel

---

## Problem Statement

Connect Claude Desktop to VN Market Intelligence MCP server through Cloudflare Tunnel with path prefix routing (`/vn-market/*`).

**Requirements:**
- SSE streaming protocol must work through proxy
- 130 MCP tools must be discoverable
- Server runs in Docker on localhost, accessible via Cloudflare domain
- Support both local dev (no prefix) and production (with prefix)

---

## Root Cause Analysis

### The SSE Path Prefix Problem

SSE (Server-Sent Events) protocol works in two phases:

1. **GET /sse** — Client establishes persistent stream
   - Server responds with initial message containing endpoint path
   - Message format: `event: endpoint\ndata: /messages?sessionId=<id>`

2. **POST /messages?sessionId=<id>** — Client sends tool requests
   - Must target same path returned in step 1

**The Bug:**
When behind Cloudflare Tunnel with path prefix:
- Request arrives: `GET https://zenmidi.com/vn-market/sse`
- Server strips prefix, processes as: `GET /sse` (internally)
- SSEServerTransport hardcoded endpoint response: `/messages?sessionId=<id>`
- Client resolves relative path from Cloudflare domain → `POST https://zenmidi.com/messages` (drops /vn-market)
- Result: 404 Not Found on POST

**Why It Failed Before:**
```typescript
// OLD: transport.ts line 48
const transport = new SSEServerTransport("/messages", res);
// This always returns: "/messages"
// But it should return: "/vn-market/messages" when behind Cloudflare
```

---

## Solution Architecture

### 1. Environment Configuration

Add path prefix as environment variable in `docker-compose.yml`:

```yaml
environment:
  CLOUDFLARE_PATH_PREFIX: /vn-market  # Production with Cloudflare
  # (empty string "" in local dev)
```

### 2. Server-Side Path Prefix Detection

In `apps/mcp-server/src/interface/mcp/server.ts`:

```typescript
// Detect path prefix from environment
const pathPrefix = process.env.CLOUDFLARE_PATH_PREFIX || "";
const sessions = new SseSessionManager(createMcpServerInstance, log, pathPrefix);
```

### 3. SSEServerTransport Configuration

In `apps/mcp-server/src/interface/mcp/transport.ts`:

```typescript
export class SseSessionManager {
  constructor(
    private readonly createServer: McpServerFactory,
    private readonly log: Logger,
    private readonly pathPrefix: string = "", // ← NEW PARAMETER
  ) {}

  async handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Include pathPrefix in the endpoint so clients find the POST endpoint
    const endpoint = `${this.pathPrefix}/messages`;
    const transport = new SSEServerTransport(endpoint, res);
    // ...
  }
}
```

### 4. How It Works End-to-End

```
Client Request (Cloudflare URL):
  GET https://zenmidi.com/vn-market/sse

Server Processing:
  1. stripCloudflarePathPrefix("/vn-market/sse") → "/sse" (internal)
  2. Route to handleSse() with pathPrefix="/vn-market"
  3. SSEServerTransport created with endpoint="/vn-market/messages"
  4. Response sent to client:
     event: endpoint
     data: /vn-market/messages?sessionId=abc123

Client Follows Up:
  POST https://zenmidi.com/vn-market/messages?sessionId=abc123
  ✓ Routes correctly through Cloudflare → localhost:3000
```

---

## Configuration Files Modified

### docker-compose.yml
```yaml
mcp-server:
  environment:
    PORT: '3000'
    HOST: 0.0.0.0  # ← Critical: accept connections from Cloudflare on macOS host
    CLOUDFLARE_PATH_PREFIX: /vn-market  # ← NEW
    # ... other vars
```

### ~/.cloudflared/config.yml
```yaml
ingress:
  # Route 1a: /vn-market/sse — MCP SSE streaming (must not buffer)
  - hostname: zenmidi.com
    path: /vn-market/sse
    service: http://localhost:3000
    originRequest:
      http2Origin: false
      noTLSVerify: false
      keepAliveTimeout: 30s  # ← Keep SSE alive through proxy
      connectTimeout: 30s

  # Route 1b: /vn-market/* — MCP Server other endpoints
  - hostname: zenmidi.com
    path: /vn-market/*
    service: http://localhost:3000
```

### .mcp.json (Claude Desktop Configuration)
```json
{
  "mcpServers": {
    "vn-market": {
      "url": "https://zenmidi.com/vn-market/sse",
      "type": "sse",
      "env": {}
    }
  }
}
```

---

## Critical Learnings

### 1. Path Prefix Must Be Included in Endpoint Response
The SSEServerTransport returns the endpoint path in the initial SSE event. When running behind a proxy with path prefix, **this path must include the prefix**. Relative path resolution alone won't work.

### 2. Host Binding Matters for Docker on macOS
```typescript
// ✗ WRONG: Only accepts localhost connections
const host = "127.0.0.1";

// ✓ CORRECT: Accept connections from macOS host to Docker container
const host = "0.0.0.0";
// or read from environment: process.env.HOST || "0.0.0.0"
```

When Cloudflare Tunnel runs on macOS and tries to reach a Docker container, it connects to the host's exposed port (0.0.0.0:3000), not the container's internal loopback. Binding to 127.0.0.1 causes "connection refused" from the tunnel.

### 3. Streaming Timeouts in Proxy Configuration
SSE keeps connections open indefinitely. Proxies may timeout idle streams. Cloudflare config must explicitly set:
```yaml
keepAliveTimeout: 30s  # Send keep-alive heartbeats
connectTimeout: 30s    # Allow longer initial connection setup
```

The server-side heartbeat (transport.ts line 59-70) also keeps the stream alive:
```typescript
const heartbeatInterval = setInterval(() => {
  res.write(": keep-alive\n\n");  // SSE comment, ignored by clients
}, 30_000);  // Every 30 seconds
```

### 4. Order Matters in Cloudflare Ingress Rules
```yaml
ingress:
  # Specific path FIRST (exact /sse match)
  - path: /vn-market/sse
    service: http://localhost:3000

  # Generic pattern SECOND (catches other /vn-market/*)
  - path: /vn-market/*
    service: http://localhost:3000
```

Cloudflare processes ingress rules in order. If `/vn-market/*` comes first, it will match `/vn-market/sse` before the specific handler.

---

## Validation Checklist

✅ **SSE Connection**
```bash
curl -m 3 -s https://zenmidi.com/vn-market/sse
# Returns: event: endpoint\ndata: /vn-market/messages?sessionId=...
```

✅ **Health Check**
```bash
curl https://zenmidi.com/vn-market/health | jq .toolCount
# Returns: 130
```

✅ **Message Routing**
```bash
curl -X POST https://zenmidi.com/vn-market/messages?sessionId=<id> \
  -d '{"jsonrpc":"2.0","method":"tools/list",...}'
# Returns: Accepted
```

✅ **Claude Desktop Connection**
- Launch Claude Desktop
- Verify MCP server "vn-market" appears in settings
- Test a tool call (e.g., `get_market_snapshot()`)
- Observe SSE events flowing through tunnel

---

## Deployment Checklist

When deploying new MCP servers behind Cloudflare Tunnel:

- [ ] **Environment Variable** — Add `CLOUDFLARE_PATH_PREFIX` to docker-compose.yml
- [ ] **Transport Configuration** — Pass `pathPrefix` to SseSessionManager constructor
- [ ] **Endpoint Path** — Build endpoint as `${pathPrefix}/messages` in handleSse()
- [ ] **Host Binding** — Use `0.0.0.0` in Docker, not `127.0.0.1`
- [ ] **Proxy Timeouts** — Set `keepAliveTimeout` and `connectTimeout` in Cloudflare config
- [ ] **Ingress Order** — Place specific paths before wildcard patterns
- [ ] **Health Check** — Verify 130 tools via `/health` endpoint

---

## Files Changed

| File | Change | Impact |
|------|--------|--------|
| `apps/mcp-server/src/interface/mcp/transport.ts` | Added `pathPrefix` parameter to SseSessionManager | Controls endpoint path in SSE response |
| `apps/mcp-server/src/interface/mcp/server.ts` | Read `CLOUDFLARE_PATH_PREFIX` environment variable | Passes prefix to session manager |
| `docker-compose.yml` | Added `CLOUDFLARE_PATH_PREFIX: /vn-market` | Configures production path prefix |
| `~/.cloudflared/config.yml` | Added explicit `/vn-market/sse` route with timeouts | Ensures streaming works through proxy |
| `.mcp.json` | Updated to `https://zenmidi.com/vn-market/sse` | Claude Desktop connects to external URL |

---

## Related Documentation

- **MCP Protocol Reference** — [Model Context Protocol Spec](https://modelcontextprotocol.io)
- **Cloudflare Tunnel Docs** — [https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- **Server Architecture** — See `docs/ARCHITECTURE.md`
- **Docker Setup** — See `docker-compose.yml`
