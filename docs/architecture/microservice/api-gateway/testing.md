# api-gateway — Testing

## Test File
`apps/api-gateway/src/__tests__/1841a-health-dashboard.test.ts`

## Framework
Bun test (`bun:test`)

## Test Fixtures
- `FIXED_HEALTH`: All 8 services 'ok' with realistic latencies (33-80ms)
- `DEGRADED_HEALTH`: 6 ok + pdf/rag 'down' (latency -1)

## Acceptance Criteria Tests

| ID | Test | Assertion |
|----|------|-----------|
| AC-1 | HTTP 200 + content-type | Status 200, text/html |
| AC-2 | Page title | Contains `<title>VN Market Intelligence` |
| AC-3 | All 8 services displayed | Body contains all service keys |
| AC-4a | Green CSS for UP | `<div class="card status-up">` |
| AC-4b | Red CSS for DOWN | `<div class="card status-down">` |
| AC-5 | Auto-refresh | `http-equiv="refresh"` + `content="60"` |
| AC-6 | Self-contained | No http/https in link/script tags |
| AC-7 | MCP placeholders | Contains `id="signals"`, `id="prediction"`, `id="alerts"` |

## Unit Tests
- `buildDashboardHtml()` renders UP/DOWN badges correctly
- Latency display: "42 ms" for ok, "N/A" for down
- `checkedAt` timestamp included

## Run Commands
```bash
cd apps/api-gateway && bun test
cd apps/api-gateway && bun tsc --noEmit
```
