# Standing Rules Checks

**Parent:** `00-index.md`
**Rules source:** `../07-phases.md` §Standing Rules + `../10-validation-rituals.md`

> Standing rules apply to every phase. These checks are not level-transition gates
> but ongoing compliance checks. Run them at the cadence specified per rule.
>
> All shell commands assume `cwd = project root`.

---

## SR-1 — Capacity Reservation (70/30 Sprint Split)

**Rule:** Each sprint reserves 30% for ops/bug-fix and 70% for refactor tasks.
**Cadence:** Sprint start and sprint close.
**Owner:** PM verifies; QA spot-checks on request.

**Sprint-start check (all must be YES):**

- [ ] Sprint plan shows task count breakdown: refactor tasks ≥ 70%, ops/bug-fix tasks ≤ 30%
  - Verify: count tasks in `docs/TASKS.md` for the current sprint tagged `[REFACTOR]` vs `[OPS]` or `[BUG]`; ratio must be ≥ 70/30.
  - ⚠️ NEEDS SHARPENING: `docs/TASKS.md` does not currently use `[REFACTOR]` vs `[OPS]` tagging. Flag for metric refinement: add a required tag to all sprint tasks (e.g., `type: refactor | ops | bug-fix`) in `docs/TASKS.md` YAML front-matter or task table column. Until then, QA must manually count by reading the task descriptions and categorizing.

**Sprint-close check (all must be YES):**

- [ ] If PO overrode the 70/30 split, an override reason is recorded in the sprint summary
  - Verify: `grep -i "override\|capacity.*split\|ops.*heavy\|refactor.*reduced" docs/agent-memory/notebooks/architect.md | tail -5` → if override occurred this sprint, entry exists; if no override, this check is N/A.
- [ ] Developer teams did not self-reassign sprint tasks without PM sign-off
  - Verify: `git log --since="<sprint-start-date>" --format="%s" -- docs/TASKS.md | grep -i "reassign\|moved\|self-assign" | wc -l` → output = 0

**On FAIL:** PM creates a corrective sprint-planning task. No gate hard-block (advisory violation).

---

## SR-2 — Module-Freeze Rule

**Rule:** Module list is declared at phase start. No module renames or moves happen mid-phase.
**Cadence:** Every time a PR is raised that touches module folder names.
**Owner:** QA checks any PR that renames or moves a `packages/modules/<name>/` folder.

**Per-PR check when a module rename/move is detected (all must be YES):**

- [ ] Detect if a module folder was renamed or moved
  - Verify: `git diff --name-only HEAD~1 HEAD | grep "packages/modules/" | grep -v "^packages/modules/[^/]*/[^/]"` → if output shows a path that doesn't match the current phase module list, a rename has occurred.
- [ ] A re-plan task exists in `docs/TASKS.md` for the structural change
  - Verify: `grep -i "re-plan\|module.*rename\|module.*move\|structural.*change" docs/TASKS.md | wc -l` → output ≥ 1
- [ ] Architect approval comment exists in the PR (PM must not merge without it)
  - Verify: PR description or comments contain `[Architect] Approved module rename` text (manual review of PR on GitHub)
- [ ] The move is scheduled at a phase boundary, not mid-sprint
  - Verify: the re-plan task's sprint is the next phase boundary sprint, not the current sprint (manual check of task sprint field)

**On FAIL:** Block PR merge. PM creates re-plan task. Architect must review before any merge.

---

## SR-3 — Scenario Refresh Ritual

**Rule:** Monthly: module owner regenerates ≥1 scenario per primitive from live production data.
**Rule:** Quarterly: system-auditor runs full stale-scenario scan.
**Cadence:** Monthly (per module) + Quarterly (full scan).
**Owner:** Module owner (monthly); system-auditor (quarterly).

**Monthly check (per module — run once per calendar month per module):**

- [ ] At least 1 scenario JSON in `packages/modules/<name>/scenarios/` has been updated this month
  - Verify: `git log --since="$(date -d '30 days ago' +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d)" --name-only -- packages/modules/<name>/scenarios/ | grep ".json" | wc -l` → output ≥ 1
- [ ] Regenerated scenario JSON contains a `"generated": "YYYY-MM"` field with the current month
  - Verify: `grep '"generated"' packages/modules/<name>/scenarios/*.json | grep "$(date +%Y-%m)" | wc -l` → output ≥ 1
- [ ] No scenarios in this module are flagged as `"stale": true`
  - Verify: `grep '"stale": true' packages/modules/<name>/scenarios/*.json | wc -l` → output = 0

**On FAIL (monthly):** Module owner dispatched to regenerate stale scenario. Red badge on module dashboard card.

**Quarterly check (full project scan — run every 90 days):**

- [ ] system-auditor has run a stale-scenario scan in the last 90 days
  - Verify: `grep -i "stale.*scenario\|scenario.*scan\|quarterly.*audit" docs/agent-memory/notebooks/system-auditor.md | tail -5` → entry exists within last 90 days
- [ ] Stale scenario count is 0, OR a WORK channel report has been sent and PM has scheduled refresh tasks
  - Verify (if stale > 0): `grep -i "stale.*scenario.*WORK\|scenario.*refresh.*task" docs/agent-memory/notebooks/system-auditor.md | wc -l` → output ≥ 1
- [ ] All scenarios with no `"generated"` field have been flagged for refresh
  - Verify: `grep -rL '"generated"' packages/primitives/*/scenarios/*.json packages/modules/*/scenarios/*.json 2>/dev/null | wc -l` → output = 0 (no scenario files missing the generated field)
  - ⚠️ NEEDS SHARPENING: `grep -rL` (files not matching) on nested glob patterns may not behave identically across macOS and Linux shells. Verify on both platforms or use: `find packages/ -path "*/scenarios/*.json" | xargs grep -rL '"generated"' | wc -l` → output = 0.

**On FAIL (quarterly):** system-auditor posts WORK channel report. PM creates refresh sprint tasks.

---

## SR-4 — Architectural Fence Enforcement (Ongoing)

**Rule:** Fence-A/B/C violations must not persist unresolved between sprints.
**Cadence:** Per PR (Phase 4+); Sprint close review.
**Owner:** QA on every PR touching source files; Architect at sprint close.

**Per-sprint close check (all must be YES):**

- [ ] Fence-A: zero primitives import from modules, apps, or infra paths
  - Verify: `grep -rn "from.*packages/modules\|from.*apps/\|from.*infrastructure" packages/primitives/ --include="*.ts" | grep -v "node_modules\|\.test\." | wc -l` → output = 0
- [ ] Fence-B: zero modules import from sibling modules
  - Verify: `grep -rn "from.*packages/modules/" packages/modules/ --include="*.ts" | grep -v "node_modules\|\.test\." | wc -l` → output = 0
- [ ] Fence-C: zero concrete infrastructure instantiation outside composition roots
  - Verify: `grep -rn "new.*Repository\|new.*Store\|new.*Client\|new.*Adapter" apps/ --include="*.ts" | grep -v "bootstrap\.ts\|index\.ts\|\.test\." | wc -l` → output = 0
- [ ] `bun run lint:fence` passes (exit 0) when run from project root
  - Verify: `bun run lint:fence` → exit 0
  - If `bun run lint:fence` is not yet configured (Phase < 2): substitute manual grep checks for Fence-A/B/C above.

**Violation found at sprint close:**
- 1 fence violation: dispatch fixer to affected zone with the specific file + line.
- 3+ fence violations: PM flags as a sprint blocker. No new feature tasks until violations are cleared. Architect reviews if violations are recurring (see recurring-bug-escalation rule in project memory).

**On ALL PASS:** Record in architect notebook: "Sprint <N> fence check: CLEAN — 0 Fence-A, 0 Fence-B, 0 Fence-C violations."
