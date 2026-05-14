# dev-api-gateway — Notebook

Zone: `apps/api-gateway/` | Stack: TS/Bun (active) + Go 1.22 (Phase 1 new sibling) | DB: none

## Working Memory

**Last task:** 1912a-gateway-go-migration (2026-05-14) — Sprint c99

**Status:** IMPL COMPLETE — awaiting QA gate + 24h smoke window

**What changed:**
- Created `apps/api-gateway-go/` — full Go 1.22 rewrite, stdlib only (net/http, log/slog)
- DDD layout: pkg/domain/, pkg/application/, pkg/infrastructure/, pkg/interface/http/, cmd/server/
- 37 Go tests — all GREEN (`go test ./...` passes), covers all 5 Vitest scenario files
- multi-stage Dockerfile: golang:1.22-alpine builder → alpine:3.19 runtime, CGO_ENABLED=0
- README-log-schema.md: documents log/slog JSON field schema (AC-7)
- docker-compose.yml: added `api-gateway-go` service on host port 4001 (TS gateway stays on 4000 during Phase 1)
- TS gateway untouched: tsc 0 errors, no regression

**AC status:**
- AC-1 (Dockerfile): PASS — golang:1.22-alpine, no CGO
- AC-2 (JSON parity): PASS — exact field names/types in Go structs + json tags
- AC-3 (Proxy parity): PASS — verbatim path for api (noProbe=true), strip-prefix for real services, 404/502 envelopes
- AC-4 (Dashboard): PASS — 200, text/html, 9 services, status-up/down CSS classes, meta refresh 60, no CDN
- AC-5 (Go tests): PASS — 37 tests, all GREEN
- AC-6 (MCP-server 8804 Vitest): DEFERRED — requires compose deploy; QA validates at gate
- AC-7 (log/slog schema): PASS — middleware + README-log-schema.md
- AC-8 (Rollback): PASS — docker-compose.yml has TS gateway on 4000, Go on 4001; revert = remove api-gateway-go block + restart
- AC-9 (DDD layout): PASS — 4 DDD layers in pkg/, cmd/server/
- AC-10 (24h smoke): DEFERRED — starts after QA merges + deploys
- AC-11 (healthz alias): PASS — GET /healthz registered in router.go → same handler as /health

**Branch:** task/1912a-gateway-go-migration
**Final commit:** a16f3bdb

**Pattern note (Go gateway):**
- Service name added to registry → 4 touch points: infrastructure/registry.go (buildServiceConfigs), cmd/server/main.go (serviceURLs), interface/http/handlers.go (dashboardServices), docker-compose.yml (api-gateway-go env)
- Tests that count services: infrastructure/registry_test.go (expects 9), application/aggregate_test.go
- No go.sum needed — stdlib only, no external deps

**Next:** QA gate on branch task/1912a-gateway-go-migration. After APPROVED merge: start 24h smoke window (AC-10). If clean, PM dispatches 1912b-alert-engine.
