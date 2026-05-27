# QA Gate Checklists — Module Tier: M-1, M-2, M-3, M-4

**Parent:** `00-index.md`
**Metric definitions:** `../04-metrics-module.md`

> These gates assume the module has been declared in `docs/data/system-map.json`
> and registered in `docs/data/metric-ladder.json` (created in Phase 0).

---

## M-1 — Bounded Context Cohesion

### M-1 L0 → L1 Gate

**Metric:** Bounded Context Cohesion
**Owner:** QA + Architect
**Trigger:** Owner claims module reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Module folder exists at `packages/modules/<name>/`
  - Verify: `ls -d packages/modules/<name>/` → exit 0
- [ ] Domain area count for imported primitives is ≤ 2 (reduced from 3+)
  - Verify: `grep -rn "from.*packages/primitives/" packages/modules/<name>/src/ | grep -oP "primitives/[^/]+" | sort -u`
    → review the list; count distinct domain prefixes (kinh-dich-*, ta-*, bctc-*, macro-*, alert-*, news-*, portfolio-*, sector-*, system-*). Output domain-prefix count ≤ 2.
  - ⚠️ NEEDS SHARPENING: "domain label" assignment (step 2 in metric definition) is a manual Architect judgment, not a machine-readable field. Until primitives carry a `"domain": "<label>"` field in their `contract.md`, QA must use the primitive name prefix as a proxy. Flag for metric refinement: add `domain:` field to primitive `contract.md` YAML front-matter so this can be grepped.
- [ ] A split plan is documented (even if not yet executed)
  - Verify: `grep -i "split\|phase\|TODO\|future\|debt" packages/modules/<name>/contract.md | head -3` → non-empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-1": "L1" }`.

---

### M-1 L1 → L2 Gate

**Metric:** Bounded Context Cohesion
**Owner:** QA + Architect
**Trigger:** Owner claims module reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] All primitives imported by this module share the same domain prefix (or directly adjacent sub-domain)
  - Verify: `grep -rn "from.*packages/primitives/" packages/modules/<name>/src/ | grep -oP "primitives/[a-z-]+" | sort -u`
    → all results share the same domain prefix (e.g., all start with `ta-`, or all start with `alert-`). Count of distinct prefixes ≤ 1 (or ≤ 2 if a directly-adjacent sub-domain is justified).
  - If count > 1: Architect must add a written justification in `contract.md` explaining why the second domain is "directly adjacent".
- [ ] No primitives from unrelated domains are imported
  - Verify: the list from the previous check contains no entries from a domain other than the module's declared domain

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-1": "L2" }`.

---

### M-1 L2 → L3 Gate

**Metric:** Bounded Context Cohesion
**Owner:** QA + Architect
**Trigger:** Owner claims module reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` at module level contains a single-sentence bounded context declaration
  - Verify: `grep -i "^## Bounded Context\|^## Domain\|^bounded context:" packages/modules/<name>/contract.md` → non-empty
- [ ] The bounded context sentence explicitly names the domain boundary (what is INSIDE and what is OUTSIDE)
  - Verify: `grep -A3 "Bounded Context\|Domain Boundary" packages/modules/<name>/contract.md | grep -i "does not\|excludes\|out of scope\|boundary"` → non-empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-1": "L3" }`.

---

### M-1 L3 → L4 Gate

**Metric:** Bounded Context Cohesion
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Import-graph linter rule for cross-domain module imports is configured
  - Verify: `grep -r "domain-import\|cross-domain\|no-cross-domain" .eslintrc* eslint.config* packages/eslint-plugin-*/` → non-empty
- [ ] Linter passes for this module (no cross-domain violations)
  - Verify: `bun run lint:fence -- packages/modules/<name>/` → exit 0
- [ ] Nightly import-graph scan covers this module
  - Verify: `grep "<name>" docs/agent-memory/notebooks/system-auditor.md | tail -5` → shows scan entry from last 24h

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-1": "L4" }`.

---

## M-2 — Primitive Composition Score

### M-2 L0 → L1 Gate

**Metric:** Primitive Composition Score
**Owner:** QA + developer
**Trigger:** Owner claims module reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least some domain logic has been extracted to primitives (not 100% inline)
  - Verify: `grep -rn "from.*packages/primitives/" packages/modules/<name>/src/ | wc -l` → output ≥ 1
- [ ] Inline domain logic in module source is less than prior baseline (confirmed by PR diff)
  - Verify: `git log --oneline -10 -- packages/modules/<name>/src/ | grep -i "extract\|primitive\|refactor\|move"` → non-empty (at least one extraction commit visible)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-2": "L1" }`.

---

### M-2 L1 → L2 Gate

**Metric:** Primitive Composition Score
**Owner:** QA + developer + Architect
**Trigger:** Owner claims module reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Zero raw computation loops in module source (all delegated to primitives)
  - Verify: `grep -rn "\.reduce(\|\.map(\|\.filter(\|for.*let\|while.*{" packages/modules/<name>/src/ | grep -v "spec\|test\|\.d\.ts"` → empty
  - ⚠️ NEEDS SHARPENING: `.reduce()`, `.map()`, `.filter()` are standard JS array methods used in legitimate orchestration (e.g., mapping module input to primitive input shapes). The metric defines a "raw calculation loop" as domain logic not delegated to a primitive, but this grep catches orchestration too. Flag for metric refinement: define "business logic" more precisely — e.g., any loop that performs a financial calculation (RSI, PnL, scoring) vs. a data-mapping loop. Until then, QA must open flagged files and confirm the loop is domain logic, not DI wiring.
- [ ] All imports of domain functions come from `packages/primitives/` (not inline modules)
  - Verify: `grep -rn "from.*domain/services\|from.*domain/utils" packages/modules/<name>/src/` → empty
- [ ] Allowed module-layer items (DI wiring, input validation, orchestration) are the only non-primitive code
  - Verify: `grep -rn "from.*packages/primitives/" packages/modules/<name>/src/ | wc -l` → output ≥ primitive_count_used (Architect specifies expected count in module design doc)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-2": "L2" }`.

---

### M-2 L2 → L3 Gate

**Metric:** Primitive Composition Score
**Owner:** QA + developer
**Trigger:** Owner claims module reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Unit tests for this module mock at the primitive boundary only (no deeper mocking)
  - Verify: `grep -rn "jest\.mock\|vi\.mock\|mock(" packages/modules/<name>/src/**/*.test.ts 2>/dev/null | grep -v "packages/primitives"` → empty (no mocking of internal functions, only primitive imports)
  - ⚠️ NEEDS SHARPENING: this check requires knowing which test runner is used (jest, vitest, bun:test). `bun:test` uses different mock syntax. Verify project standard test runner: `grep "\"test\"" package.json` → if `bun`, check for `mock()` from `bun:test` instead of `jest.mock`. Adjust grep pattern accordingly.
- [ ] No test file references internal module implementation files directly (only index.ts boundary)
  - Verify: `grep -rn "from.*packages/modules/<name>/src/[^i]" packages/modules/<name>/src/**/*.test.ts 2>/dev/null` → empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-2": "L3" }`.

---

### M-2 L3 → L4 Gate

**Metric:** Primitive Composition Score
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Static inline-logic counter is configured as a CI step
  - Verify: `grep -r "inline-logic\|no-inline-domain\|no-business-logic" .eslintrc* eslint.config* scripts/` → non-empty
  - ⚠️ NEEDS SHARPENING: "inline-logic count = 0" is not currently a standard ESLint rule. This requires a custom static analysis rule or script. Flag for metric refinement: define the exact static analysis tool and rule name before L4 gate can be validated.
- [ ] CI step passes for this module (0 inline logic violations)
  - Verify: CI job `lint-inline-logic` or equivalent last run → PASSED

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-2": "L4" }`.

---

## M-3 — No Cross-Module Imports

### M-3 L0 → L1 Gate

**Metric:** No Cross-Module Imports
**Owner:** QA + developer
**Trigger:** Owner claims module reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Cross-module imports have been reduced (not zero yet at L1)
  - Verify: `grep -rn "from.*packages/modules/" packages/modules/<name>/src/ | wc -l` → output < prior baseline (from Phase 0 measurement)
- [ ] Remaining cross-module imports are logged as tech debt items in the sprint or module debt register
  - Verify: `grep -i "cross-module\|sibling\|debt\|TODO" packages/modules/<name>/contract.md | wc -l` → output ≥ number of remaining cross-module imports

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-3": "L1" }`.

---

### M-3 L1 → L2 Gate

**Metric:** No Cross-Module Imports
**Owner:** QA + developer
**Trigger:** Owner claims module reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Zero imports from any sibling module in `packages/modules/`
  - Verify: `grep -rn "from.*packages/modules/" packages/modules/<name>/src/` → empty
- [ ] Any shared types previously imported from a sibling module are now in a shared primitive or `packages/shared-types/`
  - Verify: `grep -rn "from.*packages/primitives/\|from.*packages/shared-types/" packages/modules/<name>/src/ | wc -l` → output ≥ (count of former cross-module imports that were type-only)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-3": "L2" }`.

---

### M-3 L2 → L3 Gate

**Metric:** No Cross-Module Imports
**Owner:** QA + developer
**Trigger:** Owner claims module reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Module builds in isolation — remove all sibling module paths and confirm TypeScript compiles
  - Verify: `cd packages/modules/<name> && bun run build` → exit 0 (module must compile standalone)
  - ⚠️ NEEDS SHARPENING: "module builds in isolation" requires a per-module `package.json` with its own `build` script. This is a Phase 3 deliverable, not currently present in all modules. Until modules have standalone build scripts, verify: `tsc --noEmit --project packages/modules/<name>/tsconfig.json` → exit 0.

**On FAIL:** 1 item → dispatch fixer.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-3": "L3" }`.

---

### M-3 L3 → L4 Gate

**Metric:** No Cross-Module Imports
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Fence-B ESLint rule is configured (blocks imports from sibling modules)
  - Verify: `grep -r "Fence-B\|no-sibling-module\|module-boundary" .eslintrc* eslint.config* packages/eslint-plugin-*/` → non-empty
- [ ] `bun run lint:fence` passes for this module
  - Verify: `bun run lint:fence -- packages/modules/<name>/` → exit 0
- [ ] A PR introducing a sibling module import fails CI
  - Verify: CI job `lint-fence` last run for `packages/modules/<name>/` path → PASSED (confirming Fence-B active)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-3": "L4" }`.

---

## M-4 — Module Scenario Coverage

### M-4 L0 → L1 Gate

**Metric:** Module Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims module reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Scenarios folder exists for this module
  - Verify: `ls -d packages/modules/<name>/scenarios/` → exit 0
- [ ] At least 1 scenario JSON file exists for the most-used public method
  - Verify: `ls packages/modules/<name>/scenarios/*.json 2>/dev/null | wc -l` → output ≥ 1
- [ ] Scenario JSON is valid
  - Verify: `for f in packages/modules/<name>/scenarios/*.json; do bun -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done` → exit 0

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-4": "L1" }`.

---

### M-4 L1 → L2 Gate

**Metric:** Module Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims module reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Count of public methods in module's `index.ts`
  - Verify: `grep -c "^export function\|^export const [a-z]\|public [a-z].*(" packages/modules/<name>/src/index.ts` → record as METHOD_COUNT
- [ ] Scenario count ≥ METHOD_COUNT × 2 (at least 1 happy-path + 1 error/edge per method)
  - Verify: `ls packages/modules/<name>/scenarios/*.json | wc -l` → output ≥ METHOD_COUNT × 2
- [ ] At least 1 scenario covers an error or edge case per public method
  - Verify: `grep -l '"error"\|"failure"\|"invalid"\|"empty"\|"edge"' packages/modules/<name>/scenarios/*.json | wc -l` → output ≥ METHOD_COUNT
  - ⚠️ NEEDS SHARPENING: same as P-4 — no standardized `"scenarioType"` field in scenario JSON. QA must manually verify at least one scenario per method contains an error/edge input until scenario schema is standardized.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-4": "L2" }`.

---

### M-4 L2 → L3 Gate

**Metric:** Module Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims module reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 3 scenario variants per public method
  - Verify: `ls packages/modules/<name>/scenarios/*.json | wc -l` → output ≥ METHOD_COUNT × 3
- [ ] Every scenario exercises composition (proves at least 2 primitives are called in sequence)
  - Verify: `grep -l '"primitiveTrace"\|"composed"\|"steps"' packages/modules/<name>/scenarios/*.json | wc -l` → output ≥ total scenario count
  - ⚠️ NEEDS SHARPENING: "exercises composition (verify primitive calls)" requires a `primitiveTrace` or similar field in the scenario output — this is a sandbox-kit feature not yet defined in a schema. Flag for metric refinement: sandbox-kit's scenario output format must include a `"primitiveTrace": [...]` array. Until then, substitute: confirm module scenario JSON has a `"expectedPrimitiveCallCount"` field or equivalent.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-4": "L3" }`.

---

### M-4 L3 → L4 Gate

**Metric:** Module Scenario Coverage
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Master dashboard shows module scenario coverage % for `<name>`
  - Verify: open `apps/mcp-server/dashboard/index.html` → module card for `<name>` shows coverage badge ≥ baseline
- [ ] CI job tracks scenario coverage % and fails if it drops below the established baseline
  - Verify: CI job `trace-coverage` last run → PASSED with module coverage output for `<name>`
- [ ] A PR removing a scenario JSON triggers CI failure
  - Verify: CI job `trace-coverage` last run for a PR touching `packages/modules/<name>/scenarios/` → PASSED (confirming gate active)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "M-4": "L4" }`.
