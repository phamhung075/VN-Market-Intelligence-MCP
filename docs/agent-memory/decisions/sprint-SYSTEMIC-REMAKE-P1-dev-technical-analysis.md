# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-technical-analysis

**Sprint goal:** Phase-1 containment-now: idle-loop gates, detector-fix drain, narrative-drift fixes (see docs/architecture-briefs/2026-07-04-systemic-remake.md §1). This task (FACTORY-TECHANALYSIS-go-livepath-tests) is a BOUNDED-1 idle-capacity backlog pickup, not itself part of the SYSTEMIC-REMAKE-P1 scope — logged under the active sprint id per journal convention.
**Agent:** dev-technical-analysis
**Started:** 2026-07-08T00:00:00Z

---

### STEP dev-technical-analysis-S1 · dev-technical-analysis · 2026-07-08T00:00:00Z
**task-id:** FACTORY-TECHANALYSIS-go-livepath-tests
**what-done:** Wrote `pkg/interface/http/router_test.go` + `pkg/application/usecases_test.go` covering the live Go request path (GET /health, POST /ta/indicators happy/400/500; Execute pure-compute/DB-backed/period-default/error paths). All GREEN, zero production code changed.
**what-considered:**
- Reuse `cmd/sandbox`'s `sandboxCalculator`/`noopPriceRepo` types directly vs write local fakes in the test files — chose local fakes (package-private, no cross-package `main`-package import, matches `apps/stock-price/pkg/interface/http/router_test.go` precedent).
- Package name `http`/`application` (internal) vs `http_test`/`application_test` (external) — chose external, matching the existing `pkg/domain/*_test.go` convention (`package domain_test`) and stock-price sibling.
**why-decision:** External test package + local fakes keeps tests as pure black-box consumers of the exported port interfaces (`application.TACalculator`, `application.PriceRepo`), the same contract production callers (infrastructure adapters) satisfy — strongest regression guard for the "backstop the src/ TS deletion" goal.
**why-change:** No change from plan — approach spec's file list, coverage list, and httptest.NewServer(NewRouter(...)) pattern followed exactly.
