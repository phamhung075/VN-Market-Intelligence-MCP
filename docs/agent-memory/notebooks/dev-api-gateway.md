# dev-api-gateway — Notebook

Zone: `apps/api-gateway/` | Stack: TS/Bun (active) + Go 1.22 (Phase 1 new sibling) | DB: none

## Working Memory

**Last task:** P1-AG-B1 overall-status-computer extraction (2026-05-24) — SCALE pilot Phase 1

**Status:** P1-AG-B1 DONE — commit ab534044

**What changed (P1-AG-B1):**
- NEW: `pkg/primitive/overall-status-computer/compute.go` — exported `ComputeOverallStatus(map[string]string) string`; pure function, zero external imports, stdlib only. No import cycle (primitive does NOT import pkg/domain; uses string constants).
- NEW: `pkg/primitive/overall-status-computer/compute_test.go` — 7 table-driven sub-tests: all-ok, all-down, mixed→degraded, empty→down, single-ok, single-down, degraded-present.
- NEW: 4 scenario JSONs in `pkg/primitive/overall-status-computer/scenarios/`: golden-all-ok, golden-degraded, failure-reversed-guard (genuine failure fixture), g11-canary-cascade (G11 proof).
- MODIFIED: `pkg/domain/services.go` — imports primitive via alias `osc`, converts `map[string]HealthStatus` to `map[string]string`, calls `osc.ComputeOverallStatus`, casts result back to `HealthStatus`. Inline `computeOverallStatus` removed.
- NEW: `docs/g11-coupling-design.md` — two-trial cascade plan; Trial-1 proves overall-status-computer flip corrupts /health JSON AND dashboard badge class simultaneously; Trial-2 (B3) covers route-service-matcher.

**Test count:** 47 top-level PASS + 13 sub-tests (60 total entries). Was 45. go vet clean.

**Import cycle resolution note:** Primitive uses `string` (not `domain.HealthStatus`) to avoid domain→primitive→domain cycle. services.go converts to/from string inline. This is correct three-tier architecture: primitives are the base tier, domain depends on primitives (not vice versa).

**AC status (P1-AG-B1):**
- AC-1: ComputeOverallStatus exported, pure, zero net/http/httputil imports in pkg/primitive/. PASS.
- AC-2: 4 scenarios present; failure-reversed-guard is genuine failure scenario. PASS.
- AC-3: services.go calls primitive, inline duplicate removed. PASS.
- AC-4: go test ./... 47 PASS, go vet ./... clean. PASS.
- AC-5: g11-coupling-design.md authored, two-trial plan documented. PASS.
- AC-6: smoke output in RETURN block. PASS.

**Next tasks (Phase 1):**
- B2: Extract proxy-path-resolver primitive from pkg/interface/http/handlers.go ProxyPath
- B3: Extract route-service-matcher primitive + Trial-2 G11 evidence
- B4: pkg/module/gateway/ composition module
- B5: cmd/sandbox runner + scenario execution
- B6: Trust dashboard HTML
