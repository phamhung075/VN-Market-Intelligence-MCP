# Phase Exit Gate Checklists

**Parent:** `00-index.md`
**Phase definitions:** `../07-phases.md`

> Phase exit gates block phase advancement. No phase can start until the prior
> phase's exit gate passes. Source: `../07-phases.md` §Phase-Exit Gate Enforcement.
>
> All shell commands assume `cwd = project root`.

---

## Phase 0 Exit Gate — Baseline Audit Complete

**Trigger:** Architect declares Phase 0 complete; PM requests gate.
**Blocks:** Phase 1 cannot start until this gate passes.

**Checklist (all must be YES):**

- [ ] `docs/data/metric-ladder.json` exists and contains an entry for every registered artifact
  - Verify: `ls docs/data/metric-ladder.json` → exit 0; `jq 'keys | length' docs/data/metric-ladder.json` → output > 0
- [ ] Every module has a severity flag (GREEN/YELLOW/RED) in `../01-current-state.md`
  - Verify: `grep -c "GREEN\|YELLOW\|RED" docs/architecture-briefs/2026-05-22-refactor/01-current-state.md` → output ≥ 12 (one flag per module)
- [ ] Every metric in P-1 through X-5 has a recorded baseline L-level in `metric-ladder.json`
  - Verify: `jq '[.. | objects | select(has("P-1") and has("P-2") and has("P-3"))] | length' docs/data/metric-ladder.json` → output > 0 (at least one artifact has P-metric baseline scores)
  - Verify: `jq '.["project"] | has("X-1") and has("X-2") and has("X-3") and has("X-4") and has("X-5")' docs/data/metric-ladder.json` → true
- [ ] All 10 open bugs confirmed and assigned to phases (X-1 at L1)
  - Verify: `jq '.["project"]["X-1"]' docs/data/metric-ladder.json` → "L1"
- [ ] All 7 tech debt items confirmed with owners (X-2 at L1)
  - Verify: `jq '.["project"]["X-2"]' docs/data/metric-ladder.json` → "L1"
- [ ] Test count baseline recorded in `docs/data/project-stats.json`
  - Verify: `jq '.testCount' docs/data/project-stats.json` → a number > 0
- [ ] DEBT-001 (WARN-1..5 auto-fixable items) resolved
  - Verify: `grep "DEBT-001.*resolved\|DEBT-001.*closed\|DEBT-001.*done" docs/architecture-briefs/2026-05-22-refactor/06-metrics-cross-cutting.md` → non-empty

**On FAIL:** Any failing item → Architect must complete the baseline measurement before Phase 1 starts.
**On PASS:** PM unblocks Phase 1. PO receives notification.

---

## Phase 1 Exit Gate — Pilot Complete (kinh-dich L4)

**Trigger:** Developer declares Phase 1 complete; PM requests gate.
**Blocks:** Phase 1→2 Go/No-Go gate must pass before Track A/B/C start.

**Checklist (all must be YES):**

- [ ] sandbox-kit narrator primitive is at L3 or above (all 7 P-metrics ≥ L3)
  - Verify: `jq '.["sandbox-kit-narrator"]' docs/data/metric-ladder.json` → all P-* fields ≥ "L3"
- [ ] sandbox-kit renderer primitive is at L3 or above
  - Verify: `jq '.["sandbox-kit-renderer"]' docs/data/metric-ladder.json` → all P-* fields ≥ "L3"
- [ ] sandbox-kit narrator and renderer self-test scenarios pass
  - Verify: `bun run trace -- packages/primitives/sandbox-kit/` → exit 0
- [ ] All kinh-dich primitives at P-1 through P-7 L4
  - Verify: `jq '[to_entries[] | select(.key | startswith("kinh-dich-")) | .value | to_entries[] | select(.key | startswith("P-")) | .value == "L4"] | all' docs/data/metric-ladder.json` → true
- [ ] `packages/modules/kinh-dich/` at M-1 through M-7 L4
  - Verify: `jq '.["kinh-dich"] | to_entries[] | select(.key | startswith("M-")) | .value == "L4" | all' docs/data/metric-ladder.json` → true
- [ ] `apps/kinh-dich-service/` at S-1 through S-6 L4
  - Verify: `jq '.["kinh-dich-service"] | to_entries[] | select(.key | startswith("S-")) | .value == "L4" | all' docs/data/metric-ladder.json` → true
- [ ] `apps/mcp-server/dashboard/kinhdich.html` exists and renders without error
  - Verify: `ls apps/mcp-server/dashboard/kinhdich.html` → exit 0; `wc -c apps/mcp-server/dashboard/kinhdich.html | awk '{print $1}'` → output > 500
- [ ] All kinh-dich tests still pass (no regression from Phase 0 baseline)
  - Verify: `bun test apps/kinh-dich-service/ 2>&1 | grep -i "fail\|error" | wc -l` → output = 0
  - Verify: `jq '.testCount' docs/data/project-stats.json` → value ≥ Phase 0 snapshot value

**On FAIL:** Any failing item → Phase 1 extended. Do not run Phase 1→2 gate.
**On PASS:** Proceed to Phase 1→2 Go/No-Go gate below.

---

## Phase 1→2 Go/No-Go Gate

**Trigger:** Phase 1 exit gate PASSED; Architect produces go/no-go report; PO approves.
**Blocks:** No Track A/B/C work starts without a GO or CONDITIONAL GO from this gate.
**Reference:** `../07-phases.md` §Phase 1→2 Gate

**Checklist — measure all 4 criteria:**

- [ ] Criterion 1: Time-to-extract per primitive ≤ 4 agent-hours
  - Verify: `git log --format="%ai %s" -- packages/primitives/kinh-dich-*/ | head -20` → count commit timestamps for kinh-dich primitives; divide total elapsed time by 7 primitives. Result ≤ 4 hours per primitive.
  - ⚠️ NEEDS SHARPENING: measuring "agent-hours" from git timestamps requires knowing exactly when an agent started each primitive. This is not logged in git. Flag for metric refinement: agents must log `Started extraction of <primitive> at <ISO-time>` in their notebook at the start of each extraction task, enabling a precise elapsed-time calculation.
- [ ] Criterion 2: Dashboard render rate ≥ 90% of scenarios
  - Verify: `bun run dashboard 2>&1 | grep -c "✓\|PASS\|rendered"` → PASS_COUNT; `bun run dashboard 2>&1 | grep -c "✗\|FAIL\|error"` → FAIL_COUNT. PASS_COUNT / (PASS_COUNT + FAIL_COUNT) ≥ 0.90.
- [ ] Criterion 3: Primitive reuse count ≥ 2 callers for at least 3 of the 7 kinh-dich primitives
  - Verify (for each kinh-dich primitive): `grep -rln "from.*packages/primitives/kinh-dich-<X>" apps/ packages/modules/ | xargs -I{} dirname {} | sort -u | wc -l` → must be ≥ 2 for at least 3 of the 7 primitives.
- [ ] Criterion 4: sandbox-kit self-test — narrator + renderer both at L3
  - Verify: `jq '.["sandbox-kit-narrator"]["P-4"]' docs/data/metric-ladder.json` → "L3" or "L4"; `jq '.["sandbox-kit-renderer"]["P-4"]' docs/data/metric-ladder.json` → "L3" or "L4"

**Outcome determination:**

- **GO:** All 4 criteria met → PM sets Phase 2 scope to planned capacity (8 extractions/sprint).
  - Update `docs/data/metric-ladder.json`: `"project": { "phase-1-2-gate": "GO" }`.
- **CONDITIONAL GO:** Exactly 3 criteria met → PM caps Phase 2 to 4 extractions/sprint for first 3 sprints.
  - Update `docs/data/metric-ladder.json`: `"project": { "phase-1-2-gate": "CONDITIONAL-GO" }`.
- **NO-GO:** 2 or fewer criteria met → Architect re-plans Phase 2 scope. Phase 2 blocked.
  - Update `docs/data/metric-ladder.json`: `"project": { "phase-1-2-gate": "NO-GO" }`.
  - PM creates a re-plan task. Architect dispatched to review root cause before any new extraction.

---

## Phase 2 Exit Gate — All Primitives at L2

**Trigger:** Developer declares Phase 2 complete; PM requests gate.
**Blocks:** Phase 3 full scope cannot start until this gate passes (Phase 3 may have started at ≥50% Phase 2 completion).

**Checklist (all must be YES):**

- [ ] All ~48 primitives exist in `packages/primitives/` folders
  - Verify: `ls -d packages/primitives/*/src/ | wc -l` → output ≥ 48
- [ ] Every primitive has P-1 ≥ L2 in `metric-ladder.json`
  - Verify: `jq '[to_entries[] | select(.key | startswith("kinh-dich-") or startswith("ta-") or startswith("bctc-") or startswith("macro-") or startswith("alert-") or startswith("news-") or startswith("portfolio-") or startswith("sector-") or startswith("signal-") or startswith("sandbox-kit")) | .value["P-1"] | . >= "L2"] | all' docs/data/metric-ladder.json` → true
- [ ] Every primitive has P-2 ≥ L2 (or "N/A (exempt)")
  - Verify: `jq '[to_entries[] | select(.key | startswith("packages/primitives/") | not) | select(.value | has("P-2")) | .value["P-2"] | . >= "L2" or . == "N/A (exempt)"] | all' docs/data/metric-ladder.json` → true
- [ ] Every primitive has P-5 ≥ L2 (shape compliance)
  - Verify: similar jq check for P-5 field ≥ "L2" across all primitive entries.
- [ ] Domain services megabarrel (`apps/mcp-server/src/domain/services/index.ts`) reduced to 0 non-primitive files
  - Verify: `wc -l apps/mcp-server/src/domain/services/index.ts | awk '{print $1}'` → output ≤ 5 (empty or stub only)
- [ ] Test count has not decreased from Phase 0 baseline
  - Verify: `bun test 2>&1 | tail -5 | grep -E "[0-9]+ pass"` → extract number; compare to `jq '.testCount' docs/data/project-stats.json` → current ≥ baseline
- [ ] DEBT-005 resolved (`vpsHealthPoller.ts` + `resilientFetcher.ts` moved from domain/ to infrastructure/)
  - Verify: `ls apps/mcp-server/src/domain/services/vpsHealthPoller.ts apps/mcp-server/src/domain/services/resilientFetcher.ts 2>/dev/null` → exit 1 (files no longer present in domain/)
  - Verify: `ls apps/mcp-server/src/infrastructure/` → contains poller and fetcher files

**On FAIL:** Any failing item → Phase 2 extended. PM creates catch-up tasks.
**On PASS:** PM unblocks full Phase 3 scope.

---

## Phase 3 Exit Gate — All Modules at L2

**Trigger:** Developer declares Phase 3 complete; PM requests gate.
**Blocks:** Phase 4 full scope cannot start until this gate passes.

**Checklist (all must be YES):**

- [ ] All 11 modules exist in `packages/modules/` with contract.md and scenarios/
  - Verify: `for m in kinh-dich technical-analysis financial-reports alerts news-analysis portfolio macro-core macro-signals briefings sector-analytics market-context system-ops; do ls -d packages/modules/$m/ 2>/dev/null && ls packages/modules/$m/contract.md packages/modules/$m/scenarios/ 2>/dev/null; done` → all 11 modules present
- [ ] Every module has M-1 ≥ L2 (bounded context cohesion)
  - Verify: `jq '[to_entries[] | select(.value | has("M-1")) | .value["M-1"] | . >= "L2"] | all' docs/data/metric-ladder.json` → true
- [ ] Every module has M-2 ≥ L2 (primitive composition)
  - Verify: similar jq check for M-2 field.
- [ ] Every module has M-3 ≥ L2 (no cross-module imports)
  - Verify: `grep -rn "from.*packages/modules/" packages/modules/*/src/ | grep -v "node_modules\|\.test\." | wc -l` → output = 0
- [ ] Anti-corruption translators in place for all RED modules (`analysis` and others with domain-type leaks)
  - Verify: `ls apps/mcp-server/src/application/*translator*.ts 2>/dev/null | wc -l` → output ≥ 1 (at least one translator present)

**On FAIL:** Any failing item → Phase 3 extended.
**On PASS:** PM unblocks full Phase 4 scope.

---

## Phase 4 Exit Gate — Apps Rewired at L2

**Trigger:** Developer declares Phase 4 complete; PM requests gate.
**Blocks:** Phase 5 cannot start until this gate passes.

**Checklist (all must be YES):**

- [ ] `apps/mcp-server/src/bootstrap.ts` exists as sole composition root
  - Verify: `ls apps/mcp-server/src/bootstrap.ts` → exit 0
- [ ] Zero `new.*Repository/Store/Adapter` instantiation outside bootstrap.ts for mcp-server
  - Verify: `grep -rn "new.*Repository\|new.*Store\|new.*Adapter" apps/mcp-server/src/ --include="*.ts" | grep -v "bootstrap\.ts"` → empty
- [ ] Zero direct domain imports in mcp-server interface layer
  - Verify: `grep -rn "from.*domain/services" apps/mcp-server/src/interface/` → empty
- [ ] S-1 through S-6 at ≥ L2 for mcp-server
  - Verify: `jq '.["mcp-server"] | to_entries[] | select(.key | startswith("S-")) | .value | . >= "L2" | all' docs/data/metric-ladder.json` → true
- [ ] BUG-A21, BUG-A21b, BUG-BCTC-1 resolved (deployment health S-4 L2)
  - Verify: `jq '.["mcp-server"]["S-4"]' docs/data/metric-ladder.json` → "L2" or higher
- [ ] Test count has not decreased from Phase 0 baseline
  - Verify: current test count ≥ `jq '.testCount' docs/data/project-stats.json` Phase 0 value.
- [ ] TypeScript strict mode passes for full project
  - Verify: `tsc --noEmit` → exit 0

**On FAIL:** Any failing item → Phase 4 extended.
**On PASS:** PM unblocks Phase 5.

---

## Phase 5 Exit Gate — All Tiers at L3 (Coverage Push Complete)

**Trigger:** Developer declares Phase 5 complete; PM requests gate.
**Blocks:** Phase 6 cannot start until this gate passes.

**Checklist (all must be YES):**

- [ ] All dashboards render without error (`bun run dashboard` exits 0)
  - Verify: `cd apps/mcp-server && bun run dashboard` → exit 0
- [ ] All coverage banners show ≥ 80% (no red banners)
  - Verify: `grep -ri "WARNING\|coverage.*[0-7][0-9]%" apps/mcp-server/dashboard/index.html | grep -i "warning\|red\|low" | wc -l` → output = 0 (with the NEEDS SHARPENING caveat from X-4 gate)
- [ ] X-4 at L3 in `metric-ladder.json`
  - Verify: `jq '.["project"]["X-4"]' docs/data/metric-ladder.json` → "L3"
- [ ] PO (or user) has reviewed and approved at least 5 key module dashboards
  - Verify: `grep -i "approved\|user.*reviewed\|PO.*sign\|dashboard.*ok" docs/agent-memory/notebooks/architect.md | wc -l` → output ≥ 5
  - ⚠️ NEEDS SHARPENING: PO approval is a human action with no machine-verifiable artifact. Flag for metric refinement: define a `docs/data/dashboard-approvals.json` file that agents update after each PO review session (fields: moduleName, approvedBy, approvedAt). Then: `jq '[.[] | select(.approvedBy == "PO")] | length' docs/data/dashboard-approvals.json` → output ≥ 5.
- [ ] FIXTURES.md exists per module (original brief Phase 2 user review surface)
  - Verify: `find packages/modules/ -name "FIXTURES.md" | wc -l` → output ≥ 11 (one per module)

**On FAIL:** Any failing item → Phase 5 extended.
**On PASS:** PM unblocks Phase 6.

---

## Phase 6 Exit Gate — L4 Automation Complete (Excellence)

**Trigger:** Developer declares Phase 6 complete; PM requests gate.
**Blocks:** Project refactor completion declaration; any further automation work.

**Checklist (all must be YES):**

- [ ] All 25 metrics at L4 for all registered artifacts
  - Verify: `jq '[.. | objects | to_entries[] | select(.key | test("^[PMSX]-[0-9]+$")) | .value == "L4"] | all' docs/data/metric-ladder.json` → true
- [ ] `bun run lint:fence` exits 0 with zero Fence-A, B, C violations
  - Verify: `bun run lint:fence` → exit 0
- [ ] `bun run dashboard` exits 0 in < 30 seconds
  - Verify: `time (cd apps/mcp-server && bun run dashboard) 2>&1 | grep real` → time < 30s; exit 0
- [ ] `tsc --noEmit` exits 0 (full TypeScript strict compile)
  - Verify: `tsc --noEmit` → exit 0
- [ ] CI has required status checks for: `lint-fence`, `dashboard-build`, `contract-freshness`, `typecheck`, `trace-coverage`
  - Verify: confirm all 5 jobs appear as required status checks in the GitHub branch protection settings for `main`
  - ⚠️ NEEDS SHARPENING: branch protection settings are not readable via a shell command on the local filesystem. Verify via GitHub API: `gh api repos/OWNER/REPO/branches/main/protection/required_status_checks/contexts | jq '.[]'` → list must include all 5 job names.
- [ ] Zero red banners on master dashboard; user confirms narrative accuracy
  - Verify: open `apps/mcp-server/dashboard/index.html` → no red badges, no "WARNING" banners (visual inspection)
- [ ] system-auditor `/health` reads cover all 10 microservices
  - Verify: `grep -c "http://localhost" docs/agent-memory/notebooks/system-auditor.md` → output ≥ 10 (one health check entry per service)
- [ ] Bug count (X-1) and debt count (X-2) both at L4
  - Verify: `jq '.["project"]["X-1"]' docs/data/metric-ladder.json` → "L4"; `jq '.["project"]["X-2"]' docs/data/metric-ladder.json` → "L4"

**On FAIL:** Any failing item → identify which metrics are not yet at L4; dispatch dev-* zone owner for each failing item.
**On PASS:** PM declares refactor complete. PO notified. Architect writes post-completion brief.
