# QA Gate Checklists — Microservice Tier: S-4, S-5, S-6

**Parent:** `00-index.md`
**Metric definitions:** `../05-metrics-microservice.md`

> These gates assume the microservice has been declared in `docs/data/system-map.json`
> and registered in `docs/data/metric-ladder.json` (created in Phase 0).
>
> `<service>` = microservice folder name under `apps/` (e.g., `mcp-server`, `kinh-dich-service`).

---

## S-4 — Deployment Health

### S-4 L0 → L1 Gate

**Metric:** Deployment Health
**Owner:** QA + ops/developer
**Trigger:** Owner claims microservice reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Dockerfile exists for this microservice
  - Verify: `ls apps/<service>/Dockerfile` → exit 0
- [ ] Health endpoint returns HTTP 200 within 3 seconds
  - Verify: obtain the service port from `docs/data/system-map.json` (field: `port`); then: `curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:<port>/health` → output = 200
- [ ] Health endpoint body is non-empty
  - Verify: `curl -s --max-time 3 http://localhost:<port>/health | wc -c` → output > 10

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-4": "L1" }`.

---

### S-4 L1 → L2 Gate

**Metric:** Deployment Health
**Owner:** QA + ops/developer
**Trigger:** Owner claims microservice reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Health endpoint reports DB connection state
  - Verify: `curl -s --max-time 3 http://localhost:<port>/health | grep -i '"db"\|"database"\|"sqlite"\|"connection"'` → non-empty
- [ ] Health endpoint reports key upstream service reachability (if applicable)
  - Verify: `curl -s --max-time 3 http://localhost:<port>/health | grep -i '"upstream"\|"dependencies"\|"services"'` → non-empty OR service has no upstreams (verify by checking `system-map.json` dependencies field for `<service>` = empty array)
- [ ] Docker health check is configured in `docker-compose.yml` for this service
  - Verify: `grep -A5 "<service>:" docker-compose.yml | grep -i "healthcheck\|health"` → non-empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-4": "L2" }`.

---

### S-4 L2 → L3 Gate

**Metric:** Deployment Health
**Owner:** QA + ops/developer
**Trigger:** Owner claims microservice reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Observability metrics file exists in `apps/<service>/src/infrastructure/observability/`
  - Verify: `ls apps/<service>/src/infrastructure/observability/*.ts 2>/dev/null | wc -l` → output ≥ 1
- [ ] Circuit breaker state is exposed on `/health` endpoint (if microservice has external HTTP calls)
  - Verify: `curl -s --max-time 3 http://localhost:<port>/health | grep -i '"circuit\|"breaker\|"state"'` → non-empty OR service has no external HTTP calls (confirmed in `system-map.json`)
- [ ] Metrics per job or route are instrumented
  - Verify: `grep -rn "increment\|gauge\|histogram\|counter\|metric" apps/<service>/src/infrastructure/observability/ | wc -l` → output ≥ 1

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-4": "L3" }`.

---

### S-4 L3 → L4 Gate

**Metric:** Deployment Health
**Owner:** QA + system-auditor
**Trigger:** Phase 6 automation roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] system-auditor tier-1 cycle reads `/health` for this microservice nightly
  - Verify: `grep "<service>.*health\|health.*<service>" docs/agent-memory/notebooks/system-auditor.md | tail -5` → non-empty entries from last 24h
- [ ] Regression alert fires to BUG channel when `/health` is non-200 for >15 min
  - Verify: search last 7 days of BUG channel for `<service>` health alerts; if service has been healthy, check system-auditor notebook confirms it was checked (not skipped)
  - ⚠️ NEEDS SHARPENING: "regression alert for >15 min" requires time-series awareness in system-auditor. The current system-auditor runs nightly (not on a 15-min interval). Flag for metric refinement: either change threshold to "not healthy at time of nightly check" or add a more frequent health-polling job.
- [ ] BUG-A21 and BUG-A21b resolved (vnstock jobs no longer silently crash for 4+ days)
  - Verify: `curl -s --max-time 3 http://localhost:<port>/health | grep -i '"vnstock"\|"vnstockFundamentals"\|"vnstockTradingStats"'` → non-empty AND status = "ok" or "healthy"
  - This check applies to `mcp-server` only; skip for other services.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-4": "L4" }`.

---

## S-5 — No Domain Logic Leakage

### S-5 L0 → L1 Gate

**Metric:** No Domain Logic Leakage
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Count of direct domain imports in interface layer reduced from Phase 0 baseline
  - Verify: `grep -rn "from.*domain/services" apps/<service>/src/interface/ | wc -l` → output < Phase 0 baseline count (from `metric-ladder.json`)
- [ ] At least one anti-corruption translator file exists in the application layer
  - Verify: `ls apps/<service>/src/application/*translator* apps/<service>/src/application/*mapper* 2>/dev/null | wc -l` → output ≥ 1
  - Note: Anti-corruption translators are the Phase 3 mechanism for this service. See `07-phases.md` Phase 3 plan.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-5": "L1" }`.

---

### S-5 L1 → L2 Gate

**Metric:** No Domain Logic Leakage
**Owner:** QA + developer + Architect
**Trigger:** Owner claims microservice reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Zero direct domain service imports in interface layer
  - Verify: `grep -rn "from.*domain/services" apps/<service>/src/interface/` → empty
- [ ] Zero direct domain service imports in application layer
  - Verify: `grep -rn "from.*domain/services" apps/<service>/src/application/` → empty
- [ ] Specific `mcp-server` check: no direct `domain/services/index` import in tool handlers
  - Verify (mcp-server only): `grep -rn "from.*domain/services/index\|from.*domain/services\"" apps/mcp-server/src/interface/mcp/tools/` → empty
- [ ] All module-accessing code goes through `packages/modules/` imports
  - Verify: `grep -rn "from.*packages/modules/" apps/<service>/src/application/ | wc -l` → output ≥ 1

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-5": "L2" }`.

---

### S-5 L2 → L3 Gate

**Metric:** No Domain Logic Leakage
**Owner:** QA + Architect
**Trigger:** Owner claims microservice reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] TypeScript `tsconfig.json` paths configuration makes it physically impossible to import from `domain/` in interface layer
  - Verify: `grep -A5 '"paths"\|"baseUrl"' apps/<service>/tsconfig.json | grep "domain"` → either empty (domain path not aliased = cannot be imported by path alias) OR shows a restricted path entry
  - ⚠️ NEEDS SHARPENING: "physically impossible import" requires `tsconfig paths` or `eslint no-restricted-imports` to be configured such that the TypeScript compiler raises an error on domain imports from interface. The grep above checks for path config presence but does not confirm the restriction is enforced. Flag for metric refinement: define a `tsconfig.test.json` that explicitly excludes `domain/` from the `include` list for interface layer files, or document the exact ESLint rule that enforces this.
- [ ] TypeScript strict compile passes with zero domain import errors in interface/application layers
  - Verify: `tsc --noEmit --project apps/<service>/tsconfig.json 2>&1 | grep "domain/services"` → empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-5": "L3" }`.

---

### S-5 L3 → L4 Gate

**Metric:** No Domain Logic Leakage
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] TypeScript path alias configuration blocks cross-layer imports at compile time
  - Verify: introduce a temporary test file with `import {} from '../../domain/services'` in `apps/<service>/src/interface/` → `tsc --noEmit` → exits non-zero with an import error. Remove the test file after verification.
- [ ] CI compile step (`tsc --noEmit`) runs on every PR and enforces this
  - Verify: `grep -r "tsc.*noEmit\|typecheck\|type-check" .github/workflows/` → non-empty
- [ ] Last CI compile run passes for `apps/<service>/` with zero domain import errors
  - Verify: CI job `typecheck` or `build` last run for `apps/<service>/` → PASSED

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-5": "L4" }`.

---

## S-6 — Dashboard Presence (Microservice)

### S-6 L0 → L1 Gate

**Metric:** Dashboard Presence (Microservice)
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] E2E scenario JSON files exist in `apps/<service>/scenarios/`
  - Verify: `ls apps/<service>/scenarios/*.json 2>/dev/null | wc -l` → output ≥ 1
- [ ] Scenarios are valid JSON
  - Verify: `for f in apps/<service>/scenarios/*.json; do bun -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done` → exit 0

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-6": "L1" }`.

---

### S-6 L1 → L2 Gate

**Metric:** Dashboard Presence (Microservice)
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Microservice card appears in master dashboard with health badge
  - Verify: `grep "<service>\|<service>-service" apps/mcp-server/dashboard/index.html | wc -l` → output ≥ 1
  - Verify: open `apps/mcp-server/dashboard/index.html` in browser → microservice card visible with a colored health badge
- [ ] E2E trace renders in the microservice dashboard
  - Verify: `ls apps/<service>/dashboard.html` → exit 0; `wc -c apps/<service>/dashboard.html | awk '{print $1}'` → output > 500
  - ⚠️ NEEDS SHARPENING: same as P-7 L2 / M-7 L2 — dashboard render quality cannot be verified by file size alone. Replace with `bun run dashboard -- --service <service>` once sandbox-kit CLI is shipped.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-6": "L2" }`.

---

### S-6 L2 → L3 Gate

**Metric:** Dashboard Presence (Microservice)
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Three-level zoom works in microservice dashboard
  - Verify: open `apps/<service>/dashboard.html` in browser → click a scenario card → confirm three levels visible: (1) service-level call, (2) module called, (3) primitives called within that module (manual eyeball: three nested panels or a tree with depth 3)
  - ⚠️ NEEDS SHARPENING: requires browser interaction and visual inspection. Same Playwright recommendation as P-7 L3.
- [ ] All composition levels (service → module → primitive) are visible in at least one scenario trace
  - Verify: open any scenario in `apps/<service>/dashboard.html` → trace section shows entries at all three tiers (manual check: at least 1 microservice, 1 module, 1 primitive node in trace)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-6": "L3" }`.

---

### S-6 L3 → L4 Gate

**Metric:** Dashboard Presence (Microservice)
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Edit-and-rerun works for at least one E2E scenario
  - Verify: open `apps/<service>/dashboard.html` → modify one input field → click "Rerun" → output section updates without full page reload (manual test)
  - ⚠️ NEEDS SHARPENING: same as P-7 L3 browser interaction flag.
- [ ] `bun run dashboard` CI step covers this microservice's scenarios
  - Verify: `grep -r "bun run dashboard\|bun dashboard" .github/workflows/` → non-empty
- [ ] Broken E2E scenario JSON for this service causes CI dashboard-build to fail
  - Verify: CI log of last PR introducing a JSON syntax error in `apps/<service>/scenarios/` → confirms build failed
- [ ] Dashboard build time for full suite is < 30 seconds
  - Verify: CI job `dashboard-build` duration → < 30s

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-6": "L4" }`.
