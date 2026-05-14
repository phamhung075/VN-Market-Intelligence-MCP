# api-gateway-go — Log Schema (AC-7)

## Format

All request logs are emitted as structured JSON lines via `log/slog` to stdout.

## Required fields

| Field | Type | Description |
|---|---|---|
| `time` | string (RFC3339) | Request timestamp |
| `level` | string | Log level (INFO) |
| `msg` | string | Always `"request"` |
| `method` | string | HTTP method (GET, POST, …) |
| `path` | string | Request path |
| `status` | int | HTTP response status code |
| `latency_ms` | int | Handler latency in milliseconds |

## Sample log line

```json
{"time":"2026-05-14T12:30:00.123456789Z","level":"INFO","msg":"request","method":"GET","path":"/health","status":200,"latency_ms":3}
```

## Implementation

Emitted by `loggingMiddleware` in `pkg/interface/http/handlers.go` using `log/slog` JSON handler.
The middleware wraps every inbound request, records the response status via a `statusRecorder`, and emits one log line per request after the handler returns.
