# Decision Journal — F2 Gateway /ta/* prefix-strip bug

**Agent:** dev-api-gateway
**Task:** F2 — TASK-17 frontend campaign
**Date:** 2026-06-11
**Commit:** (filled after commit)

---

## Problem

`POST /ta/indicators` through the api-gateway returned the technical-analysis service's own 404.

Root cause: `ResolveProxyPath("/ta/indicators", noProbe=false)` stripped `/ta`, forwarding `/indicators` to `technical-analysis:5003`. But the service registers its routes at `/ta/indicators` (keeps its own prefix). The upstream responded 404 because the path `/indicators` did not match any registered route.

## Decision

**Option A — Set `NoProbe=true` for ta.**
Rejected: `NoProbe` also excludes the service from health probes. Setting it for `ta` would break the `/health` endpoint's ta status.

**Option B — Add `PreservePath bool` to `ServiceConfig` (chosen).**
Orthogonal to `NoProbe`. `PreservePath=true` means: forward the full path verbatim (do NOT strip the leading /:service segment). Health probing is unaffected. Call site computes `verbatim = svc.NoProbe || svc.PreservePath` before calling `ResolveProxyPath`.

## Changes

- `pkg/domain/models.go`: added `PreservePath bool` field to `ServiceConfig` with doc comment.
- `pkg/infrastructure/registry.go`: set `PreservePath: true` for `ta` entry.
- `pkg/primitive/proxy-path-resolver/resolve.go`: renamed parameter `noProbe` → `verbatim` (semantic now covers both virtual alias and preserve-path cases); behavior unchanged.
- `pkg/interface/http/handlers.go`: call site updated to `ppr.ResolveProxyPath(r.URL.Path, svc.NoProbe || svc.PreservePath)`.
- `pkg/module/gateway/gateway.go`: `RoutingPorts.LookupService` returns `preservePath bool` as a 4th value; `Route()` passes `noProbe || preservePath` to resolver.
- `pkg/module/gateway/gateway_test.go`: `stubPorts` updated for new 4-value signature; added `ta` service with `preservePath=true`; added `TestRoute_MultiPrimitive_TA_PreservePath`.
- `cmd/sandbox/main.go`: `sandboxPorts` updated for new 4-value signature.
- `pkg/primitive/proxy-path-resolver/resolve_test.go`: renamed `noProbe` → `verbatim`; added 2 new table rows: F2 regression case + strip-regression anchor.
- `pkg/primitive/proxy-path-resolver/scenarios/golden-ta-preserve-path.json`: new sandbox scenario.
- `pkg/interface/http/handlers_test.go`: updated 3 existing proxy-path tests; added `TestProxy_TA_PreservesFullPath` (F2 e2e) and `TestProxy_TA_OtherServices_StillStrip` (anti-regression).
- `apps/api-gateway/sandbox/traces/`: all traces regenerated; new `proxy-path-resolver-golden-ta-preserve-path-trace.json` added.

## Evidence

BEFORE (demonstrating bug): `ppr.ResolveProxyPath("/ta/indicators", false)` → `/indicators` (stripping /ta).
AFTER (fix confirmed): `ppr.ResolveProxyPath("/ta/indicators", true)` → `/ta/indicators` (verbatim).

`TestProxy_TA_PreservesFullPath` asserts: upstream captures `/ta/indicators` not `/indicators`. PASS.

`go test ./...` — 10 packages PASS.
Sandbox G12: primitive total=14 pass=14, module total=1 pass=1.
`go vet ./...` — 0 issues.
`golangci-lint run ./...` — 0 issues.

## Blast radius

Scoped to `apps/api-gateway/` only. No change to `apps/technical-analysis/`.
Other services (macro, stock, mcp, pdf, rag, news, alert, kinh-dich) unaffected: none have `PreservePath=true`. Anti-regression test `TestProxy_TA_OtherServices_StillStrip` confirms macro still gets prefix stripped.
