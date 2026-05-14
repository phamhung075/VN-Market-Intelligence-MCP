# alert-engine — Log Schema (AC-14)

## Format

All logs are emitted as structured JSON lines via `log/slog` to stdout.

## Required fields

| Field | Type | Description |
|---|---|---|
| `time` | string (RFC3339Nano) | Log timestamp |
| `level` | string | Log level (DEBUG, INFO, WARN, ERROR) |
| `msg` | string | Log message |

## Request log fields (per-request middleware)

| Field | Type | Description |
|---|---|---|
| `method` | string | HTTP method (GET, POST) |
| `path` | string | Request path |
| `duration_ms` | int | Handler latency in milliseconds |

## Startup log fields

| Field | Type | Description |
|---|---|---|
| `port` | int | Listening port (5006) |
| `db_path` | string | Path to alert_engine.db |
| `addr` | string | Bind address (`:5006`) |
| `signal` | string | Shutdown signal received (SIGINT/SIGTERM) |

## Sample log lines

```json
{"time":"2026-05-14T20:15:30.123456789Z","level":"INFO","msg":"alert-engine starting","port":5006,"db_path":"/app/data/alert_engine.db"}
{"time":"2026-05-14T20:15:30.456789012Z","level":"INFO","msg":"alert-engine listening","addr":":5006"}
{"time":"2026-05-14T20:15:31.000000000Z","level":"INFO","msg":"http request","method":"GET","path":"/health","duration_ms":1}
{"time":"2026-05-14T20:15:31.100000000Z","level":"INFO","msg":"http request","method":"POST","path":"/evaluate","duration_ms":4}
{"time":"2026-05-14T20:15:40.000000000Z","level":"INFO","msg":"shutdown signal received","signal":"SIGTERM"}
{"time":"2026-05-14T20:15:40.050000000Z","level":"INFO","msg":"alert-engine stopped"}
```

## Implementation

Startup and shutdown logs emitted directly in `cmd/server/main.go` via `slog.Info`.

Request logs emitted by `requestLogger` middleware in `pkg/interface/http/router.go`.
The middleware wraps every inbound request and emits one log line per request after the handler returns.

## Log level control

Set `LOG_LEVEL=DEBUG` environment variable to enable debug-level output.
Default level is INFO.
