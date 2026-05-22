---
title: "Phase 2 Closure Checklist — Technical-Analysis Pilot"
date: "2026-05-23"
author: "po"
status: "PRE-STAGED (awaiting final task landings)"
pilot: "technical-analysis"
phase: "2"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
plan_ref: "docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md"
status_ref: "docs/data/pilot-status.json"
rituals_ref: "docs/architecture-briefs/2026-05-22-refactor/10-validation-rituals.md"
---

# Phase 2 Closure Checklist

Pre-staged so the refactor brief can flip to DONE the moment the last in-flight task lands. Read-only on existing handoffs and pilot-status.json. New artifact only.

In-flight at pre-stage time: P2-F2 (agent-father), P2-A2 (dev-tech PID 83694), P2-B1 (dev-tech PID 83724). Their handoffs are untouched by this file.

---

## 1. REFACTOR COMPLETE — Definition

Phase 2 is COMPLETE when ALL of the following hold simultaneously:

- All 19 P2-* handoff files have landed (DONE state in `pilot-status.json.phase2.buckets[].tasks`): P2-A1, P2-A2, P2-A3, P2-A4, P2-B0, P2-B1, P2-B2, P2-B3, P2-B4, P2-C, P2-D0, P2-D1, P2-D2, P2-D3, P2-E1, P2-E2, P2-E3, P2-F2, P2-F3 (P2-F1 already DONE pre-Phase-2).
- All 12 G-goals (G1..G12) have a terminal grade in `pilot-status.json.goals[].status`: `YES`, `PARTIAL`, or `DEFER`. No `TBD` or `IN-PROGRESS` remain.
- All dispatch gates in `pilot-status.json.phase2.nextDispatchGates` are closed (every `after_*` array consumed or marked resolved).
- All sandbox scenarios are GREEN: `cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all` exits 0 with 30/30 GREEN.
- Fence linter blocks deliberate violations: P2-A4 evidence shows CI `go-lint` red on Fence-A injection, green on revert (two CI run URLs recorded).
- `pilot-status.json.phase2.status` flipped from `OPEN` to `CLOSED`; `pilot-status.json.status` updated to `DONE` if decision matrix reached terminal state, or remains `PHASE-2` only when G9 async user reply outstanding.
- Decision matrix populated: `decisionMatrix.{speed,trust,scale}` each set to `YES` or `NO`; `verdict` field set (`scale` | `rescope` | `stop-MVR`).

---

## 2. Per-Goal Grading Rubric

Grades: **PASS** (charter verification method satisfied, evidence recorded), **PARTIAL** (partial evidence — does not block matrix unless ≥2 goals fall here), **DEFER** (cannot grade in-phase, formally bumped to post-pilot with rationale).

| Goal | PASS evidence (must-have) | PARTIAL trigger | DEFER trigger | Evidence location |
|---|---|---|---|---|
| **G1** | 5 primitives + ≥3 scenarios each + 1 failure scenario, sandbox all GREEN | Scenarios present but <3 per primitive | Primitives missing | `pilot-status.json.goals[id=G1].evidence` (already YES) |
| **G2** | `grep` cross-module imports = 0; ≥1 multi-primitive module scenario GREEN | Module exists but only single-primitive scenarios | Module not extracted | `pilot-status.json.goals[id=G2].evidence` (already YES) |
| **G3** | `cmd/server/main.go` ≤80 lines; grep for domain ops = 0; OpenAPI present | Composition root has 1-2 inline ops | No composition root | `pilot-status.json.goals[id=G3].evidence` (already YES) |
| **G4** | P2-A1+A2+A3+A4 all DONE; CI red/green cycle proven; two CI run URLs | A1+A2+A3 done, A4 deliberate-violation not run | Fence linter not adopted | `docs/handoffs/TASK_P2-A{1,2,3,4}.md` + CI run URLs |
| **G5** | P2-B0..B4 all DONE; `find apps/mcp-server/src -path "*technical*" -not -path "*_deprecated*"` = 0; `grep TODO.*migrat` = 0; MCP tool end-to-end green | Deletion done but TODOs remain | Rollback executed (see §5) | `docs/handoffs/TASK_P2-B{0,1,2,3,4}.md` |
| **G6** | Dashboard 3 panels render from `file://`; no JS errors | One panel missing or stale data | Dashboard broken | `pilot-status.json.goals[id=G6].evidence` (already YES) |
| **G7** | Edit-JSON-rerun loop works; env audit empty for forbidden keys | Loop works but env audit shows non-fatal keys | Sandbox leaks credentials → charter §Security blocks PASS | `pilot-status.json.goals[id=G7].evidence` (already YES) |
| **G8** | 6 red cards visible (1 deliberate bug + 5 known-bad scenarios) | <6 red cards | Honest-red never proven | `pilot-status.json.goals[id=G8].evidence` (already YES) |
| **G9** | User verbal YES recorded with timestamp in `docs/po-decisions/2026-05-23-g9-user-confirmation.md` | User replied but no card-pointed answer | No user reply by deadline → bumped to post-pilot rescope | `docs/po-decisions/2026-05-23-g9-user-confirmation.md` + `pilot-status.json.phase2.g9` |
| **G10** | P2-D3 commits ≤2 between P2-D2 injection and final GREEN; sandbox all-scenario GREEN; baseline 1.5 cycles recorded | Fix in 3 cycles (over target but not catastrophic) | Bug never reproducible / agent unable to fix | `docs/handoffs/TASK_P2-D{0,1,2,3}.md` + git log between injection and fix |
| **G11** | P2-E3 evidence: scenario B observed RED mid-fix, agent fixed B before DONE; final all GREEN | Regression triggered but agent shipped with B red (DoD bypassed) | Canary pair never coupled; regression alarm never fires | `docs/handoffs/TASK_P2-E{1,2,3}.md` + sandbox logs |
| **G12** | Flow file contains DoD step (P2-F2 grep ≥1); 3-task streak logged in `pilot-status.json.goals[id=G12].g12Streak.tasks` (3 entries) | Streak 2/3 | Flow rule not adopted | `.claude/flows/dev-technical-analysis/main.md` + `pilot-status.json.goals[id=G12].g12Streak` |

Grading owner: PO. Grading happens after the last in-flight task lands and QA evidence is consolidated.

---

## 3. Final Commit Checklist (atomic)

Each row is one atomic commit. PO runs them sequentially after grading.

1. `chore(pilot): close Phase 2 — pilot-status.json terminal state` — flip `phase2.status: OPEN → CLOSED`, set `closedAt`, write all 12 goal grades, populate `decisionMatrix`, set `verdict`, set top-level `status` (`DONE` if all goals YES + matrix terminal; `PHASE-2` if G9 async still outstanding).
2. `docs(arch/refactor): Phase 2 closure summary` — create `docs/architecture-briefs/2026-05-22-refactor/phase-2-closure-summary.md` (1-page: goals graded, decision matrix verdict, links to evidence). Skip if summary already authored alongside last task.
3. `chore(tasks): archive Phase 2 rows` — move all 19 P2-* rows from `docs/TASKS.md` Backlog to a `## Phase 2 — ARCHIVED 2026-MM-DD` section (or to `docs/TASKS-archive.md` if archive file convention exists). Do not delete — preserve traceability.
4. `chore(pilot): graphify refresh post-Phase-2` — `/graphify docs --update --no-viz` (deferred during Phase 2 per `docs/po-decisions/2026-05-23-graphify-scope.md`; runs now).
5. Conditional: if `decisionMatrix.scale == YES`, append amendment to `pilot-charter.md` recording the verdict and the next-pilot recommendation (`macro-indicators` per charter §Decision Matrix outcome).

Single-commit fallback: if Phase 2 lands clean with no surprise, items 1+2 may be combined as `chore(po): close Phase 2 — grades, summary, status terminal`.

---

## 4. Sign-Off Line

**PO signs after grading** by appending the following block to `pilot-status.json.phase2`:

```json
"closure": {
  "signedAt": "<ISO timestamp>",
  "signedBy": "po",
  "verdict": "scale | rescope | stop-MVR",
  "goalGrades": { "G1": "PASS", "...": "..." }
}
```

**User informed via dashboard short-circuit (G9 path)**: PO drops signal `docs/signals/po-{timestamp}.json` pointing to `apps/technical-analysis/dashboard/index.html` and the Phase 2 closure summary. User opens dashboard, sees all-green, replies async.

**OR async if MCP gateway recovers**: if vn-market MCP loads in a PO cycle, PO sends Telegram WORK message with verdict + dashboard URL + 1-line ask ("Reply YES to confirm pilot scales to next microservice"). Ops escalation signal `docs/signals/po-20260522T225100Z.json` covers the gateway-recovery path.

No synchronous meeting required. PO is the decision owner per charter §Decision Matrix.

---

## 5. Rollback Plan

Triggered when any goal grades FAIL (defined: PARTIAL on ≥2 goals OR DEFER on any G4/G5/G10/G11/G12 OR explicit FAIL on G7 security gate).

| Failure mode | Recovery |
|---|---|
| **G5 deletion broke production callers** | `git revert <P2-B2 hash>` to restore `_deprecated/` → `domain/services/`. Tag `p2-b-pre-delete` (created in P2-B0 pre-step per task plan §P2-B0 rollback strategy) is the snapshot point. Single revert commit, no force-push. |
| **G4 fence misconfigured (false positives blocking legit imports)** | Revert P2-A2 CI job commit; leave `.golangci.yml` in place (config-only, harmless without CI). Re-author config under post-pilot task. Grade G4 as PARTIAL. |
| **G10 fix exceeded ≤2 cycles** | No revert — bug-fix commits stay. Grade G10 as PARTIAL. Decision matrix Speed = NO → trigger 2-YES rescope branch (charter §Decision Matrix). |
| **G11 regression never observed (canary pair did not couple)** | QA redesigns P2-E1 pair within 1 sprint extension (charter §Decision Matrix 2-YES allows max 2 additional sprints). If still no coupling after redesign, grade G11 as DEFER with rationale. |
| **G12 flow rule not adopted** | Revert P2-F2 commit. Grade G12 as DEFER. Re-dispatch under post-pilot task with stricter agent-father verification. |
| **G9 user replies NO** | Triage feedback into dashboard-polish task. Grade G9 as PARTIAL. Decision matrix Trust = NO → 2-YES rescope. |
| **Catastrophic (≥3 goals FAIL)** | Invoke charter §Decision Matrix 0-1 YES path → STOP refactor, fall back to MVR. Architect authors MVR brief within 1 sprint. |

Sprint-extension cap: charter deadline is 2026-07-03. Hard stop is 2 sprints beyond (charter §Hard Deadline silent-extension-forbidden rule). At sprint 8 absolute, PO calls the matrix on whatever state exists.

Partial-close fallback: any goal at PARTIAL with explicit PO sign-off may still allow Phase 2 CLOSED + 2-YES verdict, provided G4 + G5 + G9 are all at PASS (the trust-foundation triple).

---

## End of Checklist

Pre-staged. No file modifications outside this artifact. No agent dispatched. No in-flight work touched.
