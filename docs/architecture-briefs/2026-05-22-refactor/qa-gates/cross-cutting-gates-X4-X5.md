# QA Gate Checklists — Cross-Cutting: X-4, X-5

**Parent:** `00-index.md`
**Metric definitions:** `../06-metrics-cross-cutting.md`

> These gates assume `docs/data/metric-ladder.json` exists (created in Phase 0).
> Cross-cutting metrics apply to the whole project, not to a single artifact.

---

## X-4 — Sandbox Uptime

### X-4 L0 → L1 Gate

**Metric:** Sandbox Uptime
**Owner:** QA + developer
**Trigger:** Phase 1 sandbox-kit pilot completion; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `packages/primitives/sandbox-kit/` exists and contains narrator and renderer primitives
  - Verify: `ls packages/primitives/sandbox-kit/src/narrator.ts packages/primitives/sandbox-kit/src/render.ts 2>/dev/null` → exit 0
- [ ] sandbox-kit can be executed (even if only some dashboards render)
  - Verify: `bun run dashboard 2>&1 | head -20` → exit 0 OR produces output showing at least 1 dashboard rendered successfully (not "command not found")
  - ⚠️ NEEDS SHARPENING: `bun run dashboard` command must be registered in the root or `apps/mcp-server/package.json`. Verify: `grep '"dashboard"' apps/mcp-server/package.json` → non-empty. If not present, the command does not yet exist — this is a Phase 1 deliverable blocker.
- [ ] At least 1 dashboard HTML file exists anywhere in `packages/primitives/` or `packages/modules/`
  - Verify: `find packages/ -name "dashboard.html" | wc -l` → output ≥ 1

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-4": "L1" }`.

---

### X-4 L1 → L2 Gate

**Metric:** Sandbox Uptime
**Owner:** QA
**Trigger:** After Phase 5 dashboard build (all primitives + modules have dashboards); PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `bun run dashboard` exits with code 0 (no render errors)
  - Verify: `cd apps/mcp-server && bun run dashboard` → exit 0
- [ ] Master dashboard index shows all registered primitive and module cards
  - Verify: `grep -c '<div.*card\|<article\|<section.*primitive\|<section.*module' apps/mcp-server/dashboard/index.html` → output ≥ total registered primitives + modules count from `docs/data/metric-ladder.json`
- [ ] Zero dashboards show "render error" or "data unavailable" messages
  - Verify: `grep -ri "render error\|data unavailable\|failed to load\|parse error" apps/mcp-server/dashboard/index.html packages/**/dashboard.html 2>/dev/null | wc -l` → output = 0

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-4": "L2" }`.

---

### X-4 L2 → L3 Gate

**Metric:** Sandbox Uptime
**Owner:** QA
**Trigger:** After Phase 5 coverage push; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] All coverage banners show ≥ 80% (no red "WARNING" banners visible)
  - Verify: `grep -ri "WARNING\|coverage.*[0-7][0-9]%\|coverage.*[0-9]%" apps/mcp-server/dashboard/index.html | grep -i "warning\|red\|low" | wc -l` → output = 0
  - ⚠️ NEEDS SHARPENING: coverage banner color is determined by sandbox-kit rendering logic, not by a static string in the HTML. The grep above catches warnings in the rendered text but cannot verify badge colors reliably. Flag for metric refinement: sandbox-kit renderer should embed a machine-readable `data-coverage-status="ok|warning|error"` attribute on each card, enabling: `grep 'data-coverage-status="warning\|error"' apps/mcp-server/dashboard/index.html | wc -l` → output = 0.
- [ ] Dashboard renders in < 30 seconds
  - Verify: `time (cd apps/mcp-server && bun run dashboard) 2>&1 | grep real` → time value < 30s

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-4": "L3" }`.

---

### X-4 L3 → L4 Gate

**Metric:** Sandbox Uptime
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `bun run dashboard` is a required CI step and runs on every PR
  - Verify: `grep -r "bun run dashboard\|bun dashboard" .github/workflows/` → non-empty
- [ ] CI dashboard build passes for the current state of main branch
  - Verify: CI job `dashboard-build` last run on main → PASSED
- [ ] A PR introducing a broken scenario JSON causes `dashboard-build` CI step to fail
  - Verify: CI log of last PR with intentionally broken JSON → confirms `dashboard-build` failed
- [ ] Dashboard render time logged in CI and is < 30 seconds
  - Verify: CI job `dashboard-build` duration → < 30s

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-4": "L4" }`.

---

## X-5 — Architectural Fence Enforcement

### X-5 L0 → L1 Gate

**Metric:** Architectural Fence Enforcement
**Owner:** QA + Architect
**Trigger:** Phase 2 start (manual fence checks begin); PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Fence-A rule is documented (primitives cannot import from modules or apps or infra)
  - Verify: `grep -i "Fence-A\|fence.*A\|primitive.*no.*import.*module\|primitive.*no.*import.*app" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md` → non-empty
- [ ] Fence-B rule is documented (modules cannot import from sibling modules)
  - Verify: `grep -i "Fence-B\|fence.*B\|module.*no.*sibling\|cross-module" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md` → non-empty
- [ ] Fence-C rule is documented (no `new.*Adapter/Repository/Store` outside composition root)
  - Verify: `grep -i "Fence-C\|fence.*C\|composition.*root\|no.*new.*outside" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md` → non-empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-5": "L1" }`.

---

### X-5 L1 → L2 Gate

**Metric:** Architectural Fence Enforcement
**Owner:** QA + developer
**Trigger:** Phase 2 manual fence audit; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] ESLint fence rules are configured and runnable as `bun run lint:fence`
  - Verify: `grep '"lint:fence"' package.json apps/mcp-server/package.json 2>/dev/null` → non-empty
- [ ] `bun run lint:fence -- packages/primitives/` runs without error (exit 0)
  - Verify: `bun run lint:fence -- packages/primitives/` → exit 0
- [ ] Fence-A violation count is recorded in `docs/data/metric-ladder.json` or architect notebook
  - Verify: `jq '.["project"]["X-5-fence-A-violations"]' docs/data/metric-ladder.json` → a number (may be > 0 at L2; 0 is goal at L4)
- [ ] Fence-B violation count is recorded
  - Verify: `jq '.["project"]["X-5-fence-B-violations"]' docs/data/metric-ladder.json` → a number
- [ ] Fence-C violation count is recorded
  - Verify: `jq '.["project"]["X-5-fence-C-violations"]' docs/data/metric-ladder.json` → a number

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-5": "L2" }`.

---

### X-5 L2 → L3 Gate

**Metric:** Architectural Fence Enforcement
**Owner:** QA + developer
**Trigger:** Phase 4 pre-commit hook roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `bun run lint:fence` is added to the pre-commit hook
  - Verify: `cat .git/hooks/pre-commit | grep "lint:fence\|lint-fence"` → non-empty
  - Alternative: `grep -r "lint:fence\|lint-fence" .husky/ .lefthook* 2>/dev/null` → non-empty
- [ ] Pre-commit hook fires correctly on a local commit attempt
  - Verify: create a temporary file in `packages/primitives/` that imports from `packages/modules/` → `git commit -m "test"` → commit blocked with fence violation output. Revert the test file afterward.
- [ ] Fence-A violations = 0 (no primitive imports from modules/apps/infra)
  - Verify: `bun run lint:fence -- packages/primitives/ 2>&1 | grep -i "Fence-A\|error" | wc -l` → output = 0
- [ ] Fence-B violations = 0 (no cross-module imports)
  - Verify: `bun run lint:fence -- packages/modules/ 2>&1 | grep -i "Fence-B\|error" | wc -l` → output = 0

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-5": "L3" }`.

---

### X-5 L3 → L4 Gate

**Metric:** Architectural Fence Enforcement
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI lint job `lint-fence` runs on every PR and blocks merge on Fence-A, B, or C violation
  - Verify: `grep -r "lint:fence\|lint-fence" .github/workflows/` → non-empty; confirm the workflow has `required: true` or is a required status check in branch protection rules
- [ ] CI `lint-fence` last run on main → PASSED with 0 violations
  - Verify: CI job `lint-fence` last run on main branch → PASSED; output contains "0 violations" or "No issues found"
- [ ] Fence-A: zero violations in `packages/primitives/`
  - Verify: `bun run lint:fence -- packages/primitives/` → exit 0
- [ ] Fence-B: zero violations in `packages/modules/`
  - Verify: `bun run lint:fence -- packages/modules/` → exit 0
- [ ] Fence-C: zero composition-root violations in `apps/`
  - Verify: `grep -rn "new.*Repository\|new.*Store\|new.*Client\|new.*Adapter" apps/ --include="*.ts" | grep -v "bootstrap\.ts\|index\.ts"` → empty

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-5": "L4" }`.
