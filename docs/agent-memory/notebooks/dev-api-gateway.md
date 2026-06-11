# dev-api-gateway — Notebook

Zone: `apps/api-gateway/` | Stack: TS/Bun (active) + Go 1.22 (Phase 1 new sibling) | DB: none

## Working Memory

**Last task:** F2 — gateway /ta/* prefix-strip bug fix — 2026-06-11

**Status:** DONE — commit TBD. ta service now has PreservePath=true; gateway forwards /ta/indicators verbatim to technical-analysis:5003.

**Root cause:** ResolveProxyPath("/ta/indicators", noProbe=false) stripped /ta → forwarded /indicators → upstream 404. technical-analysis registers routes at /ta/*.

**Fix:** Added PreservePath bool to ServiceConfig (orthogonal to NoProbe). Set for ta in registry. Call site passes svc.NoProbe || svc.PreservePath to resolver. Gateway module RoutingPorts.LookupService updated to 4-return-value signature.

**Test evidence:** TestProxy_TA_PreservesFullPath PASS — upstream captures /ta/indicators. TestProxy_TA_OtherServices_StillStrip PASS — macro still stripped. 10 packages go test PASS. Sandbox G12: primitive 14/14, module 1/1. lint 0 issues.

**Decision journal:** docs/agent-memory/decisions/sprint-F2-GATEWAY-TA-PREFIX-STRIP-dev-api-gateway.md

---

**Last task:** CLUSTER-B quality burn-down — NOT_DEPLOYED_SERVICES config drift fix — 2026-06-10

**Status:** DONE — commit 2e88b0b5. api-gateway needs TARGETED rebuild (never down&&up).

**Root cause confirmed:** system-map `host_runtime_set` lists `pdf-extractor` as deployed. Go default at `cmd/server/main.go:44` wrongly had `pdf` in NOT_DEPLOYED_SERVICES. No compose env override corrected it.

**Fix:** (1) Added `NOT_DEPLOYED_SERVICES=rag,ta,stock,kinh-dich,alert,news` to api-gateway service block in `docker-compose.yml` (primary running fix). (2) Corrected Go fallback default to `rag,ta,stock,kinh-dich,alert,news` for honesty. Derived from system-map `not_deployed_short_keys` SSOT — zero manual guessing.

**DoD curl:** `curl localhost:4000/health | jq '.services.pdf.not_deployed'` must return `false` after targeted rebuild.

**G12 gate:** sandbox primitive total=13 pass=13, module total=1 pass=1. go test ./... 10 packages PASS. go vet+build clean.

**Clears:** GW-CONTRACT-03, PDF-CONTRACT-02, PDF-AVAIL-02.

---



**Last task:** F-4 SPIKE — /mcp/* prefix-strip duality — alias-only fix — 2026-06-07

**Status:** F-4 DONE

**What changed:** Added 5 `/api/` prefix aliases in `apps/mcp-server/src/interface/mcp/server.ts` (additive, no removal). Routes `/api/kinh-dich/market`, `/api/kinh-dich/reading/:code`, `/api/prices/history`, `/api/prices/batch`, `/api/news/headlines` now resolve when gateway strips the `/mcp` prefix.

**AC-1:** `GET :4000/mcp/api/news/headlines?source=cafef` → HTTP 200 (was 404). PASS.
**AC-2:** `GET :4000/news/reuters/headlines` → HTTP 200. PASS.
**AC-3:** 15 rerouter unit tests PASS. Full `go test ./...` 10 packages PASS.
**AC-5:** mcp-server container REBUILT (sha256:835858c...). api-gateway container NOT touched (no Go change).

**Decision journal:** docs/agent-memory/decisions/sprint-FETCH-OPS-PAGE-TRUTH-dev-api-gateway.md

---

**Previous last task:** FOU-3-GW REOPENED fix — loadManifest metadata-key parse abort — 2026-06-03 — commit 9dd4c1a2

**Status:** FOU-3-GW DONE-PENDING-REBUILD

**Root cause (definitive):** `systemMapFragment` decoded `capability_manifest` as `map[string]*capabilityManifestEntry`. Production system-map.json has `_note`/`_ground_truth_date` string keys inside the manifest object. `json.Unmarshal` failed "cannot unmarshal string into Go struct" → `loadManifest` returned error → `ProbeAll` returned empty map → `capabilities` nil → omitempty dropped field from /health. Unit tests green because fixtures had no metadata keys.

**Fix:** Changed map value type to `json.RawMessage`; per-key secondary unmarshal; skip non-object values (`raw[0] != '{'`); added startup slog log.

**Integration test (pkg/integration/health_capabilities_integration_test.go):** 3 tests with real loadManifest+CapabilityProber+domain+handler wiring, fixture matching production shape. ALL PASS.

**go test ./... 10 packages ALL PASS. Sandbox G12 13+1 GREEN. go vet 0 errors.**

**Previous last task:** P1-AG-G10-fix — G10 AI-fixability bug fix (SplitN=2→3) — 2026-05-24

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
