# QA Gate Checklists — Cross-Cutting: X-1, X-2, X-3

**Parent:** `00-index.md`
**Metric definitions:** `../06-metrics-cross-cutting.md`

> These gates assume `docs/data/metric-ladder.json` exists (created in Phase 0).
> Cross-cutting metrics apply to the whole project, not to a single artifact.
> Replace `<current-sprint>` with the active sprint identifier.

---

## X-1 — Known Bug Count (by tier)

### X-1 L0 → L1 Gate

**Metric:** Known Bug Count
**Owner:** QA + Architect
**Trigger:** Phase 0 baseline audit; PM requests gate.
**Blocking:** YES — Phase 1 cannot start until bugs are inventoried.

**Checklist (all must be YES):**

- [ ] All open bugs are listed in `../06-metrics-cross-cutting.md` X-1 section (or its current update)
  - Verify: `grep -c "^| BUG-\|^| BUG_" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md` → output ≥ 10 (Phase 0 baseline identified 10 bugs)
- [ ] Each bug entry has at minimum: Bug ID, description, tier assignment, target phase
  - Verify: `grep "^| BUG" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md | awk -F'|' '{print NF}' | sort -u` → output = 6 (5 columns + 2 pipes = 6 fields per row; adjust if table format differs)
  - ⚠️ NEEDS SHARPENING: this grep checks column count but not content validity. A more robust check would require a structured JSON file for bug tracking. Flag for metric refinement: move bug inventory to `docs/data/bug-inventory.json` with a required schema (id, description, tier, phase, status) so QA can validate with `bun -e "require('./docs/data/bug-inventory.json').forEach(b => { if (!b.id || !b.tier || !b.phase) throw new Error(b.id) })"`.
- [ ] All bugs from the BUG Telegram channel (last 30 days) are in the inventory
  - Verify: `grep -i "BUG-\|CRASHED\|ENOENT\|ERROR" docs/agent-memory/notebooks/system-auditor.md | grep -v "^#\|resolved\|fixed" | wc -l` → output = 0 (or all listed bugs match the inventory)
  - ⚠️ NEEDS SHARPENING: cross-referencing Telegram BUG channel with the written inventory requires manual inspection of Telegram history or a structured log file. Flag for metric refinement: add a `docs/data/bug-inventory.json` that system-auditor populates automatically from BUG channel entries.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-1": "L1" }`.

---

### X-1 L1 → L2 Gate

**Metric:** Known Bug Count
**Owner:** QA + Architect + PM
**Trigger:** After each sprint; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Every bug in the inventory has a target phase assigned
  - Verify: `grep "^| BUG" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md | grep "Phase [0-9]\|Out of scope" | wc -l` → output = total bug count
- [ ] Bug count per tier is published (primitive / module / microservice / cross-cutting)
  - Verify: `grep -i "primitive\|module\|microservice\|cross-cutting" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md | grep "| Bug\|bug count\|total.*tier" | wc -l` → output ≥ 1 OR count manually from table: each row has a tier column.
- [ ] Master dashboard shows bug count per tier (open `apps/mcp-server/dashboard/index.html`)
  - Verify: open `apps/mcp-server/dashboard/index.html` → confirm a "Bugs" panel or badge shows tier breakdown (Phase 5+ deliverable; if dashboard not yet live, substitute: `grep -i "bug\|debt" apps/mcp-server/dashboard/index.html | wc -l` → output ≥ 1 or note "dashboard not yet built — pending Phase 5")

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-1": "L2" }`.

---

### X-1 L2 → L3 Gate

**Metric:** Known Bug Count
**Owner:** QA + Architect
**Trigger:** After any sprint that closes a bug.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Each fixed bug has a corresponding metric at the required level that proves recurrence is impossible
  - Verify (BUG-A21c): `jq '.["mcp-server"]["P-2"]' docs/data/metric-ladder.json` → "L2" or higher
  - Verify (BUG-JANITOR): `jq '.["mcp-server"]["P-2"]' docs/data/metric-ladder.json` → "L2" or higher
  - Verify (BUG-1942c): `jq '.["financial-reports"]["M-2"]' docs/data/metric-ladder.json` → "L2" or higher
  - Verify (BUG-1971): relevant primitive P-2 level → "L2" or higher
  - Verify (BUG-1972): relevant primitive P-2 level → "L2" or higher
  - For each bug: check `06-metrics-cross-cutting.md` X-1 "Phase resolves" column to identify the required metric.
- [ ] Bug inventory last updated within the current sprint
  - Verify: `git log -1 --format="%ai" -- docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md` → date within last 14 days

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-1": "L3" }`.

---

### X-1 L3 → L4 Gate

**Metric:** Known Bug Count
**Owner:** QA + system-auditor + CI
**Trigger:** Phase 6 roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI or system-auditor auto-computes bug count from git log on each sprint close
  - Verify: `grep -i "bug.*count\|fix.*count\|auto.*bug" docs/agent-memory/notebooks/system-auditor.md | tail -5` → non-empty entries from last 7 days
  - ⚠️ NEEDS SHARPENING: "auto-computed from git log" is not yet implemented in system-auditor. Flag for metric refinement: define a system-auditor job that runs `git log --since=<sprint-start> --grep="fix\|bug" --oneline | wc -l` and writes the result to `docs/data/metric-ladder.json`.
- [ ] Master dashboard shows auto-updated bug count badge with tier breakdown
  - Verify: open `apps/mcp-server/dashboard/index.html` → bug badge shows a number and tier breakdown. Badge color: green if 0 open bugs, yellow if 1-3, red if >3.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-1": "L4" }`.

---

## X-2 — Tech Debt Count

### X-2 L0 → L1 Gate

**Metric:** Tech Debt Count
**Owner:** QA + Architect
**Trigger:** Phase 0 baseline; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] All tech debt items are listed in `../06-metrics-cross-cutting.md` X-2 section
  - Verify: `grep -c "^| DEBT-" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md` → output ≥ 7 (Phase 0 baseline identified 7 debt items)
- [ ] Each debt entry has: Debt ID, description, owner, target phase
  - Verify: `grep "^| DEBT-" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md | awk -F'|' '{print NF}' | sort -u` → output = 6 (5 columns + 2 pipe chars)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-2": "L1" }`.

---

### X-2 L1 → L2 Gate

**Metric:** Tech Debt Count
**Owner:** QA + Architect + PM
**Trigger:** Sprint planning; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Each debt item has a target phase AND a retirement condition (what metric improvement closes the debt)
  - Verify: `grep "^| DEBT-" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md | while IFS='|' read _ id desc owner phase _; do echo "$id phase='$phase'"; done` → each row shows a non-empty phase value
  - Manual check: review each DEBT row for a "retirement condition" description (may be in the description column).
  - ⚠️ NEEDS SHARPENING: the current debt table does not have a "retirement condition" column. Flag for metric refinement: add a `retirement_condition` column to the debt table, or move debt items to `docs/data/debt-inventory.json` with required `retirementMetric` field.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-2": "L2" }`.

---

### X-2 L2 → L3 Gate

**Metric:** Tech Debt Count
**Owner:** QA + Architect
**Trigger:** Sprint close; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Debt count trend is tracked per sprint (last 3 sprint entries available)
  - Verify: `grep -i "debt.*count\|DEBT-.*closed\|debt.*retired" docs/agent-memory/notebooks/architect.md | wc -l` → output ≥ 3 (one entry per sprint for last 3 sprints)
- [ ] Debt count trend is visible in master dashboard
  - Verify: open `apps/mcp-server/dashboard/index.html` → "Technical Debt" section visible with a count and trend indicator (if dashboard not yet live, substitute: `grep -i "debt" apps/mcp-server/dashboard/index.html | wc -l` → output ≥ 1 or note "pending Phase 5")

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-2": "L3" }`.

---

### X-2 L3 → L4 Gate

**Metric:** Tech Debt Count
**Owner:** QA + system-auditor
**Trigger:** Phase 6 roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Debt items are auto-extracted from git carry-over notes by system-auditor
  - Verify: `grep -i "debt.*auto\|carry-over.*debt\|notebook.*debt" docs/agent-memory/notebooks/system-auditor.md | tail -5` → non-empty from last 7 days
  - ⚠️ NEEDS SHARPENING: same as X-1 L4 — auto-extraction from git carry-over notes is not yet implemented. Flag for same refinement task as X-1 L4.
- [ ] Master dashboard shows auto-updated debt count with trend
  - Verify: open `apps/mcp-server/dashboard/index.html` → debt badge shows a count with a trend arrow (↑↓→). Badge color: green if count decreasing, yellow if flat, red if increasing.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-2": "L4" }`.

---

## X-3 — Documentation Freshness

### X-3 L0 → L1 Gate

**Metric:** Documentation Freshness
**Owner:** QA + Architect
**Trigger:** After any major code change; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `docs/ARCHITECTURE.md` exists
  - Verify: `ls docs/ARCHITECTURE.md` → exit 0
- [ ] `docs/references/tree-map.md` exists
  - Verify: `ls docs/references/tree-map.md` → exit 0
- [ ] Master brief `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` exists and is not empty
  - Verify: `wc -c docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md | awk '{print $1}'` → output > 1000

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-3": "L1" }`.

---

### X-3 L1 → L2 Gate

**Metric:** Documentation Freshness
**Owner:** QA + Architect
**Trigger:** Sprint close; Architect freshness check.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] `docs/ARCHITECTURE.md` is not stale by more than 14 days vs any change in `apps/*/src/`
  - Verify (arch doc): `git log -1 --format="%ai" -- docs/ARCHITECTURE.md` → ARCH_DATE
  - Verify (source): `git log -1 --format="%ai" -- apps/` → APPS_DATE
  - PASS if ARCH_DATE ≥ APPS_DATE − 14days
- [ ] `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` not stale by >7 days vs any change in `packages/primitives/` or `packages/modules/`
  - Verify (brief): `git log -1 --format="%ai" -- docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` → BRIEF_DATE
  - Verify (packages): `git log -1 --format="%ai" -- packages/` → PACKAGES_DATE
  - PASS if BRIEF_DATE ≥ PACKAGES_DATE − 7days
- [ ] All primitive `contract.md` files were updated within 7 days of their source change
  - Verify (sample — check 3 primitives): for each sampled primitive, run: `git log -1 --format="%ai" -- packages/primitives/<name>/src/`; `git log -1 --format="%ai" -- packages/primitives/<name>/contract.md`; PASS if contract ≥ source − 7days.

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-3": "L2" }`.

---

### X-3 L2 → L3 Gate

**Metric:** Documentation Freshness
**Owner:** QA + Architect
**Trigger:** Sprint start; Architect notebook review.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] Architect notebook (`docs/agent-memory/notebooks/architect.md`) contains a freshness-check entry from the current sprint start
  - Verify: `grep -i "freshness\|stale\|doc.*check\|architecture.*review" docs/agent-memory/notebooks/architect.md | tail -5` → non-empty from last 14 days
- [ ] Stale items identified by Architect are added to the current sprint backlog
  - Verify: `grep -i "STALE\|doc.*debt\|update.*contract\|TODO.*contract" docs/TASKS.md | wc -l` → output ≥ 0 (if no stale items, output = 0 is acceptable; if stale items exist in notebook, must have corresponding TASKS.md entry)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-3": "L3" }`.

---

### X-3 L3 → L4 Gate

**Metric:** Documentation Freshness
**Owner:** QA + CI
**Trigger:** Phase 6 CI roll-out; PM requests gate.
**Blocking:** YES.

**Checklist (all must be YES):**

- [ ] CI freshness check job is configured and runs on every PR that touches source files
  - Verify: `grep -r "freshness\|contract.*stale\|docs.*check" .github/workflows/ scripts/` → non-empty
- [ ] CI freshness check passes for the current state of the repo
  - Verify: CI job `contract-freshness` or `docs-freshness` last run → PASSED
- [ ] A PR touching `packages/primitives/<name>/src/` without updating `contract.md` generates a CI comment warning
  - Verify: CI log of last PR that modified a primitive without updating its contract.md → confirms a warning comment was added OR that the PR was blocked (if at zero-tolerance threshold)

**On FAIL:** 1 item → dispatch fixer. 2+ items → reject gate.
**On PASS:** Update `docs/data/metric-ladder.json`: `"project": { "X-3": "L4" }`.
