# Decision Journal — Sprint FACTORY-APIGW-dedup-default-urls · dev-api-gateway

**Sprint goal:** FACTORY-MAINTAINABILITY-2026-06 epic — make StaticServiceRegistry the sole SSOT for default upstream URLs; main.go stops duplicating the 9-entry docker-URL literal.
**Agent:** dev-api-gateway
**Started:** 2026-07-31T20:54:09Z

---

### STEP dev-api-gateway-S1 · dev-api-gateway · 2026-07-31T20:54:09Z
**task-id:** FACTORY-APIGW-dedup-default-urls
**what-done:** Replaced `main.go`'s 10-entry `serviceURLs` map literal (9 default docker URLs + hardcoded "api" alias) with `serviceURLOverrides()` — a sparse-map builder driven by a `serviceEnvVars` lookup table, reading `os.Getenv` per key and including only non-empty overrides. Unset keys fall through to `StaticServiceRegistry`'s own `get(key, fallback)` defaults; "api" has no entry (no dedicated env var) and inherits `mcp`'s resolution inside the registry (`get("api", mcpURL)`) — same as before.
**what-considered:**
- Inline the 9 `if v := os.Getenv(...)` checks directly in `main()` vs extract `serviceURLOverrides()` — chose extraction: matches this repo's own precedent (`apps/technical-analysis/cmd/server/main_test.go` unit-tests a composition-root helper via `package main`), keeps `main()` thin/wiring-only (composition-root ≤80L target), and makes the sparse-map logic independently RED→GREEN testable via `t.Setenv`.
- Keep `"mcp"` in the sparse-map keys (even though `mcpURL` is separately resolved via `getenv` for `CapabilityProber`) vs drop it — kept: `NewStaticServiceRegistry`'s own `"api"` fallback reads `get("mcp", default)` from the *urls map*, not from `main.go`'s local `mcpURL` var, so omitting `"mcp"` from the sparse map would silently desync the two when `MCP_URL` is set to a non-default value across both keys.
**why-decision:** Extraction is required for TDD (write failing test first per agent mandate) without invoking a live HTTP server; sparse-map (skip-if-empty) is exactly the approach spec's instruction, letting the registry's existing `get(key, fallback)` be the sole default-URL source.
**why-change:** No change from plan — task approach followed as specified (main.go:30-42 literal deleted, getenv/splitCSV stay local, registry.go untouched).
