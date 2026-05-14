# api-gateway — Testing

## Test Files
`apps/api-gateway/pkg/interface/http/handlers_test.go`

## Framework
Go test (`testing.T`) — table-driven tests

## Test Fixtures
- `FIXED_HEALTH`: All 9 services 'ok' with realistic latencies
- `DEGRADED_HEALTH`: Services with 'down' status (latency -1)

## Acceptance Criteria Tests

| ID | Test | Assertion |
|----|------|-----------|
| AC-1 | HTTP 200 health response | Status 200, application/json |
| AC-2 | JSON envelope shape | `{status, services{}, latencies{}, checkedAt}` |
| AC-3 | All 9 services listed | All service keys present in response |
| AC-4 | Degraded state | Overall status 'degraded' when any service down |
| AC-5 | Service health individual | `/health/:service` returns single service result |
| AC-6 | Proxy routing | `/api/*` routes forwarded to MCP server |
| AC-7 | 404 handling | Unknown routes return 404 |

## Unit Tests
- `AggregateHealthUseCase` — all ok → 'ok', any down → 'degraded'
- `StaticServiceRegistry` — returns 9 services, filters noProbe entries
- `AggregateHealthService` — fan-out via `goroutine` + `sync.WaitGroup`

## Run Commands
```bash
cd apps/api-gateway && go test ./...
```
