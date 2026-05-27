# QA Gate Checklists — Primitive Tier: P-4, P-5, P-6, P-7

**Parent:** `00-index.md`
**Metric definitions:** `../03-metrics-primitive.md`

> These gates assume the primitive has been declared in `docs/data/system-map.json`
> and registered in `docs/data/metric-ladder.json` (created in Phase 0).

---

## P-4 — Scenario Coverage

### P-4 L0 → L1 Gate

**Metric:** Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Scenarios folder exists for this primitive
  - Verify: `ls -d packages/primitives/<name>/scenarios/` → exit 0
- [ ] At least 1 scenario JSON file exists
  - Verify: `ls packages/primitives/<name>/scenarios/*.json 2>/dev/null | wc -l` → output ≥ 1
- [ ] The scenario JSON is valid (parseable)
  - Verify: `for f in packages/primitives/<name>/scenarios/*.json; do bun -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done` → exit 0 for each file

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-4": "L1" }`.

---

### P-4 L1 → L2 Gate

**Metric:** Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Count of public exported methods in primitive
  - Verify (get count): `grep -c "^export function\|^export const [a-z]" packages/primitives/<name>/src/index.ts` → record as METHOD_COUNT
- [ ] Scenario count ≥ METHOD_COUNT (at least 1 scenario per public method)
  - Verify: `ls packages/primitives/<name>/scenarios/*.json | wc -l` → output ≥ METHOD_COUNT
- [ ] At least 1 scenario file has input that is null, empty, or out-of-range (edge-case scenario)
  - Verify: `grep -l '"null"\|""\|"edge"\|"invalid"\|"empty"\|"negative"' packages/primitives/<name>/scenarios/*.json | wc -l` → output ≥ 1
  - ⚠️ NEEDS SHARPENING: the edge-case detection above uses a string heuristic. Metric `03-metrics-primitive.md` P-4 does not define a machine-readable field in the scenario JSON schema that marks a scenario as "edge case". Until a `"type": "edge-case"` field is standardized in the scenario JSON schema, QA must manually open 1 scenario file and confirm that at least one input value is invalid/boundary. Flag for metric refinement: add `"scenarioType": "happy-path" | "edge-case" | "error"` field to scenario JSON schema.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-4": "L2" }`.

---

### P-4 L2 → L3 Gate

**Metric:** Scenario Coverage
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 3 scenario JSONs per public exported method
  - Verify (per method): `ls packages/primitives/<name>/scenarios/*.json | wc -l` → output ≥ 3 × METHOD_COUNT
- [ ] All scenarios pass the sandbox runner without error
  - Verify: `bun run trace -- packages/primitives/<name>/` → exit 0
  - ⚠️ NEEDS SHARPENING: the `bun run trace` command is referenced but not yet defined in the project's package.json (sandbox-kit is a Phase 1-2 deliverable). Until sandbox-kit is shipped, replace this check with: manually confirm `bun run test -- packages/primitives/<name>/` → exit 0.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-4": "L3" }`.

---

### P-4 L3 → L4 Gate

**Metric:** Scenario Coverage
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI job (`trace-coverage` or equivalent) runs on every PR and computes scenario coverage % for this primitive
  - Verify: CI job `trace-coverage` last run status for this primitive → PASSED with coverage output visible in CI logs
- [ ] Coverage % shown in master dashboard primitive card for `<name>`
  - Verify: open `apps/mcp-server/dashboard/index.html` → primitive card for `<name>` shows a coverage badge (e.g., "Coverage: 100%")
- [ ] A PR that removes a scenario JSON fails CI with a coverage-drop error
  - Verify: CI log of last PR that touched `packages/primitives/<name>/scenarios/` → confirms gate was active

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-4": "L4" }`.

---

## P-5 — Shape Compliance

### P-5 L0 → L1 Gate

**Metric:** Shape Compliance
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `index.ts` file exists at `packages/primitives/<name>/src/index.ts`
  - Verify: `ls packages/primitives/<name>/src/index.ts` → exit 0
- [ ] Logic is no longer accessed via a deep import path from outside the primitive
  - Verify: `grep -rn "primitives/<name>/src/[^i]" apps/ packages/modules/ | grep -v "index"` → empty (no callers bypass index.ts)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-5": "L1" }`.

---

### P-5 L1 → L2 Gate

**Metric:** Shape Compliance
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `index.ts` exports exactly: 1 operation function/class + input DTO type + output DTO type + port interfaces (nothing else)
  - Verify (total export count): `grep -c "^export" packages/primitives/<name>/src/index.ts` → output ≤ 6
  - Verify (no domain entity types): `grep "^export.*Entity\|^export.*Model\b" packages/primitives/<name>/src/index.ts` → empty
  - Verify (no infrastructure references): `grep "^export.*Adapter\|^export.*Store\|^export.*Repository\b" packages/primitives/<name>/src/index.ts` → empty
- [ ] No internal helper functions are exported
  - Verify: `grep "^export function _\|^export const _" packages/primitives/<name>/src/index.ts` → empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-5": "L2" }`.

---

### P-5 L2 → L3 Gate

**Metric:** Shape Compliance
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` JSDoc header in `index.ts` states the single verb the primitive performs
  - Verify: `head -8 packages/primitives/<name>/src/index.ts | grep -i "@description\|\/\*\*"` → non-empty output
- [ ] The verb stated in `index.ts` header matches the folder name
  - Verify: manual check — folder suffix word must appear in the `@description` line (e.g., folder `ta-rsi-calculator`, description contains "calculate" or "compute")

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-5": "L3" }`.

---

### P-5 L3 → L4 Gate

**Metric:** Shape Compliance
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] AST-based lint rule for barrel shape is configured (validates `index.ts` exports)
  - Verify: `grep -r "barrel-shape\|primitive-shape\|max-barrel-exports" .eslintrc* eslint.config* packages/eslint-plugin-*/` → non-empty
- [ ] Lint passes for this primitive
  - Verify: `bun run lint -- packages/primitives/<name>/src/index.ts` → exit 0
- [ ] A PR adding a disallowed export type fails CI
  - Verify: CI job `lint-fence` last run for this primitive path → PASSED (confirming rule active)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-5": "L4" }`.

---

## P-6 — Documentation Completeness

### P-6 L0 → L1 Gate

**Metric:** Documentation Completeness
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` exists at `packages/primitives/<name>/contract.md`
  - Verify: `ls packages/primitives/<name>/contract.md` → exit 0
- [ ] File is not empty (> 50 bytes)
  - Verify: `wc -c packages/primitives/<name>/contract.md | awk '{print $1}'` → output > 50

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-6": "L1" }`.

---

### P-6 L1 → L2 Gate

**Metric:** Documentation Completeness
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` contains a one-sentence description section
  - Verify: `grep -i "^## Description\|^## What\|^# Description\|^description:" packages/primitives/<name>/contract.md` → non-empty
- [ ] `contract.md` contains an input type shape section
  - Verify: `grep -i "^## Input\|^### Input\|^input:" packages/primitives/<name>/contract.md` → non-empty
- [ ] `contract.md` contains an output type shape section
  - Verify: `grep -i "^## Output\|^### Output\|^output:" packages/primitives/<name>/contract.md` → non-empty
- [ ] `contract.md` contains a boundary statement (what this does NOT do)
  - Verify: `grep -i "does not\|not.*responsible\|out of scope\|boundary\|^## Boundary" packages/primitives/<name>/contract.md` → non-empty
- [ ] `contract.md` contains a port dependencies section
  - Verify: `grep -i "^## Port\|^## Dependencies\|^## Ports\|depends on\|port:" packages/primitives/<name>/contract.md` → non-empty (or "DI exemption: pure function" present)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-6": "L2" }`.

---

### P-6 L2 → L3 Gate

**Metric:** Documentation Completeness
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` was last-modified in the same commit as the most recent source change
  - Verify (source last commit): `git log -1 --format="%H" -- packages/primitives/<name>/src/`
  - Verify (contract last commit): `git log -1 --format="%H" -- packages/primitives/<name>/contract.md`
  - PASS if both hashes are equal OR contract is newer than source.

**On FAIL:** 1 item → dispatch fixer. Artifact must re-cycle (contract.md updated in same commit as next source change).
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-6": "L3" }`.

---

### P-6 L3 → L4 Gate

**Metric:** Documentation Completeness
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI freshness check job is configured and running on PRs
  - Verify: `grep -r "contract.*stale\|staleness\|contract-freshness" .github/workflows/ scripts/` → non-empty
- [ ] Last CI freshness check run for this primitive passed
  - Verify: CI job `contract-freshness` or `docs-freshness` last run status → PASSED
- [ ] Source and contract last-modified timestamps confirm contract is not stale (>7 days drift)
  - Verify: `git log -1 --format="%ai" -- packages/primitives/<name>/src/` → SOURCE_DATE; `git log -1 --format="%ai" -- packages/primitives/<name>/contract.md` → CONTRACT_DATE; CONTRACT_DATE ≥ SOURCE_DATE − 7days

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-6": "L4" }`.

---

## P-7 — Dashboard Presence

### P-7 L0 → L1 Gate

**Metric:** Dashboard Presence
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 1 scenario JSON exists in `packages/primitives/<name>/scenarios/`
  - Verify: `ls packages/primitives/<name>/scenarios/*.json 2>/dev/null | wc -l` → output ≥ 1

**On FAIL:** 1 item → dispatch fixer.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-7": "L1" }`.

---

### P-7 L1 → L2 Gate

**Metric:** Dashboard Presence
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Dashboard HTML file exists for this primitive
  - Verify: `ls packages/primitives/<name>/dashboard.html` → exit 0
- [ ] Primitive card appears in the master dashboard index
  - Verify: `grep "<name>" apps/mcp-server/dashboard/index.html | wc -l` → output ≥ 1
- [ ] Dashboard renders without error (sandbox-kit renderer exits 0)
  - Verify: `bun run dashboard -- --primitive <name>` → exit 0
  - ⚠️ NEEDS SHARPENING: `bun run dashboard -- --primitive <name>` command syntax is not yet defined; sandbox-kit is a Phase 1 deliverable. Once sandbox-kit is shipped, replace with the actual CLI entrypoint from `packages/primitives/sandbox-kit/` README. Until then, verify: `ls packages/primitives/<name>/dashboard.html && wc -c packages/primitives/<name>/dashboard.html | awk '{print $1}'` → output > 500 (non-trivial HTML file).

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-7": "L2" }`.

---

### P-7 L2 → L3 Gate

**Metric:** Dashboard Presence
**Owner:** QA + developer
**Trigger:** Owner claims primitive reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Dashboard shows input/output diff when scenario JSON is edited (edit-and-rerun feature)
  - Verify: open `packages/primitives/<name>/dashboard.html` in browser → edit any field in the scenario input section → click "Rerun" → output panel updates without page reload. Expected: output panel changes.
  - ⚠️ NEEDS SHARPENING: "edit-and-rerun" is a UI feature that cannot be verified by a shell command. This needs a browser-automation test (Playwright or Puppeteer) or a manual QA step documented as a numbered click-through. Flag for metric refinement: define a Playwright script or a numbered manual test procedure.
- [ ] Dashboard renders the scenario's expected output alongside actual output for diff view
  - Verify: open `packages/primitives/<name>/dashboard.html` → scenario section shows both "Expected" and "Actual" panels (manual eyeball: two adjacent panels visible)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-7": "L3" }`.

---

### P-7 L3 → L4 Gate

**Metric:** Dashboard Presence
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `bun run dashboard` is a required step in CI and runs on every PR
  - Verify: `grep -r "bun run dashboard\|bun dashboard" .github/workflows/` → non-empty
- [ ] CI dashboard build step for this primitive passes
  - Verify: CI job `dashboard-build` last run → PASSED with `<name>` in the build log
- [ ] Dashboard build time for the full set is < 30 seconds
  - Verify: CI `dashboard-build` job duration → < 30s (check CI run duration column)
- [ ] A PR that breaks a scenario JSON (invalid JSON syntax) causes CI to fail
  - Verify: CI log of last PR that introduced a broken scenario → confirms build failed with a JSON/render error message

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-7": "L4" }`.
