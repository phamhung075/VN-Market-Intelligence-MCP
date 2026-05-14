# dev-api-gateway — Go Competency

**Trigger:** `gateway_work` — load when working on the Go gateway implementation.

**Historical context:** `docs/architecture-briefs/2026-05-14-go-migration-3-services.md`
**Requirements:** `docs/REQ_1912a.md`
**Module path:** `github.com/vn-market-intelligence/api-gateway` (renamed from `api-gateway-go` per 1912d cutover)

---

## Toolchain

- Go 1.22 — pin `toolchain go1.22` in `go.mod`
- Docker base image: `golang:1.22-alpine` (build stage) → `alpine:3.19` (final stage)

## Standard Library Only (no framework)

- `net/http` — HTTP server and client
- `net/http/httputil.NewSingleHostReverseProxy` — reverse proxy for `/api/*` and `/:service/*` routes
- `log/slog` — structured JSON logging (PO decision c98); all log output as JSON to stdout

## DDD Layer Mapping (Go packages)

```
apps/api-gateway/
  domain/       — interfaces, value objects (no external deps)
  app/          — use-cases, orchestration
  infra/        — HTTP clients, config loading
  interface/    — main.go, HTTP handlers, router wiring
```

## Reverse-Proxy Pattern

```go
target, _ := url.Parse(upstreamURL)
proxy := httputil.NewSingleHostReverseProxy(target)
mux.Handle("/api/", http.StripPrefix("/api", proxy))
mux.Handle("/{service}/", proxyDispatcher)
```

## Multi-Stage Dockerfile

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o gateway ./interface/

FROM alpine:3.19
COPY --from=builder /app/gateway /gateway
ENTRYPOINT ["/gateway"]
```

## Testing

- Command: `go test ./...`
- Style: table-driven tests
- Coverage target: equivalent to existing 5 Vitest scenarios (health aggregation, proxy routing, 404, service discovery, error passthrough)

## SDD-1 Invariant

- Byte-for-byte JSON parity with TypeScript implementation on all API responses
- Gateway proxies only — it does not register `source_tier`; upstream services own their semantics
- Health endpoint response schema must remain identical (`{status, services{}, uptime}`)
