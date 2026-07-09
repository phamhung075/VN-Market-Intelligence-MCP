# Decision Journal — FACTORY-APIGW-proxy-timeout-constant

**Agent:** dev-api-gateway
**Task ID:** FACTORY-APIGW-proxy-timeout-constant
**Timestamp:** 2026-07-09T20:22Z

## Stale-Premise Correction (inherited from router pre-flight)

The router already corrected the file-path premise (handlers.go → proxy.go, post FACTORY-APIGW-split-handlers)
before dispatch. Live inspection surfaced a second stale assumption in the same original 2026-06-15 finding:
the suggested placement (`const defaultProxyTimeoutMultiplier = 5` in `pkg/infrastructure/registry.go`) is
architecturally invalid — see "What Considered" below. `ServiceConfig` (the actual "config struct" the DoD
refers to) also does not live in registry.go; it lives in `pkg/domain/models.go`. registry.go only
*constructs* instances of it.

## Decision

- Named the multiplier `domain.DefaultProxyTimeoutMultiplier = 5` in `pkg/domain/models.go`, with a
  provenance comment (proxy calls get more budget than a cheap health probe).
- Added an accessor method `func (s *ServiceConfig) EffectiveProxyTimeoutMs() int64` on `domain.ServiceConfig`
  in the same file: returns `ProxyTimeoutMs` when non-zero, else `TimeoutMs * DefaultProxyTimeoutMultiplier`
  (byte-for-byte the same branch logic as the old inline `if effectiveMs == 0 { effectiveMs = timeoutMs * 5 }`).
- `pkg/interface/http/proxy.go`'s `serveProxied` helper signature simplified from
  `(proxy, w, r2, overrideMs, timeoutMs int64)` to `(proxy, w, r2, effectiveMs int64)` — all fallback
  arithmetic moved out of the interface layer into the accessor. Both call sites in `HandleProxy`
  (the mcp not-deployed-reroute path, and the generic deployed-service path) now call
  `mcpSvc.EffectiveProxyTimeoutMs()` / `svc.EffectiveProxyTimeoutMs()` respectively.
- Added a doc-comment cross-reference in `pkg/infrastructure/registry.go` (near where macro/news set
  explicit `ProxyTimeoutMs: 120000` overrides) pointing at the domain-layer accessor, explaining *why*
  it lives there and not in registry.go.

## What Considered

1. **Constant + accessor in `pkg/infrastructure/registry.go`, called directly from `proxy.go`'s
   `serveProxied` (the literal shape the stale backlog note suggested):** REJECTED — hard architectural
   violation. `pkg/interface/http` is Fence-C-restricted by `.golangci.yml`: only `cmd/server/main.go`
   (and `*_test.go` files) may import `pkg/infrastructure`. `GatewayHandlers.registry` is already typed
   as the `domain.ServiceRegistryPort` interface, not the concrete `*StaticServiceRegistry` — confirming
   proxy.go was never meant to see the infrastructure package. `golangci-lint run ./...` would fail
   (depguard fence-c) if `proxy.go` imported `pkg/infrastructure` to reach the constant/accessor there.

2. **Constant in `pkg/domain`, accessor method on `domain.ServiceConfig` (chosen):** SELECTED — domain is
   the layer every other layer (`infrastructure`, `interface/http`) is free to import; it is also where
   the `ServiceConfig` struct that actually holds `TimeoutMs`/`ProxyTimeoutMs` already lives (per
   `pkg/domain/models.go`, not registry.go as the stale note assumed). Domain package doc comment already
   states "Zero I/O — no external dependencies", and `EffectiveProxyTimeoutMs()` is pure arithmetic on the
   struct's own fields — a natural fit, same shape as the immediately-prior FACTORY-KINHDICH-name-price-score-constants
   task's domain-layer constant placement for the same Fence-C reason.

3. **Constant only, no accessor method — call sites keep inlining `overrideMs==0 { override = timeoutMs *
   domain.DefaultProxyTimeoutMultiplier }`:** REJECTED — DoD explicitly asks to weigh an accessor; an
   inlined-but-named constant still duplicates the fallback *branch logic* (not just the literal) at every
   call site, and there are two call sites in `HandleProxy`. The accessor collapses the duplicated branch to
   one place, matching the file's own stated intent (`serveProxied`'s doc comment already says it "collapses
   the two near-identical timeout+serve blocks into one" — extending that same collapsing principle to the
   resolution logic, not just the `context.WithTimeout` wiring).

4. **Accessor takes no args and returns the resolved `context.Context`/`cancel` pair directly (fold
   `serveProxied`'s timeout wiring into the accessor too):** REJECTED — would require the domain-layer
   `ServiceConfig` to import `context`/`time` and know about request-scoped contexts, which is an HTTP/interface-layer
   concern, not a domain concern. Keeping `EffectiveProxyTimeoutMs()` a pure `int64`-returning function
   preserves the "Zero I/O" domain package guarantee; `serveProxied` still owns the `context.WithTimeout` wiring.

## Why This Change

- Names the `5` magic literal so its business meaning (proxy ops get 5x the health-probe timeout budget) is
  legible instead of implicit.
- Collapses the override/fallback branch to one accessor instead of leaving it duplicated inline across the
  two `HandleProxy` call sites.
- Resolved timeout values are unchanged by construction: `EffectiveProxyTimeoutMs()` is the exact same
  `!= 0`-check-then-multiply branch as the old inline code (verified this is semantically identical to the
  old `== 0` check — no config value in this codebase sets a negative `ProxyTimeoutMs`, so the two are
  behaviorally equivalent).
- `rebuild_required: true` (hottest-path prod HTTP handler) → task lands as REVIEW, not self-asserted
  DONE_VERIFIED; deferred live-behavior verification tracked in
  `docs/signals/ops-rebuild-verify-api-gateway-20260709T2022Z.json`, same pattern as the immediately-prior
  FACTORY-APIGW-split-handlers task.

## Verification

- `go build ./...` — exit 0
- `go vet ./...` — exit 0
- `gofmt -l .` — no new unformatted files introduced by this change (registry.go pre-existing map-literal
  alignment debt confirmed present identically on baseline via `git stash`; unrelated to this task, left
  untouched — out of scope)
- `golangci-lint run ./...` — 0 issues (confirms Fence-C is respected by the chosen domain-layer placement)
- `go test ./...` — 10/10 packages PASS, including new `pkg/domain/models_test.go`
  (`TestServiceConfig_EffectiveProxyTimeoutMs`: TimeoutMs=2000+no override→10000ms;
  ProxyTimeoutMs=120000 override→120000ms; TimeoutMs=0+no override→0ms; plus
  `TestDefaultProxyTimeoutMultiplier_PinnedValue`: constant==5)
- G12 sandbox primitive tier: 14/14 PASS
- G12 sandbox module tier: 1/1 PASS
