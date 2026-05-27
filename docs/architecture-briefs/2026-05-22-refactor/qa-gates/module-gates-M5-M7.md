# QA Gate Checklists — Module Tier: M-5, M-6, M-7

**Parent:** `00-index.md`
**Metric definitions:** `../04-metrics-module.md`

> These gates assume the module has been declared in `docs/data/system-map.json`
> and registered in `docs/data/metric-ladder.json` (created in Phase 0).

---

## M-5 — Shape Compliance

### M-5 L0 → L1 Gate

**Metric:** Shape Compliance (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Module `index.ts` barrel exists at `packages/modules/<name>/src/index.ts`
  - Verify: `ls packages/modules/<name>/src/index.ts` → exit 0
- [ ] At least 50% of exports are application service functions or DTOs (not internal domain types)
  - Verify: `grep -c "^export" packages/modules/<name>/src/index.ts` → record TOTAL_EXPORTS; `grep -c "^export.*Service\|^export.*UseCase\|^export.*DTO\|^export.*Input\|^export.*Output\|^export.*Result" packages/modules/<name>/src/index.ts` → record CLEAN_EXPORTS. CLEAN_EXPORTS / TOTAL_EXPORTS ≥ 0.5.
  - ⚠️ NEEDS SHARPENING: the naming conventions for "application service" vs "domain type" are not enforced as a naming standard in the project. The grep above is a heuristic. Flag for metric refinement: add a required naming convention (AppService suffix, or DTO suffix) to dev-standards.md, then update this check to a deterministic grep.
- [ ] Remaining dirty exports are tagged with a `// PHASE-4-TODO` comment in `index.ts`
  - Verify: `grep "PHASE-4-TODO\|PHASE4\|cleanup\|TODO.*barrel" packages/modules/<name>/src/index.ts | wc -l` → output ≥ 1 (if dirty exports exist)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-5": "L1" }`.

---

### M-5 L1 → L2 Gate

**Metric:** Shape Compliance (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Barrel exports only application service methods and DTOs — no domain entity types
  - Verify: `grep "^export.*Entity\|^export.*Model\b\|^export.*ValueObject" packages/modules/<name>/src/index.ts` → empty
- [ ] Barrel exports no primitive internals (no re-exports of primitive functions)
  - Verify: `grep "^export.*from.*packages/primitives" packages/modules/<name>/src/index.ts` → empty
- [ ] Barrel exports no infrastructure references
  - Verify: `grep "^export.*Adapter\|^export.*Store\|^export.*Repository\b\|^export.*DB\b" packages/modules/<name>/src/index.ts` → empty
- [ ] Example violation check: `sector` barrel must not export `supplyChainAnalyzer` directly
  - Verify (sector module only): `grep "supplyChainAnalyzer\|legalRiskDetector\|pharmaEventMapper\|climateImpactMapper" packages/modules/sector-analytics/src/index.ts packages/modules/market-context/src/index.ts 2>/dev/null` → empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-5": "L2" }`.

---

### M-5 L2 → L3 Gate

**Metric:** Shape Compliance (Module)
**Owner:** QA + developer + Architect
**Trigger:** Owner claims module reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` contains a "Public API Surface" or "Application Services" section that lists each exported function/class and its signature
  - Verify: `grep -i "^## Public API\|^## Application Services\|^## Exports\|^## API Surface" packages/modules/<name>/contract.md` → non-empty
- [ ] The section lists at least the same number of exports as `index.ts` currently has
  - Verify: `grep -c "^-\|^[0-9]\." packages/modules/<name>/contract.md` → output ≥ export count from `grep -c "^export" packages/modules/<name>/src/index.ts`

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-5": "L3" }`.

---

### M-5 L3 → L4 Gate

**Metric:** Shape Compliance (Module)
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] AST lint tool is configured to validate module barrel shape
  - Verify: `grep -r "barrel-shape\|module-shape\|barrel-exports" .eslintrc* eslint.config* packages/eslint-plugin-*/` → non-empty
- [ ] Lint passes for this module barrel
  - Verify: `bun run lint -- packages/modules/<name>/src/index.ts` → exit 0
- [ ] A PR adding a domain entity type export to the barrel fails CI
  - Verify: CI job `lint-fence` last run for `packages/modules/<name>/src/index.ts` → PASSED (confirming rule active)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-5": "L4" }`.

---

## M-6 — Documentation Completeness (Module)

### M-6 L0 → L1 Gate

**Metric:** Documentation Completeness (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` exists at `packages/modules/<name>/contract.md`
  - Verify: `ls packages/modules/<name>/contract.md` → exit 0
- [ ] File contains at least a bounded context sentence (non-empty, > 100 bytes)
  - Verify: `wc -c packages/modules/<name>/contract.md | awk '{print $1}'` → output > 100
  - Verify: `grep -i "bounded context\|domain\|this module" packages/modules/<name>/contract.md | head -1` → non-empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-6": "L1" }`.

---

### M-6 L1 → L2 Gate

**Metric:** Documentation Completeness (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Bounded context declaration present (1 sentence naming the domain)
  - Verify: `grep -i "^## Bounded Context\|^bounded context:" packages/modules/<name>/contract.md` → non-empty
- [ ] Application service methods listed (all public methods named)
  - Verify: `grep -i "^## Application Service\|^## Public Methods\|^## API" packages/modules/<name>/contract.md` → non-empty
- [ ] Input and output DTO shapes documented
  - Verify: `grep -i "^## Input\|^## Output\|^### Input\|^### Output\|input.*type\|output.*type" packages/modules/<name>/contract.md` → non-empty
- [ ] Boundary statement present (what module does NOT do)
  - Verify: `grep -i "does not\|not responsible\|out of scope\|^## Boundary" packages/modules/<name>/contract.md` → non-empty
- [ ] Composed primitives listed
  - Verify: `grep -i "^## Primitives\|^## Composes\|^## Dependencies\|packages/primitives" packages/modules/<name>/contract.md` → non-empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-6": "L2" }`.

---

### M-6 L2 → L3 Gate

**Metric:** Documentation Completeness (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` was last-modified in the same commit as the most recent public API change
  - Verify (source last commit): `git log -1 --format="%H" -- packages/modules/<name>/src/index.ts`
  - Verify (contract last commit): `git log -1 --format="%H" -- packages/modules/<name>/contract.md`
  - PASS if contract hash = source hash, OR contract was committed after source.
- [ ] `contract.md` modification timestamp is NOT more than 7 days behind the source
  - Verify: `git log -1 --format="%ai" -- packages/modules/<name>/src/` → SOURCE_DATE; `git log -1 --format="%ai" -- packages/modules/<name>/contract.md` → CONTRACT_DATE. CONTRACT_DATE ≥ SOURCE_DATE − 7days.

**On FAIL:** 1 item → dispatch fixer. Artifact must re-cycle (update contract.md in same PR as next API change).
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-6": "L3" }`.

---

### M-6 L3 → L4 Gate

**Metric:** Documentation Completeness (Module)
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI staleness check is configured and running for module `contract.md` files
  - Verify: `grep -r "contract.*stale\|module.*contract.*fresh\|docs-freshness" .github/workflows/ scripts/` → non-empty
- [ ] CI staleness check passes for this module
  - Verify: CI job `contract-freshness` last run → PASSED with `<name>` module in coverage
- [ ] PR template references contract.md review as a checklist item
  - Verify: `grep -i "contract.md\|contract review" .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null || grep -i "contract" docs/policies/commit-convention.md` → non-empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-6": "L4" }`.

---

## M-7 — Dashboard Presence (Module)

### M-7 L0 → L1 Gate

**Metric:** Dashboard Presence (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 1 scenario JSON exists in `packages/modules/<name>/scenarios/`
  - Verify: `ls packages/modules/<name>/scenarios/*.json 2>/dev/null | wc -l` → output ≥ 1
- [ ] Scenario JSON is valid
  - Verify: `for f in packages/modules/<name>/scenarios/*.json; do bun -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done` → exit 0

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-7": "L1" }`.

---

### M-7 L1 → L2 Gate

**Metric:** Dashboard Presence (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Module dashboard HTML file exists
  - Verify: `ls packages/modules/<name>/dashboard.html` → exit 0
- [ ] Module card appears in master dashboard
  - Verify: `grep "<name>" apps/mcp-server/dashboard/index.html | wc -l` → output ≥ 1
- [ ] Composition trace is visible in the dashboard (primitive call sequence shown)
  - Verify: `grep -i "trace\|step\|primitive\|composition" packages/modules/<name>/dashboard.html | wc -l` → output ≥ 1
  - ⚠️ NEEDS SHARPENING: "composition trace visible" requires the sandbox-kit to render a `primitiveTrace` section in the HTML. Until sandbox-kit is shipped and its output schema is defined, QA cannot verify this mechanically. Until then, substitute: `wc -c packages/modules/<name>/dashboard.html | awk '{print $1}'` → output > 1000 (confirms non-trivial rendered content).

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-7": "L2" }`.

---

### M-7 L2 → L3 Gate

**Metric:** Dashboard Presence (Module)
**Owner:** QA + developer
**Trigger:** Owner claims module reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Dashboard shows actual vs expected output diff for each scenario
  - Verify: open `packages/modules/<name>/dashboard.html` in browser → each scenario section shows "Expected" and "Actual" panels side by side (manual eyeball)
- [ ] Edit-and-rerun works for at least one scenario
  - Verify: open dashboard → edit one field in a scenario input → click "Rerun" → output panel refreshes (manual click-through)
  - ⚠️ NEEDS SHARPENING: browser interaction cannot be automated without a Playwright test. Same as P-7 L3 — flag for metric refinement: provide a numbered manual test procedure or a Playwright script.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-7": "L3" }`.

---

### M-7 L3 → L4 Gate

**Metric:** Dashboard Presence (Module)
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `bun run dashboard` CI step includes module dashboard build
  - Verify: `grep -r "bun run dashboard\|bun dashboard" .github/workflows/` → non-empty
- [ ] CI dashboard build passes for this module
  - Verify: CI job `dashboard-build` last run → PASSED; `<name>` module appears in build log
- [ ] A broken scenario JSON for this module causes CI dashboard build to fail
  - Verify: CI log of last PR introducing a JSON error in `packages/modules/<name>/scenarios/` → confirms build failed with a render/parse error

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-7": "L4" }`.
