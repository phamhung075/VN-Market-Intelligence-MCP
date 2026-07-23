# stock-price — Log Schema

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
| `port` | int | Listening port (5000) |
| `market_db` | string | Path to market.db (readonly Tier 3 source) |
| `addr` | string | Bind address (`:5000`) |

## Price fetch log fields

| Field | Type | Description |
|---|---|---|
| `error` | string | Internal error detail (ERROR level only) |

## Sample log lines

```json
{"time":"2026-05-14T20:15:30.123456789Z","level":"INFO","msg":"stock-price starting","port":5000,"market_db":"/app/data/market.db"}
{"time":"2026-05-14T20:15:30.456789012Z","level":"INFO","msg":"stock-price listening","addr":":5000"}
{"time":"2026-05-14T20:15:31.000000000Z","level":"INFO","msg":"http request","method":"GET","path":"/health","duration_ms":1}
{"time":"2026-05-14T20:15:31.100000000Z","level":"INFO","msg":"http request","method":"POST","path":"/price/fetch","duration_ms":48}
{"time":"2026-05-14T20:15:31.200000000Z","level":"INFO","msg":"http request","method":"GET","path":"/price/history","duration_ms":12}
{"time":"2026-05-14T20:15:40.000000000Z","level":"ERROR","msg":"price/fetch internal error","error":"context deadline exceeded"}
```

## Implementation

Startup logs emitted directly in `cmd/server/main.go` via `slog.Info`.

Request logs emitted by the request middleware in `pkg/interface/http/router.go` via `slog.Info("http request", ...)`.
The middleware records latency via `time.Since(start)` and emits one log line per request after the handler returns.

Error logs emitted in handlers for internal errors (infrastructure failures, not validation errors).

## Log level control

Default level is INFO. Structured JSON handler set at process start via `slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))`.
