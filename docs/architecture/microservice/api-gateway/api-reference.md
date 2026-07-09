# api-gateway — API Reference

**Files:** `apps/api-gateway/pkg/interface/http/{handlers,dashboard,middleware,proxy}.go` (split 2026-07-09, same package — see `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-api-gateway.md`). `handlers.go` = struct + `HandleHealth`/`HandleServiceHealth`/`HandleDashboard`; `dashboard.go` = `BuildDashboardHTML`; `middleware.go` = `writeJSON`/logging; `proxy.go` = `HandleProxy`.

## GET /health
Aggregate health of all 8 downstream services (virtual alias `api` excluded from probes).

**Response (200 if ok/degraded, 503 if down):**
```json
{
  "status": "ok|degraded|down",
  "services": { "mcp": "ok", "pdf": "ok", ... },
  "latencies": { "mcp": 42, "pdf": 55, ... },
  "checkedAt": "2026-05-03T10:00:00.000Z"
}
```

## GET /health/:service
Single service health check.

**Path param:** `service` — registry key (mcp, pdf, rag, ta, macro, stock, kinh-dich, alert, api)

**Response (200/503):**
```json
{ "service": "mcp", "status": "ok", "latencyMs": 42 }
```

**404 if unknown service:**
```json
{ "error": "Unknown service: invalid-key" }
```

## GET /health-dashboard
Self-contained HTML dashboard. Auto-refreshes every 60 seconds.

- Dark theme, responsive grid (min 200px cards)
- Color-coded: green (UP), red (DOWN), yellow (DEGRADED)
- No external CDN — fully self-contained
- XSS-safe: all dynamic values escaped via `escapeHtml()`
- Placeholder sections: "Signals", "Prediction Accuracy", "Active Alerts" (MCP data not yet wired)

## ANY /api/*
Virtual alias route — forwards to MCP server with **full path preserved verbatim**.

**Behavior:**
1. Looks up `api` key in registry (alias of `MCP_URL`)
2. Passes the FULL request path without stripping the `/api/` prefix
3. Forwards all headers including `Authorization` unchanged
4. Returns upstream response unchanged

**Example:** `POST /api/push-news` → `POST http://mcp-server:3000/api/push-news`

**Errors:**
- 502: MCP unreachable

## ANY /:service/*
Reverse proxy to downstream services.

**Behavior:**
1. Look up service in registry by key
2. Strip `/:service` prefix from path, preserve query string
3. Forward request (method, headers, body) with timeout `10000ms` (5x health timeout)
4. Return upstream response (status code, content-type, body)

**Path routing uses `proxyPath()`:**
- Virtual alias services (`noProbe: true`): path passed verbatim
- Real services: `/:service` segment stripped

**Example:** `POST /mcp/api/chat?foo=bar` → `POST http://mcp-server:3000/api/chat?foo=bar`

**Errors:**
- 404: service not in registry
- 502: upstream error/timeout

## Helper Functions

- `proxyPath(reqPath, svc)`: verbatim for noProbe services, strips `/:service` prefix for real services
- `statusClass(status)`: 'ok'→'status-up', 'down'→'status-down', else 'status-unknown'
- `statusLabel(status)`: 'ok'→'UP', 'down'→'DOWN', 'degraded'→'DEGRADED'
- `escapeHtml(str)`: Escapes &, <, >, ", ' for XSS prevention
