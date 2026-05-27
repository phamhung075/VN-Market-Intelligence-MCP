# QA Gate Checklists — Microservice Tier: S-1, S-2, S-3

**Parent:** `00-index.md`
**Metric definitions:** `../05-metrics-microservice.md`

> These gates assume the microservice has been declared in `docs/data/system-map.json`
> and registered in `docs/data/metric-ladder.json` (created in Phase 0).
>
> `<service>` = microservice folder name under `apps/` (e.g., `mcp-server`, `kinh-dich-service`).

---

## S-1 — Composition Root Centralization

### S-1 L0 → L1 Gate

**Metric:** Composition Root Centralization
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] A composition root file exists (bootstrap.ts or index.ts at root of src/)
  - Verify: `ls apps/<service>/src/bootstrap.ts 2>/dev/null || ls apps/<service>/src/index.ts` → exit 0 (at least one present)
- [ ] Concrete instantiation count outside the composition root has been reduced (not zero yet at L1)
  - Verify (baseline): `grep -rn "new.*Repository\|new.*Store\|new.*Client\|new.*Adapter" apps/<service>/src/ --include="*.ts" | grep -v "index\.ts\|bootstrap\.ts" | wc -l` → output < Phase 0 baseline count (check `metric-ladder.json` baseline note)
  - Verify (at least 50% consolidated): confirm result is ≤ 50% of Phase 0 baseline count

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-1": "L1" }`.

---

### S-1 L1 → L2 Gate

**Metric:** Composition Root Centralization
**Owner:** QA + developer + Architect
**Trigger:** Owner claims microservice reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Zero concrete infrastructure instantiation outside composition root
  - Verify: `grep -rn "new.*Repository\|new.*Store\|new.*Client\|new.*Adapter" apps/<service>/src/ --include="*.ts" | grep -v "index\.ts\|bootstrap\.ts"` → empty
- [ ] Composition root file exists and contains all DI wiring
  - Verify: `grep -c "new.*Repository\|new.*Store\|new.*Client\|new.*Adapter" apps/<service>/src/bootstrap.ts apps/<service>/src/index.ts 2>/dev/null` → output ≥ 1 (confirming wiring is present in the root)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-1": "L2" }`.

---

### S-1 L2 → L3 Gate

**Metric:** Composition Root Centralization
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least one test exists that verifies all ports are satisfied before server starts
  - Verify: `grep -rn "bootstrap\|composition.*root\|all.*ports" apps/<service>/src/**/*.test.ts 2>/dev/null | wc -l` → output ≥ 1
  - ⚠️ NEEDS SHARPENING: "tests verifying all ports are satisfied before server starts" is not a standardized test pattern — there is no assertion API defined for "port satisfaction" in the project. Flag for metric refinement: define a `verifyAllPortsSatisfied()` helper in the test setup and specify what it checks (e.g., no undefined adapter injection). Until then, QA must manually confirm a startup test exists that instantiates the composition root and asserts no thrown errors.
- [ ] Composition root test runs without starting real DB or HTTP server (uses in-memory ports)
  - Verify: `grep -rn "in-memory\|:memory:\|mock.*Repository\|stub.*Adapter" apps/<service>/src/**/*.test.ts 2>/dev/null | wc -l` → output ≥ 1

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-1": "L3" }`.

---

### S-1 L3 → L4 Gate

**Metric:** Composition Root Centralization
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Fence-C ESLint rule is configured (blocks `new.*Repository/Adapter/Store` outside composition root)
  - Verify: `grep -r "Fence-C\|composition-root\|no-new-outside-root" .eslintrc* eslint.config* packages/eslint-plugin-*/` → non-empty
- [ ] Composition root file is ≤ 200 lines
  - Verify: `wc -l apps/<service>/src/bootstrap.ts apps/<service>/src/index.ts 2>/dev/null | tail -1 | awk '{print $1}'` → output ≤ 200
- [ ] CI `lint-fence` passes for this microservice
  - Verify: `bun run lint:fence -- apps/<service>/src/` → exit 0
- [ ] A PR adding a `new.*Adapter` outside bootstrap.ts fails CI
  - Verify: CI job `lint-fence` last run for `apps/<service>/` path → PASSED (confirming Fence-C active)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-1": "L4" }`.

---

## S-2 — Module Composition Score

### S-2 L0 → L1 Gate

**Metric:** Module Composition Score
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least some domain logic has been moved from `apps/<service>/src/` to `packages/modules/`
  - Verify: `grep -rn "from.*packages/modules/" apps/<service>/src/ | wc -l` → output ≥ 1
- [ ] Direct domain service imports in `apps/<service>/src/application/` reduced from Phase 0 baseline
  - Verify: `grep -rn "from.*domain/services" apps/<service>/src/application/ | wc -l` → output < Phase 0 baseline count for this path

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-2": "L1" }`.

---

### S-2 L1 → L2 Gate

**Metric:** Module Composition Score
**Owner:** QA + developer + Architect
**Trigger:** Owner claims microservice reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Zero direct domain imports in `apps/<service>/src/application/`
  - Verify: `grep -rn "from.*domain/services\|from.*domain/utils\|from.*domain/models\b" apps/<service>/src/application/` → empty
- [ ] Zero domain calculations inline in `apps/<service>/src/interface/`
  - Verify: `grep -rn "from.*domain/services\|from.*domain/utils" apps/<service>/src/interface/` → empty
- [ ] All domain logic calls go through `packages/modules/` imports
  - Verify: `grep -rn "from.*packages/modules/" apps/<service>/src/application/ | wc -l` → output ≥ 1 (confirming modules are used)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-2": "L2" }`.

---

### S-2 L2 → L3 Gate

**Metric:** Module Composition Score
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Integration test suite exists in `apps/<service>/src/**/*.test.ts` that mocks all modules at module boundary
  - Verify: `grep -rn "from.*packages/modules/" apps/<service>/src/**/*.test.ts 2>/dev/null | grep -i "mock\|stub\|fake" | wc -l` → output ≥ 1
  - ⚠️ NEEDS SHARPENING: mocking "at module boundary" requires that test files import mock factories from `packages/modules/<name>` directly (not from primitive internals). This is not verifiable from grep alone — QA must manually confirm that test mock replaces the entire module interface, not individual functions inside it.
- [ ] Tests pass without real DB or external API
  - Verify: `DB_PATH=:memory: bun test apps/<service>/` → exit 0

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-2": "L3" }`.

---

### S-2 L3 → L4 Gate

**Metric:** Module Composition Score
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Import-graph analyzer is configured as a CI step for this microservice
  - Verify: `grep -r "import-graph\|no-direct-domain\|layer-import" .eslintrc* eslint.config* scripts/ .github/workflows/` → non-empty
- [ ] Analyzer shows zero direct domain imports in `apps/<service>/src/`
  - Verify: CI job `lint-import-graph` last run for `apps/<service>/` → PASSED

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-2": "L4" }`.

---

## S-3 — E2E Scenario Coverage

### S-3 L0 → L1 Gate

**Metric:** E2E Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 1 E2E scenario JSON exists in `apps/<service>/scenarios/`
  - Verify: `ls apps/<service>/scenarios/*.json 2>/dev/null | wc -l` → output ≥ 1
- [ ] The scenario is valid JSON
  - Verify: `for f in apps/<service>/scenarios/*.json; do bun -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done` → exit 0
- [ ] The scenario exercises the main happy-path use case (not an empty stub)
  - Verify: `wc -c apps/<service>/scenarios/*.json | sort -n | tail -1 | awk '{print $1}'` → output > 100 (at least one non-trivial scenario)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-3": "L1" }`.

---

### S-3 L1 → L2 Gate

**Metric:** E2E Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] List of HTTP routes in this microservice
  - Verify: `grep -rn "router\.\|app\.get\|app\.post\|\.route(" apps/<service>/src/interface/ | grep -v "\.test\." | wc -l` → record ROUTE_COUNT
- [ ] Scenario count ≥ ROUTE_COUNT × 2 (1 happy-path + 1 error scenario per route)
  - Verify: `ls apps/<service>/scenarios/*.json | wc -l` → output ≥ ROUTE_COUNT × 2
- [ ] Each scenario uses in-memory port adapters (no real DB, no external API keys required)
  - Verify: `grep -l "DB_PATH.*:memory:\|in-memory\|mock.*adapter\|fake.*adapter" apps/<service>/scenarios/*.json | wc -l` → output ≥ 1
  - ⚠️ NEEDS SHARPENING: "uses in-memory adapters" is a runtime property of how the scenario is executed, not a static JSON property. The grep above checks for documentation hints in the JSON, but cannot verify the actual execution. Flag for metric refinement: require a `"adapterType": "in-memory"` field in E2E scenario JSON schema to make this a static check.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-3": "L2" }`.

---

### S-3 L2 → L3 Gate

**Metric:** E2E Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims microservice reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 3 scenario variants per HTTP route
  - Verify: `ls apps/<service>/scenarios/*.json | wc -l` → output ≥ ROUTE_COUNT × 3
- [ ] Composition trace is visible in microservice dashboard for each scenario
  - Verify: open microservice card in `apps/mcp-server/dashboard/index.html` → click a scenario → trace shows: HTTP handler → use case → module name → primitives called (manual check: all 3 levels visible)
  - ⚠️ NEEDS SHARPENING: "composition trace visible in dashboard" is a UI assertion requiring browser interaction. See P-7 L3 and M-7 L3 flags. Same Playwright recommendation applies.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-3": "L3" }`.

---

### S-3 L3 → L4 Gate

**Metric:** E2E Scenario Coverage
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI route-coverage gate tracks scenario count per HTTP route
  - Verify: `grep -r "e2e-coverage\|route-coverage\|scenario-coverage" .github/workflows/ scripts/` → non-empty
- [ ] CI route-coverage gate passes for this microservice (≥ 1 scenario per route present)
  - Verify: CI job `e2e-coverage` or `trace-coverage` last run for `apps/<service>/` → PASSED
- [ ] A PR removing a scenario JSON for a route causes CI to fail with coverage-drop message
  - Verify: CI log of last relevant PR → confirms gate was active with route-coverage message

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<service>": { "S-3": "L4" }`.
