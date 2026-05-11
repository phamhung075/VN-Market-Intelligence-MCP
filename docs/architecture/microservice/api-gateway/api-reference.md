# api-gateway — API Reference

**File:** `apps/api-gateway/src/interface/handlers.ts`

## GET /health
Aggregate health of all 8 downstream services.

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

**Path param:** `service` — registry key (mcp, pdf, rag, ta, macro, stock, kinh-dich, alert)

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

## ANY /:service/*
Reverse proxy to downstream services.

**Behavior:**
1. Look up service in registry by key
2. Strip `/:service` prefix from path, preserve query string
3. Forward request (method, headers, body) with timeout `10000ms` (5x health timeout)
4. Return upstream response (status code, content-type, body)

**Example:** `POST /mcp/api/chat?foo=bar` → `POST http://mcp-server:3000/api/chat?foo=bar`

**Errors:**
- 404: service not in registry
- 502: upstream error/timeout

## Helper Functions

- `statusClass(status)`: 'ok'→'status-up', 'down'→'status-down', else 'status-unknown'
- `statusLabel(status)`: 'ok'→'UP', 'down'→'DOWN', 'degraded'→'DEGRADED'
- `escapeHtml(str)`: Escapes &, <, >, ", ' for XSS prevention
