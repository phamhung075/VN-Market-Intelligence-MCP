---
sprint: VN-MACRO-TOOLING
task_id: VMT-D-VPSFETCH
type: FEATURE
size: S
zone: apps/macro-indicators/pkg/infrastructure/
wave: 1
depends_on: []
blocks: [
  "VMT-1a-TRADE-BALANCE-TOTAL-HS",
  "VMT-2-BOP",
  "VMT-3a-MACRO-INDICATORS-PMI",
  "VMT-3b-MACRO-INDICATORS-GSO",
  "VMT-4-CPI-COMPONENTS",
  "VMT-5a-LIQUIDITY-STATE-NO-GATE",
  "VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO"
]
---

# VMT-D — Zone D: vpsFetch Go adapter + VpsFetchPort interface

## TLDR

Implement the shared VPS proxy wrapper that all Zone A parsers will use to route geo-blocked HTTP calls (to GSO, Customs, SBV) through Vinahost VPS. This is a strict blocking dependency: no Zone A parser can be written until this adapter exists. Deliverable: `apps/macro-indicators/pkg/infrastructure/vpsFetch.go` + `VpsFetchPort` interface in `pkg/domain/ports.go`, wired in `cmd/server/main.go`. **This is the ONLY task that must land before WAVE-2 Zone A development.**

## [PM] Planning Context

**Why this is WAVE-1 critical:**
- All Zone A parsers (VMT-1..5) depend on `vpsFetch` to route HTTP calls through the Vinahost VPS proxy.
- Without this adapter, parsers cannot fetch from geo-blocked Vietnamese sources.
- This must be infrastructure-clean (DDD port interface in domain layer, adapter in infra layer) to maintain code quality.
- Estimated 2–3 hours for experienced Go developer with DDD experience.

**Zone assignment:** Zone D (infrastructure layer, shared dependency)

**Acceptance Criteria:**
- [ ] Create `apps/macro-indicators/pkg/infrastructure/vpsFetch.go` with:
  - `VpsFetch(ctx context.Context, url string, opts VpsFetchOptions) ([]byte, error)` function
  - `VpsFetchOptions` struct: `{TimeoutSec int, BrowserUA bool, AcceptHeader string}`
  - HTTP proxy routing through `VPS_HTTP_HOST` (env var, default `125.212.251.27`) and `VPS_HTTP_PORT` (env var, default `3128`)
  - **TLS hardening:** `InsecureSkipVerify: false`, `--cacert` pattern from `VPS_CACERT_PATH` env var (see memory `project_bctc_hnx_ssl_outage`)
  - Error handling: return `(nil, error)` on timeout/connection failure; **never** fabricate a response
- [ ] Create `VpsFetchPort` interface in `apps/macro-indicators/pkg/domain/ports.go`:
  ```go
  // VpsFetchPort is the domain port for outbound HTTP proxy routing through VPS.
  // Implementing adapter: pkg/infrastructure/vpsFetch.go
  type VpsFetchPort interface {
    Fetch(ctx context.Context, url string, opts VpsFetchOptions) ([]byte, error)
  }
  ```
- [ ] Wire `VpsFetchPort` implementation in `apps/macro-indicators/cmd/server/main.go` composition root
  - Create concrete adapter instance: `vps := infrastructure.NewVpsFetch(logger)`
  - Pass to all Zone A use-case constructors
- [ ] **TLS verification:**
  - Test with a known HTTPS endpoint (e.g., `https://www.google.com` or internal test server)
  - Confirm `InsecureSkipVerify: false` is enforced
  - Confirm `--cacert` env var is read if present; graceful fallback to system CA bundle if not set
- [ ] **Env vars documented:**
  - `VPS_HTTP_HOST` (default: `125.212.251.27`)
  - `VPS_HTTP_PORT` (default: `3128`)
  - `VPS_CACERT_PATH` (optional: path to CA cert file for HTTPS through proxy)
  - All env vars logged on server startup (slog at DEBUG level)
- [ ] **Tests:**
  - Unit test: `vpsFetch_test.go` with mock net.Dialer + mock HTTP response
  - Contract test: verify options (timeout, user-agent, accept-header) are applied to HTTP request
  - **No live VPS test** — mock only; live testing happens when parsers are written (post-probe)
- [ ] **Code quality:**
  - `go fmt`, `go vet` pass
  - No linting errors: `staticcheck` if available
  - Follows existing Go package layout pattern (`infrastructure/` has other adapters; mirror their style)
  - ~80–120 lines of code (excluding tests)

**Files to create:**
- `apps/macro-indicators/pkg/infrastructure/vpsFetch.go` (adapter implementation, ~100L)
- `apps/macro-indicators/pkg/infrastructure/vpsFetch_test.go` (unit + contract tests, ~80L)

**Files to modify:**
- `apps/macro-indicators/pkg/domain/ports.go` (add VpsFetchPort interface, ~15L)
- `apps/macro-indicators/cmd/server/main.go` (wire VpsFetch in composition root, ~10L)

**Dependencies:** None (WAVE-1, no blockers)

**Knowledge needed:**
- Go net/http package (http.Client, http.Transport)
- Go context handling
- Go struct field tags (env var binding, if using a config library)
- DDD pattern (port/adapter architecture)
- HTTP proxy protocol (CONNECT for HTTPS, standard HTTP for HTTP)
- TLS certificate validation (--cacert / CA bundle)

**Existing patterns to follow:**
- `apps/macro-indicators/pkg/infrastructure/repositories.go` — adapter pattern (HTTPCommodityFetcher, SBVRateSQLiteAdapter)
- `pkg/domain/ports.go` header comment — Fence-A principle (no infra imports in domain layer)
- `cmd/server/main.go` — composition root wiring

---

## Context from Architecture

From ARCH-VN-MACRO-TOOLING:

> **Zone D — New file**
> - `apps/macro-indicators/pkg/infrastructure/vpsFetch.go` — **CREATE**
>   - `VpsFetch(ctx context.Context, url string, opts VpsFetchOptions) ([]byte, error)` — port function + adapter
>   - `VpsFetchOptions{TimeoutSec int, BrowserUA bool, AcceptHeader string}`
>   - Routes through `http://VPS_HOST:VPS_PORT` configured from env vars `VPS_HTTP_HOST` (default `125.212.251.27`) and `VPS_HTTP_PORT` (default `3128` — standard squid/proxy port; confirm with ops-vps-fetch probe). **TLS hardening: `--cacert` pattern from memory `project_bctc_hnx_ssl_outage` must be applied for HTTPS targets via the proxy — set `InsecureSkipVerify: false`, pin cacert path from `VPS_CACERT_PATH` env var.**
>   - `VpsFetchPort` interface in `pkg/domain/ports.go` (new port definition) — domain defines the contract, infra implements. Composition root wires in `cmd/server/main.go`.
>
> **DD-2: VpsFetch as domain port, not free function**
>
> `vpsFetch` must be injected as a domain port (interface in `pkg/domain/ports.go`) rather than a direct function import from `pkg/infrastructure`. Reason: domain services (`services_vmt.go`) must have zero imports from `pkg/infrastructure` (DDD Fence-A, as noted in existing `ports.go` header). Use-cases receive `VpsFetchPort` via constructor injection. Composition root in `cmd/server/main.go` (already the only file importing `pkg/infrastructure`) wires the concrete `vpsFetch.go` adapter.

---

## Dev Notes

**Key technical decisions:**
1. **HTTP proxy protocol:** Standard HTTP/CONNECT for HTTPS. Go's `http.Transport` with `Proxy` field set to a proxy URL handles this automatically.
2. **TLS via proxy:** HTTPS connections through an HTTP proxy use CONNECT tunneling. The proxy must support CONNECT for HTTPS.
3. **CA cert:** If `VPS_CACERT_PATH` is set, load the cert and set `http.Transport.TLSClientConfig.RootCAs`. If not set, use system CA bundle (go default).
4. **Context timeout:** `context.WithTimeout` wraps the VpsFetchOptions timeout (convert seconds to Duration).
5. **Options pattern:** VpsFetchOptions can be extended later without breaking callers (add new fields with sensible defaults).

**Testing strategy:**
- Mock `net.Dialer` and `http.Response` — do NOT call real VPS
- Test timeout behavior with a channel-based mock that simulates delay
- Verify options (User-Agent, Accept header) are set on the outgoing HTTP request
- Live testing happens when parsers call vpsFetch post-probe (integration test, part of VMT-1a, etc.)

**Code example (skeleton):**
```go
package infrastructure

import (
  "context"
  "fmt"
  "net/http"
  "net/url"
  "time"
  "os"
  "log/slog"
)

type VpsFetchOptions struct {
  TimeoutSec    int
  BrowserUA     bool
  AcceptHeader  string
}

type VpsFetch struct {
  vpsHost  string
  vpsPort  string
  caCertPath string
  logger   *slog.Logger
}

func NewVpsFetch(logger *slog.Logger) *VpsFetch {
  return &VpsFetch{
    vpsHost: os.Getenv("VPS_HTTP_HOST"),
    if vpsHost == "" { vpsHost = "125.212.251.27" }
    vpsPort: os.Getenv("VPS_HTTP_PORT"),
    if vpsPort == "" { vpsPort = "3128" }
    caCertPath: os.Getenv("VPS_CACERT_PATH"),
    logger: logger,
  }
}

func (v *VpsFetch) Fetch(ctx context.Context, targetURL string, opts VpsFetchOptions) ([]byte, error) {
  // Set up HTTP client with proxy
  proxyURL, _ := url.Parse(fmt.Sprintf("http://%s:%s", v.vpsHost, v.vpsPort))
  
  // TLS config (--cacert pattern)
  tlsCfg := &tls.Config{InsecureSkipVerify: false}
  if v.caCertPath != "" {
    // Load caCertPath and set RootCAs
  }
  
  transport := &http.Transport{
    Proxy:           http.ProxyURL(proxyURL),
    TLSClientConfig: tlsCfg,
  }
  
  client := &http.Client{
    Transport: transport,
    Timeout:   time.Duration(opts.TimeoutSec) * time.Second,
  }
  
  req, _ := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
  if opts.BrowserUA {
    req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; VN-Market-Intelligence)")
  }
  if opts.AcceptHeader != "" {
    req.Header.Set("Accept", opts.AcceptHeader)
  }
  
  resp, err := client.Do(req)
  if err != nil {
    return nil, err
  }
  defer resp.Body.Close()
  
  // ... read and return body
}
```

---

## Task Boundaries

**This task ENDS when:**
- `apps/macro-indicators/pkg/infrastructure/vpsFetch.go` is created and committed
- `VpsFetchPort` interface is in `pkg/domain/ports.go`
- Wiring is in `cmd/server/main.go`
- Unit + contract tests pass
- `go fmt`, `go vet` pass
- Code review passes (if applicable)

**Next steps:**
- All Zone A parsers (VMT-1a, VMT-2, VMT-3a, etc.) import VpsFetchPort and call it to fetch from geo-blocked sources
- WAVE-2 Zone A development unblocks immediately after this task is done

**CRITICAL:** No Zone A parser implementation begins until this task is merged and main branch is rebuilt (ops rebuilds container after code change; see memory `feedback_rebuild_after_dev_change`).
