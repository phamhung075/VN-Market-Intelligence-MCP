# QA Gate Checklists — Primitive Tier: P-1, P-2, P-3

**Parent:** `00-index.md`
**Metric definitions:** `../03-metrics-primitive.md`

> These gates assume the primitive has been declared in `docs/data/system-map.json`
> and registered in `docs/data/metric-ladder.json` (created in Phase 0).

---

## P-1 — SRP Score

### P-1 L0 → L1 Gate

**Metric:** SRP Score
**Owner:** QA + dev-* zone owner
**Trigger:** Owner claims primitive reached L1; PM requests gate.
**Blocking:** YES — L1→L2 work cannot start until this gate passes.

**Checklist (all must be YES):**

- [ ] A dedicated folder exists for this primitive
  - Verify: `ls -d packages/primitives/<name>/` → exit 0
- [ ] A `src/index.ts` file exists inside the folder
  - Verify: `ls packages/primitives/<name>/src/index.ts` → exit 0
- [ ] Export count is ≤ 3 operation functions/classes (still multi-export at L1)
  - Verify: `grep -c "^export function\|^export class\|^export const" packages/primitives/<name>/src/index.ts` → output ≤ 3

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-1": "L1" }`.

---

### P-1 L1 → L2 Gate

**Metric:** SRP Score
**Owner:** QA + dev-* zone owner
**Trigger:** Owner claims primitive reached L2; PM requests gate.
**Blocking:** YES — L2→L3 work cannot start until this gate passes.

**Checklist (all must be YES):**

- [ ] Exactly 1 exported operation function or class (excluding types/interfaces/DTOs)
  - Verify: `grep -c "^export function\|^export class\|^export const [a-z]" packages/primitives/<name>/src/index.ts` → output = 1
- [ ] No helper functions exported (internal helpers must not appear in index.ts exports)
  - Verify: `grep -c "^export " packages/primitives/<name>/src/index.ts` → output ≤ 4 (1 fn + up to 3 type exports)
- [ ] Primitive name is a single verb in imperative form
  - Verify: folder name matches pattern `^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$` and ends with a verb-derived suffix (manual: compute*, fetch*, parse*, render*, validate*, resolve*, calculate*, detect*, classify*, score*, map*, filter*, transform*, aggregate*)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-1": "L2" }`.

---

### P-1 L2 → L3 Gate

**Metric:** SRP Score
**Owner:** QA + dev-* zone owner
**Trigger:** Owner claims primitive reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `contract.md` exists and contains a "single verb" statement in its description line
  - Verify: `grep -i "verb\|operation\|single" packages/primitives/<name>/contract.md | head -3` → non-empty output
- [ ] `contract.md` explicitly names the one operation the primitive performs
  - Verify: `head -10 packages/primitives/<name>/contract.md` → contains 1 sentence starting with a verb (manual check: sentence must be of the form "Verb [object] [context].")
- [ ] Export count still = 1 operation (regression check from L2)
  - Verify: `grep -c "^export function\|^export class\|^export const [a-z]" packages/primitives/<name>/src/index.ts` → output = 1

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-1": "L3" }`.

---

### P-1 L3 → L4 Gate

**Metric:** SRP Score
**Owner:** QA + CI
**Trigger:** Phase 6 CI automation roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] ESLint rule `max-1-export-per-primitive` is configured in the project's ESLint config
  - Verify: `grep -r "max-1-export-per-primitive\|max-exports\|no-multiple-exports" .eslintrc* eslint.config* packages/eslint-plugin-*/` → non-empty output
- [ ] Running ESLint on this primitive produces zero violations
  - Verify: `bun run lint -- packages/primitives/<name>/src/` → exit 0, no output mentioning "export"
- [ ] A PR introducing a second exported function to this primitive fails CI
  - Verify: CI job name `lint-fence` status on last PR that touched this primitive → PASSED (confirming the rule was active)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-1": "L4" }`.

---

## P-2 — Port-Driven Score

> **Exemption note:** If the primitive is a pure function (no I/O, no time, no randomness),
> check exemption first. Verify: read `packages/primitives/<name>/contract.md` for
> "DI exemption: pure function" heading. If present → record `"P-2": "N/A (exempt)"` in
> `metric-ladder.json` and skip all P-2 gates. Exemption rules: `../03-metrics-primitive.md`
> §Trivial-Primitive Exemption.

### P-2 L0 → L1 Gate

**Metric:** Port-Driven Score
**Owner:** QA + dev-* zone owner
**Trigger:** Owner claims primitive reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Concrete infrastructure import count has been reduced (not zero yet at L1)
  - Verify: `grep -rn "from.*infrastructure\|from.*db\|Bun\.env\|process\.env\|new SQLite\|new.*Client" packages/primitives/<name>/src/` → output line count < prior baseline (check prior `metric-ladder.json` baseline note)
- [ ] At least one port interface file exists or is being drafted
  - Verify: `ls packages/primitives/<name>/src/ports.ts 2>/dev/null || ls packages/primitives/<name>/src/*port* 2>/dev/null` → exit 0 (at least one match)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-2": "L1" }`.

---

### P-2 L1 → L2 Gate

**Metric:** Port-Driven Score
**Owner:** QA + dev-* zone owner
**Trigger:** Owner claims primitive reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Zero concrete infrastructure imports in primitive source
  - Verify: `grep -rn "from.*infrastructure\|from.*db\|Bun\.env\|process\.env\|new SQLite\|new.*Client\|new.*Adapter" packages/primitives/<name>/src/` → empty
- [ ] Zero imports from `packages/modules/` or `apps/`
  - Verify: `grep -rn "from.*packages/modules\|from.*apps/" packages/primitives/<name>/src/` → empty
- [ ] Constructor injection only (no service-locator, no global singleton)
  - Verify: `grep -rn "getInstance\(\)\|singleton\|globalThis\." packages/primitives/<name>/src/` → empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-2": "L2" }`.

---

### P-2 L2 → L3 Gate

**Metric:** Port-Driven Score
**Owner:** QA + dev-* zone owner
**Trigger:** Owner claims primitive reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `ports.ts` exists in the primitive's `src/` folder
  - Verify: `ls packages/primitives/<name>/src/ports.ts` → exit 0
- [ ] Every external dependency used by the primitive is represented in `ports.ts` as an interface
  - Verify: `grep -c "^export interface\|^export type.*Port\|^export abstract" packages/primitives/<name>/src/ports.ts` → output ≥ 1
- [ ] No concrete class instantiation anywhere in primitive source (regression check)
  - Verify: `grep -rn "new [A-Z]" packages/primitives/<name>/src/` → empty (excluding `new Error`, `new Map`, `new Set`, `new Date`)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-2": "L3" }`.

---

### P-2 L3 → L4 Gate

**Metric:** Port-Driven Score
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI import-graph check job (`lint-import-graph` or equivalent) is configured and runs on PR
  - Verify: `grep -r "import-graph\|no-restricted-imports.*infrastructure\|no-restricted-imports.*db" .eslintrc* eslint.config* packages/eslint-plugin-*/` → non-empty
- [ ] CI job passes for this primitive (no infra import violations)
  - Verify: CI job `lint-fence` or `lint-import-graph` last run status for this primitive path → PASSED
- [ ] Zero violations in `packages/primitives/` scope for Fence-A rule
  - Verify: `bun run lint:fence -- packages/primitives/<name>/` → exit 0

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-2": "L4" }`.

---

## P-3 — Reusability Score

### P-3 L0 → L1 Gate

**Metric:** Reusability Score
**Owner:** QA + Architect
**Trigger:** Owner claims primitive reached L1; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Primitive is extracted into `packages/primitives/<name>/` (not still inline in a module)
  - Verify: `ls packages/primitives/<name>/src/index.ts` → exit 0
- [ ] At least 1 caller imports from this primitive
  - Verify: `grep -rn "from.*packages/primitives/<name>" apps/ packages/modules/ | wc -l` → output ≥ 1

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-3": "L1" }`.

---

### P-3 L1 → L2 Gate

**Metric:** Reusability Score
**Owner:** QA + Architect
**Trigger:** Owner claims primitive reached L2; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 2 callers across at least 2 distinct module or app folders
  - Verify (caller count): `grep -rn "from.*packages/primitives/<name>" apps/ packages/modules/ | wc -l` → output ≥ 2
  - Verify (distinct folders): `grep -rln "from.*packages/primitives/<name>" apps/ packages/modules/ | xargs -I{} dirname {} | sort -u | wc -l` → output ≥ 2

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-3": "L2" }`.

---

### P-3 L2 → L3 Gate

**Metric:** Reusability Score
**Owner:** QA + Architect
**Trigger:** Owner claims primitive reached L3; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] At least 3 callers across at least 2 tiers (module + app, or 2 distinct modules)
  - Verify (caller count): `grep -rn "from.*packages/primitives/<name>" apps/ packages/modules/ | wc -l` → output ≥ 3
  - Verify (tier spread): `grep -rln "from.*packages/primitives/<name>" apps/ packages/modules/ | grep -c "^apps/"` → output ≥ 1 AND `grep -rln "from.*packages/primitives/<name>" apps/ packages/modules/ | grep -c "^packages/modules/"` → output ≥ 1

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-3": "L3" }`.

---

### P-3 L3 → L4 Gate

**Metric:** Reusability Score
**Owner:** QA + system-auditor
**Trigger:** Phase 6 automation roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Master dashboard shows a caller-count badge for this primitive
  - Verify: open `apps/mcp-server/dashboard/index.html` → locate primitive card for `<name>` → badge shows a number ≥ 3
- [ ] system-auditor notebook (`docs/agent-memory/notebooks/system-auditor.md`) contains an entry showing this primitive's caller count was auto-measured in the last nightly cycle
  - Verify: `grep -A2 "<name>" docs/agent-memory/notebooks/system-auditor.md | grep "caller"` → non-empty output
- [ ] Unused-primitive auto-flag is not triggered for this primitive
  - Verify: `grep "<name>.*unused\|unused.*<name>" docs/agent-memory/notebooks/system-auditor.md` → empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"<name>": { "P-3": "L4" }`.
