# dev-api-gateway — Notebook

Zone: `apps/api-gateway/` | Stack: TS/Bun (active) + Go 1.22 (Phase 1 new sibling) | DB: none

## Working Memory

**Last task:** P1-AG-G10-fix — G10 AI-fixability bug fix (SplitN=2→3) — 2026-05-24

**Status:** P1-AG-G10-fix DONE — 1 cycle, commit 492cda60, signal docs/signals/dev-api-gateway-P1-AG-G10-done-2026-05-24T084119Z.json

**What changed (P1-AG-G10-fix):**
- BUG FIX (working tree only, never committed): `strings.SplitN(reqPath, "/", 2)` → `strings.SplitN(reqPath, "/", 3)` at resolve.go:28
- Re-embedded all 12 sandbox traces (the 2 RED traces restored to PASS status; all timestamps updated)
- Cycle count: 1. Sandbox primitive OK, module OK, go test all PASS, dash-check PASS (green=12, red=0)

**Previous last task:** P1-AG-G3-contract — OpenAPI 3.1 spec for all 5 gateway routes — 2026-05-24

**Status (G3):** P1-AG-G3-contract DONE — openapi.yaml absorbed into c348ea2a (concurrent race), signal commit d9c76e00

**What changed (P1-AG-G3-contract):**
- NEW: `apps/api-gateway/pkg/interface/http/openapi.yaml` — valid OpenAPI 3.1.0 spec documenting all 5 real routes (GET /health, GET /healthz, GET /health/{service}, GET /health-dashboard, ANY /{service}/{path}). Schemas: AggregatedHealth, ServiceHealthResult, HealthStatus, ErrorResponse. All schemas derived from pkg/domain/models.go. Zero invented routes.

**What changed (P1-AG-E2):**
- NEW: `apps/api-gateway/.golangci.yml` — golangci-lint v2 depguard config. fence-a: prim→module/app/interface/infra/net/http/net/http/httputil all denied. fence-b: module→app/interface/infra denied. fence-c: infra only in cmd/server/main.go.
- UPDATED: `.github/workflows/ci.yml` — added `api-gateway-go-lint` job (mirrors macro-go-lint shape), scoped to apps/api-gateway/, uses golangci-lint-action@v6.1.1 --config .golangci.yml.
- NEW: `apps/api-gateway/docs/g4-fence.md` — fence evidence doc: deny rules table, fence command, deliberate-violation protocol (Fence-A), CI job description.

**Test count:** 57 tests PASS (unchanged). go build exit 0. sandbox primitive total=11 pass=11. sandbox module total=1 pass=1.

**BITES PROOF (G4 proven non-false-green):**
- Violation: `import _ "net/http"` added to pkg/primitive/overall-status-computer/compute.go
- With violation: lint exit 1 — `import 'net/http' is not allowed from list 'fence-a': Fence-A: primitive must be pure-compute (zero I/O) — net/http forbidden (depguard)`
- After revert: lint exit 0 — `0 issues.`
- Violation NOT committed.

**AC status (P1-AG-E2):**
- AC-1: golangci-lint config with depguard rules present. PASS.
- AC-2: CI job api-gateway-go-lint added. PASS.
- AC-3: PROVEN-BITES — depguard named in non-zero output, clean after revert. Violation not committed. PASS.
- AC-4: go build ./... + go test ./... pass. PASS.
- AC-5 (G12): clean lint exit 0 + 57 go tests PASS. PASS.

**Signal:** docs/signals/dev-api-gateway-P1-AG-G4fence-done-2026-05-24T082113Z.json

**Previous tasks DONE:** B1 (overall-status-computer, ab534044), B2 (proxy-path-resolver, 239533dd), B3 (route-service-matcher, in HEAD), C1 (module/gateway, c956631d), E2 (G4 fence, 9fd1634e), G3-contract (openapi.yaml, c348ea2a+d9c76e00)

**Next tasks (Phase 1):**
- B5: cmd/sandbox runner + scenario execution (CGO_ENABLED=0 go run ./cmd/sandbox)
- B6: Trust dashboard HTML
