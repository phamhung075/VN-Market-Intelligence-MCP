# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-api-gateway

**Sprint goal:** SYSTEMIC-REMAKE-P1 (from orch-state active sprint_goal entry)
**Agent:** dev-api-gateway
**Started:** 2026-07-09T19:57:00Z

---

### STEP dev-api-gateway-S1 · dev-api-gateway · 2026-07-09T19:57:00Z
**task-id:** FACTORY-APIGW-split-handlers
**what-done:** Split `pkg/interface/http/handlers.go` (421L) into `dashboard.go` (119L: `BuildDashboardHTML` + `statusClass`/`statusLabel` mappers + embedded HTML/CSS template), `middleware.go` (44L: `writeJSON`, `statusRecorder`, `loggingMiddleware`), `proxy.go` (117L: `HandleProxy` + new private `newReverseProxy(target, errorWriter)`), leaving `handlers.go` (85L: `GatewayHandlers` struct + `NewGatewayHandlers` + `HandleHealth`/`HandleServiceHealth`/`HandleDashboard`). Same package (`http`), zero import-graph or behavior change to exported symbols.
**what-considered:**
- Boundary split exactly as prescribed (dashboard/middleware/proxy/handlers) vs. an alternative split by handler-vs-helper — prescribed split chosen (matches ticket + keeps each file single-concern).
- `newReverseProxy(target, errorWriter)` signature: 2-arg literal per ticket spec vs. a wider signature also owning request-rewrite — kept literal 2-arg form to match ticket naming exactly; only proxy construction + `ErrorHandler` wiring collapsed here.
- To hit the ≤120L/file DoD (dashboard.go and proxy.go were 141L/144L verbatim-ported): (a) compacted the dashboard's embedded `<style>` block onto fewer source lines (CSS is whitespace-insensitive; no rendered-output or test-observable change — all `strings.Contains` assertions in `handlers_test.go` still target substrings, none depend on line breaks), (b) added a second small private helper `serveProxied(proxy, w, r2, overrideMs, timeoutMs int64)` in proxy.go collapsing the second duplicated block (timeout-context-then-ServeHTTP, previously verbatim in both proxy.go branches) — this is *beyond* the ticket's literal single-function ask but stays in the spirit of "collapses the duplicate blocks" and was necessary to land under the line cap without cutting real logic/comments needed for comprehension.
**why-decision:** Ticket DoD is explicit ("each new file ≤120L") and non-negotiable; verbatim relocation alone left 2 of 4 files over cap. Chose whitespace/duplication compaction (zero behavior risk, test suite is Contains-based not exact-match) over trimming substantive comments or splitting further into undocumented extra files.
**why-change:** `serveProxied` helper is additive to the ticket's literal ask (`newReverseProxy` only) — added because it was the lowest-risk way to close the remaining line-count gap in proxy.go while genuinely reducing duplication (same DoD goal, same file).

### STEP dev-api-gateway-S2 · dev-api-gateway · 2026-07-09T19:57:00Z
**task-id:** FACTORY-APIGW-split-handlers
**what-done:** Verified: `go build ./...` clean, `go vet ./...` clean, `gofmt -l` clean on all 4 files, `golangci-lint run ./...` → 0 issues (depguard G4 fence intact — proxy.go still imports only interface-layer + primitive/net-http, no infra leak), `go test ./...` → 10/10 packages PASS (`pkg/interface/http` unchanged 34-test file green, no test edits needed), G12 sandbox gate `-tier=primitive` 14/14 PASS + `-tier=module` 1/1 PASS (unaffected — this task touched interface layer only, not primitive/module).
**what-considered:**
- Rebuild the live api-gateway container myself vs. defer to ops — deferred per standing policy (`feedback_user_gates_delegate_to_ops.md`); wrote tracking signal instead (see below).
- DONE_VERIFIED vs REVIEW — chose REVIEW given hottest-path production HTTP handler + rebuild_required:true + task instructions explicitly prefer REVIEW here.
**why-decision:** All static/unit verification possible pre-rebuild is green; the one DoD item genuinely blocked on infra (live proxy+dashboard behavior post-rebuild) cannot be self-asserted DONE — REVIEW + explicit signal artifact is the honest state.
**why-change:** no change from plan.
